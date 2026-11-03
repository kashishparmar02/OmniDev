# Speed, tokens, and STE language

## Default review path

Review uses **OmniDev Bitbucket MCP + local code + bundled skill references only**. Do not pull large external “standards catalogs” mid-review unless the user explicitly asks.

## Token diet

| Costly pattern | Why avoid |
|---|---|
| Spawning many specialist sub-agents by default | Extra round-trips + duplicate context |
| Loading full checklists into every prompt | Large markdown burns context |
| Re-reading the entire diff in multiple agents | Redundant tokens |
| Second “language polish” pass before publish | Delay with little quality gain |

| Lightweight pattern | Intent |
|---|---|
| One agent fast path | Default |
| Targeted file reads | Beyond-diff only when needed |
| Short STE-inspired comments | Clear, publishable |
| Cap publishable findings (≤8) | Signal over noise |

**Conclusion:** Keep review on Bitbucket MCP + local tip code + short bundled rules. Optional 2–4 line plain summary **after** publish if the user wants it.

## STE-inspired comments

Apply ASD-STE100 principles (short, active, concrete). See `skills/omnidev-review/references/ste-comment-language.md`.

## When to spend more

Only when the user asks — e.g. “run specialist SQL/security pass” or “load our team standards live.”
