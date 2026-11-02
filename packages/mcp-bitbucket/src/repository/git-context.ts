import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { AppError } from "../utils/errors.js";

const execFileAsync = promisify(execFile);

export async function runGit(cwd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      maxBuffer: 20 * 1024 * 1024,
      encoding: "utf8",
    });
    return stdout.trim();
  } catch (error) {
    const err = error as { stderr?: string; message?: string };
    throw new AppError("GIT_ERROR", err.stderr?.trim() || err.message || "git command failed", {
      details: { cwd, args },
      cause: error,
    });
  }
}

export async function findGitRoot(startDir: string): Promise<string | null> {
  try {
    return await runGit(startDir, ["rev-parse", "--show-toplevel"]);
  } catch {
    return null;
  }
}

export async function getRemoteUrl(repoRoot: string, remote = "origin"): Promise<string | null> {
  try {
    return await runGit(repoRoot, ["remote", "get-url", remote]);
  } catch {
    return null;
  }
}

export function parseBitbucketRemote(remoteUrl: string): { workspace: string; repoSlug: string } | null {
  // git@bitbucket.org:ws/repo.git
  // https://bitbucket.org/ws/repo.git
  // ssh://git@bitbucket.org/ws/repo.git
  const patterns = [
    /bitbucket\.org[:/](?<workspace>[^/]+)\/(?<repo>[^/.]+?)(?:\.git)?$/i,
    /ssh\.bitbucket\.org[:/](?<workspace>[^/]+)\/(?<repo>[^/.]+?)(?:\.git)?$/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(remoteUrl.trim());
    if (match?.groups) {
      return { workspace: match.groups.workspace, repoSlug: match.groups.repo };
    }
  }
  return null;
}

export async function getWorkingTreeStatus(repoRoot: string): Promise<{
  branch: string;
  dirty: boolean;
  porcelain: string;
}> {
  const branch = await runGit(repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const porcelain = await runGit(repoRoot, ["status", "--porcelain"]);
  return { branch, dirty: porcelain.length > 0, porcelain };
}

export async function isShallowClone(repoRoot: string): Promise<boolean> {
  try {
    const value = await runGit(repoRoot, ["rev-parse", "--is-shallow-repository"]);
    return value === "true";
  } catch {
    return false;
  }
}

export async function fetchRefSafe(repoRoot: string, remote: string, ref: string): Promise<void> {
  // Fetch without checkout; does not disturb working tree
  await runGit(repoRoot, ["fetch", "--no-tags", "--prune", remote, ref]);
}

export async function ensureWorktree(
  repoRoot: string,
  worktreePath: string,
  commitish: string,
): Promise<string> {
  const absolute = resolve(worktreePath);
  if (existsSync(absolute)) {
    // Reuse existing worktree checkout if present
    await runGit(absolute, ["rev-parse", "--verify", "HEAD"]);
    return absolute;
  }
  await runGit(repoRoot, ["worktree", "add", "--detach", absolute, commitish]);
  return absolute;
}
