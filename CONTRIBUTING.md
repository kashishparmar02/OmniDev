# Contributing to OmniDev

Thanks for helping build OmniDev. Keep changes **small, incremental, and tested**.

## Branch workflow

- **`main`** — stable / release line  
- **`development`** — active work branch (**do not delete**)  
- Day-to-day commits go on `development`  
- Open a PR from `development` → `main` when a slice is ready to land  
- Keep commit messages short and conventional; **never** add AI `Co-Authored-By` trailers  

## Ground rules

- No secrets in commits (`.env`, tokens, private diffs).
- Prefer one concern per PR (provider tool, skill text, docs, UI).
- Default path stays **token-light** — don’t add mandatory multi-agent fan-out.
- Human approval stays the default for write actions (comment, resolve, merge-adjacent).

## Add a provider

1. Implement the provider interface in `packages/core` (once published).
2. Create `packages/mcp-<name>/` with MCP tools + unit tests (mocked HTTP).
3. Document env vars in `.env.example` and `docs/guides/`.
4. Do not break Bitbucket paths when adding GitHub (etc.).

## Add a skill

1. Create `skills/omnidev-<workflow>/SKILL.md`.
2. Reuse existing MCP tools; only add tools when the skill cannot work otherwise.
3. Document triggers, gates, and “do not bother the user with sub-agent approvals.”

## Add a tool

1. Keep tools thin (I/O + validation). Judgment stays in the skill/agent.
2. Validate inputs with Zod (or equivalent).
3. Redact secrets in logs/errors.
4. Include mocked tests for success + failure paths.

## Local development

```bash
# After packages exist:
npm install
npm test
npm run typecheck
```

## Commit style

Keep messages short and conventional (industry standard). Imperative mood. No AI co-author trailers (`Co-Authored-By`, etc.).

Examples:

- `Initial commit`
- `Add core provider interfaces`
- `Add Bitbucket PR diff fetch`
- `docs: document thread state machine`

## Code of conduct

Be respectful. This is an engineering tool for real teams — quality over hype.
