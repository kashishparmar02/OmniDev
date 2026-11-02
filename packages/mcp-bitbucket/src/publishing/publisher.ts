import type { BitbucketClient } from "../bitbucket/client.js";
import {
  createPullRequestComment,
  findDuplicateComment,
  listPullRequestComments,
} from "../bitbucket/comments.js";
import { getPullRequestDiff } from "../bitbucket/pull-request.js";
import { validateCommentAgainstDiff } from "./anchor-validator.js";
import type { ReviewFinding } from "../schemas/review-finding.js";
import { AppError } from "../utils/errors.js";

export interface PublishRequest {
  workspace: string;
  repoSlug: string;
  pullRequestId: number;
  findings: ReviewFinding[];
  postSummary?: boolean;
  summaryText?: string;
  approvedIds: string[];
}

export interface PublishResultItem {
  findingId: string;
  status: "published" | "skipped_duplicate" | "skipped_unanchorable" | "skipped_not_approved" | "error";
  commentId?: number;
  reason?: string;
}

export async function publishApprovedFindings(
  client: BitbucketClient,
  request: PublishRequest,
): Promise<{ results: PublishResultItem[]; summaryCommentId?: number }> {
  const approved = new Set(request.approvedIds);
  const diff = await getPullRequestDiff(
    client,
    request.workspace,
    request.repoSlug,
    request.pullRequestId,
  );
  const existing = (await listPullRequestComments(
    client,
    request.workspace,
    request.repoSlug,
    request.pullRequestId,
  )) as Array<Record<string, unknown>>;

  const results: PublishResultItem[] = [];

  for (const finding of request.findings) {
    if (!approved.has(finding.id)) {
      results.push({ findingId: finding.id, status: "skipped_not_approved" });
      continue;
    }
    if (!finding.publishable || finding.validationStatus !== "validated") {
      results.push({
        findingId: finding.id,
        status: "skipped_unanchorable",
        reason: "Finding is not validated/publishable",
      });
      continue;
    }

    const anchor = validateCommentAgainstDiff(
      diff,
      finding.filePath,
      finding.line,
      finding.side ?? "new",
    );
    if (!anchor.ok || !anchor.inline) {
      results.push({
        findingId: finding.id,
        status: "skipped_unanchorable",
        reason: anchor.reason,
      });
      continue;
    }

    const body =
      finding.commentBody ||
      `${finding.explanation}${finding.suggestion ? `\n\n${finding.suggestion}` : ""}\n\n<!-- cursor-pr-review:${finding.id} -->`;

    const duplicate = findDuplicateComment(existing, body, anchor.inline);
    if (duplicate && typeof duplicate.id === "number") {
      results.push({
        findingId: finding.id,
        status: "skipped_duplicate",
        commentId: duplicate.id,
      });
      continue;
    }

    try {
      const created = (await createPullRequestComment(
        client,
        request.workspace,
        request.repoSlug,
        request.pullRequestId,
        { content: body, inline: anchor.inline },
      )) as { id?: number };
      results.push({
        findingId: finding.id,
        status: "published",
        commentId: created.id,
      });
      if (created && typeof created === "object") {
        existing.push(created as Record<string, unknown>);
      }
    } catch (error) {
      const reason = error instanceof AppError ? error.message : "Failed to publish comment";
      results.push({ findingId: finding.id, status: "error", reason });
    }
  }

  let summaryCommentId: number | undefined;
  if (request.postSummary && request.summaryText) {
    const duplicate = findDuplicateComment(existing, request.summaryText);
    if (duplicate && typeof duplicate.id === "number") {
      summaryCommentId = duplicate.id;
    } else {
      const created = (await createPullRequestComment(
        client,
        request.workspace,
        request.repoSlug,
        request.pullRequestId,
        { content: request.summaryText },
      )) as { id?: number };
      summaryCommentId = created.id;
    }
  }

  return { results, summaryCommentId };
}
