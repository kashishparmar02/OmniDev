# OmniDev

[![CI](https://github.com/kashishparmar02/OmniDev/actions/workflows/ci.yml/badge.svg)](https://github.com/kashishparmar02/OmniDev/actions/workflows/ci.yml)

A local-first toolkit that gives coding agents safe, well-tested tools and
playbooks for everyday developer work, starting with pull requests on
Bitbucket and GitHub.

Paste a pull request URL into Cursor or Claude Code and ask for a review. The
agent reads the change and the code around it, shows you its findings, and
posts only the ones you approve, as inline comments on the right lines.

## Why it is different

- **Nothing is posted without you.** Every tool that changes a pull request
  refuses to run until you have approved exactly what it will do.
- **Comments land on real lines.** Each finding is checked against the diff
  first, and a finding that is already on the pull request is not posted again.
- **One set of tools for both hosts.** The host is read from the URL. Bitbucket
  and GitHub implement one contract and pass the same contract tests.
- **Reviews read the code, not only the diff.** The pull request is checked out
  into a separate folder, so your own branch and unsaved work are never touched.
- **Secrets stay out of the model's context.** Every result and error passes
  through redaction before an agent sees it.

## Quick start

```bash
git clone https://github.com/kashishparmar02/OmniDev.git
cd OmniDev
npm install
npm run build
```

Then register the server with your editor and link the playbooks:
[docs/setup.md](./docs/setup.md).

## What you can do

| Playbook                                                | What it does                                                         |
| ------------------------------------------------------- | -------------------------------------------------------------------- |
| [`review-pr`](./skills/review-pr)                       | Reviews a pull request and publishes the findings you approve        |
| [`respond-to-review`](./skills/respond-to-review)       | Works through review comments on your pull request and replies       |
| [`write-pr-description`](./skills/write-pr-description) | Writes a title and description from the diff and opens or updates it |

The playbooks use ten tools, listed in [docs/setup.md](./docs/setup.md#tools).

## How it is built

```text
playbooks (skills/)            how to review, reply and describe
        |
MCP server (@omnidev/server)   ten tools, one approval gate, URL -> provider
        |
core (@omnidev/core)           provider contract, diff anchors, publishing,
        |                      HTTP with safe retries, secret redaction
        +-- @omnidev/provider-bitbucket   Bitbucket Cloud REST
        +-- @omnidev/provider-github      GitHub REST and GraphQL
```

| Package                       | Responsibility                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------- |
| `@omnidev/core`               | The `ICodeHostProvider` contract and everything that is the same for every host             |
| `@omnidev/core/testing`       | An in-memory host and the contract tests every provider must pass                           |
| `@omnidev/provider-bitbucket` | Translates the contract to the Bitbucket Cloud API                                          |
| `@omnidev/provider-github`    | Translates the contract to the GitHub API                                                   |
| `@omnidev/server`             | The MCP server: tools, configuration and review workspaces                                  |
| `scripts/guard`               | Git hooks and a CI job that block secrets, private names and malformed commits in this repo |

Design decisions are recorded in [docs/adr](./docs/adr).

## Status and limits

OmniDev is at an early stage. Everything listed above exists and is tested,
with these limits:

- The providers are tested against in-memory fakes of each host's API. Reading
  has also been checked against real public pull requests on both hosts.
- GitHub cannot reply to or resolve a general comment, so those calls return
  `unsupported`.
- Review workspaces need an existing local clone of the repository.
- The packages are not published to npm yet; you build from source.

## Roadmap

What comes next, and what "done" means for each step, is in
[ROADMAP.md](./ROADMAP.md).

## Development

```bash
npm install
npm run verify   # format check, lint, build, typecheck, tests
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the workflow and the guardrails,
and [SECURITY.md](./SECURITY.md) for reporting a vulnerability.

## License

MIT. See [LICENSE](./LICENSE).
