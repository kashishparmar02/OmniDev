# End-to-end flows

## 1. Happy path — review + approve + publish

```mermaid
sequenceDiagram
  actor U as User
  participant A as Cursor Agent
  participant M as bitbucket-pr-review MCP
  participant G as Local Git / ASSET
  participant B as Bitbucket Cloud

  U->>A: Review this Bitbucket PR: URL
  A->>M: bitbucket_parse_pr_url
  A->>M: bitbucket_get_pr / files / diff / commits / comments
  M->>B: GET pullrequests, diffstat, diff, commits, comments
  A->>M: bitbucket_resolve_local_repo
  M->>G: Match origin remote under ASSET roots
  alt repo missing locally
    A->>M: bitbucket_prepare_review_workspace
    M->>G: SSH clone + fetch + optional worktree
  else repo present
    A->>M: bitbucket_prepare_review_workspace
    M->>G: fetch refs + optional detached worktree
  end
  A->>G: Explore changed files + callers/tests/SQL/etc.
  opt complex risk areas
    A->>A: Delegate sql/security/performance/regression agents
  end
  A->>A: Validate + dedupe findings
  A->>U: Structured review report (no publish yet)
  U->>A: Approve selected finding IDs / edit text
  A->>M: bitbucket_validate_comment_anchor (per finding)
  A->>M: bitbucket_publish_approved_findings confirmed=true
  M->>B: POST inline comments for approved anchors only
  A->>U: Published / skipped / unanchorable summary
```

## 2. Connectivity / setup verification flow

Used during bootstrap and after token rotation.

```mermaid
flowchart TD
  A[Set .env from .env.example] --> B[npm install && npm run build]
  B --> C[npm run check:auth]
  C -->|200 user| D[npm run check:pr -- URL]
  D -->|PR + local match| E[Wire MCP via bin/run-mcp.sh]
  E --> F[Restart Cursor MCP servers]
  F --> G[Agent can call bitbucket_get_current_user]
```

Verified previously:

- Auth OK for `kashish.parmar@ei.study` / `kashishparmar1`
- PR `ei-core-ui#218` fetch + diff OK
- Comment create OK; approve blocked (403) — correct scopes
- Local match: `~/Desktop/ASSET/ei-core-ui`

## 3. Repository access modes

### Mode A — existing local clone

```mermaid
flowchart LR
  URL[PR URL] --> Meta[PR metadata]
  Meta --> Resolve[resolveLocalRepository]
  Resolve --> Match[origin matches workspace/repo]
  Match --> Fetch[git fetch source/dest refs]
  Fetch --> WT[optional detached worktree at source commit]
  WT --> Review[Analyze without touching user branch]
```

Rules:

- Do not assume current branch is the PR source branch
- Do not overwrite uncommitted changes
- Prefer worktree / read-only inspection

### Mode B — clone into managed workspace

```mermaid
flowchart LR
  Miss[No local match] --> Clone[ensureReviewClone]
  Clone --> SSH[git@bitbucket.org:ws/repo.git]
  SSH -->|fail and ALLOW_HTTPS=1| HTTPS[HTTPS clone then scrub token from remote URL]
  SSH --> Fetch[fetch PR commits/branches]
  HTTPS --> Fetch
```

Default clone root: `BITBUCKET_REVIEW_WORKSPACE` (default `~/Developer/pr-review-workspaces`).

## 4. Finding lifecycle

```mermaid
stateDiagram-v2
  [*] --> Drafted: agent/specialist produces finding
  Drafted --> Validated: orchestrator re-checks code + impact
  Drafted --> Rejected: false positive / style-only / no impact
  Drafted --> NeedsInfo: requires-investigation
  Validated --> Publishable: high/medium confidence + anchorable
  Validated --> NotPublishable: low confidence or unanchorable
  Publishable --> Approved: user selects id
  Publishable --> SkippedByUser: user rejects
  Approved --> Published: MCP POST inline comment
  Approved --> SkippedDuplicate: same body/path/line exists
  Approved --> SkippedUnanchorable: diff no longer supports line
```

## 5. Inline anchor mapping flow

```mermaid
flowchart TD
  Diff[PR unified diff] --> Parse[parseUnifiedDiff]
  Parse --> Sets[anchorableToLines / anchorableFromLines per file]
  Finding[filePath + line + side] --> Validate[validateInlineAnchor]
  Sets --> Validate
  Validate -->|ok| Inline["inline: { path, to? , from? }"]
  Validate -->|fail| Report[Mark unanchorable — do not POST]
  Inline --> Post[POST /comments]
```

Bitbucket semantics used by this system:

- `to` = line number on the **new** file side
- `from` = line number on the **old** file side
- Added files: `to` only
- Deleted files: `from` only
- Renames: comment against the new path when side=`new`

## 6. Approval gate (mandatory)

```text
PR REVIEW COMPLETE
Repository: {repo}
PR: #{id}
Files reviewed: N
Findings: N
Critical / High / Medium / Low / Info

Proposed inline comments:
1. HIGH  path:line  short title
...

Publish which? all | ids... | none
Also post PR summary? yes/no (separate confirm)
```

Only after the user answers does the agent call publish tools with `confirmed=true`.

## 7. Anti-patterns blocked by design

| Anti-pattern | Control |
|---|---|
| Auto-comment on fetch | No publish without `confirmed` |
| Comment on wrong line | Anchor validator |
| Duplicate spam | Exact content + path/line duplicate check |
| Approve/merge via token | Scopes omit `write:pullrequest` |
| Token in skill files | Skills contain process only |
| Checkout over dirty work | Worktree / fetch-only helpers |
| Blind `--import tsx` from $HOME | `bin/run-mcp.sh` + `dist/` |
