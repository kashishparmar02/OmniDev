# Configuration and setup

## 1. Environment variables

Defined in `.env.example` / loaded from `.env` (gitignored), or set in Cursor `mcp.json` `env`.

| Variable | Required | Default | Description |
|---|---|---|---|
| `BITBUCKET_EMAIL` | **Yes** | — | Atlassian account email for API Basic auth |
| `BITBUCKET_API_TOKEN` | **Yes** | — | Bitbucket API token with scopes |
| `BITBUCKET_USERNAME` | No | — | Bitbucket username (case-sensitive); HTTPS git if enabled |
| `BITBUCKET_WORKSPACE` | No | — | Default workspace for short lookups |
| `BITBUCKET_REVIEW_WORKSPACE` | No | `~/.omnidev/review-workspaces` | Managed clones + worktrees |
| `BITBUCKET_LOCAL_REPO_ROOTS` | No | — | Comma-separated roots to search for existing clones (e.g. `~/repos`) |
| `BITBUCKET_ALLOW_HTTPS_CLONE` | No | unset | Set to `1` to allow HTTPS fallback clone |
| `LOG_LEVEL` | No | `info` | `debug` \| `info` \| `warn` \| `error` |

### Example `.env`

```bash
BITBUCKET_EMAIL=you@example.com
BITBUCKET_USERNAME=your-bitbucket-username
BITBUCKET_API_TOKEN=ATATT...   # never commit
BITBUCKET_WORKSPACE=your-workspace
BITBUCKET_REVIEW_WORKSPACE=~/.omnidev/review-workspaces
BITBUCKET_LOCAL_REPO_ROOTS=~/repos
```

### Creating the token

1. Atlassian account → Security → **Create API token with scopes**
2. App = **Bitbucket**
3. Optionally restrict to your workspace
4. Enable: Repositories **Read**, Pull requests **Read**
5. Do **not** enable Pull requests **Write** unless you intentionally need approve/merge

Docs: [Create an API token](https://support.atlassian.com/bitbucket-cloud/docs/create-an-api-token/), [permissions](https://support.atlassian.com/bitbucket-cloud/docs/api-token-permissions/)

## 2. Install

```bash
cd /path/to/OmniDev
npm install
npm run build
npm test
cp packages/mcp-bitbucket/.env.example packages/mcp-bitbucket/.env
npm run check:auth
```

Run MCP (stdio):

```bash
npm run mcp:bitbucket
```

Print Cursor **`mcp.json`** paths:

```bash
npm run mcp:paths
```

## 3. Cursor MCP wiring

### User MCP (`~/.cursor/mcp.json`)

```json
"bitbucket-pr-review": {
  "command": "/absolute/path/to/OmniDev/packages/mcp-bitbucket/bin/run-mcp.sh",
  "env": {
    "BITBUCKET_EMAIL": "you@example.com",
    "BITBUCKET_API_TOKEN": "ATATT..."
  }
}
```

Or rely on `packages/mcp-bitbucket/.env` (gitignored) without putting secrets in `mcp.json`.

### Environment: `mcp.json` **and** optional `.env`

| Source | Use for |
|--------|---------|
| **`mcp.json` → `env`** | Per-machine secrets in Cursor |
| **`packages/mcp-bitbucket/.env`** | Local CLI / MCP when file exists |

**Precedence:** process / `mcp.json` env **wins** over `.env`.

Optional keys: `BITBUCKET_USERNAME`, `BITBUCKET_WORKSPACE`, `BITBUCKET_REVIEW_WORKSPACE`, `BITBUCKET_LOCAL_REPO_ROOTS`.

### Why the shell launcher?

Cursor may spawn MCP with cwd = `$HOME`. The launcher:

1. `cd`s to the package root  
2. Builds `dist/` (and `@omnidev/core`) if missing  
3. Runs Node with `--env-file=.env` **only if** `.env` exists  

After changing MCP config: **MCP: Restart Servers** (or reload window).

## 4. Skill and agents

| Location | Scope |
|---|---|
| `OmniDev/skills/omnidev-review/` | Canonical skill in this repo |
| `~/.cursor/skills/omnidev-review/` | Personal install (symlink or copy) |

Optional specialist agents under `skills/omnidev-review/agents/` (sql, security, performance, regression). Default review path does **not** spawn them unless the user asks.

## 5. npm scripts (package / root)

| Script | What it does |
|---|---|
| `npm run build` | Compile TypeScript |
| `npm run mcp:bitbucket` | Run Bitbucket MCP (stdio) |
| `npm run check:auth` | Live `/user` check |
| `npm run check:pr -- <url>` | Live PR + local resolve summary |
| `npm test` | Vitest |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run mcp:paths` | Print Cursor `mcp.json` snippet |

## 6. Security checklist

- [ ] `.env` is gitignored and never committed  
- [ ] Token not pasted into skills, agents, or docs  
- [ ] Token scopes exclude PR Write unless intentional  
- [ ] Rotate token if it was shared in chat/logs  
- [ ] Prefer SSH for git; avoid embedding tokens in remotes  
- [ ] Publish comments only after explicit human approval  

## 7. Troubleshooting

| Symptom | Likely fix |
|---|---|
| `Cannot find package 'tsx'` | Use `bin/run-mcp.sh` / `dist` entry |
| MCP connects then dies | `npm run build`; check credentials |
| `CONFIG_MISSING` | Set `BITBUCKET_EMAIL` + `BITBUCKET_API_TOKEN` |
| 401/403 on PR fetch | Token scopes / workspace access |
| 403 on approve | Expected with Read-only PR scope |
| Local repo not found | Set `BITBUCKET_LOCAL_REPO_ROOTS`; confirm `origin` remote |
| Dirty tree fear | System uses fetch/worktree; avoid manual checkouts during review |
