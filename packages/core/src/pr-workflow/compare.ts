import { runGit } from "./run.js";
import { AppError } from "../errors.js";

export type BranchCompareInput = {
  repoRoot: string;
  head: string;
  base: string;
  remote?: string;
  fetch?: boolean;
  maxDiffBytes?: number;
};

export type BranchCompareResult = {
  comparisonRef: string;
  head: string;
  base: string;
  remote: string;
  currentBranch: string;
  dirty: boolean;
  mergeInProgress: boolean;
  headOnOrigin: boolean;
  commits: string;
  commitCount: number;
  diffStat: string;
  diffBytes: number;
  diff: string;
  diffTruncated: boolean;
  note?: string;
};

async function refExists(repoRoot: string, ref: string): Promise<boolean> {
  try {
    await runGit(repoRoot, ["rev-parse", "--verify", ref]);
    return true;
  } catch {
    return false;
  }
}

export async function compareOriginBranches(input: BranchCompareInput): Promise<BranchCompareResult> {
  const remote = input.remote ?? "origin";
  const headRef = `${remote}/${input.head}`;
  const baseRef = `${remote}/${input.base}`;
  const comparisonRef = `${baseRef}...${headRef}`;

  const porcelain = await runGit(input.repoRoot, ["status", "--porcelain"]);
  const currentBranch = await runGit(input.repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const mergeInProgress =
    (await refExists(input.repoRoot, "MERGE_HEAD")) ||
    (await refExists(input.repoRoot, "REBASE_HEAD")) ||
    (await refExists(input.repoRoot, "CHERRY_PICK_HEAD"));

  if (mergeInProgress) {
    throw new AppError(
      "GIT_IN_PROGRESS",
      "Cherry-pick, rebase, or merge is in progress. Finish or abort before opening a PR.",
    );
  }

  if (input.fetch !== false) {
    await runGit(input.repoRoot, ["fetch", remote, input.base, input.head]);
  }

  const headOnOrigin = await refExists(input.repoRoot, headRef);
  if (!headOnOrigin) {
    throw new AppError(
      "MISSING_REMOTE_HEAD",
      `Ref ${headRef} does not exist after fetch. Push ${input.head} to ${remote} first.`,
      { details: { head: input.head, remote } },
    );
  }

  if (!(await refExists(input.repoRoot, baseRef))) {
    throw new AppError("MISSING_REMOTE_BASE", `Ref ${baseRef} does not exist after fetch.`, {
      details: { base: input.base, remote },
    });
  }

  const commits = await runGit(input.repoRoot, [
    "log",
    `${baseRef}..${headRef}`,
    "--oneline",
    "--no-merges",
  ]);
  const commitCount = commits ? commits.split("\n").filter(Boolean).length : 0;
  const diffStat = await runGit(input.repoRoot, ["diff", `${baseRef}...${headRef}`, "--stat"]);
  let diff = await runGit(input.repoRoot, ["diff", `${baseRef}...${headRef}`]);
  const maxBytes = input.maxDiffBytes ?? 2 * 1024 * 1024;
  let diffTruncated = false;
  const diffBytes = Buffer.byteLength(diff, "utf8");
  if (diffBytes > maxBytes) {
    diff = diff.slice(0, maxBytes);
    diffTruncated = true;
  }

  return {
    comparisonRef,
    head: input.head,
    base: input.base,
    remote,
    currentBranch,
    dirty: porcelain.length > 0,
    mergeInProgress: false,
    headOnOrigin,
    commits,
    commitCount,
    diffStat,
    diffBytes,
    diff,
    diffTruncated,
    note: porcelain.length
      ? "Working tree has local changes. They are not part of the PR description scope."
      : undefined,
  };
}
