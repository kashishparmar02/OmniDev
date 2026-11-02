import { z } from "zod";
import { AppError } from "../utils/errors.js";

export const ParsedPrUrlSchema = z.object({
  workspace: z.string().min(1),
  repoSlug: z.string().min(1),
  pullRequestId: z.number().int().positive(),
  rawUrl: z.string().url(),
});

export type ParsedPrUrl = z.infer<typeof ParsedPrUrlSchema>;

const PR_PATH =
  /^\/(?<workspace>[^/]+)\/(?<repo>[^/]+)\/(?:pull-requests|pullrequest)\/(?<id>\d+)(?:\/|$|\?|#)/i;

/**
 * Parse Bitbucket Cloud PR URLs.
 * Accepts:
 * - https://bitbucket.org/{workspace}/{repo}/pull-requests/{id}
 * - https://bitbucket.org/{workspace}/{repo}/pull-requests/{id}/...
 */
export function parseBitbucketPrUrl(input: string): ParsedPrUrl {
  const trimmed = input.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new AppError("INVALID_PR_URL", `Not a valid URL: ${trimmed}`);
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new AppError("INVALID_PR_URL", "Only http(s) Bitbucket PR URLs are allowed");
  }

  const host = url.hostname.toLowerCase();
  if (host !== "bitbucket.org" && host !== "www.bitbucket.org") {
    throw new AppError("INVALID_PR_URL", `Unsupported host: ${host}`);
  }

  const match = PR_PATH.exec(url.pathname);
  if (!match?.groups) {
    throw new AppError(
      "INVALID_PR_URL",
      "URL must look like https://bitbucket.org/{workspace}/{repo}/pull-requests/{id}",
    );
  }

  return ParsedPrUrlSchema.parse({
    workspace: match.groups.workspace,
    repoSlug: match.groups.repo,
    pullRequestId: Number(match.groups.id),
    rawUrl: url.toString(),
  });
}
