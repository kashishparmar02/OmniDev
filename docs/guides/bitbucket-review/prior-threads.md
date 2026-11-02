# Prior thread verification & re-review

## Why this exists

Bitbucket “Resolved” only means someone closed the discussion UI. It does **not** mean the tip commit fixed the bug. Authors may also reply “fixed” without enough evidence.

The review system must:

1. Read existing comments/activity on every review
2. Verify each meaningful thread against **current tip code**
3. Publish follow-ups when resolve/claim ≠ actual fix
4. Avoid duplicate spam when the issue is truly fixed or already open with the same substance

## Standard report section (required)

```markdown
### Prior feedback status (already on the PR)

| Topic | Status |
|---|---|
| CH/wave maps keyed by um only | Fixed — evidence… |
| Prefetch cancel on abort | Partially fixed — residual F1 |
| … | Unjustified resolve / Not fixed / Deferred |
```

Then list **New findings** only for residual or newly discovered defects.

## Status definitions

| Status | Publish follow-up? |
|---|---|
| Fixed | No (cite evidence in table) |
| Partially fixed | Yes — residual finding |
| Not fixed | Yes |
| Unjustified resolve | Yes — call out missing justification + remaining defect |
| Acknowledged / deferred | Usually no; list under “Not re-raising” unless severity demands |
| Same issue, different path | Yes — new finding; reference prior thread |

## Example (from ei-asset-reports-verification #51 pattern)

Agent correctly:

- Marked cycle-key / build-fallback / normalization as **Fixed** with tip evidence
- Marked prefetch cancel as **Partially fixed** and raised **F1** for uncleared failed task
- Raised **F2** as same *class* as an earlier cycle-key comment but still open in `identities()`
- Did not re-raise deferred INFRA_FAIL / pool / ordering items

That pattern is the intended behavior.

## Re-review after author pushes fixes

When user says “re-review” / “check fixes”:

1. Fetch latest PR commits + tip
2. Re-run prior-thread table first
3. Confirm each previously published F# against tip
4. Only propose new/still-open items for publish approval

## Dedup layers

| Layer | Mechanism |
|---|---|
| Publisher | Exact same comment body + path + line → skip |
| Agent | Semantic overlap with open human/bot threads → track, don’t clone |
| Agent | Related but distinct path → new finding with cross-reference |

## Approval still required

Follow-ups for unjustified resolves are still gated: show them as proposed comments and wait for `all` / selected ids / `none`.
