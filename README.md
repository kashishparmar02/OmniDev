# OmniDev

**Agentic toolkit for pull-request review and author workflows.**

OmniDev is a local-first, extensible platform for developer agents — skills (playbooks) plus thin MCP tools — not a black-box “AI dumps comments on a diff” bot.

| Seat | What OmniDev helps with |
|---|---|
| **Reviewer** | Repo-aware PR review → human approval → precise inline comments |
| **Author** | Fetch review threads → reply / resolve → draft or refresh PR description |
| **Later** | Issue triage, more hosts, optional thin UI |

**Status:** Bitbucket Cloud review + author tools (`@omnidev/mcp-bitbucket`); GitHub author tools (`@omnidev/mcp-github`); shared author workflow in `@omnidev/core`.

---

## Principles

1. **Evidence over vibes** — act on tip code and thread context.
2. **Human gate by default** — publish / reply / resolve only with explicit approval.
3. **Provider-agnostic core** — Bitbucket first; GitHub as a second adapter, not a fork.
4. **Skills + tools** — playbooks call thin MCP tools; collaborators can extend either side.
5. **Token-light** — one agent by default; short, clear comments (STE-inspired).
6. **Safe git** — never trash a dirty working tree; prefer fetch / worktrees.

---

## Repository layout

```text
OmniDev/
├── packages/
│   ├── core/              # Shared author PR workflow + types
│   ├── mcp-bitbucket/     # Bitbucket review + bitbucket_pr_* author tools
│   └── mcp-github/        # github_pr_* author tools (review planned)
├── skills/
│   ├── omnidev-review/    # Reviewer playbook
│   ├── omnidev-respond/   # Author loop (comments → reply → PR)
│   ├── pr-comments/       # List PR threads
│   ├── pr-comment-reply/  # Reply / resolve
│   └── pr-description-generator/  # Open or update PR description
├── apps/
│   └── web/               # Optional thin UI (planned)
└── docs/
    ├── architecture/
    └── guides/
```

---

## Extensibility

| You want to add… | Put it here | Must |
|---|---|---|
| Host API (GitLab, etc.) | `packages/mcp-<provider>/` | Shared shapes via `packages/core` where possible |
| New workflow | `skills/omnidev-<name>/` or `skills/pr-*` | Skill.md; reuse existing tools first |
| New MCP tool | Relevant `packages/mcp-*` | Tests; no secrets in repo |
| UI surface | `apps/web/` | Call the same tools — no second brain |

See [CONTRIBUTING.md](./CONTRIBUTING.md) and [docs/architecture/overview.md](./docs/architecture/overview.md).

---

## Roadmap (high level)

1. Scaffold — done  
2. Bitbucket review MCP + review skill — done  
3. Author respond / comments / PR description — in progress  
4. GitHub provider parity  
5. Lightweight web inbox  

Details: [docs/ROADMAP.md](./docs/ROADMAP.md)

---

## Quick start

```bash
git clone https://github.com/kashishparmar02/OmniDev.git
cd OmniDev
npm install
npm run build
npm test
```

Configure Bitbucket credentials (optional `.env` or Cursor `mcp.json` `env`):

```bash
cp packages/mcp-bitbucket/.env.example packages/mcp-bitbucket/.env
# set BITBUCKET_EMAIL and BITBUCKET_API_TOKEN
npm run check:auth
```

Run MCP (stdio):

```bash
npm run mcp:bitbucket   # or: npm run mcp:github
npm run mcp:paths       # print Cursor mcp.json snippet
```

Guides:

- [Run MCP](./docs/guides/run-mcp.md)
- [Author PR workflow](./docs/guides/pr-workflow-mcp.md)
- [Bitbucket review](./docs/guides/bitbucket-review/README.md)

---

## License

MIT — see [LICENSE](./LICENSE).
