# OmniDev

A local-first toolkit that gives coding agents safe, well-tested tools and
playbooks for everyday developer work.

OmniDev is being rebuilt from scratch. This README lists only what exists in
the repository today; planned work lives in GitHub issues, not here.

## What exists today

| Part                          | What it does                                                                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@omnidev/core`               | `redactSecrets`, which strips known credential formats from any text before it leaves a process                                                         |
| Provider contract             | `ICodeHostProvider`, the one interface a code host implements, with OmniDev's own data shapes                                                           |
| Diff anchors                  | `parseUnifiedDiff` and `checkAnchor`, which decide whether an inline comment can attach to a line                                                       |
| Host requests                 | `sendHostRequest`, the single HTTP path to a host, with timeouts, safe retries and error mapping                                                        |
| Publishing findings           | `publishFindings`, which posts approved review findings inline, skipping duplicates and lines outside the diff                                          |
| `@omnidev/core/testing`       | An in-memory code host and the shared contract tests every provider must pass                                                                           |
| `@omnidev/provider-bitbucket` | Bitbucket Cloud implementation of the provider contract                                                                                                 |
| `@omnidev/provider-github`    | GitHub implementation of the provider contract, using REST and GraphQL                                                                                  |
| `@omnidev/server`             | An MCP server with ten pull request tools that work on both hosts from a pasted URL; every tool that changes a pull request needs explicit confirmation |
| Repository guardrails         | Git hooks and a CI job that block secrets, secret files, private names and malformed commits                                                            |
| Continuous integration        | Format check, lint, typecheck, tests and build on every pull request                                                                                    |

## Development

```bash
npm install
npm run verify
```

Design decisions are recorded in [docs/adr](./docs/adr).

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the workflow and the guardrails,
and [SECURITY.md](./SECURITY.md) for reporting a vulnerability.

## License

MIT. See [LICENSE](./LICENSE).
