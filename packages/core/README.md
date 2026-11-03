# @omnidev/core

Shared OmniDev building blocks:

- **`registerAuthorPrTools`** — author-mode MCP tools (`*_pr_list_comments`, etc.) used by `@omnidev/mcp-bitbucket` and `@omnidev/mcp-github`
- Shell scripts under `scripts/pr-workflow/` (Bitbucket + GitHub via `origin`)
- PR description template in `templates/PR_TEMPLATE.md`

Provider-specific **review** tools stay in each MCP package; **author** tools share this module.
