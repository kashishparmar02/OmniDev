import { describe, expect, it, vi, afterEach } from "vitest";
import { BitbucketClient } from "../../src/bitbucket/client.js";
import { getPullRequest } from "../../src/bitbucket/pull-request.js";
import { createPullRequestComment } from "../../src/bitbucket/comments.js";

const config = {
  email: "user@example.com",
  apiToken: "test-token",
  workspace: "ei-india-admin",
  reviewWorkspace: "/tmp/pr-review-workspaces",
  localRepoRoots: ["/tmp"],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("BitbucketClient mocked integration", () => {
  it("fetches and validates PR metadata", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            type: "pullrequest",
            id: 218,
            title: "Test PR",
            state: "OPEN",
            source: { branch: { name: "feature" }, commit: { hash: "abc" } },
            destination: { branch: { name: "main" }, commit: { hash: "def" } },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    const client = new BitbucketClient(config);
    const pr = await getPullRequest(client, "ei-india-admin", "ei-core-ui", 218);
    expect(pr.id).toBe(218);
    expect(pr.title).toBe("Test PR");
  });

  it("posts an inline comment payload", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || "{}"));
      expect(body.content.raw).toContain("independent");
      expect(body.inline).toEqual({ path: "src/a.ts", to: 42 });
      return new Response(JSON.stringify({ id: 1, type: "pullrequest_comment" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new BitbucketClient(config);
    const created = await createPullRequestComment(client, "ei-india-admin", "ei-core-ui", 218, {
      content: "Do these need to be sequential if they are independent?",
      inline: { path: "src/a.ts", to: 42 },
    });
    expect((created as { id: number }).id).toBe(1);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("retries on 429 then succeeds", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls += 1;
        if (calls === 1) {
          return new Response("rate limited", { status: 429, headers: { "retry-after": "0" } });
        }
        return new Response(JSON.stringify({ username: "tester" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );

    const client = new BitbucketClient(config);
    const user = await client.request("/user");
    expect(user).toMatchObject({ username: "tester" });
    expect(calls).toBe(2);
  });
});
