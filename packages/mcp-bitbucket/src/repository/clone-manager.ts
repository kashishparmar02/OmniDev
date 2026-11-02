import { mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { runGit } from "./git-context.js";
import type { ReviewConfig } from "../utils/config.js";
import { AppError } from "../utils/errors.js";

/**
 * Clone via SSH by default (no token in URL). Falls back to HTTPS with email:token
 * only when BITBUCKET_ALLOW_HTTPS_CLONE=1.
 */
export async function ensureReviewClone(
  config: ReviewConfig,
  workspace: string,
  repoSlug: string,
): Promise<string> {
  mkdirSync(config.reviewWorkspace, { recursive: true });
  const target = join(config.reviewWorkspace, workspace, repoSlug);

  if (existsSync(join(target, ".git"))) {
    await runGit(target, ["fetch", "--all", "--prune"]);
    return target;
  }

  mkdirSync(join(config.reviewWorkspace, workspace), { recursive: true });

  const sshUrl = `git@bitbucket.org:${workspace}/${repoSlug}.git`;
  try {
    await runGit(config.reviewWorkspace, ["clone", "--", sshUrl, target]);
    return target;
  } catch (sshError) {
    if (process.env.BITBUCKET_ALLOW_HTTPS_CLONE !== "1") {
      throw new AppError(
        "CLONE_FAILED",
        `SSH clone failed for ${workspace}/${repoSlug}. Fix SSH access or set BITBUCKET_ALLOW_HTTPS_CLONE=1`,
        { cause: sshError },
      );
    }
    // Prefer Bitbucket username for HTTPS git auth with API tokens
    const user = config.username || config.email;
    const httpsUrl = `https://${encodeURIComponent(user)}:${encodeURIComponent(config.apiToken)}@bitbucket.org/${workspace}/${repoSlug}.git`;
    try {
      await runGit(config.reviewWorkspace, ["clone", "--", httpsUrl, target]);
      // Rewrite remote to token-free URL
      await runGit(target, [
        "remote",
        "set-url",
        "origin",
        `https://bitbucket.org/${workspace}/${repoSlug}.git`,
      ]);
      return target;
    } catch (httpsError) {
      throw new AppError("CLONE_FAILED", `Failed to clone ${workspace}/${repoSlug}`, {
        cause: httpsError,
      });
    }
  }
}
