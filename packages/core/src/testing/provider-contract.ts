// The behaviour every ICodeHostProvider must have, written once as tests.
//
// Each provider package calls describeProviderContract from its own test file
// and supplies a provider wired to a fake of its host. A capability can then
// rely on any provider behaving exactly like the in-memory one, which is what
// lets capability tests run against the in-memory host alone.

import { beforeEach, describe, expect, it } from "vitest";
import type { ICodeHostProvider, InlineAnchor, PullRequestRef } from "../provider/code-host.js";

export interface ProviderContractFixture {
  provider: ICodeHostProvider;
  /** A pull request that exists and starts with no threads. */
  existing: PullRequestRef;
  /** A pull request that does not exist. */
  missing: PullRequestRef;
  /** A line of the existing pull request's diff that accepts an inline comment. */
  anchor: InlineAnchor;
}

/**
 * Registers the contract tests under the given name.
 *
 * `setup` runs before every test and must return a fixture with fresh state,
 * because the tests create threads and would otherwise see each other's data.
 */
export function describeProviderContract(
  name: string,
  setup: () => ProviderContractFixture | Promise<ProviderContractFixture>,
): void {
  describe(`${name} provider contract`, () => {
    let fixture: ProviderContractFixture;

    beforeEach(async () => {
      fixture = await setup();
    });

    it("returns the pull request it was asked for", async () => {
      const pullRequest = await fixture.provider.getPullRequest(fixture.existing);

      expect(pullRequest.ref).toEqual(fixture.existing);
      expect(pullRequest.headCommit).not.toBe("");
    });

    it("rejects with not_found for a pull request that does not exist", async () => {
      const { provider, missing } = fixture;

      await expect(provider.getPullRequest(missing)).rejects.toMatchObject({ code: "not_found" });
      await expect(provider.getDiff(missing)).rejects.toMatchObject({ code: "not_found" });
      await expect(provider.listThreads(missing)).rejects.toMatchObject({ code: "not_found" });
    });

    it("returns a git-format diff that includes the anchored file", async () => {
      const diff = await fixture.provider.getDiff(fixture.existing);

      expect(diff).toContain("diff --git");
      expect(diff).toContain(fixture.anchor.path);
    });

    it("lists a new general thread as unresolved with its first comment", async () => {
      const { provider, existing } = fixture;

      const created = await provider.createThread(existing, { body: "Please add a test." });
      const threads = await provider.listThreads(existing);

      expect(threads).toHaveLength(1);
      expect(threads[0]).toMatchObject({ id: created.id, resolved: false });
      expect(threads[0]?.anchor).toBeUndefined();
      expect(threads[0]?.comments.map((comment) => comment.body)).toEqual(["Please add a test."]);
    });

    it("keeps the anchor of an inline thread", async () => {
      const { provider, existing, anchor } = fixture;

      await provider.createThread(existing, { body: "This can be null.", anchor });
      const threads = await provider.listThreads(existing);

      expect(threads[0]?.anchor).toEqual(anchor);
    });

    it("appends replies to a thread in the order they were written", async () => {
      const { provider, existing } = fixture;
      const thread = await provider.createThread(existing, { body: "first" });

      await provider.replyToThread(existing, thread.id, "second");
      await provider.replyToThread(existing, thread.id, "third");
      const threads = await provider.listThreads(existing);

      expect(threads[0]?.comments.map((comment) => comment.body)).toEqual([
        "first",
        "second",
        "third",
      ]);
    });

    it("resolves and reopens a thread", async () => {
      const { provider, existing } = fixture;
      const thread = await provider.createThread(existing, { body: "Fix the typo." });

      await provider.setThreadResolved(existing, thread.id, true);
      expect((await provider.listThreads(existing))[0]?.resolved).toBe(true);

      await provider.setThreadResolved(existing, thread.id, false);
      expect((await provider.listThreads(existing))[0]?.resolved).toBe(false);
    });

    it("rejects with not_found when the thread does not exist", async () => {
      const { provider, existing } = fixture;

      await expect(
        provider.replyToThread(existing, "no-such-thread", "hello"),
      ).rejects.toMatchObject({ code: "not_found" });
      await expect(
        provider.setThreadResolved(existing, "no-such-thread", true),
      ).rejects.toMatchObject({ code: "not_found" });
    });
  });
}
