#!/usr/bin/env bash
# Print pull request comments. Resolved threads are omitted unless --include-resolved.
# Auth: Bitbucket — git config user.email + full git credential token (curl).
#       GitHub — gh CLI (must be authenticated).
# Never print credentials. Read the token with sed, not awk -F=, so '=' in the token is kept.
# Do not call the Bitbucket API with Python urllib.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  pull-pr-comments.sh [--url URL | --pr ID | --head BRANCH --base BRANCH] [--include-resolved]
  pull-pr-comments.sh ... --serial N

Options:
  --url URL              Bitbucket or GitHub pull request URL (/diff is fine)
  --pr ID                Pull request number on origin
  --head BRANCH          Source branch. Used when no URL or PR id is given.
  --base BRANCH          Destination branch. Use with --head for an exact open PR.
  --include-resolved     Also print resolved threads
  --serial N             Print only the comment id for open comment #N (#1 = first open)
  -h, --help             Show this help

With no selector, uses the current branch as --head and the open PR into any base.
If more than one open PR matches, the script lists them and exits.

Requires: curl, git, python3. GitHub needs gh. Run from a git repository.
EOF
}

PR_ID=""
PR_URL=""
HEAD=""
BASE=""
INCLUDE_RESOLVED=false
SERIAL=""
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

while [[ $# -gt 0 ]]; do
  case "$1" in
    --pr) PR_ID="${2:-}"; shift 2 ;;
    --url) PR_URL="${2:-}"; shift 2 ;;
    --head) HEAD="${2:-}"; shift 2 ;;
    --base) BASE="${2:-}"; shift 2 ;;
    --serial) SERIAL="${2:-}"; shift 2 ;;
    --include-resolved) INCLUDE_RESOLVED=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 1 ;;
  esac
done

if [[ -n "$BASE" && -z "$HEAD" && -z "$PR_URL" && -z "$PR_ID" ]]; then
  echo "--base requires --head" >&2
  exit 1
fi
if [[ -n "$SERIAL" && ! "$SERIAL" =~ ^[0-9]+$ ]]; then
  echo "--serial must be a positive integer" >&2
  exit 1
fi

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || {
  echo "Not inside a git repository" >&2
  exit 1
}
cd "$REPO_ROOT"

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

RESOLVED_ARG=""
if [[ "$INCLUDE_RESOLVED" == true ]]; then
  RESOLVED_ARG="--include-resolved"
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
  local method="$1" url="$2" out="$3"
  local args=(-sS -o "$out" -w '%{http_code}' -X "$method" -H "Accept: application/json")
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

# Download every page of a Bitbucket list. Prints one file path per line.
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

pull_bitbucket() {
  load_bitbucket_auth
  local root
  root=$(bb_root)

  if [[ -z "$PR_ID" ]]; then
    local q
    q=$(PR_HEAD="$HEAD" PR_BASE="$BASE" python3 - << 'PY'
import os, sys
head = os.environ["PR_HEAD"]
base = os.environ.get("PR_BASE") or ""
for label, value in (("head", head), ("base", base)):
    if any(ch in value for ch in '"\n\r\\'):
        print(f"Unsupported character in {label} branch name", file=sys.stderr)
        sys.exit(1)
query = f'state="OPEN" AND source.branch.name="{head}"'
if base:
    query += f' AND destination.branch.name="{base}"'
print(query)
PY
)
    local encoded
    encoded=$(python3 -c 'import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))' "$q")
    local list_url="${root}/pullrequests?pagelen=50&q=${encoded}"
    bb_pages "$list_url" "lookup" > "$WORKDIR/lookup.list"
    local list_files=()
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
  fi

  local meta="$WORKDIR/meta.json"
  local http
  http=$(bb_api GET "${root}/pullrequests/${PR_ID}" "$meta")
  if [[ "$http" != "200" ]]; then
    bb_fail "$http" "$meta" "pull request"
  fi

  bb_pages "${root}/pullrequests/${PR_ID}/comments?pagelen=100" "comments" > "$WORKDIR/comment.list"
  local comment_files=()
  while IFS= read -r line; do
    [[ -n "$line" ]] && comment_files+=("$line")
  done < "$WORKDIR/comment.list"
  if [[ ${#comment_files[@]} -eq 0 ]]; then
    echo "Bitbucket comments lookup returned no pages" >&2
    exit 1
  fi

  python3 "$SCRIPT_DIR/format_comments.py" bitbucket \
    --meta "$meta" \
    --pages "${comment_files[@]}" \
    ${RESOLVED_ARG:+"$RESOLVED_ARG"} \
    ${SERIAL:+--serial "$SERIAL"}
}

# --- GitHub -----------------------------------------------------------------

pull_github() {
  if ! command -v gh >/dev/null 2>&1; then
    echo "GitHub CLI (gh) is required" >&2
    exit 1
  fi
  local repo="${GH_OWNER}/${GH_REPO}"

  if [[ -z "$PR_ID" ]]; then
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
  fi

  local meta="$WORKDIR/meta.json"
  gh pr view "$PR_ID" --repo "$repo" \
    --json number,title,url,state,headRefName,baseRefName > "$meta"

  gh api --paginate --slurp "repos/${GH_OWNER}/${GH_REPO}/pulls/${PR_ID}/comments" \
    > "$WORKDIR/review-comments.json"
  gh api --paginate --slurp "repos/${GH_OWNER}/${GH_REPO}/issues/${PR_ID}/comments" \
    > "$WORKDIR/issue-comments.json"
  gh api --paginate --slurp "repos/${GH_OWNER}/${GH_REPO}/pulls/${PR_ID}/reviews" \
    > "$WORKDIR/reviews.json"

  # $endCursor is the name gh --paginate follows. Inner comment pages are capped at 100.
  gh api graphql --paginate --slurp \
    -F owner="$GH_OWNER" -F name="$GH_REPO" -F number="$PR_ID" \
    -f query='
      query($owner: String!, $name: String!, $number: Int!, $endCursor: String) {
        repository(owner: $owner, name: $name) {
          pullRequest(number: $number) {
            reviewThreads(first: 100, after: $endCursor) {
              pageInfo { hasNextPage endCursor }
              nodes {
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

  python3 "$SCRIPT_DIR/format_comments.py" github \
    --meta "$meta" \
    --review-comments "$WORKDIR/review-comments.json" \
    --issue-comments "$WORKDIR/issue-comments.json" \
    --reviews "$WORKDIR/reviews.json" \
    --threads "$WORKDIR/threads.json" \
    ${RESOLVED_ARG:+"$RESOLVED_ARG"} \
    ${SERIAL:+--serial "$SERIAL"}
}

case "$SCM_HOST" in
  bitbucket) pull_bitbucket ;;
  github) pull_github ;;
  *) echo "Unsupported host" >&2; exit 1 ;;
esac
