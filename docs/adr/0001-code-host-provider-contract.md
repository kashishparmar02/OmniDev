# 1. One provider contract for every code host

Status: accepted

## Context

OmniDev's capabilities, such as reviewing a pull request or replying to review
threads, need the same few things from a code host: the pull request, its diff
and its comment threads. Bitbucket and GitHub expose these through different
APIs with different shapes. GitHub, for example, resolves a thread through
GraphQL, while Bitbucket uses a REST call on the comment.

If each capability called host APIs directly, every capability would be written
once per host, and a fix in one copy would be missed in the others.

## Decision

`@omnidev/core` defines one interface, `ICodeHostProvider`, and its own data
shapes (`PullRequest`, `ReviewThread`, `InlineAnchor`). Capabilities depend
only on that interface. Each host gets one package that implements it.

The behaviour of the interface is specified by a shared test suite,
`describeProviderContract`, exported from `@omnidev/core/testing`. Every
provider package must run it. `InMemoryCodeHost` is the reference
implementation and the stand-in for a real host in capability tests.

Three rules keep the contract small:

1. **Providers do I/O and translation only.** Checking that an inline anchor
   is inside the diff, asking the user for approval and removing duplicates all
   happen above the provider, once, for every host.
2. **Providers reject only with `ProviderError`.** Its `code` tells a
   capability what happened without knowing which host it is talking to.
3. **A method is added only when a capability needs it.** The interface is not
   a general-purpose host client.

## Alternatives considered

- **One tool server per host, each with its own logic.** This is the simplest
  start, but logic such as anchor validation ends up duplicated per host and
  drifts apart.
- **Use a host's official client library as the abstraction.** These libraries
  model one host each, so the capability would still need a branch per host.
- **A wider, generic interface covering issues, pipelines and repositories.**
  Rejected for now because no capability needs it yet, and an interface
  designed without a caller is usually wrong.

## Consequences

- Adding a host means implementing six methods and passing the contract tests.
  No capability changes.
- Capability tests need no network and no credentials.
- The contract only guarantees what its tests check. Behaviour that differs
  between hosts and is not covered there, such as rate limits, must be handled
  inside each provider.
- The data shapes are the lowest common denominator. A host-specific feature,
  such as GitHub's suggested changes, is not available until the contract is
  deliberately extended.
