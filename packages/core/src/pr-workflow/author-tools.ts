import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFile } from "node:fs/promises";
import { compareOriginBranches } from "./compare.js";
import { runGit } from "./run.js";
import { isAppError, redactSecrets } from "../errors.js";
import { prTemplatePath, runBashScript } from "./run-script.js";

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
              { error: true, code: error.code, message: error.message, details: error.details },
              null,
              2,
            ),
          ),
        },
      ],
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { isError: true, content: [{ type: "text" as const, text: redactSecrets(message) }] };
}

const PrSelectorSchema = {
  url: z.string().optional().describe("Bitbucket or GitHub PR URL (/diff is fine)"),
  pr: z.number().int().positive().optional().describe("PR number on origin"),
  head: z.string().optional().describe("Source branch"),
  base: z.string().optional().describe("Destination branch; use with head for an exact open PR"),
};

function buildSelectorArgs(args: {
  url?: string;
  pr?: number;
  head?: string;
  base?: string;
}): string[] {
  const out: string[] = [];
  if (args.url) out.push("--url", args.url);
  else if (args.pr) out.push("--pr", String(args.pr));
  else {
    if (args.head) out.push("--head", args.head);
    if (args.base) out.push("--base", args.base);
  }
  return out;
}

export type RegisterAuthorPrToolsOptions = {
  /** e.g. bitbucket_ or github_ */
  toolPrefix: string;
  /** Shown in tool descriptions */
  hostLabel: string;
};

/** Register author-mode PR tools (list/reply/publish/compare). Shared by provider MCP servers. */
export function registerAuthorPrTools(server: McpServer, options: RegisterAuthorPrToolsOptions): void {
  const { toolPrefix: p, hostLabel } = options;
  const hostNote = `${hostLabel} repos (detected from origin in repoRoot).`;

  server.registerTool(
    `${p}pr_get_description_template`,
    {
      title: "PR description template",
      description: "Return the markdown template used for pull request descriptions (PR_TEMPLATE.md).",
      inputSchema: {},
    },
    async () => {
      try {
        const template = await readFile(prTemplatePath, "utf8");
        return textResult({ templatePath: prTemplatePath, template });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    `${p}pr_branch_compare`,
    {
      title: "Compare origin branches for PR description",
      description: `Fetch origin, then return commits, diff stat, and full diff for origin/<base>...origin/<head>. ${hostNote}`,
      inputSchema: {
        repoRoot: z.string().describe("Absolute path to the git repository root"),
        head: z.string().describe("Source branch name"),
        base: z.string().describe("Target branch name"),
        remote: z.string().default("origin"),
        fetch: z.boolean().default(true),
        maxDiffBytes: z.number().int().positive().optional(),
      },
    },
    async (args) => {
      try {
        return textResult(await compareOriginBranches(args));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    `${p}pr_push_head`,
    {
      title: "Push head branch to origin",
      description: "Push the source branch to origin when local is ahead or the remote branch is missing. Requires confirmed=true.",
      inputSchema: {
        repoRoot: z.string(),
        head: z.string(),
        remote: z.string().default("origin"),
        confirmed: z.boolean().describe("Must be true. User approved the push."),
      },
    },
    async (args) => {
      try {
        if (!args.confirmed) {
          return errorResult(new Error("Refusing to push: confirmed=false"));
        }
        const out = await runGit(args.repoRoot, ["push", "-u", args.remote, args.head]);
        return textResult({ pushed: true, output: out });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    `${p}pr_list_comments`,
    {
      title: "List pull request review comments",
      description: `List open PR comments with serial numbers (#1, #2, …). ${hostNote}`,
      inputSchema: {
        repoRoot: z.string().describe("Absolute path to the git repository root"),
        ...PrSelectorSchema,
        includeResolved: z.boolean().default(false),
        serial: z.number().int().positive().optional().describe("Return only comment id for open serial #N"),
      },
    },
    async (args) => {
      try {
        const scriptArgs = [...buildSelectorArgs(args)];
        if (args.includeResolved) scriptArgs.push("--include-resolved");
        if (args.serial) scriptArgs.push("--serial", String(args.serial));
        return textResult(await runBashScript(args.repoRoot, "pull-pr-comments.sh", scriptArgs));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    `${p}pr_reply_comment`,
    {
      title: "Reply to a PR comment (and optionally resolve)",
      description: `Post one ASD-STE100 reply. Use serial from ${p}pr_list_comments. Requires confirmed=true.`,
      inputSchema: {
        repoRoot: z.string(),
        ...PrSelectorSchema,
        commentId: z.number().int().positive().optional(),
        serial: z.number().int().positive().optional(),
        body: z.string().optional(),
        resolve: z.boolean().default(false),
        resolveOnly: z.boolean().default(false),
        allowResolved: z.boolean().default(false),
        dryRun: z.boolean().default(false),
        confirmed: z.boolean().describe("Must be true to post or resolve (except dryRun)."),
      },
    },
    async (args) => {
      const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
      const { join } = await import("node:path");
      const { tmpdir } = await import("node:os");
      let workDir: string | undefined;
      try {
        if (!args.dryRun && !args.confirmed) {
          return errorResult(new Error("Refusing to reply: confirmed=false"));
        }
        if (args.commentId && args.serial) {
          return errorResult(new Error("Pass commentId or serial, not both"));
        }
        if (!args.commentId && !args.serial) {
          return errorResult(new Error("Pass commentId or serial"));
        }
        const scriptArgs = [...buildSelectorArgs(args)];
        if (args.commentId) scriptArgs.push("--comment", String(args.commentId));
        if (args.serial) scriptArgs.push("--serial", String(args.serial));
        if (args.resolve) scriptArgs.push("--resolve");
        if (args.resolveOnly) scriptArgs.push("--resolve-only");
        if (args.allowResolved) scriptArgs.push("--allow-resolved");
        if (args.dryRun) scriptArgs.push("--dry-run");
        if (!args.resolveOnly && !args.body) {
          return errorResult(new Error("body is required unless resolveOnly=true"));
        }
        if (args.body) {
          workDir = await mkdtemp(join(tmpdir(), "omnidev-pr-reply-"));
          const bodyFile = join(workDir, "body.txt");
          await writeFile(bodyFile, args.body, "utf8");
          scriptArgs.push("--body-file", bodyFile);
        }
        return textResult(await runBashScript(args.repoRoot, "reply-pr-comment.sh", scriptArgs));
      } catch (error) {
        return errorResult(error);
      } finally {
        if (workDir) await rm(workDir, { recursive: true, force: true });
      }
    },
  );

  server.registerTool(
    `${p}pr_publish_description`,
    {
      title: "Create or update pull request description",
      description: `Create or update PR body (ASD-STE100). ${hostNote} Requires confirmed=true.`,
      inputSchema: {
        repoRoot: z.string(),
        head: z.string().optional().describe("Source branch; default current branch in repo"),
        base: z.string().optional().describe("Required when creating a new PR"),
        title: z.string().optional().describe("Required when creating a new PR"),
        description: z.string().min(1).describe("Full markdown PR body"),
        create: z.boolean().default(true).describe("Create PR when none is open for head->base"),
        updateTitle: z.boolean().default(false),
        url: z.string().optional(),
        pr: z.number().int().positive().optional(),
        dryRun: z.boolean().default(false),
        confirmed: z.boolean().describe("Must be true to create or update (except dryRun)."),
      },
    },
    async (args) => {
      try {
        if (!args.dryRun && !args.confirmed) {
          return errorResult(new Error("Refusing to publish: confirmed=false"));
        }
        const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
        const { join } = await import("node:path");
        const { tmpdir } = await import("node:os");
        const dir = await mkdtemp(join(tmpdir(), "omnidev-pr-body-"));
        const bodyFile = join(dir, "body.md");
        try {
          await writeFile(bodyFile, args.description, "utf8");
          const scriptArgs: string[] = ["--body-file", bodyFile];
          if (args.url) scriptArgs.push("--url", args.url);
          if (args.pr) scriptArgs.push("--pr", String(args.pr));
          if (args.head) scriptArgs.push("--head", args.head);
          if (args.base) scriptArgs.push("--base", args.base);
          if (args.title) scriptArgs.push("--title", args.title);
          if (args.create) scriptArgs.push("--create");
          if (args.updateTitle) scriptArgs.push("--update-title");
          if (args.dryRun) scriptArgs.push("--dry-run");
          return textResult(await runBashScript(args.repoRoot, "publish-pr-description.sh", scriptArgs));
        } finally {
          await rm(dir, { recursive: true, force: true });
        }
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
