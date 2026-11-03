# Contributing to OmniDev

Thanks for helping build OmniDev. Keep changes **small, incremental, and tested**.

## Branch workflow

- **`main`** — stable / release line  
- **`development`** — active integration branch (**do not delete**)  
- **Feature branches** (e.g. `PR-Skills`, `feature/AC-12345`) — one slice per branch  
- Open a PR **into `development`** when the slice is ready; **`development` → `main`** when releasing  
- Keep commit messages short and conventional; **never** add AI `Co-Authored-By` trailers  

## Ground rules

- No secrets in commits (`.env`, tokens, private diffs).
- Prefer one concern per PR (provider tool, skill text, docs, UI).
- Default path stays **token-light** — don’t add mandatory multi-agent fan-out.
- Human approval stays the default for write actions (comment, resolve, merge-adjacent).

## Shared skills vs provider MCPs

| Layer | Location | Rule |
|--------|-----------|------|
| **Skills** | `skills/` | **One playbook per workflow**, usable in **any** application repo. Do not fork skills per Bitbucket/GitHub. |
| **Author I/O** | `@omnidev/core` | Shared scripts + `registerAuthorPrTools()`. |
| **MCP servers** | `packages/mcp-bitbucket`, `packages/mcp-github`, … | Register tools with a **host prefix** (`bitbucket_pr_*`, `github_pr_*`). Same skill text; agent picks prefix from `origin`. |
| **Review** | Provider MCP only | e.g. `bitbucket_get_pr_*` on Bitbucket; do not mix author publish into review-only flows. |

Capability map: [docs/architecture/capability-map.md](./docs/architecture/capability-map.md).

When adding a new host: extend **core** or provider MCP; **reuse existing skill names** (`pr-comments`, etc.) and document the new tool prefix in the capability map.

## Add a provider

1. Add author tools via `registerAuthorPrTools(server, { toolPrefix: "<host>_", hostLabel: "..." })` from `@omnidev/core`.
2. Create or extend `packages/mcp-<name>/` with review tools when needed + unit tests (mocked HTTP).
3. Document env vars in `.env.example` and `docs/guides/`.
4. Do not break Bitbucket tool names when adding GitHub (etc.).

## Add a skill

1. Create `skills/omnidev-<workflow>/SKILL.md` (or extend `skills/pr-*` if it fits an existing workflow).
2. Reference **logical** capabilities and `{prefix}tool_name` — not Bitbucket-only HTTP.
3. Reuse existing MCP tools; only add tools when the skill cannot work otherwise.
4. Document triggers, gates, ASD-STE100 where user-facing text is published, and “do not bother the user with sub-agent approvals.”
5. Install for local use: symlink `skills/<name>` → `~/.cursor/skills/` (see [docs/guides/run-mcp.md](./docs/guides/run-mcp.md)).

## Add a tool

1. Keep tools thin (I/O + validation). Judgment stays in the skill/agent.
2. Prefer shared registration in **core** for author PR tools; provider-specific for review APIs.
3. Validate inputs with Zod (or equivalent).
4. Redact secrets in logs/errors.
5. Include mocked tests for success + failure paths.

## Local development

```bash
cd OmniDev
npm install
npm run build
npm test
npm run typecheck
npm run mcp:bitbucket    # smoke-run Bitbucket MCP (stdio)
npm run mcp:paths        # print Cursor mcp.json snippet
```

Bitbucket auth check:

```bash
cp packages/mcp-bitbucket/.env.example packages/mcp-bitbucket/.env
npm run check:auth
```

## Commit style

Keep messages short and conventional (industry standard). Imperative mood. No AI co-author trailers (`Co-Authored-By`, etc.).

Examples:

- `Add author PR tools on core and provider MCPs`
- `Support mcp.json env with optional package .env`
- `docs: add run-mcp guide`

## Code of conduct

Be respectful. This is an engineering tool for real teams — quality over hype.
