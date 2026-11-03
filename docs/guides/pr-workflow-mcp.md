# Author PR tools (Bitbucket + GitHub MCP)

Author-mode tools live on **provider MCP servers**, backed by shared `@omnidev/core` scripts. Skills stay the same; tool names use a **host prefix**.

## Cursor wiring

**Bitbucket** (review + author on one server):

```json
"bitbucket-pr-review": {
  "command": "/absolute/path/to/OmniDev/packages/mcp-bitbucket/bin/run-mcp.sh"
}
```

**GitHub** (author today; review planned):

```json
"omnidev-github": {
  "command": "/absolute/path/to/OmniDev/packages/mcp-github/bin/run-mcp.sh"
}
```

Pair with: `skills/omnidev-respond`, `pr-comments`, `pr-comment-reply`, `pr-description-generator`.

All author skills use **ASD-STE100** (`skills/omnidev-respond/references/asd-ste100.md`).

## Tool map

| Capability | Bitbucket tool | GitHub tool |
|------------|----------------|-------------|
| List threads `#N` | `bitbucket_pr_list_comments` | `github_pr_list_comments` |
| Reply / resolve | `bitbucket_pr_reply_comment` | `github_pr_reply_comment` |
| Branch compare | `bitbucket_pr_branch_compare` | `github_pr_branch_compare` |
| Description template | `bitbucket_pr_get_description_template` | `github_pr_get_description_template` |
| Create / update PR | `bitbucket_pr_publish_description` | `github_pr_publish_description` |
| Push head | `bitbucket_pr_push_head` | `github_pr_push_head` |

Always pass **`repoRoot`** as the absolute path to the project clone.

Write tools require **`confirmed: true`**.

## Reviewer ↔ developer

1. Reviewer: `omnidev-review` + **review** tools on `bitbucket-pr-review` (`bitbucket_get_pr_*`, publish findings).
2. Developer: `omnidev-respond` + **`bitbucket_pr_*`** on the **same** Bitbucket MCP (or `github_pr_*` on GitHub).
3. Ask for **head** and **base** when not obvious; use PR URL when given.

## Auth

- **Bitbucket author:** `git config user.email` + bitbucket.org git credential or `BITBUCKET_API_TOKEN` (PR read/write).
- **Bitbucket review:** `packages/mcp-bitbucket/.env` (see [bitbucket-review/configuration.md](./bitbucket-review/configuration.md)).
- **GitHub author:** authenticated `gh` CLI.

## Commits

No `Co-Authored-By: Cursor` — see [CONTRIBUTING.md](../../CONTRIBUTING.md).
