# Capability map (skills ↔ MCP)

Skills in `skills/` are **host-agnostic**. MCP servers implement capabilities with a **prefix**.

| Capability | Skill | Bitbucket MCP | GitHub MCP |
|------------|-------|---------------|------------|
| Deep PR review | `omnidev-review` | `bitbucket_get_pr_*`, publish findings | (planned) |
| List review threads | `pr-comments` | `bitbucket_pr_list_comments` | `github_pr_list_comments` |
| Reply / resolve | `pr-comment-reply` | `bitbucket_pr_reply_comment` | `github_pr_reply_comment` |
| PR description / raise | `pr-description-generator` | `bitbucket_pr_*` compare/template/publish/push | `github_pr_*` |
| Author orchestration | `omnidev-respond` | uses rows above | uses rows above |

Shared scripts and registration: **`@omnidev/core`** (`registerAuthorPrTools`).
