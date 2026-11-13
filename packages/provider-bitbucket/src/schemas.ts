// The parts of Bitbucket Cloud's API responses that OmniDev reads.
//
// Responses are validated with these schemas at the network boundary, so a
// changed or unexpected response fails loudly in one place and the rest of
// the provider can trust the shapes.

import { z } from "zod";

const userSchema = z
  .object({ display_name: z.string().optional(), nickname: z.string().optional() })
  .nullish();

const branchSchema = z.object({ name: z.string() });

export const pullRequestSchema = z.object({
  id: z.number(),
  title: z.string(),
  description: z.string().nullish(),
  state: z.string(),
  author: userSchema,
  source: z.object({
    branch: branchSchema,
    // Null once the source branch has been deleted.
    commit: z.object({ hash: z.string() }).nullish(),
  }),
  destination: z.object({ branch: branchSchema }),
  links: z.object({ html: z.object({ href: z.string() }) }),
});

export const commentSchema = z.object({
  id: z.number(),
  content: z.object({ raw: z.string() }),
  user: userSchema,
  created_on: z.string(),
  deleted: z.boolean().optional(),
  // `to` is a line of the new file, `from` a line of the old file.
  inline: z
    .object({ path: z.string(), from: z.number().nullish(), to: z.number().nullish() })
    .nullish(),
  parent: z.object({ id: z.number() }).nullish(),
  // Present, with details OmniDev does not need, once the thread is resolved.
  resolution: z.unknown().optional(),
});

export const commentPageSchema = z.object({
  values: z.array(commentSchema),
  next: z.string().optional(),
});

export type BitbucketPullRequest = z.infer<typeof pullRequestSchema>;
export type BitbucketComment = z.infer<typeof commentSchema>;
