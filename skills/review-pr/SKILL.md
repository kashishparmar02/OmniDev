---
name: review-pr
description: Review a Bitbucket or GitHub pull request using the OmniDev tools, then publish only the findings the user approves as inline comments. Use when the user shares a pull request URL and asks for a review, a second opinion, or "what's wrong with this PR".
---

# Review a pull request

You are reviewing someone else's change. The goal is a short list of findings
that are each true, specific and worth the author's time. A review with three
real problems is better than one with fifteen maybes.

Nothing is posted until the user approves it.

## 1. Gather

Call these with the pull request URL:

1. `pr_get` for the title, description and branches.
2. `pr_get_diff` for the changes.
3. `pr_list_threads` so you do not repeat what a reviewer already said.
4. `pr_prepare_workspace` for a folder that holds the code at the pull
   request's head commit.

If `pr_prepare_workspace` fails, tell the user the review will be based on the
diff alone, and continue. Never edit files in the workspace folder.

## 2. Understand the intent

Write one or two sentences saying what the change is meant to do, based on the
title, the description and the diff. If you cannot tell, that is your first
finding: ask the author.

## 3. Investigate

The diff shows what changed, not what the change affects. For each changed
function or query, open the workspace and read:

- its callers, to see what inputs really arrive;
- its tests, to see what is and is not covered;
- one or two neighbouring files, to learn the conventions the project follows.

Then go through the lenses in [references/lenses.md](./references/lenses.md).

## 4. Keep only what you can prove

A finding is kept only if you can state all three of these:

- **Where:** a file and a line that the diff shows.
- **What goes wrong:** a concrete case, such as "when `items` is empty this
  divides by zero", not "this might be unsafe".
- **What to do:** a specific change, or a specific question if you are unsure.

Drop anything that fails this test. Also drop style preferences, unless the
change breaks a rule the project itself enforces. Keep at most ten findings,
most serious first.

Give each finding a severity:

| Severity   | Meaning                                                      |
| ---------- | ------------------------------------------------------------ |
| `blocker`  | Wrong results, data loss, a security hole or a broken build  |
| `major`    | A real bug in a less common path, or a missing test for risk |
| `minor`    | Works, but is harder to maintain or slower than it need be   |
| `question` | You suspect a problem and need the author to confirm         |

## 5. Show the user

Present a table with an id, severity, `file:line` and the exact comment text
for each finding. Then ask which ones to publish. Wait for the answer.

Write each comment for the author:

- Start with the problem, then why it matters, then the suggested change.
- One issue per comment, three sentences at most.
- No praise, no "nit:", no apology. Phrase a doubt as a question.

## 6. Publish what was approved

Call `pr_publish_findings` with the approved findings and `confirmed: true`.
Report the outcome of each one:

- `published`: posted.
- `duplicate`: already on the pull request; nothing was posted.
- `not_in_diff`: the line is not part of the diff. Offer to put these in one
  general comment with `pr_comment`.
- `failed`: say why, using the reason returned.

## Never

- Publish, reply or resolve without the user's approval in this conversation.
- Approve, merge or decline the pull request.
- Report a finding you have not checked against the code.
