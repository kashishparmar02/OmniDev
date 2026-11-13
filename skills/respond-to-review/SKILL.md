---
name: respond-to-review
description: Work through the review comments on the user's own Bitbucket or GitHub pull request using the OmniDev tools - fix what needs fixing, draft replies, and resolve threads once the user approves. Use when the user asks to address review comments, reply to reviewers, or clear open threads on a pull request.
---

# Respond to review comments

You are helping the author of a pull request answer its reviewers. Every reply
is posted under the user's name, so nothing is posted or resolved until the
user approves it.

## 1. Gather

1. `pr_get` with the pull request URL.
2. `pr_list_threads` with `unresolvedOnly: true`.

If there are no open threads, say so and stop.

## 2. Sort each thread

Read the comment, then read the code it points at in the user's working copy.
Put each thread into one group:

| Group            | When                                               | What you do               |
| ---------------- | -------------------------------------------------- | ------------------------- |
| Needs a fix      | The reviewer is right and the code should change   | Make the fix, then reply  |
| Already fixed    | A later commit already addressed it                | Reply and name the commit |
| Question         | The reviewer asked how or why something works      | Answer from the code      |
| Disagree         | The claim does not hold for the current code       | Reply with the evidence   |
| Needs the author | It depends on intent or a decision you cannot make | Ask the user              |

## 3. Make the fixes

For each "needs a fix" thread, change the code in the user's working copy and
run the narrowest test that covers it. If a fix is large or touches code
outside the pull request, describe it and ask before making it.

## 4. Draft the replies

Show the user a table: the thread, its group, the reply text, and whether the
thread will be resolved. Write each reply for the reviewer:

- Say what was done or why not, in one to three sentences.
- For a fix, say what changed. Name the commit only if it exists.
- For a disagreement, give the specific line or case that shows it.
- No thanks, no apology, no restating the reviewer's comment.

Resolve a thread only when the fix is committed or the question is fully
answered. Never resolve a disagreement or a thread that needs the author; the
reviewer decides when those are done.

## 5. Check the fixes are pushed

A reply that says "fixed" must be true for someone reading the pull request.
Before posting, run `git status` and compare the local branch with its remote.
If the fixes are not committed and pushed, say so and ask the user to push, or
offer to do it.

## 6. Post what was approved

For each approved reply, call `pr_reply` with `confirmed: true`, and
`resolve: true` where the user agreed to resolve.

If the tool answers `unsupported`, the thread is a general comment on GitHub,
which cannot be replied to or resolved. Offer to post the reply as a new
general comment with `pr_comment`, quoting the first line of the original.

Finish with a short summary: threads answered, threads resolved, and threads
left open with the reason.

## Never

- Post, resolve or push without the user's approval in this conversation.
- Say something is fixed or tested unless you made the change or ran the test.
- Resolve a thread to make the list shorter.
