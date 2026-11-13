# OmniDev

A local-first toolkit that gives coding agents safe, well-tested tools and
playbooks for everyday developer work.

OmniDev is being rebuilt from scratch. This README lists only what exists in
the repository today; planned work lives in GitHub issues, not here.

## What exists today

| Part                   | What it does                                                                                    |
| ---------------------- | ----------------------------------------------------------------------------------------------- |
| `@omnidev/core`        | `redactSecrets`, which strips known credential formats from any text before it leaves a process |
| Repository guardrails  | Git hooks and a CI job that block secrets, secret files, private names and malformed commits    |
| Continuous integration | Format check, lint, typecheck, tests and build on every pull request                            |

## Development

```bash
npm install
npm run verify
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the workflow and the guardrails,
and [SECURITY.md](./SECURITY.md) for reporting a vulnerability.

## License

MIT. See [LICENSE](./LICENSE).
