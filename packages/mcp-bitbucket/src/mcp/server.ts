#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadConfig } from "../utils/config.js";
import { BitbucketClient } from "../bitbucket/client.js";
import { parseBitbucketPrUrl } from "../bitbucket/url.js";
import {
  getCurrentUser,
  getPullRequest,
  getPullRequestActivity,
  getPullRequestCommits,
  getPullRequestDiff,
  getPullRequestDiffstat,
} from "../bitbucket/pull-request.js";
import {
  createPullRequestComment,
  deletePullRequestComment,
  findDuplicateComment,
  listPullRequestComments,
} from "../bitbucket/comments.js";
import { parseUnifiedDiff, validateInlineAnchor } from "../publishing/line-mapper.js";
import { publishApprovedFindings } from "../publishing/publisher.js";
import { resolveLocalRepository } from "../repository/resolver.js";
import { ensureReviewClone } from "../repository/clone-manager.js";
import { fetchRefSafe, ensureWorktree, getWorkingTreeStatus } from "../repository/git-context.js";
import { isAppError, redactSecrets } from "../utils/errors.js";
import { ReviewFindingSchema } from "../schemas/review-finding.js";
import { join } from "node:path";

function textResult(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof data === "string" ? redactSecrets(data) : redactSecrets(JSON.stringify(data, null, 2)),
      },
    ],
  };
}

function errorResult(error: unknown) {
  if (isAppError(error)) {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: redactSecrets(
            JSON.stringify(
              {
                error: true,
                code: error.code,
                message: error.message,
                status: error.status,
              },
              null,
              2,
            ),
          ),
        },
      ],
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  return {
    isError: true,
    content: [{ type: "text" as const, text: redactSecrets(message) }],
  };
}

function getClient() {
  const config = loadConfig();
  return { config, client: new BitbucketClient(config) };
}

const server = new McpServer({
  name: "bitbucket-pr-review",
  version: "0.1.0",
});

server.registerTool(
  "bitbucket_parse_pr_url",
  {
    title: "Parse Bitbucket PR URL",
    description: "Parse a Bitbucket Cloud pull request URL into workspace, repo slug, and PR id.",
    inputSchema: {
      url: z.string().describe("Bitbucket PR URL"),
    },
  },
  async ({ url }) => {
    try {
      return textResult(parseBitbucketPrUrl(url));
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  "bitbucket_get_current_user",
  {
    title: "Get Bitbucket current user",
    description: "Verify Bitbucket authentication and return the current user profile.",
    inputSchema: {},
  },
  async () => {
    try {
      const { client } = getClient();
      return textResult(await getCurrentUser(client));
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  "bitbucket_get_pr",
  {
    title: "Get pull request",
    description: "Fetch Bitbucket PR metadata by workspace/repo/id or by PR URL.",
    inputSchema: {
      url: z.string().optional().describe("Bitbucket PR URL"),
      workspace: z.string().optional(),
      repoSlug: z.string().optional(),
      pullRequestId: z.number().int().positive().optional(),
    },
  },
  async (args) => {
    try {
      const { client } = getClient();
      const parsed = args.url
        ? parseBitbucketPrUrl(args.url)
        : {
            workspace: args.workspace!,
            repoSlug: args.repoSlug!,
            pullRequestId: args.pullRequestId!,
          };
      if (!parsed.workspace || !parsed.repoSlug || !parsed.pullRequestId) {
        throw new Error("Provide either url or workspace+repoSlug+pullRequestId");
      }
      const pr = await getPullRequest(client, parsed.workspace, parsed.repoSlug, parsed.pullRequestId);
      return textResult(pr);
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  "bitbucket_get_pr_diff",
  {
    title: "Get PR diff",
    description: "Fetch the unified diff for a Bitbucket pull request.",
    inputSchema: {
      url: z.string().optional(),
      workspace: z.string().optional(),
      repoSlug: z.string().optional(),
      pullRequestId: z.number().int().positive().optional(),
    },
  },
  async (args) => {
    try {
      const { client } = getClient();
      const parsed = args.url
        ? parseBitbucketPrUrl(args.url)
        : {
            workspace: args.workspace!,
            repoSlug: args.repoSlug!,
            pullRequestId: args.pullRequestId!,
          };
      const diff = await getPullRequestDiff(
        client,
        parsed.workspace,
        parsed.repoSlug,
        parsed.pullRequestId,
      );
      return textResult({
        workspace: parsed.workspace,
        repoSlug: parsed.repoSlug,
        pullRequestId: parsed.pullRequestId,
        bytes: Buffer.byteLength(diff, "utf8"),
        diff,
      });
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  "bitbucket_get_pr_files",
  {
    title: "Get PR changed files",
    description: "Fetch diffstat (changed files) for a Bitbucket pull request.",
    inputSchema: {
      url: z.string().optional(),
      workspace: z.string().optional(),
      repoSlug: z.string().optional(),
      pullRequestId: z.number().int().positive().optional(),
    },
  },
  async (args) => {
    try {
      const { client } = getClient();
      const parsed = args.url
        ? parseBitbucketPrUrl(args.url)
        : {
            workspace: args.workspace!,
            repoSlug: args.repoSlug!,
            pullRequestId: args.pullRequestId!,
          };
      const files = await getPullRequestDiffstat(
        client,
        parsed.workspace,
        parsed.repoSlug,
        parsed.pullRequestId,
      );
      return textResult({ count: files.length, files });
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  "bitbucket_get_pr_commits",
  {
    title: "Get PR commits",
    description: "List commits included in a Bitbucket pull request.",
    inputSchema: {
      url: z.string().optional(),
      workspace: z.string().optional(),
      repoSlug: z.string().optional(),
      pullRequestId: z.number().int().positive().optional(),
    },
  },
  async (args) => {
    try {
      const { client } = getClient();
      const parsed = args.url
        ? parseBitbucketPrUrl(args.url)
        : {
            workspace: args.workspace!,
            repoSlug: args.repoSlug!,
            pullRequestId: args.pullRequestId!,
          };
      const commits = await getPullRequestCommits(
        client,
        parsed.workspace,
        parsed.repoSlug,
        parsed.pullRequestId,
      );
      return textResult({ count: commits.length, commits });
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  "bitbucket_get_pr_comments",
  {
    title: "Get PR comments",
    description: "List existing comments on a Bitbucket pull request.",
    inputSchema: {
      url: z.string().optional(),
      workspace: z.string().optional(),
      repoSlug: z.string().optional(),
      pullRequestId: z.number().int().positive().optional(),
    },
  },
  async (args) => {
    try {
      const { client } = getClient();
      const parsed = args.url
        ? parseBitbucketPrUrl(args.url)
        : {
            workspace: args.workspace!,
            repoSlug: args.repoSlug!,
            pullRequestId: args.pullRequestId!,
          };
      const comments = await listPullRequestComments(
        client,
        parsed.workspace,
        parsed.repoSlug,
        parsed.pullRequestId,
      );
      return textResult({ count: comments.length, comments });
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  "bitbucket_get_pr_activity",
  {
    title: "Get PR activity",
    description: "Fetch recent activity events for a Bitbucket pull request.",
    inputSchema: {
      url: z.string().optional(),
      workspace: z.string().optional(),
      repoSlug: z.string().optional(),
      pullRequestId: z.number().int().positive().optional(),
    },
  },
  async (args) => {
    try {
      const { client } = getClient();
      const parsed = args.url
        ? parseBitbucketPrUrl(args.url)
        : {
            workspace: args.workspace!,
            repoSlug: args.repoSlug!,
            pullRequestId: args.pullRequestId!,
          };
      const activity = await getPullRequestActivity(
        client,
        parsed.workspace,
        parsed.repoSlug,
        parsed.pullRequestId,
      );
      return textResult({ count: activity.length, activity });
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  "bitbucket_validate_comment_anchor",
  {
    title: "Validate inline comment anchor",
    description:
      "Validate that a file/line can be used as a Bitbucket inline comment anchor against the PR diff.",
    inputSchema: {
      url: z.string().optional(),
      workspace: z.string().optional(),
      repoSlug: z.string().optional(),
      pullRequestId: z.number().int().positive().optional(),
      path: z.string(),
      line: z.number().int().positive(),
      side: z.enum(["new", "old"]).default("new"),
    },
  },
  async (args) => {
    try {
      const { client } = getClient();
      const parsed = args.url
        ? parseBitbucketPrUrl(args.url)
        : {
            workspace: args.workspace!,
            repoSlug: args.repoSlug!,
            pullRequestId: args.pullRequestId!,
          };
      const diff = await getPullRequestDiff(
        client,
        parsed.workspace,
        parsed.repoSlug,
        parsed.pullRequestId,
      );
      const result = validateInlineAnchor(parseUnifiedDiff(diff), args.path, args.line, args.side);
      return textResult(result);
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  "bitbucket_post_inline_comment",
  {
    title: "Post inline PR comment",
    description:
      "Post an inline comment on a Bitbucket PR. Validates the anchor against the diff first. Never call without explicit user approval.",
    inputSchema: {
      url: z.string().optional(),
      workspace: z.string().optional(),
      repoSlug: z.string().optional(),
      pullRequestId: z.number().int().positive().optional(),
      content: z.string().min(1),
      path: z.string().min(1),
      line: z.number().int().positive(),
      side: z.enum(["new", "old"]).default("new"),
      skipDuplicateCheck: z.boolean().default(false),
      confirmed: z
        .boolean()
        .describe("Must be true. Confirms the user explicitly approved publishing this comment."),
    },
  },
  async (args) => {
    try {
      if (!args.confirmed) {
        return errorResult(new Error("Refusing to publish: confirmed=false. Ask the user for approval first."));
      }
      const { client } = getClient();
      const parsed = args.url
        ? parseBitbucketPrUrl(args.url)
        : {
            workspace: args.workspace!,
            repoSlug: args.repoSlug!,
            pullRequestId: args.pullRequestId!,
          };
      const diff = await getPullRequestDiff(
        client,
        parsed.workspace,
        parsed.repoSlug,
        parsed.pullRequestId,
      );
      const anchor = validateInlineAnchor(parseUnifiedDiff(diff), args.path, args.line, args.side);
      if (!anchor.ok || !anchor.inline) {
        return errorResult(new Error(anchor.reason || "Unanchorable line"));
      }

      if (!args.skipDuplicateCheck) {
        const existing = (await listPullRequestComments(
          client,
          parsed.workspace,
          parsed.repoSlug,
          parsed.pullRequestId,
        )) as Array<Record<string, unknown>>;
        const duplicate = findDuplicateComment(existing, args.content, anchor.inline);
        if (duplicate) {
          return textResult({ skipped: true, reason: "duplicate", existing: duplicate });
        }
      }

      const created = await createPullRequestComment(
        client,
        parsed.workspace,
        parsed.repoSlug,
        parsed.pullRequestId,
        { content: args.content, inline: anchor.inline },
      );
      return textResult({ published: true, comment: created });
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  "bitbucket_post_pr_summary",
  {
    title: "Post PR summary comment",
    description:
      "Post a general (non-inline) summary comment on a Bitbucket PR. Requires explicit user confirmation.",
    inputSchema: {
      url: z.string().optional(),
      workspace: z.string().optional(),
      repoSlug: z.string().optional(),
      pullRequestId: z.number().int().positive().optional(),
      content: z.string().min(1),
      confirmed: z.boolean(),
    },
  },
  async (args) => {
    try {
      if (!args.confirmed) {
        return errorResult(new Error("Refusing to publish summary: confirmed=false"));
      }
      const { client } = getClient();
      const parsed = args.url
        ? parseBitbucketPrUrl(args.url)
        : {
            workspace: args.workspace!,
            repoSlug: args.repoSlug!,
            pullRequestId: args.pullRequestId!,
          };
      const created = await createPullRequestComment(
        client,
        parsed.workspace,
        parsed.repoSlug,
        parsed.pullRequestId,
        { content: args.content },
      );
      return textResult({ published: true, comment: created });
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  "bitbucket_delete_comment",
  {
    title: "Delete PR comment",
    description: "Delete a Bitbucket PR comment by id. Use for cleanup of probe comments only with user approval.",
    inputSchema: {
      url: z.string().optional(),
      workspace: z.string().optional(),
      repoSlug: z.string().optional(),
      pullRequestId: z.number().int().positive().optional(),
      commentId: z.number().int().positive(),
      confirmed: z.boolean(),
    },
  },
  async (args) => {
    try {
      if (!args.confirmed) {
        return errorResult(new Error("Refusing to delete: confirmed=false"));
      }
      const { client } = getClient();
      const parsed = args.url
        ? parseBitbucketPrUrl(args.url)
        : {
            workspace: args.workspace!,
            repoSlug: args.repoSlug!,
            pullRequestId: args.pullRequestId!,
          };
      await deletePullRequestComment(
        client,
        parsed.workspace,
        parsed.repoSlug,
        parsed.pullRequestId,
        args.commentId,
      );
      return textResult({ deleted: true, commentId: args.commentId });
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  "bitbucket_publish_approved_findings",
  {
    title: "Publish approved review findings",
    description:
      "Publish selected validated findings as inline comments after user approval. Validates anchors and skips duplicates.",
    inputSchema: {
      url: z.string().optional(),
      workspace: z.string().optional(),
      repoSlug: z.string().optional(),
      pullRequestId: z.number().int().positive().optional(),
      findings: z.array(ReviewFindingSchema),
      approvedIds: z.array(z.string()),
      postSummary: z.boolean().default(false),
      summaryText: z.string().optional(),
      confirmed: z.boolean(),
    },
  },
  async (args) => {
    try {
      if (!args.confirmed) {
        return errorResult(new Error("Refusing to publish findings: confirmed=false"));
      }
      const { client } = getClient();
      const parsed = args.url
        ? parseBitbucketPrUrl(args.url)
        : {
            workspace: args.workspace!,
            repoSlug: args.repoSlug!,
            pullRequestId: args.pullRequestId!,
          };
      const result = await publishApprovedFindings(client, {
        workspace: parsed.workspace,
        repoSlug: parsed.repoSlug,
        pullRequestId: parsed.pullRequestId,
        findings: args.findings,
        approvedIds: args.approvedIds,
        postSummary: args.postSummary,
        summaryText: args.summaryText,
      });
      return textResult(result);
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  "bitbucket_resolve_local_repo",
  {
    title: "Resolve local repository",
    description:
      "Find whether a Bitbucket repo already exists under configured local roots (e.g. ASSET folder).",
    inputSchema: {
      workspace: z.string(),
      repoSlug: z.string(),
    },
  },
  async ({ workspace, repoSlug }) => {
    try {
      const { config } = getClient();
      const resolved = await resolveLocalRepository(config, workspace, repoSlug);
      return textResult(resolved);
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  "bitbucket_prepare_review_workspace",
  {
    title: "Prepare review workspace",
    description:
      "Resolve or clone the repository and fetch PR source/destination refs without disturbing the user's current branch. Uses git worktrees when possible.",
    inputSchema: {
      url: z.string().optional(),
      workspace: z.string().optional(),
      repoSlug: z.string().optional(),
      pullRequestId: z.number().int().positive().optional(),
      createWorktree: z.boolean().default(true),
    },
  },
  async (args) => {
    try {
      const { config, client } = getClient();
      const parsed = args.url
        ? parseBitbucketPrUrl(args.url)
        : {
            workspace: args.workspace!,
            repoSlug: args.repoSlug!,
            pullRequestId: args.pullRequestId!,
          };
      const pr = await getPullRequest(client, parsed.workspace, parsed.repoSlug, parsed.pullRequestId);
      const sourceBranch = pr.source?.branch?.name;
      const destBranch = pr.destination?.branch?.name;
      const sourceCommit = pr.source?.commit?.hash;
      const destCommit = pr.destination?.commit?.hash;

      let local = await resolveLocalRepository(config, parsed.workspace, parsed.repoSlug);
      let repoRoot = local.repoRoot;
      if (!repoRoot) {
        repoRoot = await ensureReviewClone(config, parsed.workspace, parsed.repoSlug);
        local = await resolveLocalRepository(config, parsed.workspace, parsed.repoSlug);
      }
      if (!repoRoot) {
        throw new Error("Failed to resolve a local repository root for review");
      }

      const statusBefore = await getWorkingTreeStatus(repoRoot);
      if (sourceBranch) {
        try {
          await fetchRefSafe(repoRoot, "origin", sourceBranch);
        } catch {
          // source branch may already be deleted after merge; commit fetch below still helps
        }
      }
      if (destBranch) {
        try {
          await fetchRefSafe(repoRoot, "origin", destBranch);
        } catch {
          // ignore
        }
      }

      let worktreePath: string | undefined;
      if (args.createWorktree && sourceCommit) {
        worktreePath = join(
          config.reviewWorkspace,
          "worktrees",
          parsed.workspace,
          parsed.repoSlug,
          `pr-${parsed.pullRequestId}`,
        );
        worktreePath = await ensureWorktree(repoRoot, worktreePath, sourceCommit);
      }

      const statusAfter = await getWorkingTreeStatus(repoRoot);
      return textResult({
        workspace: parsed.workspace,
        repoSlug: parsed.repoSlug,
        pullRequestId: parsed.pullRequestId,
        title: pr.title,
        state: pr.state,
        sourceBranch,
        destBranch,
        sourceCommit,
        destCommit,
        repoRoot,
        worktreePath,
        workingTreeUntouched: statusBefore.porcelain === statusAfter.porcelain,
        dirty: statusAfter.dirty,
        shallow: local.shallow ?? false,
      });
    } catch (error) {
      return errorResult(error);
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(redactSecrets(error instanceof Error ? error.message : String(error)));
  process.exit(1);
});
