# Run OmniDev MCP servers

## Install and build

```bash
cd /path/to/OmniDev
npm install
npm run build
npm test
```

## Run locally (stdio)

From repo root:

```bash
npm run mcp:bitbucket   # review + bitbucket_pr_* author tools
npm run mcp:github      # github_pr_* author tools
```

The process waits on stdio (normal for MCP). Stop with Ctrl+C.

Optional Bitbucket `.env`:

```bash
cp packages/mcp-bitbucket/.env.example packages/mcp-bitbucket/.env
```

Or set `BITBUCKET_EMAIL` and `BITBUCKET_API_TOKEN` in Cursor `mcp.json` `env` (overrides `.env`).

## Cursor `mcp.json`

Print a snippet with resolved **`run-mcp.sh`** paths (use these in Cursor; avoid broken paths when `.bin` symlinks mis-resolve):

```bash
npm run mcp:paths
```

If MCP logs `ENV_ARGS[@]: unbound variable`, pull latest `PR-Skills` (fixed launcher). If logs `node_modules/../core: No such file`, use the **`packages/mcp-bitbucket/bin/run-mcp.sh`** path from `mcp:paths`, not an old `.bin` path.

Restart MCP in Cursor after edits.

## Skills (any application repo)

Skills live under `skills/` in OmniDev. They are **host-agnostic** — install once, use in any git repo:

```bash
OMNI=/path/to/OmniDev/skills
mkdir -p ~/.cursor/skills
for s in omnidev-respond omnidev-review pr-comments pr-comment-reply pr-description-generator; do
  ln -sf "$OMNI/$s" ~/.cursor/skills/$s
done
```

Open the **application repo** in Cursor. The agent picks `bitbucket_pr_*` or `github_pr_*` from `origin`.

See [pr-workflow-mcp.md](./pr-workflow-mcp.md) and [architecture/capability-map.md](../architecture/capability-map.md).
