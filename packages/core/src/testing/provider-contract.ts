// The behaviour every ICodeHostProvider must have, written once as tests.
//
// Each provider package calls describeProviderContract from its own test file
// and supplies a provider wired to a fake of its host. A capability can then
// rely on any provider behaving exactly like the in-memory one, which is what
// lets capability tests run against the in-memory host alone.
//
// Replies and resolution are tested on inline threads only, because that is
// what every host supports. Some hosts cannot reply to or resolve a general
// comment and reject with `unsupported` instead.

import { beforeEach, describe, expect, it } from "vitest";
import type {
  ICodeHostProvider,
  InlineAnchor,
  NewPullRequest,
  PullRequestRef,
} from "../provider/code-host.js";

export interface ProviderContractFixture {
  provider: ICodeHostProvider;
  /** A pull request that exists and starts with no threads. */
  existing: PullRequestRef;
  /** A pull request that does not exist. */
  missing: PullRequestRef;
  /** A line of the existing pull request's diff that accepts an inline comment. */
  anchor: InlineAnchor;
  /** A pull request that can be opened in the same repository as `existing`. */
  draft: NewPullRequest;
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
      expect(pullRequest.state).toBe("open");
      expect(pullRequest.headCommit).not.toBe("");
    });

    it("rejects with not_found for a pull request that does not exist", async () => {
      const { provider, missing } = fixture;

      await expect(provider.getPullRequest(missing)).rejects.toMatchObject({ code: "not_found" });
      await expect(provider.getDiff(missing)).rejects.toMatchObject({ code: "not_found" });
      await expect(provider.listThreads(missing)).rejects.toMatchObject({ code: "not_found" });
    });

    it("opens a pull request that can then be fetched", async () => {
      const { provider, existing, draft } = fixture;

      const created = await provider.createPullRequest(existing, draft);
      const fetched = await provider.getPullRequest(created.ref);

      expect(created).toMatchObject({ ...draft, state: "open" });
      expect(created.ref).toMatchObject({ owner: existing.owner, repo: existing.repo });
      expect(fetched).toEqual(created);
    });

    it("updates only the fields that were given", async () => {
      const { provider, existing } = fixture;
      const before = await provider.getPullRequest(existing);

      const updated = await provider.updatePullRequest(existing, { description: "New text." });

      expect(updated.description).toBe("New text.");
      expect(updated.title).toBe(before.title);
      expect(await provider.getPullRequest(existing)).toEqual(updated);
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

      const created = await provider.createThread(existing, { body: "This can be null.", anchor });
      const threads = await provider.listThreads(existing);

      expect(created.anchor).toEqual(anchor);
      expect(threads[0]).toMatchObject({ id: created.id, anchor });
    });

    it("appends replies to an inline thread in the order they were written", async () => {
      const { provider, existing, anchor } = fixture;
      const thread = await provider.createThread(existing, { body: "first", anchor });

      await provider.replyToThread(existing, thread.id, "second");
      await provider.replyToThread(existing, thread.id, "third");
      const threads = await provider.listThreads(existing);

      expect(threads).toHaveLength(1);
      expect(threads[0]?.comments.map((comment) => comment.body)).toEqual([
        "first",
        "second",
        "third",
      ]);
    });

    it("resolves and reopens an inline thread, and accepts a repeated request", async () => {
      const { provider, existing, anchor } = fixture;
      const thread = await provider.createThread(existing, { body: "Fix the typo.", anchor });

      await provider.setThreadResolved(existing, thread.id, true);
      await provider.setThreadResolved(existing, thread.id, true);
      expect((await provider.listThreads(existing))[0]?.resolved).toBe(true);

      await provider.setThreadResolved(existing, thread.id, false);
      expect((await provider.listThreads(existing))[0]?.resolved).toBe(false);
    });

    it("rejects with not_found when the thread does not exist", async () => {
      const { provider, existing } = fixture;

      await expect(provider.replyToThread(existing, "999999", "hello")).rejects.toMatchObject({
        code: "not_found",
      });
      await expect(provider.setThreadResolved(existing, "999999", true)).rejects.toMatchObject({
        code: "not_found",
      });
    });
  });
}
