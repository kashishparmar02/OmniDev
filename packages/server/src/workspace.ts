// Gives a reviewer the pull request's code on disk without touching the
// user's own checkout.
//
// A review that only sees the diff misses callers, tests and conventions, so
// the review playbook reads the surrounding code. To do that safely, this
// module finds the user's existing clone of the repository and adds a git
// worktree, which is a second working folder backed by the same clone, at the
// pull request's head commit. The user's branch, staged changes and unsaved
// work are never read or changed.

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { redactSecrets, type PullRequest } from "@omnidev/core";
import type { Host } from "./pr-url.js";

const run = promisify(execFile);

export interface WorkspaceOptions {
  repoRoots: string[];
  worktreeDir: string;
}

export interface Workspace {
  /** Folder that holds the pull request's code. */
  path: string;
  /** The user's clone that the worktree belongs to. */
  clone: string;
  commit: string;
}

async function git(cwd: string, ...args: string[]): Promise<string> {
  try {
    const { stdout } = await run("git", args, {
      cwd,
      timeout: 120_000,
      // Never stop to ask for a password; fail and report instead.
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
    return stdout.trim();
  } catch (error) {
    const detail = (error as { stderr?: string }).stderr?.trim() || (error as Error).message;
    throw new Error(redactSecrets(`git ${args[0]} failed in ${cwd}: ${detail}`), { cause: error });
  }
}

/**
 * Reads the host, owner and repository out of a git remote URL. It accepts
 * HTTPS and both SSH forms, and recognises the host by name so that an SSH
 * alias such as "github-work" still matches.
 */
export function parseRemoteUrl(remote: string): { host: Host; owner: string; repo: string } | null {
  const match =
    /^(?:[a-z+]+:\/\/)?(?:[^@/]+@)?([^:/]+)[:/](?:\d+\/)?(.+?)\/([^/]+?)(?:\.git)?\/?$/.exec(
      remote.trim(),
    );
  if (!match) return null;
  const hostname = match[1]!;
  const owner = match[2]!;
  const repo = match[3]!;
  const host = hostname.includes("bitbucket")
    ? "bitbucket"
    : hostname.includes("github")
      ? "github"
      : null;
  return host ? { host, owner, repo } : null;
}

async function findClone(roots: string[], host: Host, pullRequest: PullRequest): Promise<string> {
  const { owner, repo } = pullRequest.ref;
  const wanted = `${host}/${owner}/${repo}`.toLowerCase();

  for (const root of roots) {
    const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
    const candidates = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(root, entry.name))
      .filter((folder) => existsSync(join(folder, ".git")));

    for (const folder of candidates) {
      // The configured URL is read directly so that URL rewriting rules in
      // the user's git configuration do not change what is compared.
      const remote = await git(folder, "config", "--get", "remote.origin.url").catch(() => "");
      const parsed = parseRemoteUrl(remote);
      if (parsed && `${parsed.host}/${parsed.owner}/${parsed.repo}`.toLowerCase() === wanted) {
        return folder;
      }
    }
  }
  throw new Error(
    `No local clone of ${owner}/${repo} was found. Clone it into one of the folders listed in ` +
      `OMNIDEV_REPO_ROOTS (currently: ${roots.join(", ") || "none"}).`,
  );
}

/**
 * Creates or updates the review folder for a pull request and returns where
 * it is. Calling it again after the pull request has new commits moves the
 * same folder to the new head.
 */
export async function prepareWorkspace(
  options: WorkspaceOptions,
  host: Host,
  pullRequest: PullRequest,
): Promise<Workspace> {
  const { ref, headCommit, sourceBranch } = pullRequest;
  // Both values come from the host and are passed to git, so they are checked
  // or qualified to make sure neither can be read as a command-line option.
  if (!/^[0-9a-f]{7,40}$/i.test(headCommit)) {
    throw new Error("The pull request has no usable head commit; its source branch may be gone.");
  }
  const clone = await findClone(options.repoRoots, host, pullRequest);

  // Fetch the branch first. If it was deleted after a merge, ask for the
  // commit itself, which hosts still serve while the pull request exists.
  await git(clone, "fetch", "--quiet", "origin", `refs/heads/${sourceBranch}`).catch(() => "");
  const hasCommit = () =>
    git(clone, "cat-file", "-e", `${headCommit}^{commit}`).then(
      () => true,
      () => false,
    );
  if (!(await hasCommit())) {
    await git(clone, "fetch", "--quiet", "origin", headCommit).catch(() => "");
    if (!(await hasCommit())) {
      throw new Error(`Commit ${headCommit} could not be fetched from origin into ${clone}.`);
    }
  }

  const path = join(options.worktreeDir, host, ref.owner, ref.repo, `pr-${ref.number}`);
  if (existsSync(join(path, ".git"))) {
    await git(path, "checkout", "--quiet", "--detach", headCommit);
  } else {
    await mkdir(dirname(path), { recursive: true });
    // Forget a worktree whose folder was deleted by hand, so the add succeeds.
    await git(clone, "worktree", "prune");
    await git(clone, "worktree", "add", "--quiet", "--detach", path, headCommit);
  }
  return { path, clone, commit: headCommit };
}
