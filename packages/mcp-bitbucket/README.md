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

## MCP

```json
{
  "command": "/absolute/path/to/OmniDev/packages/mcp-bitbucket/bin/run-mcp.sh"
}
```

## Safety

- Comment publish requires `confirmed=true`
- Prefer PR Read scope (comments allowed); avoid PR Write (approve/merge)
- Never commit `.env`
