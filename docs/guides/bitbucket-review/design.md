# Design document — Cursor Bitbucket PR Review

## 1. Problem

ASSET is a local folder of many Bitbucket Cloud clones (`ei-india-admin/*`). Reviews today are manual, shallow, or generic LLM-over-diff chats. We need a **Cursor-native** workflow where pasting a Bitbucket PR URL produces a **repository-aware** engineering review, with **human approval** before any inline comments are published.

## 2. Goals

1. Open Cursor → paste `https://bitbucket.org/{workspace}/{repo}/pull-requests/{id}` → get a senior-engineer-quality review.
2. Prefer an already-cloned repo under `~/Desktop/ASSET`; otherwise clone into a managed workspace.
3. Investigate beyond the diff (callers, SQL/schema, auth, workers, contracts).
4. Produce natural inline comments, mapped to valid Bitbucket diff anchors.
5. **Never** publish without explicit approval.
6. **Never** modify app code, push, merge, or approve the PR as part of review.
7. Reuse across all ASSET repos via a personal Cursor skill + local MCP server.

## 3. Non-goals (current phase)

- Autonomous unattended commenting on every PR
- Replacing human ownership of merge decisions
- Running production `EXPLAIN ANALYZE` by default
- Bitbucket Server / Data Center (Cloud only)
- Using the Atlassian Jira/Confluence MCP as the PR comment channel (it cannot post Bitbucket PR comments)

## 4. Design principles

| Principle | Implication |
|---|---|
| Least privilege | API token uses PR **Read** (comments allowed) + repo **Read**; no PR Write (approve/merge) |
| Separation of concerns | MCP/client owns Bitbucket I/O; Cursor agent owns judgment; skill owns methodology |
| Safety over throughput | Few high-quality findings; low-confidence items not publishable |
| Local-first | Analyze local git content; API used for PR metadata, diff, comments |
| Non-destructive git | Fetch + detached worktrees; never checkout over dirty trees |
| Explicit publish gate | All write tools require `confirmed=true` |
| Secret hygiene | Tokens only in `.env` / process env; redacted from logs/errors |

## 5. Key product decisions

### 5.1 Why a custom Bitbucket MCP?

Cursor’s Atlassian plugin covers Jira/Confluence (and optional code search). It does **not** expose Bitbucket PR fetch/comment APIs. Therefore we built `bitbucket-pr-review` as a local stdio MCP server around Bitbucket Cloud REST API 2.0.

### 5.2 Why comment works without “Write” permission

Bitbucket API token scopes:

- **Pull requests → Read** (`read:pullrequest:bitbucket`) = view PRs **and comment**
- **Pull requests → Write** (`write:pullrequest:bitbucket`) = create/update/approve/decline/merge

We verified live: comment create → `201`; approve → `403` missing scopes.

### 5.3 Where intelligence lives

| Layer | Responsibility |
|---|---|
| MCP + TypeScript libraries | Auth, pagination, retries, URL parse, diff parse, anchor validate, publish |
| Cursor skill `bitbucket-pr-review` | Review philosophy, checklists, comment style, approval UX |
| Agents | Orchestrator + optional SQL/security/performance/regression specialists |
| Human | Approve/edit/reject findings before publish |

This is intentional: deep review quality comes from the agent following the skill against a real local repo, not from a black-box “review microservice.”

### 5.4 Multi-repo ASSET layout

`~/Desktop/ASSET` is **not** one git root. The resolver searches configured roots for child clones whose `origin` matches `{workspace}/{repoSlug}`.

### 5.5 MCP process startup

Cursor spawns MCP from a cwd outside the project (often `$HOME`). `--import tsx` therefore failed. Production entrypoint is compiled JS via `bin/run-mcp.sh`.

## 6. What we built (summary)

1. TypeScript package `cursor-pr-review`
2. Bitbucket Cloud client (Basic/Bearer-capable auth, redirects, retries)
3. PR URL parser, diffstat/diff/commits/comments/activity helpers
4. Unified-diff line mapper + anchor validator
5. Local repo resolver + SSH-first clone manager + worktree helper
6. Approval-gated publisher with duplicate detection
7. MCP server exposing the tools listed in [04-tools-and-api.md](./04-tools-and-api.md)
8. CLI (`check:auth`, `check:pr`)
9. Cursor skill + 5 agent definitions
10. Unit + mocked integration tests; live connectivity proven on PR `#218`

## 7. Success metrics

- Agent can identify repo + PR from URL
- Local match under ASSET works without disturbing dirty trees
- Findings presented before any comment POST
- Approved comments land on correct diff lines
- Unanchorable findings reported, not force-posted
- Credentials never appear in tool output / logs
