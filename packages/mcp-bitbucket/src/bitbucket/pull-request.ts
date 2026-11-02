import { BitbucketClient } from "./client.js";
import { collectPages } from "./pagination.js";
import { DiffstatItemSchema, PullRequestSchema, type PullRequest } from "../schemas/bitbucket.js";
import { z } from "zod";

export function prBasePath(workspace: string, repoSlug: string, pullRequestId: number): string {
  return `/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(repoSlug)}/pullrequests/${pullRequestId}`;
}

export async function getPullRequest(
  client: BitbucketClient,
  workspace: string,
  repoSlug: string,
  pullRequestId: number,
): Promise<PullRequest> {
  const raw = await client.request<unknown>(prBasePath(workspace, repoSlug, pullRequestId));
  return PullRequestSchema.parse(raw);
}

export async function getPullRequestDiff(
  client: BitbucketClient,
  workspace: string,
  repoSlug: string,
  pullRequestId: number,
): Promise<string> {
  return client.request<string>(`${prBasePath(workspace, repoSlug, pullRequestId)}/diff`, {
    accept: "text/plain",
    raw: true,
  });
}

export async function getPullRequestDiffstat(
  client: BitbucketClient,
  workspace: string,
  repoSlug: string,
  pullRequestId: number,
) {
  const values = await collectPages(async (url) => {
    if (url) return client.getAbsolutePaginated(url);
    return client.getPaginated(`${prBasePath(workspace, repoSlug, pullRequestId)}/diffstat`, {
      pagelen: 100,
    });
  });
  return z.array(DiffstatItemSchema).parse(values);
}

export async function getPullRequestCommits(
  client: BitbucketClient,
  workspace: string,
  repoSlug: string,
  pullRequestId: number,
) {
  return collectPages<Record<string, unknown>>(async (url) => {
    if (url) return client.getAbsolutePaginated(url);
    return client.getPaginated(`${prBasePath(workspace, repoSlug, pullRequestId)}/commits`, {
      pagelen: 50,
    });
  });
}

export async function getPullRequestActivity(
  client: BitbucketClient,
  workspace: string,
  repoSlug: string,
  pullRequestId: number,
) {
  return collectPages<Record<string, unknown>>(
    async (url) => {
      if (url) return client.getAbsolutePaginated(url);
      return client.getPaginated(`${prBasePath(workspace, repoSlug, pullRequestId)}/activity`, {
        pagelen: 50,
      });
    },
    { maxPages: 20 },
  );
}

export async function getCurrentUser(client: BitbucketClient) {
  return client.request<Record<string, unknown>>("/user");
}
