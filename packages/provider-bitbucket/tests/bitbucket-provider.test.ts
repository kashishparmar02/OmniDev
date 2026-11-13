import { describeProviderContract } from "@omnidev/core/testing";
import { describe, expect, it } from "vitest";
import { BitbucketProvider } from "../src/index.js";
import { BASE_URL, createFakeBitbucket } from "./fake-bitbucket.js";

const existing = { owner: "acme", repo: "sample-app", number: 7 };

function setup(credentials: { email?: string; apiToken?: string } = {}) {
  const host = createFakeBitbucket();
  const provider = new BitbucketProvider({
    ...credentials,
    baseUrl: BASE_URL,
    request: { fetch: host.fetch, maxRetries: 0 },
  });
  return { host, provider };
}

describeProviderContract("Bitbucket", () => ({
  provider: setup().provider,
  existing,
  missing: { ...existing, number: 404 },
  anchor: { path: "src/cart.ts", line: 11, side: "new" },
  draft: {
    title: "Add coupons",
    description: "Adds coupon codes to checkout.",
    sourceBranch: "feat/coupons",
    targetBranch: "main",
  },
}));

describe("BitbucketProvider", () => {
  it("sends basic authentication when credentials are given, and none otherwise", async () => {
    const password = "p".repeat(12);
    const withCredentials = setup({ email: "dev@example.com", apiToken: password });
    const anonymous = setup();

    await withCredentials.provider.getPullRequest(existing);
    await anonymous.provider.getPullRequest(existing);

    const expected = Buffer.from(`dev@example.com:${password}`).toString("base64");
    expect(withCredentials.host.requests[0]?.headers.Authorization).toBe(`Basic ${expected}`);
    expect(anonymous.host.requests[0]?.headers.Authorization).toBeUndefined();
  });

  it("folds nested replies into the thread of the first comment", async () => {
    const { host, provider } = setup();
    const root = host.addComment(7, { content: { raw: "root" } });
    const reply = host.addComment(7, { content: { raw: "reply" }, parent: { id: root.id } });
    host.addComment(7, { content: { raw: "reply to reply" }, parent: { id: reply.id } });
    host.addComment(7, { content: { raw: "another thread" } });

    const threads = await provider.listThreads(existing);

    expect(threads.map((thread) => thread.comments.map((comment) => comment.body))).toEqual([
      ["root", "reply", "reply to reply"],
      ["another thread"],
    ]);
  });

  it("leaves out deleted comments but keeps replies to them", async () => {
    const { host, provider } = setup();
    const removed = host.addComment(7, { content: { raw: "" }, deleted: true });
    host.addComment(7, { content: { raw: "orphan reply" }, parent: { id: removed.id } });

    const threads = await provider.listThreads(existing);

    expect(threads.map((thread) => thread.comments.map((comment) => comment.body))).toEqual([
      ["orphan reply"],
    ]);
  });

  it("maps an old-side comment and a file-level comment", async () => {
    const { host, provider } = setup();
    host.addComment(7, { inline: { path: "src/cart.ts", from: 11, to: null } });
    host.addComment(7, { inline: { path: "src/cart.ts", from: null, to: null } });

    const threads = await provider.listThreads(existing);

    expect(threads[0]?.anchor).toEqual({ path: "src/cart.ts", line: 11, side: "old" });
    expect(threads[1]?.anchor).toBeUndefined();
  });

  it("refuses to follow a next-page link that leaves the API", async () => {
    const provider = new BitbucketProvider({
      baseUrl: BASE_URL,
      request: {
        fetch: async () =>
          new Response(JSON.stringify({ values: [], next: "https://elsewhere.test/steal" })),
      },
    });

    await expect(provider.listThreads(existing)).rejects.toMatchObject({ code: "unavailable" });
  });

  it("reports a refused pull request as invalid_request", async () => {
    const { provider } = setup();

    await expect(
      provider.createPullRequest(existing, {
        title: "t",
        description: "d",
        sourceBranch: "no-such-branch",
        targetBranch: "main",
      }),
    ).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("reports a response it cannot read as unavailable", async () => {
    const provider = new BitbucketProvider({
      baseUrl: BASE_URL,
      request: { fetch: async () => new Response("<html>maintenance</html>") },
    });

    await expect(provider.getPullRequest(existing)).rejects.toMatchObject({ code: "unavailable" });
  });
});
