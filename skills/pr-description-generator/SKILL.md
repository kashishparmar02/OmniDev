---
name: pr-description-generator
description: >-
  Opens or updates a pull request on Bitbucket or GitHub with an accurate description
  from origin/<base>...origin/<head>. Title and body follow ASD-STE100. Use when the user
  asks to raise, open, create, or refresh a PR description. Requires bitbucket_* or github_*
  author tools on the provider MCP.
---

# PR description generator

Raise a PR from **head** into **base** with an accurate description. If an open PR exists for that pair, update the description.

## Language (ASD-STE100)

Follow **`../omnidev-respond/references/asd-ste100.md`** for **title**, every template section, and the chat message after publish (`CREATED` / `UPDATED`).

## Tools (by host)

| Step | Bitbucket (`bitbucket-pr-review`) | GitHub (`omnidev-github`) |
|------|-----------------------------------|---------------------------|
| Compare | `bitbucket_pr_branch_compare` | `github_pr_branch_compare` |
| Template | `bitbucket_pr_get_description_template` | `github_pr_get_description_template` |
| Publish | `bitbucket_pr_publish_description` | `github_pr_publish_description` |
| Push | `bitbucket_pr_push_head` | `github_pr_push_head` |

## Inputs (ask only if missing)

- **Head (source)** — default current branch in `repoRoot`.
- **Base (target)** — required when creating a PR.
- **Remote** — default `origin`.
- **PR URL or number** — when updating a specific PR.

`X -> Y` → head **X**, base **Y**.

If head does not exist locally or on origin, stop. Do not substitute a similar branch name.

## Workflow (origin only)

1. Resolve head, base, `repoRoot`. Uncommitted files are **not** in the PR scope.
2. **`{prefix}pr_branch_compare`**: `fetch: true` — commits, diff stat, full diff for `origin/<base>...origin/<head>`.
3. If head is not on origin or local is ahead: **`{prefix}pr_push_head`** with `confirmed: true` (never force-push unless user asks). Re-run compare after push.
4. **`{prefix}pr_get_description_template`** — fill every section from the diff (no placeholder-only bullets).
5. **`{prefix}pr_publish_description`**: `create: true`, `title`, `description`, `head`, `base`, `confirmed: true`.
6. Reply with PR URL from tool output (`CREATED` / `UPDATED`) in **ASD-STE100** (one or two short sentences).

Never compare local branches only. Never mention uncommitted paths in the description.

## Content

Summarize **what** and **why** in STE (short sentences, active voice). Include comparison ref, commit count, and stat lines. **Test plan** uses imperative steps. **Scope** and **Rollout/Config** state facts only. No placeholder-only bullets.

## Commits

Use the developer’s git identity only. **Never** add `Co-Authored-By: Cursor` or other AI co-author trailers.

## Parent flow

Part of **`omnidev-respond`** after review threads are handled (or standalone when user only wants a PR raised).
