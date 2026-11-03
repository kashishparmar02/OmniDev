#!/usr/bin/env bash
# Post one reply on a pull request comment. Resolved threads are refused
# unless --allow-resolved. --dry-run prints the target and does not post.
# Auth: Bitbucket — git config user.email + full git credential token (curl).
#       GitHub — gh CLI (must be authenticated).
# Never print credentials. Read the token with sed, not awk -F=, so '=' in the token is kept.
# Do not call the Bitbucket API with Python urllib.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  reply-pr-comment.sh (--comment ID | --serial N) (--body-file PATH | --body TEXT) [selector]
  reply-pr-comment.sh (--comment ID | --serial N) --resolve-only [selector]

Options:
  --comment ID           Comment to reply to (the id printed by pr-comments)
  --serial N             Open comment serial from pr-comments (#1, #2, … on that PR)
  --body-file PATH       Reply text. Prefer this for more than one line.
  --body TEXT            Reply text as one argument
  --resolve              After a successful reply, resolve the thread (Bitbucket:
                         top-level comment; GitHub: review thread)
  --resolve-only         Resolve the thread without posting a reply (pass any
                         comment id in the thread)
  --url URL              Bitbucket or GitHub pull request URL (/diff is fine)
  --pr ID                Pull request number on origin
  --head BRANCH          Source branch, when no URL or PR id is given
  --base BRANCH          Destination branch. Use with --head for an exact open PR
  --allow-resolved       Reply even when the thread is resolved
  --dry-run              Show the target comment and do not post or resolve
  -h, --help             Show this help

With no PR selector, uses the open PR for the current branch.
If more than one open PR matches, the script lists them and exits.

Requires: curl, git, python3. GitHub needs gh. Run from a git repository.
EOF
}

PR_ID=""
PR_URL=""
HEAD=""
BASE=""
COMMENT_ID=""
SERIAL=""
BODY_FILE=""
BODY_TEXT=""
ALLOW_RESOLVED=false
DRY_RUN=false
DO_RESOLVE=false
RESOLVE_ONLY=false
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PR_COMMENTS_SCRIPT="${PR_COMMENTS_SCRIPT:-$SCRIPT_DIR/pull-pr-comments.sh}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --pr) PR_ID="${2:-}"; shift 2 ;;
    --url) PR_URL="${2:-}"; shift 2 ;;
    --head) HEAD="${2:-}"; shift 2 ;;
    --base) BASE="${2:-}"; shift 2 ;;
    --comment) COMMENT_ID="${2:-}"; shift 2 ;;
    --serial) SERIAL="${2:-}"; shift 2 ;;
    --body-file) BODY_FILE="${2:-}"; shift 2 ;;
    --body) BODY_TEXT="${2:-}"; shift 2 ;;
    --resolve) DO_RESOLVE=true; shift ;;
    --resolve-only) RESOLVE_ONLY=true; DO_RESOLVE=true; shift ;;
    --allow-resolved) ALLOW_RESOLVED=true; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 1 ;;
  esac
done

if [[ -z "$COMMENT_ID" && -z "$SERIAL" ]]; then
  echo "Pass --comment ID or --serial N (from pr-comments #N on this PR)" >&2
  exit 1
fi
if [[ -n "$COMMENT_ID" && -n "$SERIAL" ]]; then
  echo "Pass --comment or --serial, not both" >&2
  exit 1
fi
if [[ -n "$SERIAL" && ! "$SERIAL" =~ ^[0-9]+$ ]]; then
  echo "--serial must be a positive integer" >&2
  exit 1
fi
if [[ -n "$BODY_FILE" && -n "$BODY_TEXT" ]]; then
  echo "Pass --body-file or --body, not both" >&2
  exit 1
fi
if [[ "$RESOLVE_ONLY" == true && ( -n "$BODY_FILE" || -n "$BODY_TEXT" ) ]]; then
  echo "--resolve-only cannot be combined with --body or --body-file" >&2
  exit 1
fi
if [[ "$RESOLVE_ONLY" != true && -z "$BODY_FILE" && -z "$BODY_TEXT" ]]; then
  echo "Pass --body-file or --body (or use --resolve-only)" >&2
  exit 1
fi
if [[ "$BODY_FILE" == "/tmp/pr-reply.txt" ]]; then
  echo "Refusing /tmp/pr-reply.txt (shared path). Use a unique file." >&2
  exit 1
fi
if [[ -n "$BODY_FILE" && ! -f "$BODY_FILE" ]]; then
  echo "Body file not found: $BODY_FILE" >&2
  exit 1
fi
if [[ -n "$BASE" && -z "$HEAD" && -z "$PR_URL" && -z "$PR_ID" ]]; then
  echo "--base requires --head" >&2
  exit 1
fi

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || {
  echo "Not inside a git repository" >&2
  exit 1
}
cd "$REPO_ROOT"

resolve_serial_to_comment_id() {
  if [[ ! -x "$PR_COMMENTS_SCRIPT" && ! -f "$PR_COMMENTS_SCRIPT" ]]; then
    echo "pr-comments script not found: $PR_COMMENTS_SCRIPT" >&2
    exit 1
  fi
  local args=()
  if [[ -n "$PR_URL" ]]; then
    args+=(--url "$PR_URL")
  elif [[ -n "$PR_ID" ]]; then
    args+=(--pr "$PR_ID")
  else
    [[ -n "$HEAD" ]] && args+=(--head "$HEAD")
    [[ -n "$BASE" ]] && args+=(--base "$BASE")
  fi
  args+=(--serial "$SERIAL")
  local mapped
  if ! mapped=$(bash "$PR_COMMENTS_SCRIPT" "${args[@]}"); then
    exit 1
  fi
  COMMENT_ID="$mapped"
  echo "serial: #$SERIAL"
  echo "comment_id: $COMMENT_ID"
}

if [[ -n "$SERIAL" ]]; then
  resolve_serial_to_comment_id
fi

if [[ ! "$COMMENT_ID" =~ ^[0-9]+$ ]]; then
  echo "--comment must be a numeric id" >&2
  exit 1
fi

normalize_url() {
  local u="$1"
  u="${u#git@}"
  u="${u//:/\/}"
  u="${u#https://}"
  u="${u#http://}"
  u="${u%.git}"
  if [[ "$u" == *@* ]]; then
    u="${u#*@}"
  fi
  printf '%s' "$u"
}

SCM_HOST=""
BB_WORKSPACE=""
BB_REPO=""
GH_OWNER=""
GH_REPO=""
URL_REPO=false

if [[ -n "$PR_URL" ]]; then
  if [[ "$PR_URL" =~ bitbucket\.org/([^/]+)/([^/]+)/pull-requests/([0-9]+) ]]; then
    BB_WORKSPACE="${BASH_REMATCH[1]}"
    BB_REPO="${BASH_REMATCH[2]}"
    PR_ID="${BASH_REMATCH[3]}"
    SCM_HOST=bitbucket
    URL_REPO=true
  elif [[ "$PR_URL" =~ github\.com/([^/]+)/([^/]+)/pull/([0-9]+) ]]; then
    GH_OWNER="${BASH_REMATCH[1]}"
    GH_REPO="${BASH_REMATCH[2]}"
    PR_ID="${BASH_REMATCH[3]}"
    SCM_HOST=github
    URL_REPO=true
  else
    echo "Could not parse a Bitbucket or GitHub pull request URL: $PR_URL" >&2
    exit 1
  fi
fi

ORIGIN_URL=$(git remote get-url origin 2>/dev/null || true)
if [[ "$URL_REPO" != true ]]; then
  if [[ -z "$ORIGIN_URL" ]]; then
    echo "No origin remote configured" >&2
    exit 1
  fi
  NORMALIZED=$(normalize_url "$ORIGIN_URL")
  if [[ "$NORMALIZED" =~ ^bitbucket\.org/([^/]+)/([^/]+)$ ]]; then
    SCM_HOST=bitbucket
    BB_WORKSPACE="${BASH_REMATCH[1]}"
    BB_REPO="${BASH_REMATCH[2]}"
  elif [[ "$NORMALIZED" =~ ^github\.com/([^/]+)/([^/]+)$ ]]; then
    SCM_HOST=github
    GH_OWNER="${BASH_REMATCH[1]}"
    GH_REPO="${BASH_REMATCH[2]}"
  else
    echo "Unsupported origin (expected Bitbucket or GitHub): $ORIGIN_URL" >&2
    exit 1
  fi
fi

if [[ -z "$PR_ID" && -z "$HEAD" ]]; then
  HEAD=$(git rev-parse --abbrev-ref HEAD)
  if [[ "$HEAD" == "HEAD" ]]; then
    echo "Detached HEAD. Pass --url, --pr, or --head and --base." >&2
    exit 1
  fi
fi

WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT

if [[ -n "$BODY_TEXT" ]]; then
  BODY_FILE="$WORKDIR/body.txt"
  printf '%s' "$BODY_TEXT" > "$BODY_FILE"
fi
if [[ "$RESOLVE_ONLY" != true ]]; then
  python3 -c 'import pathlib,sys; sys.exit(0 if pathlib.Path(sys.argv[1]).read_text().strip() else 1)' "$BODY_FILE" || {
    echo "Reply body is empty" >&2
    exit 1
  }
fi

ALLOW_FLAG=""
if [[ "$ALLOW_RESOLVED" == true ]]; then
  ALLOW_FLAG="--allow-resolved"
fi

# --- Bitbucket --------------------------------------------------------------

BB_EMAIL=""
BB_GIT_USER=""
BB_PASS=""
BB_AUTH_USER=""

load_bitbucket_auth() {
  BB_EMAIL=$(git config user.email || true)
  if [[ -z "$BB_EMAIL" ]]; then
    echo "git config user.email is required for Bitbucket API (use Atlassian account email)" >&2
    exit 1
  fi
  local git_user_hint=""
  if [[ "$ORIGIN_URL" =~ https://([^/@]+)@bitbucket\.org/ ]]; then
    git_user_hint="${BASH_REMATCH[1]}"
  fi
  local cred_in=$'protocol=https\nhost=bitbucket.org\n'
  [[ -n "$git_user_hint" ]] && cred_in+="username=${git_user_hint}"$'\n'
  cred_in+=$'\n'
  local cred
  cred=$(printf '%s' "$cred_in" | git credential fill 2>/dev/null || true)
  BB_GIT_USER=$(printf '%s\n' "$cred" | sed -n 's/^username=//p')
  BB_PASS=$(printf '%s\n' "$cred" | sed -n 's/^password=//p')
  unset cred
  if [[ -z "$BB_PASS" ]]; then
    BB_PASS="${BITBUCKET_API_TOKEN:-}"
  fi
  if [[ -z "$BB_PASS" ]]; then
    echo "No Bitbucket API token (git credential for bitbucket.org or BITBUCKET_API_TOKEN)" >&2
    exit 1
  fi
  BB_AUTH_USER="$BB_EMAIL"
}

bb_curl() {
  curl -sS -u "$BB_AUTH_USER:$BB_PASS" "$@"
}

bb_api() {
  local method="$1" url="$2" out="$3" data_file="${4:-}"
  local args=(-sS -o "$out" -w '%{http_code}' -X "$method" -H "Accept: application/json")
  if [[ -n "$data_file" ]]; then
    args+=(-H "Content-Type: application/json" --data @"$data_file")
  fi
  local code
  code=$(bb_curl "${args[@]}" "$url" || true)
  if [[ "$code" == "401" && -n "$BB_GIT_USER" && "$BB_GIT_USER" != "$BB_AUTH_USER" ]]; then
    BB_AUTH_USER="$BB_GIT_USER"
    code=$(bb_curl "${args[@]}" "$url" || true)
  fi
  printf '%s' "$code"
}

bb_fail() {
  local http="$1" out="$2" what="$3"
  echo "Bitbucket ${what} returned HTTP ${http:-network failure}" >&2
  python3 -c 'import json,sys
try:
    d=json.load(open(sys.argv[1]))
except Exception:
    sys.exit(0)
err=d.get("error") if isinstance(d, dict) else None
if isinstance(err, dict) and err.get("message"):
    print(err["message"], file=sys.stderr)
' "$out" 2>/dev/null || true
  exit 1
}

bb_root() {
  python3 -c 'import urllib.parse,sys; w,r=sys.argv[1:]; print("https://api.bitbucket.org/2.0/repositories/%s/%s" % (urllib.parse.quote(w, safe=""), urllib.parse.quote(r, safe="")))' \
    "$BB_WORKSPACE" "$BB_REPO"
}

bb_pages() {
  local url="$1" prefix="$2"
  local page=1
  while [[ -n "$url" ]]; do
    if [[ "$page" -gt 20 ]]; then
      echo "Bitbucket result was still paged after 20 requests: $prefix" >&2
      exit 1
    fi
    local out="$WORKDIR/${prefix}-${page}.json"
    local http
    http=$(bb_api GET "$url" "$out")
    if [[ "$http" != "200" ]]; then
      bb_fail "$http" "$out" "$prefix"
    fi
    printf '%s\n' "$out"
    url=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("next") or "")' "$out")
    page=$((page + 1))
  done
}

resolve_bitbucket_pr() {
  local root="$1"
  if [[ -n "$PR_ID" ]]; then
    return 0
  fi
  local q
  q=$(PR_HEAD="$HEAD" PR_BASE="$BASE" python3 - << 'PY'
import os, sys
head = os.environ["PR_HEAD"]
base = os.environ.get("PR_BASE") or ""
for label, value in (("head", head), ("base", base)):
    if any(ch in value for ch in '"\n\r\\'):
        print("Unsupported character in %s branch name" % label, file=sys.stderr)
        sys.exit(1)
query = 'state="OPEN" AND source.branch.name="%s"' % head
if base:
    query += ' AND destination.branch.name="%s"' % base
print(query)
PY
)
  local encoded
  encoded=$(python3 -c 'import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))' "$q")
  bb_pages "${root}/pullrequests?pagelen=50&q=${encoded}" "lookup" > "$WORKDIR/lookup.list"
  local list_files=()
  local line
  while IFS= read -r line; do
    [[ -n "$line" ]] && list_files+=("$line")
  done < "$WORKDIR/lookup.list"
  if [[ ${#list_files[@]} -eq 0 ]]; then
    echo "Bitbucket PR lookup returned no pages" >&2
    exit 1
  fi
  PR_ID=$(python3 -c 'import json,sys
files=sys.argv[1:]
values=[]
for path in files:
    page=json.load(open(path))
    values.extend(page.get("values") or [])
if not values:
    print("")
    sys.exit(0)
if len(values) > 1:
    print("MANY")
    for v in values:
        src=(v.get("source") or {}).get("branch", {}).get("name", "")
        dst=(v.get("destination") or {}).get("branch", {}).get("name", "")
        title=(v.get("title") or "").replace("\t", " ")
        print("%s\t%s -> %s\t%s" % (v.get("id"), src, dst, title))
    sys.exit(0)
print(values[0]["id"])
' "${list_files[@]}")
  if [[ -z "$PR_ID" ]]; then
    if [[ -n "$BASE" ]]; then
      echo "No open Bitbucket PR for ${HEAD} -> ${BASE}" >&2
    else
      echo "No open Bitbucket PR for branch: ${HEAD}" >&2
    fi
    exit 1
  fi
  if [[ "${PR_ID%%$'\n'*}" == "MANY" ]]; then
    echo "More than one open Bitbucket PR matches. Pass --url or --pr." >&2
    printf '%s\n' "$PR_ID" | tail -n +2 >&2
    exit 1
  fi
}

finish_or_dry_run() {
  if [[ "$RESOLVE_ONLY" != true ]]; then
    local bytes
    bytes=$(wc -c < "$BODY_FILE" | tr -d ' ')
    echo "body_bytes: $bytes"
  fi
  if [[ "$DRY_RUN" == true ]]; then
    echo "DRY RUN"
    exit 0
  fi
}

bb_load_comment_chain() {
  BB_CHAIN_ROOT="$1"
  local current="$COMMENT_ID"
  local depth=0
  : > "$WORKDIR/chain.list"
  while [[ -n "$current" ]]; do
    depth=$((depth + 1))
    if [[ "$depth" -gt 20 ]]; then
      echo "Comment parent chain is too deep" >&2
      exit 1
    fi
    local out="$WORKDIR/chain-${depth}.json"
    local http
    http=$(bb_api GET "${BB_CHAIN_ROOT}/pullrequests/${PR_ID}/comments/${current}" "$out")
    if [[ "$http" != "200" ]]; then
      bb_fail "$http" "$out" "comment ${current}"
    fi
    printf '%s\n' "$out" >> "$WORKDIR/chain.list"
    current=$(python3 -c 'import json,sys; c=json.load(open(sys.argv[1])); p=c.get("parent") or {}; print(p.get("id") or "")' "$out")
  done
  BB_CHAIN_FILES=()
  local line
  while IFS= read -r line; do
    [[ -n "$line" ]] && BB_CHAIN_FILES+=("$line")
  done < "$WORKDIR/chain.list"
}

bb_resolve_thread() {
  local api_root="$1"
  local root_meta="$WORKDIR/root-meta.txt"
  python3 "$SCRIPT_DIR/prepare_reply.py" root-bitbucket --chain "${BB_CHAIN_FILES[@]}" > "$root_meta"
  local thread_root
  thread_root=$(sed -n 's/^thread_root: //p' "$root_meta" | head -1)
  if [[ -z "$thread_root" ]]; then
    echo "Could not determine Bitbucket thread root" >&2
    exit 1
  fi
  if grep -q '^already_resolved: yes' "$root_meta"; then
    echo "RESOLVED"
    echo "thread_root: $thread_root"
    echo "already_resolved: yes"
    return 0
  fi
  printf '{}' > "$WORKDIR/resolve-payload.json"
  local resolved="$WORKDIR/resolved.json"
  local http
  http=$(bb_api POST \
    "${api_root}/pullrequests/${PR_ID}/comments/${thread_root}/resolve" \
    "$resolved" "$WORKDIR/resolve-payload.json")
  if [[ "$http" != "200" && "$http" != "201" ]]; then
    bb_fail "$http" "$resolved" "resolve thread ${thread_root}"
  fi
  python3 "$SCRIPT_DIR/prepare_reply.py" verify-resolve-bitbucket --response "$resolved"
  echo "thread_root: $thread_root"
}

reply_bitbucket() {
  load_bitbucket_auth
  local root
  root=$(bb_root)
  resolve_bitbucket_pr "$root"

  local meta="$WORKDIR/meta.json"
  local http
  http=$(bb_api GET "${root}/pullrequests/${PR_ID}" "$meta")
  if [[ "$http" != "200" ]]; then
    bb_fail "$http" "$meta" "pull request"
  fi

  bb_load_comment_chain "$root"

  if [[ "$RESOLVE_ONLY" == true ]]; then
    if [[ "$DRY_RUN" == true ]]; then
      python3 "$SCRIPT_DIR/prepare_reply.py" root-bitbucket --chain "${BB_CHAIN_FILES[@]}"
      echo "DRY RUN"
      exit 0
    fi
    bb_resolve_thread "$root"
    return 0
  fi

  python3 "$SCRIPT_DIR/prepare_reply.py" target-bitbucket \
    --pr "$PR_ID" \
    --chain "${BB_CHAIN_FILES[@]}" \
    ${ALLOW_FLAG:+"$ALLOW_FLAG"}

  finish_or_dry_run

  python3 "$SCRIPT_DIR/prepare_reply.py" payload \
    --host bitbucket --comment "$COMMENT_ID" --body-file "$BODY_FILE" --out "$WORKDIR/payload.json"
  local posted="$WORKDIR/posted.json"
  http=$(bb_api POST "${root}/pullrequests/${PR_ID}/comments" "$posted" "$WORKDIR/payload.json")
  if [[ "$http" != "201" ]]; then
    bb_fail "$http" "$posted" "reply"
  fi
  python3 "$SCRIPT_DIR/prepare_reply.py" verify \
    --host bitbucket --comment "$COMMENT_ID" --body-file "$BODY_FILE" \
    --response "$posted" --meta "$meta"
  if [[ "$DO_RESOLVE" == true ]]; then
    bb_resolve_thread "$root"
  fi
}

# --- GitHub -----------------------------------------------------------------

resolve_github_pr() {
  local repo="${GH_OWNER}/${GH_REPO}"
  if [[ -n "$PR_ID" ]]; then
    return 0
  fi
  local list="$WORKDIR/pr-list.json"
  if [[ -n "$BASE" ]]; then
    gh pr list --repo "$repo" --head "$HEAD" --base "$BASE" --state open \
      --json number,title,headRefName,baseRefName > "$list"
  else
    gh pr list --repo "$repo" --head "$HEAD" --state open \
      --json number,title,headRefName,baseRefName > "$list"
  fi
  PR_ID=$(python3 -c 'import json,sys
rows=json.load(open(sys.argv[1]))
if not rows:
    print("")
elif len(rows)==1:
    print(rows[0]["number"])
else:
    print("MANY")
    for row in rows:
        title=(row.get("title") or "").replace("\t", " ")
        print("%s\t%s -> %s\t%s" % (row.get("number"), row.get("headRefName", ""), row.get("baseRefName", ""), title))
' "$list")
  if [[ -z "$PR_ID" ]]; then
    if [[ -n "$BASE" ]]; then
      echo "No open GitHub PR for ${HEAD} -> ${BASE}" >&2
    else
      echo "No open GitHub PR for branch: ${HEAD}" >&2
    fi
    exit 1
  fi
  if [[ "${PR_ID%%$'\n'*}" == "MANY" ]]; then
    echo "More than one open GitHub PR matches. Pass --url or --pr." >&2
    printf '%s\n' "$PR_ID" | tail -n +2 >&2
    exit 1
  fi
}

reply_github() {
  if ! command -v gh >/dev/null 2>&1; then
    echo "GitHub CLI (gh) is required" >&2
    exit 1
  fi
  resolve_github_pr
  local repo="${GH_OWNER}/${GH_REPO}"
  local meta="$WORKDIR/meta.json"
  gh pr view "$PR_ID" --repo "$repo" \
    --json number,title,url,state,headRefName,baseRefName > "$meta"

  local comment="$WORKDIR/comment.json"
  if ! gh api "repos/${GH_OWNER}/${GH_REPO}/pulls/comments/${COMMENT_ID}" > "$comment"; then
    echo "GitHub comment ${COMMENT_ID} is not a pull request review comment" >&2
    exit 1
  fi

  gh_fetch_review_threads "$repo"

  if [[ "$RESOLVE_ONLY" == true ]]; then
    if [[ "$DRY_RUN" == true ]]; then
      python3 "$SCRIPT_DIR/prepare_reply.py" thread-github \
        --comment-id "$COMMENT_ID" --threads "$WORKDIR/threads.json"
      echo "DRY RUN"
      exit 0
    fi
    gh_resolve_review_thread
    return 0
  fi

  python3 "$SCRIPT_DIR/prepare_reply.py" target-github \
    --pr "$PR_ID" --comment-id "$COMMENT_ID" \
    --comment "$comment" --threads "$WORKDIR/threads.json" \
    ${ALLOW_FLAG:+"$ALLOW_FLAG"}

  finish_or_dry_run

  python3 "$SCRIPT_DIR/prepare_reply.py" payload \
    --host github --comment "$COMMENT_ID" --body-file "$BODY_FILE" --out "$WORKDIR/payload.json"
  gh api --method POST \
    "repos/${GH_OWNER}/${GH_REPO}/pulls/${PR_ID}/comments/${COMMENT_ID}/replies" \
    --input "$WORKDIR/payload.json" > "$WORKDIR/posted.json"
  python3 "$SCRIPT_DIR/prepare_reply.py" verify \
    --host github --comment "$COMMENT_ID" --body-file "$BODY_FILE" \
    --response "$WORKDIR/posted.json" --meta "$meta"
  if [[ "$DO_RESOLVE" == true ]]; then
    gh_resolve_review_thread
  fi
}

gh_fetch_review_threads() {
  local repo="$1"
  gh api graphql --paginate --slurp \
    -F owner="$GH_OWNER" -F name="$GH_REPO" -F number="$PR_ID" \
    -f query='
      query($owner: String!, $name: String!, $number: Int!, $endCursor: String) {
        repository(owner: $owner, name: $name) {
          pullRequest(number: $number) {
            reviewThreads(first: 100, after: $endCursor) {
              pageInfo { hasNextPage endCursor }
              nodes {
                id
                isResolved
                comments(first: 100) {
                  pageInfo { hasNextPage }
                  nodes { databaseId }
                }
              }
            }
          }
        }
      }
    ' > "$WORKDIR/threads.json"
}

gh_resolve_review_thread() {
  local thread_meta="$WORKDIR/thread-meta.txt"
  python3 "$SCRIPT_DIR/prepare_reply.py" thread-github \
    --comment-id "$COMMENT_ID" --threads "$WORKDIR/threads.json" > "$thread_meta"
  local thread_id
  thread_id=$(sed -n 's/^thread_id: //p' "$thread_meta" | head -1)
  if [[ -z "$thread_id" ]]; then
    echo "Could not determine GitHub review thread id" >&2
    exit 1
  fi
  if grep -q '^already_resolved: yes' "$thread_meta"; then
    echo "RESOLVED"
    echo "thread_id: $thread_id"
    echo "already_resolved: yes"
    return 0
  fi
  gh api graphql \
    -f query='mutation($id: ID!) { resolveReviewThread(input: {threadId: $id}) { thread { id isResolved } } }' \
    -f id="$thread_id" > "$WORKDIR/resolved.json"
  python3 "$SCRIPT_DIR/prepare_reply.py" verify-resolve-github --response "$WORKDIR/resolved.json"
  echo "thread_id: $thread_id"
}

case "$SCM_HOST" in
  bitbucket) reply_bitbucket ;;
  github) reply_github ;;
  *) echo "Unsupported host" >&2; exit 1 ;;
esac
