import { homedir } from "node:os";
import { resolve } from "node:path";
import { AppError } from "./errors.js";

export interface ReviewConfig {
  email: string;
  username?: string;
  apiToken: string;
  workspace: string;
  reviewWorkspace: string;
  localRepoRoots: string[];
}

function expandHome(pathValue: string): string {
  if (pathValue.startsWith("~/")) return resolve(homedir(), pathValue.slice(2));
  if (pathValue === "~") return homedir();
  return pathValue;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ReviewConfig {
  const email = (env.BITBUCKET_EMAIL || "").trim();
  const apiToken = (env.BITBUCKET_API_TOKEN || "").trim();
  const username = (env.BITBUCKET_USERNAME || "").trim() || undefined;
  const workspace = (env.BITBUCKET_WORKSPACE || "").trim();
  const reviewWorkspace = expandHome(
    (env.BITBUCKET_REVIEW_WORKSPACE || "~/.omnidev/review-workspaces").trim(),
  );
  const rootsRaw = (env.BITBUCKET_LOCAL_REPO_ROOTS || "").trim();
  const localRepoRoots = rootsRaw
    .split(",")
    .map((p) => expandHome(p.trim()))
    .filter(Boolean);

  if (!email) {
    throw new AppError("CONFIG_MISSING", "BITBUCKET_EMAIL is required");
  }
  if (!apiToken) {
    throw new AppError("CONFIG_MISSING", "BITBUCKET_API_TOKEN is required");
  }

  return {
    email,
    username,
    apiToken,
    workspace,
    reviewWorkspace,
    localRepoRoots,
  };
}
