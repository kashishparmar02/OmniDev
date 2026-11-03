---
name: omnidev-respond
description: >-
  OmniDev author mode — address PR review threads (list, reply, resolve) and raise or refresh
  the pull request description. All user-facing text follows ASD-STE100. Use when the developer
  responds to review feedback, resolves comments, or opens/updates a PR after fixes.
  Requires provider MCP author tools (bitbucket_* or github_*).
---

# OmniDev Author (respond + raise PR)

## Language (ASD-STE100)

All chat, thread replies, PR title, and PR description text follow **`references/asd-ste100.md`**. Child skills (`pr-comments`, `pr-comment-reply`, `pr-description-generator`) use the same rules.

## MCP and tool names

Pick tools from the MCP server for the repo’s **`origin`** host:

| Host | Cursor MCP server | Tool prefix (examples) |
|------|-------------------|-------------------------|
| **Bitbucket Cloud** | `bitbucket-pr-review` (`@omnidev/mcp-bitbucket`) | `bitbucket_pr_list_comments`, `bitbucket_pr_reply_comment`, … |
| **GitHub** | `omnidev-github` (`@omnidev/mcp-github`) | `github_pr_list_comments`, `github_pr_reply_comment`, … |

Shared implementation lives in `@omnidev/core`. Skills are host-agnostic; only the **prefix** changes.

## Role

Developer **after** review (or before first PR). You may change code, commit, and push. You **must not** add `Co-Authored-By: Cursor` or other AI co-author trailers to commits.

Use **provider MCP author tools** plus the focused skills:

| Step | Skill | Tools (Bitbucket example) |
|---|---|---|
| List threads | `pr-comments` | `bitbucket_pr_list_comments` |
| Reply / resolve | `pr-comment-reply` | `bitbucket_pr_reply_comment` |
| Description + open PR | `pr-description-generator` | `bitbucket_pr_branch_compare`, `bitbucket_pr_get_description_template`, `bitbucket_pr_publish_description`, `bitbucket_pr_push_head` |

**Reviewer** flow stays in `omnidev-review` (review tools on the same Bitbucket MCP — do not publish author replies during review).

## Inputs (ask when missing)

1. **Head (source)** — feature branch; default current branch in the repo.
2. **Base (destination)** — e.g. `development`, `main`. Required to create a PR.
3. **PR URL or number** — when the user already pointed at one.

`X -> Y` means head **X**, base **Y**.

## Default author loop

1. **`{prefix}pr_list_comments`** (`repoRoot`, head/base or URL) — show open `#1…#N` threads.
2. For each thread: read tip code, classify (fixed / defer / discuss / disagree).
3. Draft reply text per **ASD-STE100**; user approves wording.
4. **`{prefix}pr_reply_comment`** with `confirmed=true`. Use `serial` from the list.
5. **Resolve** only when the user names `#N` or comment id — pass `resolve=true` on that reply, or resolve-only per `pr-comment-reply`.
6. Repeat until open threads are handled or explicitly left open.
7. When the user wants the PR raised or refreshed:
   - Follow **`pr-description-generator`** (fetch/compare on `origin`, write body from template, push if needed, **`{prefix}pr_publish_description`** with `confirmed=true`).

## Gates

- Use **ASD-STE100** for approval prompts (what will post, which `#N` or PR fields).
- Never post replies or PR bodies without **`confirmed=true`** (unless `dryRun`).
- Never resolve threads the user did not name.
- Never mention uncommitted files in the PR description — scope is `origin/<base>...origin/<head>` only.
- Never force-push unless the user explicitly asks.

## Reviewer handoff

After `omnidev-review`, tell the author they can run **omnidev-respond** on the same PR URL or branch pair to work through `#N` serials and then raise/update the PR. Use STE for the handoff (short, active, no filler).
