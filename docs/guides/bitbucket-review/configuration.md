# Configuration and setup

## 1. Environment variables

Defined in `.env.example` / loaded from `.env` (gitignored).

| Variable | Required | Default | Description |
|---|---|---|---|
| `BITBUCKET_EMAIL` | **Yes** | — | Atlassian account email for API Basic auth |
| `BITBUCKET_API_TOKEN` | **Yes** | — | Bitbucket API token with scopes |
| `BITBUCKET_USERNAME` | No | — | Bitbucket username (case-sensitive); used for HTTPS git if enabled |
| `BITBUCKET_WORKSPACE` | No | `ei-india-admin` | Default workspace |
| `BITBUCKET_REVIEW_WORKSPACE` | No | `~/Developer/pr-review-workspaces` | Managed clones + worktrees root |
| `BITBUCKET_LOCAL_REPO_ROOTS` | No | `~/Desktop/ASSET` | Comma-separated roots to search for existing clones |
| `BITBUCKET_ALLOW_HTTPS_CLONE` | No | unset | Set to `1` to allow HTTPS fallback clone |
| `LOG_LEVEL` | No | `info` | `debug` \| `info` \| `warn` \| `error` |

### Example `.env`

```bash
BITBUCKET_EMAIL=kashish.parmar@ei.study
BITBUCKET_USERNAME=kashishparmar1
BITBUCKET_API_TOKEN=ATATT...   # never commit
BITBUCKET_WORKSPACE=ei-india-admin
BITBUCKET_REVIEW_WORKSPACE=~/Developer/pr-review-workspaces
BITBUCKET_LOCAL_REPO_ROOTS=~/Desktop/ASSET
```

### Creating the token

1. Atlassian account → Security → **Create API token with scopes**
2. App = **Bitbucket**
3. Optionally restrict to workspace `ei-india-admin`
4. Enable: Repositories **Read**, Pull requests **Read**
5. Do **not** enable Pull requests **Write**

Docs: [Create an API token](https://support.atlassian.com/bitbucket-cloud/docs/create-an-api-token/), [permissions](https://support.atlassian.com/bitbucket-cloud/docs/api-token-permissions/)

## 2. Install

```bash
cd ~/Desktop/ASSET/cursor-pr-review
cp .env.example .env   # then fill values
npm install
npm run build
npm test
npm run check:auth
```

## 3. Cursor MCP wiring

### User MCP (`~/.cursor/mcp.json`)

```json
"bitbucket-pr-review": {
  "command": "/Users/kashish.parmar/Desktop/ASSET/cursor-pr-review/bin/run-mcp.sh"
}
```

Project mirror: `.cursor/mcp.json`.

### Why the shell launcher?

Cursor may spawn MCP with cwd = `$HOME`. The launcher:

1. `cd`s to the package root
2. Builds `dist/` if missing
3. Runs compiled server with `--env-file=.env`

After changing MCP config: **MCP: Restart Servers** (or reload window).

## 4. Skill and agents

### Skill

| Location | Scope |
|---|---|
| `cursor-pr-review/.cursor/skills/bitbucket-pr-review/` | Project |
| `~/.cursor/skills/bitbucket-pr-review/` | Personal (all workspaces) |

### Agents

| File | Role |
|---|---|
| `pr-review-orchestrator.md` | End-to-end coordination |
| `sql-reviewer.md` | SQL / DB |
| `security-reviewer.md` | Security |
| `performance-reviewer.md` | Perf / concurrency |
| `regression-reviewer.md` | Blast radius / contracts |

Copy to `~/.cursor/agents/` for global reuse (already done in bootstrap).

## 5. npm scripts

| Script | What it does |
|---|---|
| `npm run build` | Compile `src/` → `dist/` |
| `npm run mcp` | Run compiled MCP server |
| `npm run mcp:dev` | Run TypeScript via tsx (dev only; not for Cursor spawn) |
| `npm run check:auth` | Live `/user` check |
| `npm run check:pr -- <url>` | Live PR + local resolve summary |
| `npm test` | Vitest unit + mocked integration |
| `npm run typecheck` | `tsc --noEmit` |

## 6. Security checklist for operators

- [ ] `.env` is gitignored and never committed
- [ ] Token not pasted into skills, agents, or docs
- [ ] Token scopes exclude PR Write
- [ ] Rotate token if it was shared in chat/logs
- [ ] Prefer SSH for git; avoid embedding tokens in remotes
- [ ] Only publish comments after explicit human approval in chat

## 7. Troubleshooting

| Symptom | Likely fix |
|---|---|
| `Cannot find package 'tsx'` | Use `bin/run-mcp.sh` / `dist` entry (not `--import tsx`) |
| MCP connects then dies | Ensure `npm run build` succeeds; check `.env` present |
| `CONFIG_MISSING` | Set `BITBUCKET_EMAIL` + `BITBUCKET_API_TOKEN` |
| 401/403 on PR fetch | Token scopes / workspace access |
| 403 on approve | Expected with Read-only PR scope |
| Diff empty / odd | Client must follow redirects (already implemented) |
| Local repo not found | Confirm clone under `BITBUCKET_LOCAL_REPO_ROOTS` and `origin` remote |
| Dirty tree fear | System uses fetch/worktree; still avoid manual checkouts during review |
