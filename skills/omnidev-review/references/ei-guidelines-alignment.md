# EI Factory guidelines vs bitbucket-pr-review

Source (Factory MCP / Skills Guild, read-only catalog):

- `microservice-code-reviewer` + `references/review-checklist.md`
- `angular-code-reviewer` + `references/review-checklist.md`
- `code-standards-enforcer`
- Brain: coding-standards / architecture docs (via `brain_get_for_task` when needed)

## What Factory provides (and we did not fully encode before)

| Area | Factory strength |
|---|---|
| Microservice Clean Architecture | Layer dependency rules, DTO/transaction/repo patterns, stack-specific TS/Python/Rust checks |
| Angular Enterprise Scaffolding | Standalone/OnPush/signals/BEM/tokens/i18n/a11y/lazy routes |
| Standards enforcer | REST naming, HTTP semantics, TS strict/zero-any, HTML/BEM, complexity limits |
| Report shape | Blocker/Major/Minor/Suggestion + approve verdict |

## What our skill already does better (keep)

| Area | Our strength |
|---|---|
| Bitbucket I/O | MCP fetch/diff/comments/publish with approval gate |
| Prior threads | Resolved ≠ fixed; unjustified resolve follow-ups |
| Repo intelligence | Local ASSET resolve, worktrees, beyond-diff flow tracing |
| Regression / SQL depth | Callers, contracts, workers, query evidence rules |
| Comment voice | Natural eng discussion, not checklist-bot tone |
| Publish safety | Anchor validation, confirmed=true, exact dedupe |

## Severity mapping

| EI Factory | Our severity | Publish default |
|---|---|---|
| Blocker | critical or high | Yes if validated |
| Major | high or medium | Yes if behavioural/standards impact is real |
| Minor | low | Only if meaningful; prefer skip for pure style |
| Suggestion | informational | Usually not publishable as inline |

Do **not** flood PRs with every Minor/Suggestion from EI checklists. Use them as review lenses; publish only high-signal items.

## Stack routing

| Repo signal | Apply |
|---|---|
| Angular (`*.component.ts`, standalone, signals) | `references/ei-angular-checklist.md` + optional Factory `angular-code-reviewer` |
| Microservice Clean Arch (domain/application/infrastructure/presentation) | `references/ei-microservice-checklist.md` + optional Factory `microservice-code-reviewer` |
| Mixed / scripts / workers / reports | Our core methodology + `code-standards-enforcer` themes (security, SQL param, complexity) |
| Always | Prior-thread verification + Bitbucket publish gate |

## Factory during PR review

**Do not call Factory/EC MCP in the default PR review path.**  
Use the bundled checklists in this folder only.

Factory remains useful for other EI work outside this skill. Optional deep mode only if the user explicitly asks to load live Factory standards.
