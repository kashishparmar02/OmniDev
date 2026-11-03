# AGENTS.md

Guidance for coding agents working on OmniDev.

1. Read [CONTRIBUTING.md](./CONTRIBUTING.md) and [docs/ROADMAP.md](./docs/ROADMAP.md).
2. Work on **`development`** (do not delete that branch). Open PRs into `development`; release via `development` → `main`.
3. Skills own judgment; MCP tools stay thin and approval-gated (`confirmed=true` for writes).
4. Never commit secrets (`.env`, tokens). Never add AI `Co-Authored-By` trailers.
5. Prefer one concern per PR. Keep the default path token-light (single agent).
6. Docs and examples must stay **generic** — no private machine paths, personal emails, or org-specific folder names.
