#!/usr/bin/env bash
# Create a pull request or update its description on Bitbucket or GitHub.
# Auth: Bitbucket — git config user.email + full git credential token (curl).
#       GitHub — gh CLI (must be authenticated).
# Never print credentials. Read the token with sed, not awk -F=, so '=' in the token is kept.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  publish-pr-description.sh --body-file PATH [options]
  publish-pr-description.sh --body TEXT [options]

Options:
  --pr ID              Pull request number (update this PR)
  --url URL            PR URL (extracts host + PR id)
  --body-file PATH     Markdown description file (unique path; not /tmp/pr-description.md)
  --body TEXT          Inline description (prefer --body-file for multiline)
  --create             Open a PR when none is open for --head into --base; otherwise update it
  --title TEXT         Title used when creating. Ignored on update unless --update-title
  --head BRANCH        Source branch (default: current branch)
  --base BRANCH        Target branch (required with --create)
  --update-title       Also set --title when updating an existing PR
  --close-source       Bitbucket only: close the source branch on merge
  --dry-run            Print the action; do not create or update
  -h, --help           Show this help

If --pr / --url is omitted and --create is omitted, updates the open PR for --head.
If --create is set and an open PR for head -> base already exists, its description is updated.

Requires: curl, git, python3. GitHub needs `gh`. Run from a git repository root.
EOF
}

PR_ID=""
PR_URL=""
BODY_FILE=""
BODY_TEXT=""
DRY_RUN=false
CREATE=false
TITLE=""
HEAD=""
BASE=""
UPDATE_TITLE=false
CLOSE_SOURCE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --pr) PR_ID="${2:-}"; shift 2 ;;
    --url) PR_URL="${2:-}"; shift 2 ;;
    --body-file) BODY_FILE="${2:-}"; shift 2 ;;
    --body) BODY_TEXT="${2:-}"; shift 2 ;;
    --create) CREATE=true; shift ;;
    --title) TITLE="${2:-}"; shift 2 ;;
    --head) HEAD="${2:-}"; shift 2 ;;
    --base) BASE="${2:-}"; shift 2 ;;
    --update-title) UPDATE_TITLE=true; shift ;;
    --close-source) CLOSE_SOURCE=true; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 1 ;;
  esac
done

if [[ -n "$PR_URL" ]]; then
  if [[ "$PR_URL" =~ bitbucket\.org/[^/]+/[^/]+/pull-requests/([0-9]+) ]]; then
    PR_ID="${BASH_REMATCH[1]}"
    SCM_HOST=bitbucket
  elif [[ "$PR_URL" =~ github\.com/[^/]+/[^/]+/pull/([0-9]+) ]]; then
    PR_ID="${BASH_REMATCH[1]}"
    SCM_HOST=github
  else
    echo "Could not parse PR id from URL: $PR_URL" >&2
    exit 1
  fi
fi

if [[ -n "$BODY_FILE" ]]; then
  [[ -f "$BODY_FILE" ]] || { echo "Body file not found: $BODY_FILE" >&2; exit 1; }
elif [[ -n "$BODY_TEXT" ]]; then
  BODY_FILE=$(mktemp)
  trap 'rm -f "$BODY_FILE"' EXIT
  printf '%s' "$BODY_TEXT" > "$BODY_FILE"
else
  echo "Provide --body-file or --body" >&2
  usage >&2
  exit 1
fi

if [[ "$BODY_FILE" == "/tmp/pr-description.md" ]]; then
  echo "Refusing /tmp/pr-description.md (shared path; another run can overwrite it). Use a unique file." >&2
  exit 1
fi

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || {
  echo "Not inside a git repository" >&2
  exit 1
}
cd "$REPO_ROOT"

if [[ -z "$HEAD" ]]; then
  HEAD=$(git rev-parse --abbrev-ref HEAD)
fi

ORIGIN_URL=$(git remote get-url origin 2>/dev/null || true)
if [[ -z "$ORIGIN_URL" ]]; then
  echo "No origin remote configured" >&2
  exit 1
fi

normalize_url() {
  local u="$1"
  u="${u#git@}"
  u="${u//:/\/}"
  u="${u#https://}"
  u="${u#http://}"
  u="${u%.git}"
  # https://user@host/path → host/path
  if [[ "$u" == *@* ]]; then
    u="${u#*@}"
  fi
  echo "$u"
}

NORMALIZED=$(normalize_url "$ORIGIN_URL")

if [[ -z "${SCM_HOST:-}" ]]; then
  if [[ "$NORMALIZED" == bitbucket.org/* ]]; then
    SCM_HOST=bitbucket
  elif [[ "$NORMALIZED" == github.com/* ]]; then
    SCM_HOST=github
  else
    echo "Unsupported origin (expected Bitbucket or GitHub): $ORIGIN_URL" >&2
    exit 1
  fi
fi

# Bitbucket auth. Password is everything after the first '=' on the password line.
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
  local cred git_user_hint=""
  # https://user@bitbucket.org/... — hint with that username.
  # git@bitbucket.org:workspace/repo is the workspace, not the git user; do not hint with it.
  if [[ "$ORIGIN_URL" =~ https://([^/@]+)@bitbucket\.org/ ]]; then
    git_user_hint="${BASH_REMATCH[1]}"
  fi
  local cred_in=$'protocol=https\nhost=bitbucket.org\n'
  [[ -n "$git_user_hint" ]] && cred_in+="username=${git_user_hint}"$'\n'
  cred_in+=$'\n'
  cred=$(printf '%s' "$cred_in" | git credential fill 2>/dev/null || true)
  BB_GIT_USER=$(printf '%s\n' "$cred" | sed -n 's/^username=//p')
  BB_PASS=$(printf '%s\n' "$cred" | sed -n 's/^password=//p')
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

# Run curl. On 401, retry once with the git credential username (app password style).
bb_api() {
  local method="$1" url="$2" data_file="$3" out="$4"
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

resolve_bitbucket_repo() {
  if [[ "$NORMALIZED" =~ ^bitbucket.org/([^/]+)/([^/]+)$ ]]; then
    BB_WORKSPACE="${BASH_REMATCH[1]}"
    BB_REPO="${BASH_REMATCH[2]}"
  else
    echo "Could not parse Bitbucket workspace/repo from origin" >&2
    exit 1
  fi
}

write_payload() {
  local dest="$1" mode="$2"
  PR_BODY_FILE="$BODY_FILE" PR_TITLE="$TITLE" PR_HEAD="$HEAD" PR_BASE="$BASE" \
    PR_MODE="$mode" PR_UPDATE_TITLE="$([[ "$UPDATE_TITLE" == true ]] && echo 1 || echo 0)" \
    PR_CLOSE_SOURCE="$([[ "$CLOSE_SOURCE" == true ]] && echo 1 || echo 0)" \
    PR_PAYLOAD="$dest" \
    python3 - << 'PY'
import json, os, pathlib
mode = os.environ["PR_MODE"]
description = pathlib.Path(os.environ["PR_BODY_FILE"]).read_text()
if mode == "create":
    body = {
        "title": os.environ["PR_TITLE"],
        "description": description,
        "source": {"branch": {"name": os.environ["PR_HEAD"]}},
        "destination": {"branch": {"name": os.environ["PR_BASE"]}},
        "close_source_branch": os.environ.get("PR_CLOSE_SOURCE") == "1",
    }
else:
    body = {"description": description}
    if os.environ.get("PR_UPDATE_TITLE") == "1" and os.environ.get("PR_TITLE"):
        body["title"] = os.environ["PR_TITLE"]
pathlib.Path(os.environ["PR_PAYLOAD"]).write_text(json.dumps(body))
PY
}

descriptions_match() {
  local live_file="$1"
  PR_BODY_FILE="$BODY_FILE" PR_LIVE_FILE="$live_file" python3 - << 'PY'
import json, os, pathlib, sys
live = json.load(open(os.environ["PR_LIVE_FILE"]))
got = (live.get("description") or "").replace("\r\n", "\n").rstrip("\n")
expected = pathlib.Path(os.environ["PR_BODY_FILE"]).read_text().replace("\r\n", "\n").rstrip("\n")
if got == expected:
    sys.exit(0)
print("Description on the PR does not match the body file.", file=sys.stderr)
print("EXPECTED_START:", expected.splitlines()[0] if expected else "", file=sys.stderr)
print("LIVE_START:", got.splitlines()[0] if got else "", file=sys.stderr)
sys.exit(1)
PY
}

find_bitbucket_pr() {
  local branch="$1" dest="${2:-}"
  local q="state=\"OPEN\" AND source.branch.name=\"${branch}\""
  if [[ -n "$dest" ]]; then
    q+=" AND destination.branch.name=\"${dest}\""
  fi
  local encoded
  encoded=$(python3 -c 'import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))' "$q")
  local out
  out=$(mktemp)
  local api="https://api.bitbucket.org/2.0/repositories/${BB_WORKSPACE}/${BB_REPO}/pullrequests?q=${encoded}&pagelen=5"
  local http
  http=$(bb_api GET "$api" "" "$out")
  if [[ "$http" != "200" ]]; then
    echo "Bitbucket PR lookup returned HTTP $http" >&2
    python3 -c "import json; print(json.load(open('$out')))" 2>/dev/null || cat "$out" >&2
    rm -f "$out"
    exit 1
  fi
  PR_ID=$(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); v=d.get("values") or []; print(v[0]["id"] if v else "")' "$out")
  rm -f "$out"
}

bitbucket_pr_url() {
  local id="$1" out="$2"
  python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print(d.get("links",{}).get("html",{}).get("href",""))' "$out"
}

raise_bitbucket() {
  load_bitbucket_auth
  resolve_bitbucket_repo
  local action="update"
  if [[ -z "$PR_ID" ]]; then
    if [[ "$CREATE" == true && -z "$BASE" ]]; then
      echo "--base is required with --create" >&2
      exit 1
    fi
    find_bitbucket_pr "$HEAD" "$BASE"
    if [[ -z "$PR_ID" ]]; then
      if [[ "$CREATE" != true ]]; then
        echo "No open Bitbucket PR found for branch: $HEAD" >&2
        exit 1
      fi
      if [[ -z "$TITLE" ]]; then
        echo "--title is required to create a Bitbucket PR" >&2
        exit 1
      fi
      action="create"
    fi
  fi

  local api="https://api.bitbucket.org/2.0/repositories/${BB_WORKSPACE}/${BB_REPO}/pullrequests"
  if [[ "$action" == "update" ]]; then
    api="${api}/${PR_ID}"
  fi

  if $DRY_RUN; then
    echo "DRY RUN: $(printf '%s' "$action" | tr '[:lower:]' '[:upper:]') bitbucket ${HEAD} -> ${BASE:-?} (description bytes: $(wc -c < "$BODY_FILE" | tr -d ' '))"
    [[ "$action" == "update" ]] && echo "PR $PR_ID"
    exit 0
  fi

  local payload out http method
  payload=$(mktemp)
  out=$(mktemp)
  write_payload "$payload" "$action"
  if [[ "$action" == "create" ]]; then
    method=POST
  else
    method=PUT
  fi
  http=$(bb_api "$method" "$api" "$payload" "$out")
  local expect="200"
  [[ "$action" == "create" ]] && expect="201"
  if [[ "$http" != "$expect" ]]; then
    echo "Bitbucket API returned HTTP $http" >&2
    python3 -c "import json; print(json.load(open('$out')))" 2>/dev/null || cat "$out" >&2
    rm -f "$payload" "$out"
    exit 1
  fi

  local url
  url=$(bitbucket_pr_url "" "$out")
  if [[ "$action" == "create" ]]; then
    PR_ID=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["id"])' "$out")
  fi
  rm -f "$payload" "$out"

  local verify
  verify=$(mktemp)
  http=$(bb_api GET "https://api.bitbucket.org/2.0/repositories/${BB_WORKSPACE}/${BB_REPO}/pullrequests/${PR_ID}" "" "$verify")
  if [[ "$http" != "200" ]]; then
    echo "Bitbucket verify returned HTTP $http" >&2
    rm -f "$verify"
    exit 1
  fi
  descriptions_match "$verify"
  rm -f "$verify"
  echo "$(printf '%s' "$action" | tr '[:lower:]' '[:upper:]')"
  echo "$url"
}

find_github_pr() {
  local json number
  if [[ -n "$BASE" ]]; then
    json=$(gh pr list --head "$HEAD" --base "$BASE" --state open --json number,url)
  else
    json=$(gh pr list --head "$HEAD" --state open --json number,url)
  fi
  number=$(python3 -c 'import json,sys; v=json.loads(sys.argv[1]); print(v[0]["number"] if v else "")' "$json")
  printf '%s' "$number"
}

raise_github() {
  if ! command -v gh >/dev/null 2>&1; then
    echo "GitHub CLI (gh) is required" >&2
    exit 1
  fi
  local action="update"
  if [[ -z "$PR_ID" ]]; then
    if [[ "$CREATE" == true && -z "$BASE" ]]; then
      echo "--base is required with --create" >&2
      exit 1
    fi
    PR_ID=$(find_github_pr)
    if [[ -z "$PR_ID" ]]; then
      if [[ "$CREATE" != true ]]; then
        echo "No open GitHub PR for branch: $HEAD" >&2
        exit 1
      fi
      if [[ -z "$TITLE" ]]; then
        echo "--title is required to create a GitHub PR" >&2
        exit 1
      fi
      action="create"
    fi
  fi

  if $DRY_RUN; then
    echo "DRY RUN: $(printf '%s' "$action" | tr '[:lower:]' '[:upper:]') github ${HEAD} -> ${BASE:-?} (description bytes: $(wc -c < "$BODY_FILE" | tr -d ' '))"
    [[ "$action" == "update" ]] && echo "PR $PR_ID"
    exit 0
  fi

  if [[ "$action" == "create" ]]; then
    gh pr create --base "$BASE" --head "$HEAD" --title "$TITLE" --body-file "$BODY_FILE"
  else
    if [[ "$UPDATE_TITLE" == true && -n "$TITLE" ]]; then
      gh pr edit "$PR_ID" --title "$TITLE" --body-file "$BODY_FILE"
    else
      gh pr edit "$PR_ID" --body-file "$BODY_FILE"
    fi
  fi

  local live
  live=$(mktemp)
  gh pr view "$PR_ID" --json body,url > "$live"
  PR_BODY_FILE="$BODY_FILE" PR_LIVE_FILE="$live" python3 - << 'PY'
import json, os, pathlib, sys
live = json.load(open(os.environ["PR_LIVE_FILE"]))
got = (live.get("body") or "").replace("\r\n", "\n").rstrip("\n")
expected = pathlib.Path(os.environ["PR_BODY_FILE"]).read_text().replace("\r\n", "\n").rstrip("\n")
url = (live.get("url") or "").strip()
if got != expected:
    print("Description on the PR does not match the body file.", file=sys.stderr)
    print("EXPECTED_START:", expected.splitlines()[0] if expected else "", file=sys.stderr)
    print("LIVE_START:", got.splitlines()[0] if got else "", file=sys.stderr)
    sys.exit(1)
open(os.environ["PR_LIVE_FILE"] + ".url", "w").write(url)
PY
  local url
  url=$(cat "$live.url")
  rm -f "$live" "$live.url"
  echo "$(printf '%s' "$action" | tr '[:lower:]' '[:upper:]')"
  echo "$url"
}

case "$SCM_HOST" in
  bitbucket) raise_bitbucket ;;
  github) raise_github ;;
  *) echo "Unknown SCM host: $SCM_HOST" >&2; exit 1 ;;
esac
