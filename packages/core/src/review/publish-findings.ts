// Posts review findings to a pull request as inline threads.
//
// This is the step that runs after a person has approved a set of findings.
// It works against any ICodeHostProvider and adds the three protections that
// every host needs: a finding is only posted on a line the diff shows, a
// finding that is already on the pull request is not posted again, and one
// failed finding does not lose the report on the others.

import { checkAnchor, parseUnifiedDiff } from "../diff/unified-diff.js";
import type {
  ICodeHostProvider,
  InlineAnchor,
  PullRequestRef,
  ReviewThread,
} from "../provider/code-host.js";
import { ProviderError, type ProviderErrorCode } from "../provider/errors.js";

export interface Finding {
  /** Chosen by the caller and echoed in the outcome, so results can be matched up. */
  id: string;
  /** The comment text exactly as it should appear on the pull request. */
  body: string;
  anchor: InlineAnchor;
}

export interface PublishOutcome {
  findingId: string;
  status: "published" | "duplicate" | "not_in_diff" | "failed";
  /** The thread that was created, or the existing one for a duplicate. */
  threadId?: string;
  /** Why the finding was not published. */
  reason?: string;
}

// After one of these, every further call would fail the same way, so the
// remaining findings are not attempted.
const STOP_AFTER: ReadonlySet<ProviderErrorCode> = new Set([
  "unauthorized",
  "rate_limited",
  "unavailable",
]);

function normalise(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function findDuplicate(threads: ReviewThread[], finding: Finding): ReviewThread | undefined {
  const { path, line, side } = finding.anchor;
  const body = normalise(finding.body);
  return threads.find(
    (thread) =>
      thread.anchor?.path === path &&
      thread.anchor.line === line &&
      thread.anchor.side === side &&
      thread.comments.some((comment) => normalise(comment.body) === body),
  );
}

/**
 * Publishes each finding as an inline thread and reports what happened to
 * every one of them, in the order given.
 *
 * Running it twice with the same findings posts nothing the second time: a
 * finding counts as a duplicate when a thread on the same line already holds
 * a comment with the same text, ignoring whitespace differences.
 *
 * It rejects only when the pull request itself cannot be read. A failure to
 * post one finding is reported in that finding's outcome instead.
 */
export async function publishFindings(
  provider: ICodeHostProvider,
  ref: PullRequestRef,
  findings: Finding[],
): Promise<PublishOutcome[]> {
  const diffFiles = parseUnifiedDiff(await provider.getDiff(ref));
  const threads = await provider.listThreads(ref);
  const outcomes: PublishOutcome[] = [];
  let stoppedBecause: string | undefined;

  for (const finding of findings) {
    const findingId = finding.id;
    if (stoppedBecause) {
      outcomes.push({ findingId, status: "failed", reason: `Not attempted. ${stoppedBecause}` });
      continue;
    }

    const anchor = checkAnchor(diffFiles, finding.anchor);
    if (!anchor.ok) {
      outcomes.push({ findingId, status: "not_in_diff", reason: anchor.reason });
      continue;
    }

    const duplicate = findDuplicate(threads, finding);
    if (duplicate) {
      outcomes.push({ findingId, status: "duplicate", threadId: duplicate.id });
      continue;
    }

    try {
      const created = await provider.createThread(ref, finding);
      // Remembered so that a repeated finding later in the same batch is
      // recognised as a duplicate too.
      threads.push(created);
      outcomes.push({ findingId, status: "published", threadId: created.id });
    } catch (error) {
      if (!(error instanceof ProviderError)) throw error;
      outcomes.push({ findingId, status: "failed", reason: error.message });
      if (STOP_AFTER.has(error.code)) stoppedBecause = error.message;
    }
  }
  return outcomes;
}
