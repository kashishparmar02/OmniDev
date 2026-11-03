import { describe, expect, it } from "vitest";
import { parseBitbucketPrUrl } from "../../src/bitbucket/url.js";

describe("parseBitbucketPrUrl", () => {
  it("parses a standard PR URL", () => {
    const parsed = parseBitbucketPrUrl(
      "https://bitbucket.org/acme/sample-app/pull-requests/218",
    );
    expect(parsed).toMatchObject({
      workspace: "acme",
      repoSlug: "sample-app",
      pullRequestId: 218,
    });
  });

  it("parses URLs with trailing path segments", () => {
    const parsed = parseBitbucketPrUrl(
      "https://bitbucket.org/acme/sample-app/pull-requests/218/overview",
    );
    expect(parsed.pullRequestId).toBe(218);
  });

  it("rejects non-bitbucket hosts", () => {
    expect(() => parseBitbucketPrUrl("https://github.com/org/repo/pull/1")).toThrow(/Unsupported host/);
  });

  it("rejects malformed paths", () => {
    expect(() => parseBitbucketPrUrl("https://bitbucket.org/acme/sample-app")).toThrow(
      /must look like/,
    );
  });
});
