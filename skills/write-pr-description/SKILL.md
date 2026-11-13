---
name: write-pr-description
description: Write a pull request title and description from the actual changes on a branch, then open the pull request or update an existing one on Bitbucket or GitHub using the OmniDev tools. Use when the user asks to raise a PR, write or refresh a PR description, or says a branch is ready for review.
---

# Write a pull request description

A reviewer reads the description before the code. It should tell them what
changed, why, and how to check it, without making them read the commit list.

## 1. Find out what changed

In the user's working copy:

1. Find the source branch (the current branch) and the target branch. If the
   target is not obvious, ask.
2. Read `git log <target>..HEAD` and `git diff <target>...HEAD`.
3. Look for a pull request template in the repository, such as
   `.github/pull_request_template.md`. If there is one, use its headings.

## 2. Draft

Without a template, use these headings:

- **What:** the change in one or two sentences, in terms of behaviour.
- **Why:** the problem it solves and why this approach was chosen.
- **How to verify:** commands to run or steps to follow, and what to expect.
- **Notes for the reviewer:** risks, follow-ups and anything left out on
  purpose. Leave the heading out if there is nothing to say.

Rules for the text:

- Describe the change as it is now, not the story of how it was written.
- Say a test or a build passes only if you ran it in this conversation.
- Keep it short. Link to an issue; do not paste it.
- For the title, follow the convention the repository's recent commits use.

## 3. Show the user

Show the title and the description exactly as they will be posted and ask for
approval or edits.

## 4. Open or update

- **A pull request already exists:** call `pr_update` with its URL, the new
  title or description, and `confirmed: true`.
- **No pull request yet:** check that the branch is pushed. If it is not, ask
  before pushing. Then call `pr_create` with the repository URL from
  `git remote get-url origin` (converted to its https web address), both
  branches, the title, the description and `confirmed: true`.

Give the user the pull request URL from the result.

## Never

- Open, update or push without the user's approval in this conversation.
- Describe changes that are not in the diff.
