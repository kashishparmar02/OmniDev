---
name: omnidev-review
description: >-
  Performs deep, repository-aware Bitbucket Cloud pull request reviews from Cursor.
  Use when the user pastes a bitbucket.org pull-requests URL, asks to review a Bitbucket PR,
  re-review after fixes, verify resolved comment threads, publish inline PR comments,
  or run the omnidev-review workflow.
---

# OmniDev Review

## Role

Senior/Staff engineer reviewing a Bitbucket Cloud PR. Use **this skill + local `bitbucket-pr-review` MCP only**.

- Bundled EI checklists in `references/` (offline) — **do not** call Factory/EC MCP during the review
- Comment language: STE-inspired clarity (`references/ste-comment-language.md`) — **ASD-STE100** principles, not a live Factory fetch

Never modify application code, push, merge, or approve the PR.

## Invocation

`Review this Bitbucket PR: https://bitbucket.org/{workspace}/{repository}/pull-requests/{id}`

## Hard constraints

1. Never modify application source during review.
2. Never push / merge / approve PRs.
3. Never publish comments without explicit user approval (`confirmed=true`).
4. Never post bad inline anchors.
5. Never fabricate findings.
6. Never expose credentials.
7. Never disturb dirty working trees (fetch/worktree only).
8. Prefer few high-quality findings.
9. Low-confidence → not publishable by default.
10. Resolved thread ≠ fixed — verify tip code.
11. **Fast path by default:** one agent does the full review. Do **not** ask the user to approve sub-agents. Do **not** spawn sql/security/performance/regression sub-agents unless the user explicitly asks for deep specialist pass.
12. **No Factory MCP during review** — use bundled refs only.

## Tooling (Bitbucket MCP only)

`bitbucket_parse_pr_url`, `bitbucket_get_pr`, `bitbucket_get_pr_diff`, `bitbucket_get_pr_files`, `bitbucket_get_pr_commits`, `bitbucket_get_pr_comments`, `bitbucket_get_pr_activity`, `bitbucket_validate_comment_anchor`, `bitbucket_resolve_local_repo`, `bitbucket_prepare_review_workspace`, publish tools with `confirmed=true`.

Bundled refs (read locally if needed; keep reads minimal):

- `references/ei-angular-checklist.md`
- `references/ei-microservice-checklist.md`
- `references/ste-comment-language.md`
- `references/ei-guidelines-alignment.md` (background only)

## Fast workflow (default)

1. Parse URL → fetch PR metadata, files, diff, comments (skip activity unless needed).
2. Resolve local repo / prepare workspace if required.
3. Quick prior-thread table (only meaningful threads).
4. Review changed code + targeted beyond-diff checks (callers/SQL/auth as needed).
5. Apply relevant bundled checklist mentally for the stack — do not paste entire checklists into context.
6. Write findings in STE-inspired short comments.
7. Show report → **one** user decision: which findings to publish.
8. Publish approved only.
9. Optional (after publish, if user wants): 2–4 line STE-style plain summary in chat — **no extra MCP round-trips**.

### What NOT to do (speed / tokens)

- Do not call Factory/EC MCP mid-review.
- Do not spawn specialist sub-agents or ask “approve sql-reviewer?”.
- Do not load full diffs into multiple agents.
- Do not re-read entire checklists verbatim into the prompt when you already know the stack rules.
- Do not run a second “language polish” pass before publish.

## Prior threads

Verify tip. Statuses: Fixed / Partially fixed / Not fixed / Unjustified resolve / Deferred. Follow up only when resolve ≠ fix.

## Comment style (STE-inspired)

Short, active, concrete. See `references/ste-comment-language.md`.

## Finding schema

id, category, severity, confidence, filePath, line, side, title, explanation, impact, suggestion?, evidence[], validationStatus, publishable, commentBody?

## Approval UI (single gate)

```text
PR REVIEW COMPLETE
Repository: {workspace}/{repo}
PR: #{id}
Files reviewed: N
Findings: N
Critical/High/Medium/Low

Prior feedback: (short table if any)

Proposed:
  F1 path:line — title
  …

Publish which? all | F1,F2 | none
```

Only this approval bothers the user. No sub-agent prompts.

## Merge verdict

Lead with Do not merge / OK with nits / etc. from remaining critical/high.

## Token / context policy

| Phase | Budget intent |
|---|---|
| PR fetch tools | Necessary |
| Local file reads | Targeted only |
| Bundled checklist | Prefer recall; open file only if unsure |
| Sub-agents | Off by default |
| Factory MCP | Off during review |
| Post-publish plain summary | Optional, tiny |

If context is tight: shrink prior-thread detail, cap findings (best ≤8 publishable), skip activity feed.

## Author handoff

When review is done and the user is the **developer**, point them to **`omnidev-respond`** (`pr-comments` → `pr-comment-reply` → `pr-description-generator` via **`bitbucket_pr_*`** tools on this MCP). Do not run author publish tools during review.
