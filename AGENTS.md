# Guidance for coding agents

Follow [CONTRIBUTING.md](./CONTRIBUTING.md). The rules agents most often break:

1. Never add AI attribution to commits or pull requests: no `Co-Authored-By`
   trailer naming an assistant and no "Generated with" line.
2. Never write a real credential, organisation name, personal email address or
   machine-specific path anywhere, including tests and examples.
3. Never bypass the git hooks with `--no-verify`. Fix the reported problem.
4. Run `npm run verify` before saying a change is done.
5. Describe only what exists. Do not document planned features as built.
