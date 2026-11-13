// The parts of GitHub's REST and GraphQL responses that OmniDev reads.
//
// Responses are validated with these schemas at the network boundary, so a
// changed or unexpected response fails loudly in one place and the rest of
// the provider can trust the shapes.

import { z } from "zod";

const userSchema = z.object({ login: z.string() }).nullish();

export const pullRequestSchema = z.object({
  number: z.number(),
  title: z.string(),
  body: z.string().nullish(),
  state: z.string(),
  merged_at: z.string().nullish(),
  user: userSchema,
  head: z.object({ ref: z.string(), sha: z.string() }),
  base: z.object({ ref: z.string() }),
  html_url: z.string(),
});

/** A general comment on the pull request's conversation tab. */
export const issueCommentSchema = z.object({
  id: z.number(),
  body: z.string().nullish(),
  user: userSchema,
  created_at: z.string(),
});

export const createdReviewCommentSchema = z.object({ id: z.number() });

const threadCommentSchema = z.object({
  databaseId: z.number(),
  author: userSchema,
  body: z.string(),
  createdAt: z.string(),
});

const reviewThreadSchema = z.object({
  id: z.string(),
  isResolved: z.boolean(),
  path: z.string(),
  // Null once the code under the comment has changed; originalLine remains.
  line: z.number().nullish(),
  originalLine: z.number().nullish(),
  diffSide: z.enum(["LEFT", "RIGHT"]),
  comments: z.object({ nodes: z.array(threadCommentSchema) }),
});

export const reviewThreadsDataSchema = z.object({
  repository: z
    .object({
      pullRequest: z
        .object({
          reviewThreads: z.object({
            pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullish() }),
            nodes: z.array(reviewThreadSchema),
          }),
        })
        .nullable(),
    })
    .nullable(),
});

export const replyDataSchema = z.object({
  addPullRequestReviewThreadReply: z.object({ comment: threadCommentSchema }),
});

export const graphqlEnvelopeSchema = z.object({
  data: z.unknown().optional(),
  errors: z.array(z.object({ type: z.string().optional(), message: z.string() })).optional(),
});

export type GitHubPullRequest = z.infer<typeof pullRequestSchema>;
export type GitHubIssueComment = z.infer<typeof issueCommentSchema>;
export type GitHubReviewThread = z.infer<typeof reviewThreadSchema>;
export type GitHubThreadComment = z.infer<typeof threadCommentSchema>;
