# Design — Bitbucket Cloud PR review

## 1. Problem

PR reviews in chat are often shallow (diff-only, no local context) or unsafe (auto-comment without approval). OmniDev needs a **Cursor-native** flow: paste a Bitbucket Cloud PR URL → **repository-aware** review → **human approval** before any inline comments are published.

## 2. Goals

1. Paste `https://bitbucket.org/{workspace}/{repo}/pull-requests/{id}` → senior-engineer-quality review.
2. Prefer an already-cloned repo under configured local roots; otherwise clone into a managed workspace.
3. Investigate beyond the diff when needed (callers, SQL/schema, auth, workers, contracts).
4. Map findings to valid Bitbucket diff anchors for inline comments.
5. **Never** publish without explicit approval.
6. **Never** modify app code, push, merge, or approve the PR as part of review.
7. Reuse across many local clones via skill + local MCP server.

## 3. Non-goals (current phase)

- Unattended commenting on every PR
- Replacing human ownership of merge decisions
- Production `EXPLAIN ANALYZE` by default
- Bitbucket Server / Data Center (Cloud only)
- Using Jira/Confluence MCP as the Bitbucket comment channel

## 4. Design principles

| Principle | Implication |
|---|---|
| Least privilege | API token: PR **Read** (includes comment) + repo **Read**; avoid PR Write (approve/merge) |
| Separation of concerns | MCP owns I/O; skill owns methodology; agent owns judgment |
| Safety over throughput | Few high-quality findings; low-confidence items not publishable by default |
| Local-first | Analyze local git; API for PR metadata, diff, comments |
| Non-destructive git | Fetch + detached worktrees; never checkout over dirty trees |
| Explicit publish gate | Write tools require `confirmed=true` |
| Secret hygiene | Tokens only in `.env` / process env; redacted from logs |

## 5. Key decisions

### 5.1 Custom Bitbucket MCP

Cursor’s Atlassian integrations cover Jira/Confluence-style surfaces. They do **not** expose Bitbucket PR fetch/comment APIs. OmniDev ships `@omnidev/mcp-bitbucket` as a local stdio MCP over Bitbucket Cloud REST API 2.0.

### 5.2 Comment without “Write” scope

- **Pull requests → Read** — view PRs **and** comment  
- **Pull requests → Write** — create/update/approve/decline/merge  

Comment create succeeds with Read; approve fails without Write (by design).

### 5.3 Where intelligence lives

| Layer | Responsibility |
|---|---|
| MCP + libraries | Auth, pagination, URL/diff parse, anchors, publish |
| Skill `omnidev-review` | Philosophy, checklists, comment style, approval UX |
| Optional specialist agents | SQL / security / performance / regression (off by default) |
| Human | Approve/edit/reject before publish |

### 5.4 Multi-repo local layout

Configured roots (e.g. `~/repos`) are often **not** a single git root. The resolver searches child clones whose `origin` matches `{workspace}/{repoSlug}`.

### 5.5 MCP process startup

Cursor may spawn MCP with cwd = `$HOME`. Entrypoint is compiled JS via `bin/run-mcp.sh` (not raw `tsx` from an arbitrary cwd).

## 6. Built so far

1. `@omnidev/mcp-bitbucket` TypeScript package  
2. Bitbucket Cloud client (auth, redirects, retries)  
3. PR URL parser; diffstat/diff/commits/comments/activity helpers  
4. Unified-diff line mapper + anchor validator  
5. Local repo resolver + SSH-first clone + worktree helper  
6. Approval-gated publisher with duplicate detection  
7. MCP tools (see [tools-and-api.md](./tools-and-api.md))  
8. CLI (`check:auth`, `check:pr`)  
9. Cursor skill + optional specialist agents  
10. Unit + mocked integration tests  

## 7. Success metrics

- Agent resolves workspace / repo / PR from URL  
- Local match works without disturbing dirty trees  
- Findings shown before any comment POST  
- Approved comments land on correct diff lines  
- Unanchorable findings reported, not force-posted  
- Credentials never appear in tool output / logs  
