# Review guidelines (bundled)

Use these as **lenses**, not as a mandate to flood the PR.

## Severity → publish default

| Severity | Publish default |
|---|---|
| Critical / High | Yes, if confirmed + anchorable |
| Medium | Yes when high-signal and PR-scoped |
| Low / Nit / Suggestion | Rarely — chat or skip unless user asks for nits |

Do **not** publish every checklist item. Prefer few high-quality findings.

## Stack → checklist

| Stack signal | Reference |
|---|---|
| Angular (`*.component.ts`, standalone, signals) | `references/angular-checklist.md` |
| Microservice Clean Arch | `references/microservice-checklist.md` |
| Comment wording | `references/ste-comment-language.md` |

## Scope

- Focus on this PR’s changes.
- Beyond-diff only when the PR causes, worsens, or newly depends on an issue.
- Unrelated pre-existing issues: note in chat if useful; do not invent inline anchors outside the diff.
