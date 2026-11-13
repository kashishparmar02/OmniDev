import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PullRequest } from "@omnidev/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseRemoteUrl, prepareWorkspace } from "../src/workspace.js";

// These tests run real git against repositories in a temporary folder. The
// user's clone is given a github.com remote URL, and a git rewrite rule maps
// that URL to a local bare repository, so nothing touches the network.

let sandbox: string;
let clone: string;
let options: { repoRoots: string[]; worktreeDir: string };

function git(cwd: string, ...args: string[]): string {
  return execFileSync(
    "git",
    ["-c", "user.name=Test", "-c", "user.email=test@example.com", ...args],
    { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
}

function commit(cwd: string, file: string, content: string): string {
  writeFileSync(join(cwd, file), content);
  git(cwd, "add", file);
  git(cwd, "commit", "--quiet", "-m", `change ${file}`);
  return git(cwd, "rev-parse", "HEAD");
}

function pullRequestAt(headCommit: string): PullRequest {
  return {
    ref: { owner: "acme", repo: "sample-app", number: 7 },
    title: "Add feature",
    description: "",
    state: "open",
    author: "sam",
    sourceBranch: "feature",
    targetBranch: "main",
    headCommit,
    url: "https://github.com/acme/sample-app/pull/7",
  };
}

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), "omnidev-workspace-"));
  const remote = join(sandbox, "remote", "acme", "sample-app.git");
  const roots = join(sandbox, "code");
  clone = join(roots, "sample-app");
  git(sandbox, "init", "--quiet", "--bare", "--initial-branch=main", remote);
  git(sandbox, "init", "--quiet", "--initial-branch=main", clone);
  git(clone, "config", "remote.origin.url", "git@github.com:acme/sample-app.git");
  git(clone, "config", "remote.origin.fetch", "+refs/heads/*:refs/remotes/origin/*");
  git(clone, "config", `url.${join(sandbox, "remote")}/.insteadOf`, "git@github.com:");
  commit(clone, "app.txt", "main version\n");
  git(clone, "push", "--quiet", "origin", "main");
  options = { repoRoots: [roots], worktreeDir: join(sandbox, "worktrees") };
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

// Pushes a commit to the feature branch from a second clone, the way a
// teammate would, so the user's clone does not have it yet.
function pushFeatureCommit(content: string): string {
  const other = mkdtempSync(join(sandbox, "teammate-"));
  git(other, "clone", "--quiet", join(sandbox, "remote", "acme", "sample-app.git"), ".");
  const existing = git(other, "branch", "--remotes", "--list", "origin/feature");
  git(other, "checkout", "--quiet", ...(existing ? ["feature"] : ["-b", "feature"]));
  const head = commit(other, "app.txt", content);
  git(other, "push", "--quiet", "origin", "feature");
  return head;
}

describe("prepareWorkspace", () => {
  it("checks out the head commit without touching the user's checkout", async () => {
    const head = pushFeatureCommit("feature version\n");
    writeFileSync(join(clone, "app.txt"), "unsaved local edit\n");

    const workspace = await prepareWorkspace(options, "github", pullRequestAt(head));

    expect(workspace).toEqual({
      path: join(options.worktreeDir, "github", "acme", "sample-app", "pr-7"),
      clone,
      commit: head,
    });
    expect(readFileSync(join(workspace.path, "app.txt"), "utf8")).toBe("feature version\n");
    expect(readFileSync(join(clone, "app.txt"), "utf8")).toBe("unsaved local edit\n");
    expect(git(clone, "branch", "--show-current")).toBe("main");
  });

  it("moves the same folder forward when the pull request gets a new commit", async () => {
    const first = await prepareWorkspace(
      options,
      "github",
      pullRequestAt(pushFeatureCommit("one\n")),
    );
    const newHead = pushFeatureCommit("two\n");

    const second = await prepareWorkspace(options, "github", pullRequestAt(newHead));

    expect(second.path).toBe(first.path);
    expect(readFileSync(join(second.path, "app.txt"), "utf8")).toBe("two\n");
  });

  it("explains where to clone when no local clone matches", async () => {
    const head = pushFeatureCommit("x\n");
    const elsewhere = { ...options, repoRoots: [join(sandbox, "empty")] };

    await expect(prepareWorkspace(elsewhere, "github", pullRequestAt(head))).rejects.toThrow(
      /No local clone of acme\/sample-app was found.*OMNIDEV_REPO_ROOTS/,
    );
  });

  it("refuses a head commit that is not a commit hash", async () => {
    await expect(
      prepareWorkspace(options, "github", pullRequestAt("--upload-pack=evil")),
    ).rejects.toThrow("no usable head commit");
  });
});

describe("parseRemoteUrl", () => {
  it.each([
    ["git@bitbucket.org:acme/sample-app.git", "bitbucket"],
    ["https://dev@bitbucket.org/acme/sample-app.git", "bitbucket"],
    ["https://github.com/acme/sample-app", "github"],
    ["ssh://git@github.com:22/acme/sample-app.git", "github"],
    ["git@github-work:acme/sample-app.git", "github"],
  ])("reads %s", (remote, host) => {
    expect(parseRemoteUrl(remote)).toEqual({ host, owner: "acme", repo: "sample-app" });
  });

  it("returns null for a remote on another host or a local path", () => {
    expect(parseRemoteUrl("git@gitlab.com:acme/sample-app.git")).toBeNull();
    expect(parseRemoteUrl("/srv/git/acme/sample-app.git")).toBeNull();
  });
});
