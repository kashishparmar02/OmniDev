# Roadmap

## Where OmniDev is going

OmniDev gives coding agents safe, well-tested tools and playbooks for everyday
developer work. It started with pull requests. The aim is a small platform on
which each new capability is cheap to add, because the hard shared parts are
already solved once: reaching a code host, asking for approval, keeping
secrets out of a model's context and refusing to act on things it cannot
prove.

Three ideas decide what gets built:

1. **Tools that check their own claims.** A playbook on its own is advice. A
   playbook backed by a tool that can prove or disprove a finding is a
   product. Every capability should ship with the tool that grounds it.
2. **Depth before breadth.** A few capabilities that are finished, measured
   and documented are worth more than many that are sketched.
3. **Honest status.** The README describes only what exists. This file
   describes what does not exist yet.

## Milestones

Milestones are in priority order. Each item lists what "done" means, so that
anyone can tell when to stop.

### M1. Prove it on real hosts

The providers are tested against in-memory fakes. Writes have never run
against a real host. Nothing else matters until they have.

| Item                   | Done when                                                                                                                                                                                                                                    |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1 Live check script  | `scripts/live-check` runs the contract's operations against a throwaway pull request on each host, using credentials from the environment, and cleans up after itself. It is never run in CI on forks and never against a real pull request. |
| 1.2 Fix what it finds  | Every difference between a fake and its real host is fixed in the provider and reproduced in the fake, so the contract suite would now catch it.                                                                                             |
| 1.3 Fake fidelity note | The contributor documentation lists what each fake is known to get right and what it has never been compared against.                                                                                                                        |

### M2. Install in one command

| Item                  | Done when                                                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2.1 Publishable build | The packages have real versions, correct `files` and `exports`, and `npm pack` produces archives that work when installed into an empty project. |
| 2.2 Release workflow  | A tagged release publishes to npm from CI with provenance, and nothing can be published from a laptop by accident.                               |
| 2.3 One-line start    | `npx` starts the server with no clone and no build, and the setup guide leads with that.                                                         |
| 2.4 `omnidev doctor`  | A command checks credentials, repository roots and host access, and prints what to fix. It never prints a credential.                            |

### M3. Measure the review

A claim that the review is good needs numbers.

| Item          | Done when                                                                                                                                                               |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1 Dataset   | A script collects a fixed set of merged public pull requests together with the comments human reviewers left on them, and the set is recorded so runs can be repeated.  |
| 3.2 Harness   | One command runs the review playbook over the set without posting anything, and stores each finding with its file and line.                                             |
| 3.3 Metrics   | The report states how many findings anchor to a valid line, how many repeat an existing comment, and how many match an issue a human raised, with the method explained. |
| 3.4 Published | The results and their limits are in `docs/evaluation.md` and summarised in the README. Numbers that look bad are published too.                                         |

### M4. Capabilities with their own evidence

Each capability is a playbook plus the tool that grounds it. Build them one at
a time, in this order.

| Item                   | Done when                                                                                                                                                                                                             |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.1 Security review    | A finding is only reported with a traced path from where untrusted input enters to where it does harm. A tool produces that path from the review workspace, and the playbook drops any finding without one.           |
| 4.2 SQL and migrations | A tool flags schema changes that lock or rewrite a table, per database engine, with tests for each rule. A second tool can run a read-only query plan against a development database the user configures.             |
| 4.3 CI failure triage  | The provider contract can list a pull request's failed checks and fetch a job log. A tool reduces a log to the failing step and the first real error, and the playbook maps it to the commit and file that caused it. |
| 4.4 Performance review | A finding states how often the code runs and how its cost grows, and where the project has benchmarks the playbook runs them before and after.                                                                        |

### M5. A third host

| Item       | Done when                                                                                                                                     |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 5.1 GitLab | A GitLab provider passes the shared contract suite with no change to any capability, and any contract change it forced is recorded in an ADR. |

### M6. Ready for contributors

| Item                 | Done when                                                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 6.1 Coverage         | CI reports test coverage and fails below an agreed threshold.                                                                |
| 6.2 Static analysis  | Code scanning runs on every pull request.                                                                                    |
| 6.3 Contributor path | Issue templates, a code of conduct and a "write your own provider" guide exist, with a few issues marked as good first ones. |
| 6.4 Demo             | The README opens with a short recording of a review from URL to posted comment.                                              |

## Known gaps and debt

These are small, real and not yet scheduled. Fix one when you are already
working nearby, or pick one up between milestones.

- GitHub threads longer than one hundred comments are cut off.
- The diff parser does not decode escape sequences in quoted file names.
- `pr_get_diff` returns the whole diff, which can be too large for a model's
  context. It needs a size limit and a way to ask for one file.
- The server reports its version as `0.0.0`.
- Review workspaces need an existing clone; OmniDev does not clone for you.
- There are no tools for a pull request's commits or for deleting a comment.
- Dependency updates to a new major TypeScript version fail until the lint
  tooling supports it.

## Not planned

- Approving, merging or declining a pull request on the user's behalf.
- Posting anything without the user's approval.
- A hosted service. OmniDev runs on the developer's machine.
