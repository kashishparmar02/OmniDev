# Author PR tools (Bitbucket + GitHub MCP)

Author-mode tools live on **provider MCP servers**, backed by shared `@omnidev/core` scripts. Skills stay the same; tool names use a **host prefix**.

## Run and wire MCP

From OmniDev repo root: `npm run mcp:bitbucket` or `npm run mcp:github`. Full steps: [run-mcp.md](./run-mcp.md).

Cursor config (after `npm install`):

```bash
npm run mcp:paths
```

**Bitbucket** (review + author on one server) — example:

```json
"bitbucket-pr-review": {
  "command": "/path/to/OmniDev/node_modules/.bin/omnidev-bitbucket-mcp",
  "env": {
    "BITBUCKET_EMAIL": "you@ei.study",
    "BITBUCKET_API_TOKEN": "ATATT..."
  }
}
```

**GitHub** (author today; review planned):

```json
"omnidev-github": {
  "command": "/path/to/OmniDev/node_modules/.bin/omnidev-github-mcp"
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

- **Bitbucket review:** `BITBUCKET_EMAIL` + `BITBUCKET_API_TOKEN` via **`mcp.json` `env`** and/or `packages/mcp-bitbucket/.env` (see [configuration.md](./bitbucket-review/configuration.md)). `mcp.json` overrides `.env`.
- **Bitbucket author (`bitbucket_pr_*`):** same token in `mcp.json` / `.env` **or** git credential for `bitbucket.org`; scripts also use `git config user.email` for API user.
- **GitHub author:** authenticated `gh` CLI; optional `packages/mcp-github/.env` for future keys (same launcher pattern).

## Commits

No `Co-Authored-By: Cursor` — see [CONTRIBUTING.md](../../CONTRIBUTING.md).
