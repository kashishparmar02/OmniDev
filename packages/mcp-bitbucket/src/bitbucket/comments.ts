import { BitbucketClient } from "./client.js";
import { collectPages } from "./pagination.js";
import { prBasePath } from "./pull-request.js";
import {
  CreateCommentInputSchema,
  type CreateCommentInput,
} from "../schemas/bitbucket.js";
import { AppError } from "../utils/errors.js";

export async function listPullRequestComments(
  client: BitbucketClient,
  workspace: string,
  repoSlug: string,
  pullRequestId: number,
) {
  return collectPages<Record<string, unknown>>(async (url) => {
    if (url) return client.getAbsolutePaginated(url);
    return client.getPaginated(`${prBasePath(workspace, repoSlug, pullRequestId)}/comments`, {
      pagelen: 100,
    });
  });
}

export async function createPullRequestComment(
  client: BitbucketClient,
  workspace: string,
  repoSlug: string,
  pullRequestId: number,
  input: CreateCommentInput,
) {
  const parsed = CreateCommentInputSchema.parse(input);
  const body: Record<string, unknown> = {
    content: { raw: parsed.content },
  };

  if (parsed.parentId) {
    body.parent = { id: parsed.parentId };
  }

  if (parsed.inline) {
    const inline: Record<string, unknown> = { path: parsed.inline.path };
    if (parsed.inline.to !== undefined) inline.to = parsed.inline.to;
    if (parsed.inline.from !== undefined) inline.from = parsed.inline.from;
    body.inline = inline;
  }

  try {
    return await client.request(`${prBasePath(workspace, repoSlug, pullRequestId)}/comments`, {
      method: "POST",
      body,
      retries: 1,
    });
  } catch (error) {
    if (error instanceof AppError && error.status === 400) {
      throw new AppError("INVALID_COMMENT_ANCHOR", "Bitbucket rejected the comment anchor or payload", {
        status: 400,
        details: error.details,
        cause: error,
      });
    }
    throw error;
  }
}

export async function deletePullRequestComment(
  client: BitbucketClient,
  workspace: string,
  repoSlug: string,
  pullRequestId: number,
  commentId: number,
) {
  await client.request(
    `${prBasePath(workspace, repoSlug, pullRequestId)}/comments/${commentId}`,
    { method: "DELETE", retries: 1 },
  );
}

/**
 * Detect likely duplicates by exact content match on same path/line.
 */
export function findDuplicateComment(
  existing: Array<Record<string, unknown>>,
  content: string,
  inline?: { path: string; to?: number; from?: number },
): Record<string, unknown> | undefined {
  const normalized = content.trim();
  for (const comment of existing) {
    const raw =
      typeof comment.content === "object" &&
      comment.content &&
      "raw" in (comment.content as object)
        ? String((comment.content as { raw?: string }).raw || "")
        : "";
    if (raw.trim() !== normalized) continue;
    if (!inline) return comment;
    const cInline = comment.inline as { path?: string; to?: number; from?: number } | undefined;
    if (!cInline) continue;
    if (cInline.path !== inline.path) continue;
    if (inline.to !== undefined && cInline.to !== inline.to) continue;
    if (inline.from !== undefined && cInline.from !== inline.from) continue;
    return comment;
  }
  return undefined;
}
