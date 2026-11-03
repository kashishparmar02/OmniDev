import { describe, expect, it } from "vitest";
import { parseBitbucketRemote } from "../../src/repository/git-context.js";

describe("parseBitbucketRemote", () => {
  it("parses SSH remotes", () => {
    expect(parseBitbucketRemote("git@bitbucket.org:acme/sample-app.git")).toEqual({
      workspace: "acme",
      repoSlug: "sample-app",
    });
  });

  it("parses HTTPS remotes with username", () => {
    expect(
      parseBitbucketRemote("https://gituser@bitbucket.org/acme/api-gateway.git"),
    ).toEqual({
      workspace: "acme",
      repoSlug: "api-gateway",
    });
  });

  it("parses ssh.bitbucket.org remotes", () => {
    expect(
      parseBitbucketRemote("git@ssh.bitbucket.org:acme/auth-portal.git"),
    ).toEqual({
      workspace: "acme",
      repoSlug: "auth-portal",
    });
  });
});
