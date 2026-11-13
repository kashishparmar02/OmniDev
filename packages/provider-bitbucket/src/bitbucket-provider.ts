// Bitbucket Cloud implementation of ICodeHostProvider.
//
// It translates between OmniDev's data shapes and Bitbucket's REST API 2.0 and
// does nothing else. Bitbucket stores a thread as a flat list of comments in
// which each reply points at its parent, so most of the work here is
// rebuilding threads from that list.

import {
  ProviderError,
  sendHostRequest,
  type Comment,
  type HostRequest,
  type HostRequestOptions,
  type ICodeHostProvider,
  type InlineAnchor,
  type NewPullRequest,
  type NewThread,
  type PullRequest,
  type PullRequestChanges,
  type PullRequestRef,
  type RepoRef,
  type ReviewThread,
} from "@omnidev/core";
import type { z } from "zod";
import {
  commentPageSchema,
  commentSchema,
  pullRequestSchema,
  type BitbucketComment,
  type BitbucketPullRequest,
} from "./schemas.js";

export interface BitbucketProviderOptions {
  /** Atlassian account email. Leave out, with apiToken, to read public repositories. */
  email?: string;
  apiToken?: string;
  baseUrl?: string;
  request?: HostRequestOptions;
}

const COMMENTS_PER_PAGE = 100;

function toPullRequest(repo: RepoRef, raw: BitbucketPullRequest): PullRequest {
  const state = raw.state === "OPEN" ? "open" : raw.state === "MERGED" ? "merged" : "closed";
  return {
    ref: { owner: repo.owner, repo: repo.repo, number: raw.id },
    title: raw.title,
    description: raw.description ?? "",
    state,
    author: raw.author?.display_name ?? raw.author?.nickname ?? "unknown",
    sourceBranch: raw.source.branch.name,
    targetBranch: raw.destination.branch.name,
    headCommit: raw.source.commit?.hash ?? "",
    url: raw.links.html.href,
  };
}

function toComment(raw: BitbucketComment): Comment {
  return {
    id: String(raw.id),
    author: raw.user?.display_name ?? raw.user?.nickname ?? "unknown",
    body: raw.content.raw,
    createdAt: raw.created_on,
  };
}

// A comment on a whole file has a path but no line; OmniDev treats it as a
// general thread because it has no line to anchor to.
function toAnchor(raw: BitbucketComment): InlineAnchor | undefined {
  const inline = raw.inline;
  if (!inline) return undefined;
  if (typeof inline.to === "number") return { path: inline.path, line: inline.to, side: "new" };
  if (typeof inline.from === "number") return { path: inline.path, line: inline.from, side: "old" };
  return undefined;
}

function byCreation(a: BitbucketComment, b: BitbucketComment): number {
  return a.created_on.localeCompare(b.created_on) || a.id - b.id;
}

/**
 * Groups a flat list of comments into threads.
 *
 * A reply can point at another reply, so each comment is followed up its
 * parent chain to the first comment of the conversation. If a parent is
 * missing because it was deleted, the chain stops there and the orphan starts
 * its own thread, so no visible comment is lost.
 */
function toThreads(comments: BitbucketComment[]): ReviewThread[] {
  const byId = new Map(comments.map((comment) => [comment.id, comment]));
  const rootOf = (comment: BitbucketComment): BitbucketComment => {
    let current = comment;
    // The step limit only guards against a malformed response with a cycle.
    for (let steps = 0; steps < comments.length; steps += 1) {
      const parent = current.parent ? byId.get(current.parent.id) : undefined;
      if (!parent) break;
      current = parent;
    }
    return current;
  };

  const members = new Map<number, BitbucketComment[]>();
  for (const comment of comments) {
    const root = rootOf(comment);
    members.set(root.id, [...(members.get(root.id) ?? []), comment]);
  }

  return [...members.keys()]
    .map((rootId) => byId.get(rootId)!)
    .sort(byCreation)
    .map((root) => {
      const anchor = toAnchor(root);
      return {
        id: String(root.id),
        resolved: Boolean(root.resolution),
        comments: members.get(root.id)!.sort(byCreation).map(toComment),
        ...(anchor ? { anchor } : {}),
      };
    });
}

export class BitbucketProvider implements ICodeHostProvider {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private readonly requestOptions: HostRequestOptions;

  constructor(options: BitbucketProviderOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "https://api.bitbucket.org/2.0").replace(/\/$/, "");
    this.requestOptions = options.request ?? {};
    this.headers =
      options.email && options.apiToken
        ? {
            Authorization: `Basic ${Buffer.from(`${options.email}:${options.apiToken}`).toString("base64")}`,
          }
        : {};
  }

  async getPullRequest(ref: PullRequestRef): Promise<PullRequest> {
    return toPullRequest(
      ref,
      await this.json(pullRequestSchema, { url: this.pullRequestUrl(ref) }),
    );
  }

  async createPullRequest(repo: RepoRef, draft: NewPullRequest): Promise<PullRequest> {
    const raw = await this.json(pullRequestSchema, {
      method: "POST",
      url: `${this.repoUrl(repo)}/pullrequests`,
      body: {
        title: draft.title,
        description: draft.description,
        source: { branch: { name: draft.sourceBranch } },
        destination: { branch: { name: draft.targetBranch } },
      },
    });
    return toPullRequest(repo, raw);
  }

  async updatePullRequest(ref: PullRequestRef, changes: PullRequestChanges): Promise<PullRequest> {
    // Bitbucket requires the title on every update, so the current one is
    // read first when the caller is only changing the description.
    const title = changes.title ?? (await this.getPullRequest(ref)).title;
    const raw = await this.json(pullRequestSchema, {
      method: "PUT",
      url: this.pullRequestUrl(ref),
      body: {
        title,
        ...(changes.description !== undefined ? { description: changes.description } : {}),
      },
    });
    return toPullRequest(ref, raw);
  }

  async getDiff(ref: PullRequestRef): Promise<string> {
    return (await this.send({ url: `${this.pullRequestUrl(ref)}/diff` })).body;
  }

  async listThreads(ref: PullRequestRef): Promise<ReviewThread[]> {
    const comments: BitbucketComment[] = [];
    let url: string | undefined =
      `${this.pullRequestUrl(ref)}/comments?pagelen=${COMMENTS_PER_PAGE}`;
    while (url) {
      const page: z.infer<typeof commentPageSchema> = await this.json(commentPageSchema, { url });
      comments.push(...page.values.filter((comment) => !comment.deleted));
      // The next-page link comes from the response. It is only followed when
      // it stays on the API, so credentials are never sent anywhere else.
      if (page.next && !page.next.startsWith(`${this.baseUrl}/`)) {
        throw new ProviderError("unavailable", "Bitbucket returned an unexpected next-page link.");
      }
      url = page.next;
    }
    return toThreads(comments);
  }

  async createThread(ref: PullRequestRef, thread: NewThread): Promise<ReviewThread> {
    const { anchor } = thread;
    const inline = anchor && {
      path: anchor.path,
      ...(anchor.side === "new" ? { to: anchor.line } : { from: anchor.line }),
    };
    const created = await this.json(commentSchema, {
      method: "POST",
      url: `${this.pullRequestUrl(ref)}/comments`,
      body: { content: { raw: thread.body }, ...(inline ? { inline } : {}) },
    });
    return {
      id: String(created.id),
      resolved: false,
      comments: [toComment(created)],
      ...(anchor ? { anchor } : {}),
    };
  }

  async replyToThread(ref: PullRequestRef, threadId: string, body: string): Promise<Comment> {
    // The thread is fetched first so that a missing one is always reported as
    // not_found, whatever Bitbucket answers to a reply with an unknown parent.
    const root = await this.getComment(ref, threadId);
    const created = await this.json(commentSchema, {
      method: "POST",
      url: `${this.pullRequestUrl(ref)}/comments`,
      body: { content: { raw: body }, parent: { id: root.id } },
    });
    return toComment(created);
  }

  async setThreadResolved(ref: PullRequestRef, threadId: string, resolved: boolean): Promise<void> {
    // Reading the current state first makes a repeated request a no-op and
    // avoids depending on how Bitbucket answers a second resolve.
    const root = await this.getComment(ref, threadId);
    if (Boolean(root.resolution) === resolved) return;
    await this.send({
      method: resolved ? "POST" : "DELETE",
      url: `${this.pullRequestUrl(ref)}/comments/${root.id}/resolve`,
    });
  }

  private repoUrl(repo: RepoRef): string {
    return `${this.baseUrl}/repositories/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}`;
  }

  private pullRequestUrl(ref: PullRequestRef): string {
    return `${this.repoUrl(ref)}/pullrequests/${ref.number}`;
  }

  private getComment(ref: PullRequestRef, threadId: string): Promise<BitbucketComment> {
    if (!/^\d+$/.test(threadId)) {
      throw new ProviderError("not_found", `Thread ${threadId} was not found.`);
    }
    return this.json(commentSchema, { url: `${this.pullRequestUrl(ref)}/comments/${threadId}` });
  }

  private send(request: HostRequest) {
    return sendHostRequest(
      { ...request, headers: { ...this.headers, ...request.headers } },
      this.requestOptions,
    );
  }

  private async json<Schema extends z.ZodType>(
    schema: Schema,
    request: HostRequest,
  ): Promise<z.infer<Schema>> {
    const { body } = await this.send(request);
    try {
      return schema.parse(JSON.parse(body));
    } catch (cause) {
      throw new ProviderError(
        "unavailable",
        "Bitbucket returned a response OmniDev could not read.",
        {
          cause,
        },
      );
    }
  }
}
