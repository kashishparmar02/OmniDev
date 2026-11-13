// GitHub implementation of ICodeHostProvider.
//
// GitHub splits what OmniDev calls threads across two APIs. General comments
// are "issue comments" in the REST API: flat, with no replies and no resolved
// state. Inline threads are "review threads", and only the GraphQL API exposes
// them as threads or lets them be resolved. This provider reads both and
// presents them as one list.
//
// Because a general comment cannot be replied to or resolved on GitHub, those
// two operations reject with `unsupported` for a general thread.

import {
  ProviderError,
  redactSecrets,
  sendHostRequest,
  type Comment,
  type HostRequest,
  type HostRequestOptions,
  type ICodeHostProvider,
  type NewPullRequest,
  type NewThread,
  type ProviderErrorCode,
  type PullRequest,
  type PullRequestChanges,
  type PullRequestRef,
  type RepoRef,
  type ReviewThread,
} from "@omnidev/core";
import type { z } from "zod";
import {
  createdReviewCommentSchema,
  graphqlEnvelopeSchema,
  issueCommentSchema,
  pullRequestSchema,
  replyDataSchema,
  reviewThreadsDataSchema,
  type GitHubIssueComment,
  type GitHubPullRequest,
  type GitHubReviewThread,
  type GitHubThreadComment,
} from "./schemas.js";

export interface GitHubProviderOptions {
  /** Personal access token. Without one only public pull request details and diffs can be read. */
  token?: string;
  apiUrl?: string;
  request?: HostRequestOptions;
}

const PER_PAGE = 100;
const GENERAL_THREAD_PREFIX = "comment-";

const REVIEW_THREADS_QUERY = `
  query ($owner: String!, $repo: String!, $number: Int!, $after: String) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        reviewThreads(first: ${PER_PAGE}, after: $after) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id isResolved path line originalLine diffSide
            comments(first: ${PER_PAGE}) { nodes { databaseId author { login } body createdAt } }
          }
        }
      }
    }
  }`;

const REPLY_MUTATION = `
  mutation ($threadId: ID!, $body: String!) {
    addPullRequestReviewThreadReply(input: { pullRequestReviewThreadId: $threadId, body: $body }) {
      comment { databaseId author { login } body createdAt }
    }
  }`;

const resolveMutation = (resolved: boolean) => `
  mutation ($threadId: ID!) {
    ${resolved ? "resolveReviewThread" : "unresolveReviewThread"}(input: { threadId: $threadId }) {
      thread { id }
    }
  }`;

const GRAPHQL_ERROR_CODES: Record<string, ProviderErrorCode> = {
  NOT_FOUND: "not_found",
  FORBIDDEN: "unauthorized",
  INSUFFICIENT_SCOPES: "unauthorized",
  RATE_LIMITED: "rate_limited",
};

function toPullRequest(repo: RepoRef, raw: GitHubPullRequest): PullRequest {
  const state = raw.merged_at ? "merged" : raw.state === "open" ? "open" : "closed";
  return {
    ref: { owner: repo.owner, repo: repo.repo, number: raw.number },
    title: raw.title,
    description: raw.body ?? "",
    state,
    author: raw.user?.login ?? "unknown",
    sourceBranch: raw.head.ref,
    targetBranch: raw.base.ref,
    headCommit: raw.head.sha,
    url: raw.html_url,
  };
}

function generalThread(raw: GitHubIssueComment): ReviewThread {
  return {
    id: `${GENERAL_THREAD_PREFIX}${raw.id}`,
    resolved: false,
    comments: [
      {
        id: String(raw.id),
        author: raw.user?.login ?? "unknown",
        body: raw.body ?? "",
        createdAt: raw.created_at,
      },
    ],
  };
}

function toComment(raw: GitHubThreadComment): Comment {
  return {
    id: String(raw.databaseId),
    author: raw.author?.login ?? "unknown",
    body: raw.body,
    createdAt: raw.createdAt,
  };
}

function inlineThread(raw: GitHubReviewThread): ReviewThread {
  const line = raw.line ?? raw.originalLine;
  return {
    id: raw.id,
    resolved: raw.isResolved,
    comments: raw.comments.nodes.map(toComment),
    // A thread on a whole file has no line and so no anchor.
    ...(typeof line === "number"
      ? { anchor: { path: raw.path, line, side: raw.diffSide === "RIGHT" ? "new" : "old" } }
      : {}),
  };
}

function unsupported(action: string): ProviderError {
  return new ProviderError(
    "unsupported",
    `GitHub cannot ${action} a general comment. Post a new comment instead.`,
  );
}

export class GitHubProvider implements ICodeHostProvider {
  private readonly apiUrl: string;
  private readonly headers: Record<string, string>;
  private readonly requestOptions: HostRequestOptions;

  constructor(options: GitHubProviderOptions = {}) {
    this.apiUrl = (options.apiUrl ?? "https://api.github.com").replace(/\/$/, "");
    this.requestOptions = options.request ?? {};
    this.headers = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "omnidev",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    };
  }

  async getPullRequest(ref: PullRequestRef): Promise<PullRequest> {
    return toPullRequest(ref, await this.rest(pullRequestSchema, { url: this.pullUrl(ref) }));
  }

  async createPullRequest(repo: RepoRef, draft: NewPullRequest): Promise<PullRequest> {
    const raw = await this.rest(pullRequestSchema, {
      method: "POST",
      url: `${this.repoUrl(repo)}/pulls`,
      body: {
        title: draft.title,
        body: draft.description,
        head: draft.sourceBranch,
        base: draft.targetBranch,
      },
    });
    return toPullRequest(repo, raw);
  }

  async updatePullRequest(ref: PullRequestRef, changes: PullRequestChanges): Promise<PullRequest> {
    const raw = await this.rest(pullRequestSchema, {
      method: "PATCH",
      url: this.pullUrl(ref),
      body: {
        ...(changes.title !== undefined ? { title: changes.title } : {}),
        ...(changes.description !== undefined ? { body: changes.description } : {}),
      },
    });
    return toPullRequest(ref, raw);
  }

  async getDiff(ref: PullRequestRef): Promise<string> {
    const response = await this.send({
      url: this.pullUrl(ref),
      headers: { Accept: "application/vnd.github.diff" },
    });
    return response.body;
  }

  async listThreads(ref: PullRequestRef): Promise<ReviewThread[]> {
    // The REST call runs first: it answers 404 for a missing pull request,
    // which becomes not_found before any GraphQL query is made.
    const general = (await this.listIssueComments(ref)).map(generalThread);
    const inline = (await this.listReviewThreads(ref)).map(inlineThread);
    return [...general, ...inline].sort((a, b) =>
      (a.comments[0]?.createdAt ?? "").localeCompare(b.comments[0]?.createdAt ?? ""),
    );
  }

  async createThread(ref: PullRequestRef, thread: NewThread): Promise<ReviewThread> {
    const { anchor } = thread;
    if (!anchor) {
      const created = await this.rest(issueCommentSchema, {
        method: "POST",
        url: `${this.repoUrl(ref)}/issues/${ref.number}/comments`,
        body: { body: thread.body },
      });
      return generalThread(created);
    }

    // An inline comment must name the commit it was written against.
    const { headCommit } = await this.getPullRequest(ref);
    const created = await this.rest(createdReviewCommentSchema, {
      method: "POST",
      url: `${this.pullUrl(ref)}/comments`,
      body: {
        body: thread.body,
        commit_id: headCommit,
        path: anchor.path,
        line: anchor.line,
        side: anchor.side === "new" ? "RIGHT" : "LEFT",
      },
    });

    // The REST API returns the comment but not the thread it started, and the
    // thread's ID is what replying and resolving need, so it is looked up.
    const threads = await this.listReviewThreads(ref);
    const started = threads.find((candidate) =>
      candidate.comments.nodes.some((comment) => comment.databaseId === created.id),
    );
    if (!started) {
      throw new ProviderError(
        "unavailable",
        "GitHub did not list the thread that was just created.",
      );
    }
    return inlineThread(started);
  }

  async replyToThread(_ref: PullRequestRef, threadId: string, body: string): Promise<Comment> {
    if (threadId.startsWith(GENERAL_THREAD_PREFIX)) throw unsupported("reply to");
    const data = await this.graphql(replyDataSchema, REPLY_MUTATION, { threadId, body });
    return toComment(data.addPullRequestReviewThreadReply.comment);
  }

  async setThreadResolved(
    _ref: PullRequestRef,
    threadId: string,
    resolved: boolean,
  ): Promise<void> {
    if (threadId.startsWith(GENERAL_THREAD_PREFIX)) throw unsupported("resolve");
    await this.graphql(undefined, resolveMutation(resolved), { threadId });
  }

  private repoUrl(repo: RepoRef): string {
    return `${this.apiUrl}/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}`;
  }

  private pullUrl(ref: PullRequestRef): string {
    return `${this.repoUrl(ref)}/pulls/${ref.number}`;
  }

  // Pages are requested until one comes back short, which avoids parsing the
  // Link header.
  private async listIssueComments(ref: PullRequestRef): Promise<GitHubIssueComment[]> {
    const comments: GitHubIssueComment[] = [];
    for (let page = 1; ; page += 1) {
      const batch = await this.rest(issueCommentSchema.array(), {
        url: `${this.repoUrl(ref)}/issues/${ref.number}/comments?per_page=${PER_PAGE}&page=${page}`,
      });
      comments.push(...batch);
      if (batch.length < PER_PAGE) return comments;
    }
  }

  // Only the first hundred comments of each thread are read; longer threads
  // are cut off at that point.
  private async listReviewThreads(ref: PullRequestRef): Promise<GitHubReviewThread[]> {
    const threads: GitHubReviewThread[] = [];
    let after: string | null = null;
    for (;;) {
      const data: z.infer<typeof reviewThreadsDataSchema> = await this.graphql(
        reviewThreadsDataSchema,
        REVIEW_THREADS_QUERY,
        { owner: ref.owner, repo: ref.repo, number: ref.number, after },
      );
      const page = data.repository?.pullRequest?.reviewThreads;
      if (!page) throw new ProviderError("not_found", "The pull request was not found on GitHub.");
      threads.push(...page.nodes);
      if (!page.pageInfo.hasNextPage || !page.pageInfo.endCursor) return threads;
      after = page.pageInfo.endCursor;
    }
  }

  private send(request: HostRequest) {
    return sendHostRequest(
      { ...request, headers: { ...this.headers, ...request.headers } },
      this.requestOptions,
    );
  }

  private parse<Schema extends z.ZodType>(schema: Schema, read: () => unknown): z.infer<Schema> {
    try {
      return schema.parse(read());
    } catch (cause) {
      throw new ProviderError("unavailable", "GitHub returned a response OmniDev could not read.", {
        cause,
      });
    }
  }

  private async rest<Schema extends z.ZodType>(
    schema: Schema,
    request: HostRequest,
  ): Promise<z.infer<Schema>> {
    const { body } = await this.send(request);
    return this.parse(schema, () => JSON.parse(body));
  }

  /**
   * Runs a GraphQL operation and returns its validated data, or nothing when
   * no schema is given. GraphQL reports most failures with HTTP 200 and an
   * `errors` list, so that list is translated into a ProviderError here.
   */
  private async graphql<Schema extends z.ZodType>(
    schema: Schema,
    query: string,
    variables: Record<string, unknown>,
  ): Promise<z.infer<Schema>>;
  private async graphql(
    schema: undefined,
    query: string,
    variables: Record<string, unknown>,
  ): Promise<void>;
  private async graphql(
    schema: z.ZodType | undefined,
    query: string,
    variables: Record<string, unknown>,
  ): Promise<unknown> {
    // GitHub answers an anonymous GraphQL call with a rate-limit error, which
    // would be retried and then reported misleadingly, so it is refused here.
    if (!this.headers.Authorization) {
      throw new ProviderError(
        "unauthorized",
        "GitHub needs a token to read or change review threads.",
      );
    }
    const { body } = await this.send({
      method: "POST",
      url: `${this.apiUrl}/graphql`,
      body: { query, variables },
    });
    const envelope = this.parse(graphqlEnvelopeSchema, () => JSON.parse(body));
    const failure = envelope.errors?.[0];
    if (failure) {
      const code = GRAPHQL_ERROR_CODES[failure.type ?? ""] ?? "invalid_request";
      throw new ProviderError(
        code,
        redactSecrets(`GitHub refused the request: ${failure.message}`),
      );
    }
    return schema ? this.parse(schema, () => envelope.data) : undefined;
  }
}
