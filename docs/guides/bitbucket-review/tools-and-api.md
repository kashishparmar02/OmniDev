# MCP tools and Bitbucket API

## 1. MCP server

- **Name:** `bitbucket-pr-review`
- **Transport:** stdio
- **Entrypoint:** `bin/run-mcp.sh` → `node --env-file=.env dist/mcp/server.js`
- **Identifier in Cursor logs:** `user-bitbucket-pr-review`

## 2. Tool catalog

### Read / inspect

| Tool | Purpose | Side effects |
|---|---|---|
| `bitbucket_parse_pr_url` | Parse Bitbucket Cloud PR URL → workspace, repoSlug, pullRequestId | None |
| `bitbucket_get_current_user` | Auth self-check (`GET /2.0/user`) | None |
| `bitbucket_get_pr` | PR metadata | None |
| `bitbucket_get_pr_diff` | Unified diff text (+ byte size) | None |
| `bitbucket_get_pr_files` | Diffstat / changed files | None |
| `bitbucket_get_pr_commits` | Commits on the PR | None |
| `bitbucket_get_pr_comments` | Existing PR comments | None |
| `bitbucket_get_pr_activity` | Activity feed (capped pages) | None |
| `bitbucket_validate_comment_anchor` | Check path/line/side against live diff | None |
| `bitbucket_resolve_local_repo` | Find matching clone under configured roots | None |

### Workspace preparation

| Tool | Purpose | Side effects |
|---|---|---|
| `bitbucket_prepare_review_workspace` | Resolve/clone, fetch refs, optional detached worktree | May `git fetch`, `git clone`, `git worktree add` — does not checkout user’s current branch |

### Publish (gated)

All require **`confirmed=true`**. Without it, tools refuse.

| Tool | Purpose |
|---|---|
| `bitbucket_post_inline_comment` | Validate anchor → optional duplicate check → POST inline comment |
| `bitbucket_post_pr_summary` | POST general (non-inline) PR comment |
| `bitbucket_publish_approved_findings` | Batch publish selected `ReviewFinding`s; optional summary |
| `bitbucket_delete_comment` | Delete a comment by id (cleanup / probes) |

## 3. Common tool inputs

Most PR tools accept either:

```json
{ "url": "https://bitbucket.org/{workspace}/{repo}/pull-requests/{id}" }
```

or:

```json
{
  "workspace": "acme",
  "repoSlug": "sample-app",
  "pullRequestId": 218
}
```

Inline publish example:

```json
{
  "url": "https://bitbucket.org/acme/sample-app/pull-requests/218",
  "content": "Do these awaits need to stay sequential?",
  "path": "src/app/app.component.ts",
  "line": 42,
  "side": "new",
  "confirmed": true
}
```

## 4. Bitbucket Cloud REST endpoints used

Base: `https://api.bitbucket.org/2.0`

| Operation | Method + path |
|---|---|
| Current user | `GET /user` |
| Get PR | `GET /repositories/{workspace}/{repo_slug}/pullrequests/{id}` |
| Diff | `GET .../pullrequests/{id}/diff` *(may 302; client follows)* |
| Diffstat | `GET .../pullrequests/{id}/diffstat` |
| Commits | `GET .../pullrequests/{id}/commits` |
| Activity | `GET .../pullrequests/{id}/activity` |
| List comments | `GET .../pullrequests/{id}/comments` |
| Create comment | `POST .../pullrequests/{id}/comments` |
| Delete comment | `DELETE .../pullrequests/{id}/comments/{comment_id}` |

### Create comment body shapes

General:

```json
{ "content": { "raw": "summary text" } }
```

Inline (new side):

```json
{
  "content": { "raw": "..." },
  "inline": { "path": "src/file.ts", "to": 42 }
}
```

Inline (old/deleted side):

```json
{
  "content": { "raw": "..." },
  "inline": { "path": "src/file.ts", "from": 10 }
}
```

## 5. Authentication

Preferred: **Bitbucket API token with scopes** (App Passwords are legacy).

### HTTP

- Basic: `Authorization: Basic base64(email:api_token)`
- Also supported by Bitbucket: `Authorization: Bearer {api_token}`

Implementation uses Basic with `BITBUCKET_EMAIL` + `BITBUCKET_API_TOKEN`.

### Required scopes

| Scope | Needed for |
|---|---|
| `read:pullrequest:bitbucket` | Fetch PRs **and post comments** |
| `read:repository:bitbucket` | Repo/diffstat-related access, HTTPS clone if enabled |
| `read:user:bitbucket` (optional) | Cleaner `/user` checks |
| `read:workspace:bitbucket` (optional) | Workspace lookups |

### Explicitly avoid

| Scope | Why |
|---|---|
| `write:pullrequest:bitbucket` | Approve / decline / merge |
| `write:repository:bitbucket` | Push code |

Live proof: comment `201`, approve `403` “credentials lack … privilege scopes”.

### Git auth

- Default clone/fetch: **SSH** (`git@bitbucket.org:...`) — already working on this machine
- HTTPS clone only if `BITBUCKET_ALLOW_HTTPS_CLONE=1` (uses username/token, then rewrites remote to token-free URL)

## 6. Client reliability features

Implemented in `src/bitbucket/client.ts` and helpers:

- Follow HTTP redirects (critical for diff/diffstat)
- Retry on 429 / 5xx with backoff
- Request timeout (60s)
- Structured `AppError` with status + redacted messages
- Pagination collector for list endpoints
- Secret redaction (`ATATT…`, Basic/Bearer headers)

## 7. CLI counterparts (non-MCP)

```bash
npm run check:auth
npm run check:pr -- "https://bitbucket.org/acme/sample-app/pull-requests/218"
```

Useful when debugging MCP spawn issues independently of Cursor.
