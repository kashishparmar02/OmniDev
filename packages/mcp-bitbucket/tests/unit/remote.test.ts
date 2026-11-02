import { describe, expect, it } from "vitest";
import { parseBitbucketRemote } from "../../src/repository/git-context.js";

describe("parseBitbucketRemote", () => {
  it("parses SSH remotes", () => {
    expect(parseBitbucketRemote("git@bitbucket.org:ei-india-admin/ei-core-ui.git")).toEqual({
      workspace: "ei-india-admin",
      repoSlug: "ei-core-ui",
    });
  });

  it("parses HTTPS remotes with username", () => {
    expect(
      parseBitbucketRemote("https://kashishparmar1@bitbucket.org/ei-india-admin/api-gateway.git"),
    ).toEqual({
      workspace: "ei-india-admin",
      repoSlug: "api-gateway",
    });
  });

  it("parses ssh.bitbucket.org remotes", () => {
    expect(
      parseBitbucketRemote("git@ssh.bitbucket.org:ei-india-admin/authentication-portal.git"),
    ).toEqual({
      workspace: "ei-india-admin",
      repoSlug: "authentication-portal",
    });
  });
});
