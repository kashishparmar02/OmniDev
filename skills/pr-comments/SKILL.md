---
name: pr-comments
description: >-
  Fetches pull request comments from Bitbucket or GitHub and skips resolved
  threads. Summaries to the user follow ASD-STE100. Use when the user asks to pull,
  fetch, list, or read PR comments, review comments, or unresolved feedback, or
  gives a PR URL, a PR number, or a branch pair such as feature/AC-15108 -> development.
  Requires bitbucket_* or github_* author tools on the provider MCP.
---

# PR comments

List review comments for one pull request. Skip resolved threads unless the user asked for those too.

## Language (ASD-STE100)

Follow **`../omnidev-respond/references/asd-ste100.md`** for how you present threads in chat (not for quoting reviewer comment bodies verbatim).

## Tool

Call **`{prefix}pr_list_comments`** with `repoRoot` (absolute path to the git clone):

| Host | MCP server | Tool |
|------|------------|------|
| Bitbucket | `bitbucket-pr-review` | `bitbucket_pr_list_comments` |
| GitHub | `omnidev-github` | `github_pr_list_comments` |

| User gave | Tool arguments |
|---|---|
| PR URL (Bitbucket or GitHub; `/diff` is fine) | `url` |
| PR number | `pr` |
| `head -> base` or `head to base` | `head`, `base` |
| nothing | omit selector; open PR for current branch in that repo |

`<head>` is the source branch. `<base>` is the destination. If several open PRs match, the tool lists them and fails. Do not pick one.

Set `includeResolved: true` only when the user wants resolved comments.

Optional `serial: N` returns only the comment id for open `#N`.

Auth: Bitbucket — `git config user.email` + bitbucket.org credential or `BITBUCKET_API_TOKEN`. GitHub — `gh`. Never print credentials.

## Resolved

A Bitbucket comment is resolved when `resolution` is not null. `"resolution": {}` is resolved. Replies with `resolution: null` inherit resolve state from the parent chain.

## Serial numbers

Open comments are `#1`, `#2`, … in created-on order. Header includes `open_serials: #1-#N`. Use with **`{prefix}pr_reply_comment`** `serial`. Re-fetch after new comments land.

## What to tell the user

Use STE: lead with PR link, `head -> base`, and `authors:`. For each open comment: **#N**, author, file:line, body (or one-line gist if long). Mention `skipped_resolved` when &gt; 0. Do not dump raw JSON. No filler openers.

## Next step

Replies: **`pr-comment-reply`** skill → **`{prefix}pr_reply_comment`**.
