# @omnidev/mcp-github

GitHub MCP for OmniDev **author** PR workflow (list/reply/publish). Review tools are planned later.

Uses shared `@omnidev/core` scripts; `origin` must be a GitHub remote. Auth via `gh` CLI.

## Cursor MCP

```json
"omnidev-github": {
  "command": "/absolute/path/to/OmniDev/packages/mcp-github/bin/run-mcp.sh"
}
```

Tools: `github_pr_list_comments`, `github_pr_reply_comment`, `github_pr_publish_description`, etc.

Skills: same `omnidev-respond` / `pr-*` playbooks — use the `github_*` tool names when `origin` is GitHub.
