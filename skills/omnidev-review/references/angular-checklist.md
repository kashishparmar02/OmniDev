# Angular review checklist

Use when reviewing Angular apps (standalone / signals / OnPush patterns).

## Components

- `standalone: true`, `ChangeDetectionStrategy.OnPush`
- `input()` / `output()` (not decorator Inputs/Outputs)
- `inject()` over constructor DI; `host` object over HostBinding/Listener
- No NgModules; no Zone.js auto-CD assumptions

## Signals / state

- Private writable `_state = signal(...)`; public `.asReadonly()`
- `computed()` for derived state; mutate only via `.set`/`.update`
- Observables → signals at component boundary (`toSignal` pattern)

## Naming / TS quality

- Explicit access modifiers; private/protected `_` prefix
- Booleans `is/has/can/...`; constants `UPPER_SNAKE_CASE`
- Zero `any`; explicit returns on public methods; `catch (error: unknown)`
- Complexity: cyclomatic ≤ 10; method ≤ 50 lines; file ≤ 500 (flag as low unless harmful)

## Templates / a11y

- Semantic HTML; label/`for` on inputs; meaningful `alt`
- `data-testid` on interactive elements
- `NgOptimizedImage` for static images when project uses it
- `target="_blank"` → `rel="noopener noreferrer"`
- Prefer Transloco / project i18n over hardcoded UI strings when the repo already does i18n

## SCSS / BEM / tokens

- One BEM block per file; no nested `__el__subel`
- Class selectors only; tokens for color/spacing/type (no random hex when tokens exist)
- Logical properties; nesting ≤ 3; `@use` not deprecated `@import`

## Architecture boundaries

- Core/Shared must not import Features/Layout incorrectly
- No deep `../../` when path aliases exist (`@core/*`, `@shared/*`)
- Feature routes lazy-loaded

## Tests

- Colocated `.spec.ts`; one behaviour per `it`
- Mock HTTP; `detectChanges` after state changes

## Blockers (usually critical/high)

- Missing OnPush / non-standalone where the project standard requires it
- Hardcoded secrets, `eval`, open redirects
- Writable public signals mutating shared state unsafely
