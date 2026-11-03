# OmniDev roadmap

Incremental delivery. Each row should become one or more small PRs/commits.

| Phase | Deliverable | Notes |
|---|---|---|
| **0 – Scaffold** | Repo layout, README, CONTRIBUTING, architecture stub | Done in init commit |
| **1 – Core contracts** | `packages/core` types: provider, thread state, finding schema | No live API yet |
| **2 – Bitbucket review** | `packages/mcp-bitbucket` + `skills/omnidev-review` | Done on development |
| **3 – Author respond** | `@omnidev/core` + author tools on provider MCPs + pr-* skills | Landed on development |
| **4 – GitHub provider** | `packages/mcp-github` parity for review + respond | Same core interface |
| **5 – Web inbox** | `apps/web` thin UI over tools | Optional; keep MCP usable alone |
| **6 – Hardening** | CI, e2e fixtures, security review, docs polish | Before wider announce |

## Non-goals (for now)

- Replacing human merge ownership
- Mandatory external “standards brain” during every review
- Auto-resolve without evidence + policy
