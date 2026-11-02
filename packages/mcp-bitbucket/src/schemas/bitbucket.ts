import { z } from "zod";

export const BitbucketUserSchema = z
  .object({
    type: z.string().optional(),
    uuid: z.string().optional(),
    account_id: z.string().optional(),
    display_name: z.string().optional(),
    nickname: z.string().optional(),
    username: z.string().optional(),
  })
  .passthrough();

export const PullRequestSchema = z
  .object({
    type: z.literal("pullrequest").or(z.string()),
    id: z.number(),
    title: z.string(),
    state: z.string(),
    description: z.string().nullable().optional(),
    comment_count: z.number().optional(),
    task_count: z.number().optional(),
    created_on: z.string().optional(),
    updated_on: z.string().optional(),
    author: BitbucketUserSchema.optional(),
    source: z
      .object({
        branch: z.object({ name: z.string() }).partial().optional(),
        commit: z.object({ hash: z.string() }).partial().optional(),
        repository: z
          .object({
            full_name: z.string().optional(),
            name: z.string().optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
    destination: z
      .object({
        branch: z.object({ name: z.string() }).partial().optional(),
        commit: z.object({ hash: z.string() }).partial().optional(),
        repository: z
          .object({
            full_name: z.string().optional(),
            name: z.string().optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
    links: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export type PullRequest = z.infer<typeof PullRequestSchema>;

export const DiffstatItemSchema = z
  .object({
    status: z.string(),
    lines_added: z.number().optional(),
    lines_removed: z.number().optional(),
    old: z
      .object({
        path: z.string().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
    new: z
      .object({
        path: z.string().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

export const InlineAnchorSchema = z.object({
  path: z.string().min(1),
  from: z.number().int().positive().optional(),
  to: z.number().int().positive().optional(),
});

export const CreateCommentInputSchema = z
  .object({
    content: z.string().min(1),
    inline: InlineAnchorSchema.optional(),
    parentId: z.number().int().positive().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.inline && val.inline.from === undefined && val.inline.to === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "inline comment requires `from` and/or `to`",
        path: ["inline"],
      });
    }
  });

export type CreateCommentInput = z.infer<typeof CreateCommentInputSchema>;
