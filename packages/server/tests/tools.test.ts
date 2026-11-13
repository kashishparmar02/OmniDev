import type { PullRequest } from "@omnidev/core";
import { InMemoryCodeHost } from "@omnidev/core/testing";
import { describe, expect, it } from "vitest";
import { createTools, runTool } from "../src/tools.js";

const url = "https://github.com/acme/sample-app/pull/7";
const pullRequest: PullRequest = {
  ref: { owner: "acme", repo: "sample-app", number: 7 },
  title: "Handle empty cart",
  description: "",
  state: "open",
  author: "sam",
  sourceBranch: "fix/cart",
  targetBranch: "main",
  headCommit: "a1b2c3d",
  url,
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

// GitHub URLs are served by a seeded host and Bitbucket URLs by an empty one,
// which shows that the URL alone decides where a call goes.
function setup() {
  const github = new InMemoryCodeHost([{ pullRequest, diff }]);
  const tools = createTools({
    providers: { github, bitbucket: new InMemoryCodeHost() },
    prepareWorkspace: async (host, pr) => ({
      path: `/work/${host}/pr-${pr.ref.number}`,
      clone: "/code/sample-app",
      commit: pr.headCommit,
    }),
  });
  const call = (name: string, args: Record<string, unknown>) =>
    runTool(
      tools.find((tool) => tool.name === name)!,
      args,
    );
  return { github, tools, call };
}

describe("tools", () => {
  it("routes a call to the provider for the URL's host", async () => {
    const { call } = setup();

    const fromGitHub = await call("pr_get", { url });
    const fromBitbucket = await call("pr_get", {
      url: "https://bitbucket.org/acme/sample-app/pull-requests/7",
    });

    expect(JSON.parse(fromGitHub.text)).toMatchObject({ title: "Handle empty cart" });
    expect(fromBitbucket).toMatchObject({ isError: true });
    expect(fromBitbucket.text).toMatch(/^not_found: /);
  });

  it("returns the diff as plain text", async () => {
    const { call } = setup();

    expect(await call("pr_get_diff", { url })).toEqual({ isError: false, text: diff });
  });

  it("refuses every tool that changes the host until it is confirmed", async () => {
    const { tools, github } = setup();
    const changing = tools.filter((tool) => "confirmed" in tool.input).map((tool) => tool.name);
    const args = {
      url,
      repoUrl: "https://github.com/acme/sample-app",
      body: "text",
      threadId: "thread-1",
      resolved: true,
      title: "t",
      description: "d",
      sourceBranch: "a",
      targetBranch: "main",
      findings: [{ id: "a", body: "text", path: "src/cart.ts", line: 11 }],
    };

    expect(changing).toEqual([
      "pr_publish_findings",
      "pr_comment",
      "pr_reply",
      "pr_set_resolved",
      "pr_update",
      "pr_create",
    ]);
    for (const tool of tools.filter((candidate) => changing.includes(candidate.name))) {
      const result = await runTool(tool, { ...args, confirmed: false });
      expect(result.isError, tool.name).toBe(true);
      expect(result.text).toContain("was not run");
    }
    expect(await github.listThreads(pullRequest.ref)).toEqual([]);
    expect((await github.getPullRequest(pullRequest.ref)).title).toBe("Handle empty cart");
  });

  it("publishes confirmed findings and reports each outcome", async () => {
    const { call, github } = setup();

    const result = await call("pr_publish_findings", {
      url,
      confirmed: true,
      findings: [
        { id: "a", body: "Returns early for an empty cart.", path: "src/cart.ts", line: 11 },
        { id: "b", body: "Outside the diff.", path: "src/cart.ts", line: 99 },
      ],
    });

    expect(JSON.parse(result.text).map((outcome: { status: string }) => outcome.status)).toEqual([
      "published",
      "not_in_diff",
    ]);
    expect((await github.listThreads(pullRequest.ref))[0]?.anchor).toEqual({
      path: "src/cart.ts",
      line: 11,
      side: "new",
    });
  });

  it("replies and resolves in one call, and can list only unresolved threads", async () => {
    const { call, github } = setup();
    const thread = await github.createThread(pullRequest.ref, { body: "Rename this." });
    await github.createThread(pullRequest.ref, { body: "Still open." });

    await call("pr_reply", {
      url,
      threadId: thread.id,
      body: "Renamed.",
      resolve: true,
      confirmed: true,
    });
    const open = JSON.parse((await call("pr_list_threads", { url, unresolvedOnly: true })).text);

    expect(open).toHaveLength(1);
    expect(open[0].comments[0].body).toBe("Still open.");
  });

  it("creates and updates a pull request", async () => {
    const { call } = setup();

    const created = await call("pr_create", {
      repoUrl: "https://github.com/acme/sample-app",
      sourceBranch: "feat/coupons",
      targetBranch: "main",
      title: "Add coupons",
      description: "First draft.",
      confirmed: true,
    });
    const updated = await call("pr_update", { url, description: "Final text.", confirmed: true });
    const nothingToChange = await call("pr_update", { url, confirmed: true });

    expect(JSON.parse(created.text)).toMatchObject({ title: "Add coupons", state: "open" });
    expect(JSON.parse(updated.text)).toMatchObject({
      title: "Handle empty cart",
      description: "Final text.",
    });
    expect(nothingToChange).toEqual({
      isError: true,
      text: "Give a title, a description or both.",
    });
  });

  it("prepares a workspace for the pull request's head commit", async () => {
    const { call } = setup();

    const result = await call("pr_prepare_workspace", { url });

    expect(JSON.parse(result.text)).toEqual({
      path: "/work/github/pr-7",
      clone: "/code/sample-app",
      commit: "a1b2c3d",
    });
  });

  it("explains invalid input and an unusable URL", async () => {
    const { call } = setup();

    const missingField = await call("pr_comment", { url, confirmed: true });
    const badUrl = await call("pr_get", { url: "https://example.com/x" });

    expect(missingField.isError).toBe(true);
    expect(missingField.text).toMatch(/^Invalid input: /);
    expect(badUrl).toEqual({
      isError: true,
      text: "example.com is not a supported host. Use bitbucket.org or github.com.",
    });
  });

  it("removes credentials from results and errors", async () => {
    const token = ["ghp", "x".repeat(40)].join("_");
    const { call, github } = setup();
    await github.updatePullRequest(pullRequest.ref, { description: `token ${token}` });

    const result = await call("pr_get", { url });

    expect(result.text).not.toContain(token);
    expect(result.text).toContain("[REDACTED]");
  });
});
