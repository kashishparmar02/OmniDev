# OmniDev

**Agentic toolkit that closes the loop on PRs, review threads, and (later) issues.**

OmniDev is a local-first, extensible platform for developer workflow agents — not a one-off “AI dumps comments on a diff” bot.

| Seat | What OmniDev helps with |
|---|---|
| **Reviewer** | Deep, repo-aware PR review → human approval → precise inline comments |
| **Author** | Fetch review comments → verify against tip → reply / resolve / keep open for discussion |
| **Later** | Issue triage, PR draft/generation, more providers, thin UI |

**Status:** early scaffold. Bitbucket Cloud review core lands next (incremental commits). GitHub and author-mode follow.

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
│   ├── mcp-bitbucket/     # Bitbucket Cloud MCP (review + later respond)
│   └── mcp-github/        # GitHub MCP (planned)
├── skills/
│   ├── omnidev-review/    # Reviewer playbook
│   └── omnidev-respond/   # Author reply/resolve playbook (planned)
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

Not installable yet — packages land in following commits.

```bash
git clone https://github.com/kashishparmar02/OmniDev.git
cd OmniDev
# npm install   # after packages land
```

---

## License

MIT — see [LICENSE](./LICENSE).

---

## Related

Local Bitbucket prototype that seeded this project lives privately under ASSET (`cursor-pr-review`) and will be migrated in small commits into `packages/mcp-bitbucket` + `skills/omnidev-review`.
