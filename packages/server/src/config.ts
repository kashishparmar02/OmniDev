// Reads the server's settings from environment variables.
//
// Credentials are only ever taken from the environment, which an MCP client
// sets in its own configuration file. Nothing is read from a file inside this
// repository, so there is no local file that could be committed by mistake.

import { homedir } from "node:os";
import { delimiter, join, resolve } from "node:path";

export interface ServerConfig {
  bitbucket: { email?: string; apiToken?: string };
  github: { token?: string };
  /** Folders that contain the user's own clones, searched one level deep. */
  repoRoots: string[];
  /** Where review checkouts are created. */
  worktreeDir: string;
}

function expandHome(path: string): string {
  return resolve(path.replace(/^~(?=$|\/)/, homedir()));
}

function optional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function loadConfig(env: NodeJS.ProcessEnv): ServerConfig {
  const email = optional(env.BITBUCKET_EMAIL);
  const apiToken = optional(env.BITBUCKET_API_TOKEN);
  const token = optional(env.GITHUB_TOKEN);
  return {
    bitbucket: { ...(email ? { email } : {}), ...(apiToken ? { apiToken } : {}) },
    github: token ? { token } : {},
    repoRoots: (env.OMNIDEV_REPO_ROOTS ?? "")
      .split(delimiter)
      .filter((root) => root.trim() !== "")
      .map(expandHome),
    worktreeDir: expandHome(
      optional(env.OMNIDEV_WORKTREE_DIR) ?? join("~", ".omnidev", "worktrees"),
    ),
  };
}
