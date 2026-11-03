# @omnidev/mcp-bitbucket

Bitbucket Cloud MCP server for OmniDev:

- **Review:** fetch PRs/diffs/comments, validate anchors, publish approved inline comments
- **Author:** `bitbucket_pr_list_comments`, `bitbucket_pr_reply_comment`, `bitbucket_pr_publish_description`, etc. (from `@omnidev/core`)

See [docs/guides/pr-workflow-mcp.md](../../docs/guides/pr-workflow-mcp.md).

## Setup

```bash
cd packages/mcp-bitbucket
cp .env.example .env
# fill BITBUCKET_EMAIL + BITBUCKET_API_TOKEN
npm install
npm test
npm run build
```

## Run MCP

From **OmniDev repo root** (after `npm install` && `npm run build`):

```bash
npm run mcp:bitbucket
```

From this package:

```bash
npm run mcp
```

Print a Cursor **`mcp.json`** snippet with resolved paths:

```bash
npm run mcp:paths
```

(run from repo root)

## Cursor `mcp.json`

Use the path from `npm run mcp:paths`, or:

```json
{
  "command": "/absolute/path/to/OmniDev/node_modules/.bin/omnidev-bitbucket-mcp",
  "env": {
    "BITBUCKET_EMAIL": "you@ei.study",
    "BITBUCKET_API_TOKEN": "ATATT..."
  }
}
```

## Safety

- Comment publish requires `confirmed=true`
- Prefer PR Read scope (comments allowed); avoid PR Write (approve/merge)
- Never commit `.env`
