// Turns the web addresses people paste into the references OmniDev works with.
//
// A pull request URL is the only identifier a tool call needs: it names the
// host, the repository and the pull request, so the server can pick the right
// provider without a separate set of tools per host.

import type { PullRequestRef, RepoRef } from "@omnidev/core";

export type Host = "bitbucket" | "github";

export interface PullRequestTarget {
  host: Host;
  ref: PullRequestRef;
}

export interface RepoTarget {
  host: Host;
  repo: RepoRef;
}

// Each host uses a different path word between the repository and the number.
const PULL_REQUEST_PATH_WORD: Record<Host, string> = {
  bitbucket: "pull-requests",
  github: "pull",
};

function parse(input: string): { host: Host; segments: string[] } {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error(`"${input}" is not a URL.`);
  }
  const hostname = url.hostname.replace(/^www\./, "");
  const host =
    hostname === "bitbucket.org" ? "bitbucket" : hostname === "github.com" ? "github" : null;
  if (!host)
    throw new Error(`${hostname} is not a supported host. Use bitbucket.org or github.com.`);
  return { host, segments: url.pathname.split("/").filter(Boolean) };
}

/**
 * Reads a repository URL such as https://github.com/acme/sample-app.
 * Anything after the repository name, and a trailing ".git", is ignored.
 */
export function parseRepoUrl(input: string): RepoTarget {
  const { host, segments } = parse(input);
  const [owner, repo] = segments;
  if (!owner || !repo) throw new Error(`"${input}" does not name a repository.`);
  return { host, repo: { owner, repo: repo.replace(/\.git$/, "") } };
}

/**
 * Reads a pull request URL from either host. Extra path segments after the
 * number, such as "/files" or "/diff", are accepted so that a URL copied from
 * any tab of the pull request page works.
 */
export function parsePullRequestUrl(input: string): PullRequestTarget {
  const { host, segments } = parse(input);
  const [owner, repo, word, number] = segments;
  if (!owner || !repo || word !== PULL_REQUEST_PATH_WORD[host] || !/^\d+$/.test(number ?? "")) {
    throw new Error(`"${input}" is not a pull request URL.`);
  }
  return { host, ref: { owner, repo, number: Number(number) } };
}
