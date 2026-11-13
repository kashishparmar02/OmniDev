# Contributing to OmniDev

## Setup

```bash
git clone https://github.com/kashishparmar02/OmniDev.git
cd OmniDev
npm install      # also points git at the hooks in .githooks/
npm run verify   # format check, lint, build, typecheck, tests
```

Node 20 or newer is required. `npm run verify` is exactly what CI runs.

## Workflow

1. Branch from `main`. Name the branch `type/short-description`, for example
   `feat/github-provider`.
2. Keep each pull request to one concern and under about 300 changed lines.
   Refactors and features go in separate pull requests.
3. Tests ship in the same pull request as the code they cover.
4. Open the pull request into `main`. It merges by rebase once the `verify`
   and `guard` checks pass, so every commit must stand on its own.

## Commit messages

Commits follow [Conventional Commits](https://www.conventionalcommits.org/):

```text
type(optional-scope): summary in the imperative, 72 characters or fewer

Optional body explaining why the change was needed.
```

Allowed types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`,
`build`, `perf`, `revert`.

Do not add AI tool attribution, such as a `Co-Authored-By` trailer naming an
assistant or a "Generated with" line. The author of a commit is the person
responsible for it. Human co-authors are welcome.

## Guardrails

The same checks run in a local git hook and in CI, from `scripts/guard/`.

| Check                                   | Local hook        | CI      |
| --------------------------------------- | ----------------- | ------- |
| Commit message format, no AI trailers   | `commit-msg`      | `guard` |
| Secret files such as `.env` and `*.pem` | `pre-commit`      | `guard` |
| Known credential formats in added lines | `pre-commit`      | `guard` |
| Full secret scan with gitleaks          | when installed    | `guard` |
| Private terms                           | when list present | `guard` |

Install [gitleaks](https://github.com/gitleaks/gitleaks#installing) to get the
full secret scan before you commit instead of after you push.

### Secrets in tests

Never paste a real credential into a test, a fixture or documentation, even
one you believe has expired. Build fake values at runtime so that no
token-shaped text exists in the repository:

```ts
const fakeToken = ["ghp", "x".repeat(40)].join("_");
```

In documentation, write placeholders such as `<your-api-token>`.

### Private terms

If there are names that must never appear in this repository, such as an
employer, a client or an internal project, list them in a file named
`.private-terms` at the repository root. It holds one case-insensitive regular
expression per line and is ignored by git, so the list itself stays private.
The hooks then block any commit whose content, paths or message match.

Maintainers store the same list in the `OMNIDEV_PRIVATE_TERMS` repository
secret so that CI enforces it too.

### Examples and documentation

Use neutral placeholders: `acme` for an organisation, `example.com` for a
domain, `~/code` for a local folder. Do not include real workspace names,
personal email addresses or absolute paths from your machine.

## Documentation

The README describes only what exists in the repository. Plans belong in
[ROADMAP.md](./ROADMAP.md). A pull request that adds a feature updates the README in the
same change.
