import { describe, expect, it } from "vitest";
import { ProviderError, publishFindings, type Finding, type PullRequest } from "../src/index.js";
import { InMemoryCodeHost } from "../src/testing/index.js";

const ref = { owner: "acme", repo: "sample-app", number: 7 };
const pullRequest: PullRequest = {
  ref,
  title: "Handle empty cart",
  description: "",
  state: "open",
  author: "sam",
  sourceBranch: "fix/cart",
  targetBranch: "main",
  headCommit: "a1b2c3d",
  url: "https://example.com/acme/sample-app/pull/7",
};
const diff = [
  "diff --git a/src/cart.ts b/src/cart.ts",
  "--- a/src/cart.ts",
  "+++ b/src/cart.ts",
  "@@ -10,2 +10,3 @@",
  " export function total(cart: Cart) {",
  "+  if (cart.items.length === 0) return 0;",
  "   return cart.items.reduce(sum, 0);",
].join("\n");

const onLine = (id: string, line: number, body: string): Finding => ({
  id,
  body,
  anchor: { path: "src/cart.ts", line, side: "new" },
});

const newHost = () => new InMemoryCodeHost([{ pullRequest, diff }]);

describe("publishFindings", () => {
  it("publishes findings on lines shown in the diff and skips the rest", async () => {
    const host = newHost();

    const outcomes = await publishFindings(host, ref, [
      onLine("a", 11, "This returns early for an empty cart."),
      onLine("b", 99, "Unrelated line."),
    ]);

    expect(outcomes).toEqual([
      { findingId: "a", status: "published", threadId: expect.any(String) },
      {
        findingId: "b",
        status: "not_in_diff",
        reason: "Line 99 of src/cart.ts is not an added or unchanged line shown in the diff.",
      },
    ]);
    expect(await host.listThreads(ref)).toHaveLength(1);
  });

  it("posts nothing when the same findings are published again", async () => {
    const host = newHost();
    const findings = [onLine("a", 11, "Check for null."), onLine("b", 12, "Name this constant.")];
    const [first] = await publishFindings(host, ref, findings);

    const second = await publishFindings(host, ref, findings);

    expect(second.map((outcome) => outcome.status)).toEqual(["duplicate", "duplicate"]);
    expect(second[0]?.threadId).toBe(first?.threadId);
    expect(await host.listThreads(ref)).toHaveLength(2);
  });

  it("treats whitespace differences and repeats within a batch as duplicates", async () => {
    const host = newHost();

    const outcomes = await publishFindings(host, ref, [
      onLine("a", 11, "Check for null."),
      onLine("b", 11, "  Check   for null.\n"),
      onLine("c", 11, "A different point on the same line."),
    ]);

    expect(outcomes.map((outcome) => outcome.status)).toEqual([
      "published",
      "duplicate",
      "published",
    ]);
  });

  it("reports one refused finding and still publishes the next", async () => {
    const host = newHost();
    const createThread = host.createThread.bind(host);
    let calls = 0;
    host.createThread = async (...args) => {
      calls += 1;
      if (calls === 1) throw new ProviderError("invalid_request", "The host refused this line.");
      return createThread(...args);
    };

    const outcomes = await publishFindings(host, ref, [
      onLine("a", 11, "First."),
      onLine("b", 12, "Second."),
    ]);

    expect(outcomes).toEqual([
      { findingId: "a", status: "failed", reason: "The host refused this line." },
      { findingId: "b", status: "published", threadId: expect.any(String) },
    ]);
  });

  it("stops attempting after a failure that would repeat for every finding", async () => {
    const host = newHost();
    let calls = 0;
    host.createThread = async () => {
      calls += 1;
      throw new ProviderError("rate_limited", "Slow down.");
    };

    const outcomes = await publishFindings(host, ref, [
      onLine("a", 11, "First."),
      onLine("b", 12, "Second."),
    ]);

    expect(calls).toBe(1);
    expect(outcomes).toEqual([
      { findingId: "a", status: "failed", reason: "Slow down." },
      { findingId: "b", status: "failed", reason: "Not attempted. Slow down." },
    ]);
  });

  it("rejects when the pull request cannot be read", async () => {
    const missing = { ...ref, number: 404 };

    await expect(publishFindings(newHost(), missing, [])).rejects.toMatchObject({
      code: "not_found",
    });
  });
});
