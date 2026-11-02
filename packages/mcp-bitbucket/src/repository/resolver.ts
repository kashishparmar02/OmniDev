import { readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  findGitRoot,
  getRemoteUrl,
  parseBitbucketRemote,
  getWorkingTreeStatus,
  isShallowClone,
} from "./git-context.js";
import type { ReviewConfig } from "../utils/config.js";

export interface ResolvedLocalRepo {
  matched: boolean;
  repoRoot?: string;
  workspace?: string;
  repoSlug?: string;
  remoteUrl?: string;
  branch?: string;
  dirty?: boolean;
  shallow?: boolean;
  searchedRoots: string[];
}

async function inspectRepo(repoRoot: string): Promise<ResolvedLocalRepo | null> {
  const remoteUrl = await getRemoteUrl(repoRoot);
  if (!remoteUrl) return null;
  const parsed = parseBitbucketRemote(remoteUrl);
  if (!parsed) return null;
  const status = await getWorkingTreeStatus(repoRoot);
  const shallow = await isShallowClone(repoRoot);
  return {
    matched: true,
    repoRoot,
    workspace: parsed.workspace,
    repoSlug: parsed.repoSlug,
    remoteUrl,
    branch: status.branch,
    dirty: status.dirty,
    shallow,
    searchedRoots: [],
  };
}

function listCandidateDirs(root: string): string[] {
  if (!existsSync(root)) return [];
  const out: string[] = [];
  if (existsSync(join(root, ".git"))) {
    out.push(root);
  }
  let entries: string[] = [];
  try {
    entries = readdirSync(root);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name.startsWith(".")) continue;
    const full = join(root, name);
    try {
      if (!statSync(full).isDirectory()) continue;
    } catch {
      continue;
    }
    if (existsSync(join(full, ".git"))) out.push(full);
  }
  return out;
}

export async function resolveLocalRepository(
  config: ReviewConfig,
  workspace: string,
  repoSlug: string,
  cwd = process.cwd(),
): Promise<ResolvedLocalRepo> {
  const searchedRoots = [...config.localRepoRoots];
  const cwdRoot = await findGitRoot(cwd);
  if (cwdRoot) searchedRoots.unshift(cwdRoot);

  const uniqueRoots = [...new Set(searchedRoots)];
  const candidates = uniqueRoots.flatMap(listCandidateDirs);

  for (const candidate of candidates) {
    const info = await inspectRepo(candidate);
    if (!info) continue;
    if (
      info.workspace?.toLowerCase() === workspace.toLowerCase() &&
      info.repoSlug?.toLowerCase() === repoSlug.toLowerCase()
    ) {
      return { ...info, searchedRoots: uniqueRoots };
    }
  }

  return { matched: false, searchedRoots: uniqueRoots };
}
