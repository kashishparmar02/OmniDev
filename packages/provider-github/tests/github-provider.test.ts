import { describeProviderContract } from "@omnidev/core/testing";
import { describe, expect, it } from "vitest";
import { GitHubProvider } from "../src/index.js";
import { API_URL, createFakeGitHub } from "./fake-github.js";

const existing = { owner: "acme", repo: "sample-app", number: 7 };
const anchor = { path: "src/cart.ts", line: 11, side: "new" } as const;
// Assembled at runtime so that no token-shaped literal exists in the repository.
const fakeToken = ["test", "token", "x".repeat(8)].join("-");

function setup(token: string | undefined = fakeToken) {
  const host = createFakeGitHub();
  const provider = new GitHubProvider({
    ...(token ? { token } : {}),
    apiUrl: API_URL,
    request: { fetch: host.fetch, maxRetries: 0 },
  });
  return { host, provider };
}

describeProviderContract("GitHub", () => ({
  provider: setup().provider,
  existing,
  missing: { ...existing, number: 404 },
  anchor,
  draft: {
    title: "Add coupons",
    description: "Adds coupon codes to checkout.",
    sourceBranch: "feat/coupons",
    targetBranch: "main",
  },
}));

describe("GitHubProvider", () => {
  it("sends the token as a bearer header", async () => {
    const { host, provider } = setup();

    await provider.getPullRequest(existing);

    expect(host.requests[0]?.headers.Authorization).toBe(`Bearer ${fakeToken}`);
  });

  it("reads a public pull request and its diff without a token", async () => {
    const { provider } = setup("");

    expect((await provider.getPullRequest(existing)).title).toBe("Handle empty cart");
    expect(await provider.getDiff(existing)).toContain("diff --git");
  });

  it("reports unauthorized when threads are listed without a token", async () => {
    const { provider } = setup("");

    await expect(provider.listThreads(existing)).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("rejects replying to or resolving a general comment as unsupported", async () => {
    const { provider } = setup();
    const general = await provider.createThread(existing, { body: "Looks good overall." });

    await expect(provider.replyToThread(existing, general.id, "Thanks")).rejects.toMatchObject({
      code: "unsupported",
    });
    await expect(provider.setThreadResolved(existing, general.id, true)).rejects.toMatchObject({
      code: "unsupported",
    });
  });

  it("returns general and inline threads together, oldest first", async () => {
    const { provider } = setup();
    await provider.createThread(existing, { body: "inline one", anchor });
    await provider.createThread(existing, { body: "general" });
    await provider.createThread(existing, { body: "inline two", anchor });

    const threads = await provider.listThreads(existing);

    expect(threads.map((thread) => thread.comments[0]?.body)).toEqual([
      "inline one",
      "general",
      "inline two",
    ]);
  });

  it("reads every page of general comments and of review threads", async () => {
    const { host, provider } = setup();
    for (let index = 0; index < 101; index += 1) host.addIssueComment(7, `general ${index}`);
    for (let index = 0; index < 3; index += 1) {
      await provider.createThread(existing, { body: `inline ${index}`, anchor });
    }

    expect(await provider.listThreads(existing)).toHaveLength(104);
  });

  it("maps a merged pull request and a refused one", async () => {
    const provider = new GitHubProvider({
      apiUrl: API_URL,
      request: {
        fetch: async () =>
          new Response(
            JSON.stringify({
              number: 7,
              title: "t",
              body: null,
              state: "closed",
              merged_at: "2026-01-02T00:00:00Z",
              user: null,
              head: { ref: "a", sha: "abc" },
              base: { ref: "main" },
              html_url: "https://github.test/acme/sample-app/pull/7",
            }),
          ),
      },
    });
    const { provider: live } = setup();

    expect(await provider.getPullRequest(existing)).toMatchObject({
      state: "merged",
      description: "",
      author: "unknown",
    });
    await expect(
      live.createPullRequest(existing, {
        title: "t",
        description: "d",
        sourceBranch: "no-such-branch",
        targetBranch: "main",
      }),
    ).rejects.toMatchObject({ code: "invalid_request" });
  });
});
