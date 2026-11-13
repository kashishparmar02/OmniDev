import { expect, it } from "vitest";
import type { PullRequest } from "../src/index.js";
import { describeProviderContract, InMemoryCodeHost } from "../src/testing/index.js";

const pullRequest: PullRequest = {
  ref: { owner: "acme", repo: "sample-app", number: 7 },
  title: "Handle empty cart",
  description: "Avoids a crash when the cart has no items.",
  state: "open",
  author: "sam",
  sourceBranch: "fix/empty-cart",
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

function newHost(): InMemoryCodeHost {
  return new InMemoryCodeHost([{ pullRequest, diff }]);
}

describeProviderContract("in-memory", () => ({
  provider: newHost(),
  existing: pullRequest.ref,
  missing: { ...pullRequest.ref, number: 404 },
  anchor: { path: "src/cart.ts", line: 11, side: "new" },
}));

it("does not let a caller change stored state through a returned object", async () => {
  const host = newHost();

  const first = await host.getPullRequest(pullRequest.ref);
  first.title = "changed by the caller";

  expect((await host.getPullRequest(pullRequest.ref)).title).toBe("Handle empty cart");
});
