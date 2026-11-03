---
name: pr-comment-reply
description: >-
  Posts a reply to one pull request comment on Bitbucket or GitHub (ASD-STE100),
  and optionally resolves the thread when the user explicitly names which comments
  to resolve. Use when the user asks to reply to PR feedback or resolve threads.
  Requires bitbucket_* or github_* author tools on the provider MCP.
---

# PR comment reply

Post one reply on a pull request comment. Optionally resolve the thread. PR selection matches **pr-comments**.

## Tool

**`{prefix}pr_reply_comment`** with `repoRoot`. Bitbucket: `bitbucket_pr_reply_comment` on **`bitbucket-pr-review`**. GitHub: `github_pr_reply_comment` on **`omnidev-github`**.

| Field | Notes |
|---|---|
| `serial` or `commentId` | From latest **`{prefix}pr_list_comments`** |
| `body` | STE reply text (required unless `resolveOnly`) |
| `confirmed` | Must be `true` to post (unless `dryRun`) |
| `resolve` | Only when user named this thread for resolve |
| `resolveOnly` | Resolve without reply when user asked |

Same PR selector as pr-comments: `url`, `pr`, or `head` + `base`.

## Serial numbers

Run **pr-comments** first. Serials apply to **open** comments only for that fetch.

## Resolve — ask first

Do **not** set `resolve` or `resolveOnly` unless the user named `#N`, id, or an explicit list.

## Reply text (ASD-STE100)

Follow **`../omnidev-respond/references/asd-ste100.md`** (inline thread replies + banned patterns). Official spec: [ASD-STE100](https://www.asd-ste100.org/).

Draft in chat if the user wants review; post only approved STE text in `body`. Chat drafts use the same rules.

| Situation | Avoid | Prefer |
|-----------|--------|--------|
| Fixed in code | Thanks — good catch! | Fixed. `build()` runs single-item prefetch when the bundle is missing. |
| Deferring | Fair point, we can sort later. | Deferred. List order does not change results. |
| By design | Acknowledged — intentional. | Intentional. Prefetch failure marks the chunk INFRA_FAIL. |

## Examples (conceptual)

Reply to open #2 on Bitbucket:

- `bitbucket_pr_reply_comment`: `repoRoot`, `head`, `base`, `serial: 2`, `body`, `confirmed: true`

Reply and resolve #1 only when user asked to resolve #1:

- add `resolve: true`
