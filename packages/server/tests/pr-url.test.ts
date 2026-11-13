import { describe, expect, it } from "vitest";
import { parsePullRequestUrl, parseRepoUrl } from "../src/pr-url.js";

describe("parsePullRequestUrl", () => {
  it.each([
    ["https://bitbucket.org/acme/sample-app/pull-requests/218", "bitbucket", 218],
    ["https://bitbucket.org/acme/sample-app/pull-requests/218/diff", "bitbucket", 218],
    ["https://github.com/acme/sample-app/pull/7", "github", 7],
    [" https://www.github.com/acme/sample-app/pull/7/files?diff=split ", "github", 7],
  ])("reads %s", (url, host, number) => {
    expect(parsePullRequestUrl(url)).toEqual({
      host,
      ref: { owner: "acme", repo: "sample-app", number },
    });
  });

  it.each([
    ["not a url", "is not a URL"],
    ["https://gitlab.com/acme/sample-app/merge_requests/1", "not a supported host"],
    ["https://github.com/acme/sample-app", "not a pull request URL"],
    ["https://github.com/acme/sample-app/pull-requests/7", "not a pull request URL"],
    ["https://bitbucket.org/acme/sample-app/pull-requests/abc", "not a pull request URL"],
  ])("rejects %s", (url, message) => {
    expect(() => parsePullRequestUrl(url)).toThrow(message);
  });
});

describe("parseRepoUrl", () => {
  it("reads a repository URL and ignores a .git suffix and extra path", () => {
    const expected = { host: "github", repo: { owner: "acme", repo: "sample-app" } };

    expect(parseRepoUrl("https://github.com/acme/sample-app.git")).toEqual(expected);
    expect(parseRepoUrl("https://github.com/acme/sample-app/tree/main")).toEqual(expected);
  });

  it("rejects a URL without a repository", () => {
    expect(() => parseRepoUrl("https://bitbucket.org/acme")).toThrow("does not name a repository");
  });
});
