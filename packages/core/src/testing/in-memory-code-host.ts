// A code host that lives entirely in memory.
//
// Capability tests use it in place of a real host, so they run without a
// network or credentials. It is also the reference implementation of
// ICodeHostProvider: the shared contract tests are developed against it first.

import type {
  Comment,
  ICodeHostProvider,
  NewThread,
  PullRequest,
  PullRequestRef,
  ReviewThread,
} from "../provider/code-host.js";
import { ProviderError } from "../provider/errors.js";

export interface SeededPullRequest {
  pullRequest: PullRequest;
  diff: string;
  threads?: ReviewThread[];
}

interface StoredPullRequest {
  pullRequest: PullRequest;
  diff: string;
  threads: ReviewThread[];
}

function keyOf(ref: PullRequestRef): string {
  return `${ref.owner}/${ref.repo}#${ref.number}`;
}

export class InMemoryCodeHost implements ICodeHostProvider {
  private readonly stored = new Map<string, StoredPullRequest>();
  private readonly currentUser: string;
  private nextId = 1;

  /** `currentUser` is recorded as the author of every comment this instance writes. */
  constructor(seed: SeededPullRequest[] = [], currentUser = "omnidev-test-user") {
    this.currentUser = currentUser;
    for (const entry of seed) {
      this.stored.set(
        keyOf(entry.pullRequest.ref),
        structuredClone({ ...entry, threads: entry.threads ?? [] }),
      );
    }
  }

  // Every method returns a copy. A real host hands back fresh data on each
  // call, so a test must not be able to change stored state by mutating a
  // returned object.

  async getPullRequest(ref: PullRequestRef): Promise<PullRequest> {
    return structuredClone(this.find(ref).pullRequest);
  }

  async getDiff(ref: PullRequestRef): Promise<string> {
    return this.find(ref).diff;
  }

  async listThreads(ref: PullRequestRef): Promise<ReviewThread[]> {
    return structuredClone(this.find(ref).threads);
  }

  async createThread(ref: PullRequestRef, thread: NewThread): Promise<ReviewThread> {
    const created: ReviewThread = {
      id: this.newId("thread"),
      resolved: false,
      comments: [this.newComment(thread.body)],
      ...(thread.anchor ? { anchor: thread.anchor } : {}),
    };
    this.find(ref).threads.push(created);
    return structuredClone(created);
  }

  async replyToThread(ref: PullRequestRef, threadId: string, body: string): Promise<Comment> {
    const reply = this.newComment(body);
    this.findThread(ref, threadId).comments.push(reply);
    return structuredClone(reply);
  }

  async setThreadResolved(ref: PullRequestRef, threadId: string, resolved: boolean): Promise<void> {
    this.findThread(ref, threadId).resolved = resolved;
  }

  private find(ref: PullRequestRef): StoredPullRequest {
    const found = this.stored.get(keyOf(ref));
    if (!found) throw new ProviderError("not_found", `Pull request ${keyOf(ref)} was not found.`);
    return found;
  }

  private findThread(ref: PullRequestRef, threadId: string): ReviewThread {
    const thread = this.find(ref).threads.find((candidate) => candidate.id === threadId);
    if (!thread) {
      throw new ProviderError("not_found", `Thread ${threadId} was not found on ${keyOf(ref)}.`);
    }
    return thread;
  }

  private newId(prefix: string): string {
    return `${prefix}-${this.nextId++}`;
  }

  private newComment(body: string): Comment {
    return {
      id: this.newId("comment"),
      author: this.currentUser,
      body,
      createdAt: new Date().toISOString(),
    };
  }
}
