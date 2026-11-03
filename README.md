# OmniDev

**Agentic toolkit that closes the loop on PRs, review threads, and (later) issues.**

OmniDev is a local-first, extensible platform for developer workflow agents — not a one-off “AI dumps comments on a diff” bot.

| Seat | What OmniDev helps with |
|---|---|
| **Reviewer** | Deep, repo-aware PR review → human approval → precise inline comments |
| **Author** | Fetch review comments → reply / resolve → raise or refresh PR description (`omnidev-respond`) |
| **Later** | Issue triage, more providers, thin UI |

**Status:** Bitbucket review + author tools on `mcp-bitbucket`; GitHub author tools on `mcp-github`; shared scripts in `@omnidev/core`.

---

## Principles

1. **Evidence over vibes** — act on tip code + thread context, not generic advice.
2. **Human gate by default** — publish / reply / resolve only with explicit approval (until you opt into high-confidence auto).
3. **Provider-agnostic core** — Bitbucket first; GitHub as a second adapter, not a fork.
4. **Skills + tools** — playbooks (skills) call thin MCP tools; collaborators can add either without rewriting the spine.
5. **Token-light** — one agent by default, targeted reads, short clear comments (STE-inspired). No mandatory cloud “brain” mid-loop.
6. **Safe git** — never trash a dirty working tree; prefer fetch / worktrees.

---

## Repository layout

```text
OmniDev/
├── packages/
│   ├── core/              # Shared types, provider interfaces, thread state machine
│   ├── core/              # Shared author PR workflow + registerAuthorPrTools
│   ├── mcp-bitbucket/     # Bitbucket review + bitbucket_pr_* author tools
│   └── mcp-github/        # github_pr_* author tools (review planned)
├── skills/
│   ├── omnidev-review/    # Reviewer playbook
│   ├── omnidev-respond/   # Author loop (comments → reply → raise PR)
│   ├── pr-comments/       # List PR threads (MCP)
│   ├── pr-comment-reply/  # Reply / resolve (MCP)
│   └── pr-description-generator/  # Open or update PR (MCP)
├── apps/
│   └── web/               # Optional thin UI (planned — after author-mode)
├── docs/
│   ├── architecture/      # How the system fits together
│   ├── guides/            # Setup & usage
│   └── adr/               # Architecture decision records
└── .github/               # Issues / CI (later)
```

Empty package folders are intentional placeholders so contributors know where to land code.

---

## Extensibility contract (for collaborators)

| You want to add… | Put it here | Must |
|---|---|---|
| Host API (GitLab, etc.) | `packages/mcp-<provider>/` | Implement `packages/core` provider interface |
| New workflow (draft PR, triage) | `skills/omnidev-<name>/` | Skill.md + use existing tools first |
| New MCP tool | Relevant `packages/mcp-*` | Tests + no secrets in repo |
| UI surface | `apps/web/` | Call the same tools/APIs — no second brain |

See [CONTRIBUTING.md](./CONTRIBUTING.md) and [docs/architecture/overview.md](./docs/architecture/overview.md).

---

## Roadmap (high level)

1. **Scaffold** ← you are here  
2. **Bitbucket review MCP + review skill** (migrate hardened local prototype)  
3. **Author respond mode** (classify threads → reply / resolve / discuss)  
4. **GitHub provider**  
5. **Lightweight web inbox** for PRs/threads  

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

Run MCP locally: `npm run mcp:bitbucket` or `npm run mcp:github` (from repo root after build).

Cursor config paths: `npm run mcp:paths` (prints `mcp.json` snippet).

Run and wire MCP — [docs/guides/run-mcp.md](./docs/guides/run-mcp.md). Author tools: [pr-workflow-mcp.md](./docs/guides/pr-workflow-mcp.md). Review: [packages/mcp-bitbucket/README.md](./packages/mcp-bitbucket/README.md).

Skills: `skills/omnidev-review`, `skills/omnidev-respond`, plus `pr-comments`, `pr-comment-reply`, `pr-description-generator`.

---

## License

MIT — see [LICENSE](./LICENSE).

---

## Related

Local Bitbucket prototype that seeded this project lives privately under ASSET (`cursor-pr-review`) and will be migrated in small commits into `packages/mcp-bitbucket` + `skills/omnidev-review`.
