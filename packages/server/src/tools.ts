// The tools OmniDev offers to a coding agent.
//
// Every tool is a thin wrapper: it validates its input, picks the provider
// for the URL it was given and calls one function from @omnidev/core. Review
// judgement lives in the playbooks under skills/, not here.
//
// Tools that change something on the host are declared with `changesHost`.
// defineTool gives each of those a `confirmed` input and refuses to run until
// it is true, so the approval rule is enforced in one place and cannot be
// forgotten when a tool is added.

import {
  ProviderError,
  publishFindings,
  redactSecrets,
  type ICodeHostProvider,
  type PullRequest,
} from "@omnidev/core";
import { z } from "zod";
import { parsePullRequestUrl, parseRepoUrl, type Host } from "./pr-url.js";
import type { Workspace } from "./workspace.js";

export interface ToolDependencies {
  providers: Record<Host, ICodeHostProvider>;
  prepareWorkspace(host: Host, pullRequest: PullRequest): Promise<Workspace>;
}

export interface Tool {
  name: string;
  description: string;
  /** Zod shape of the input, in the form the MCP SDK registers. */
  input: z.ZodRawShape;
  /** Validates the raw arguments and runs the tool. */
  run(args: unknown): Promise<unknown>;
}

export interface ToolResult {
  isError: boolean;
  text: string;
}

class ApprovalRequiredError extends Error {}

const CONFIRMED_DESCRIPTION =
  "Set to true only after the user has seen exactly what will be changed and approved it.";

function defineTool<Shape extends z.ZodRawShape>(definition: {
  name: string;
  description: string;
  changesHost?: boolean;
  input: Shape;
  run(args: z.infer<z.ZodObject<Shape>>): Promise<unknown>;
}): Tool {
  const input: z.ZodRawShape = definition.changesHost
    ? { ...definition.input, confirmed: z.boolean().describe(CONFIRMED_DESCRIPTION) }
    : definition.input;
  return {
    name: definition.name,
    description: definition.changesHost
      ? `${definition.description} Changes the pull request, so it requires confirmed=true.`
      : definition.description,
    input,
    async run(args) {
      const parsed = z.object(input).parse(args) as z.infer<z.ZodObject<Shape>> & {
        confirmed?: boolean;
      };
      if (definition.changesHost && parsed.confirmed !== true) {
        throw new ApprovalRequiredError(
          `${definition.name} was not run. Show the user exactly what will be changed, and call ` +
            "it again with confirmed=true only after they approve.",
        );
      }
      return definition.run(parsed);
    },
  };
}

const prUrl = z
  .string()
  .describe("Pull request URL on bitbucket.org or github.com, copied from the browser.");

export function createTools({ providers, prepareWorkspace }: ToolDependencies): Tool[] {
  const target = (url: string) => {
    const { host, ref } = parsePullRequestUrl(url);
    return { host, ref, provider: providers[host] };
  };

  return [
    defineTool({
      name: "pr_get",
      description: "Get a pull request's title, description, state, branches and head commit.",
      input: { url: prUrl },
      async run({ url }) {
        const { provider, ref } = target(url);
        return provider.getPullRequest(ref);
      },
    }),

    defineTool({
      name: "pr_get_diff",
      description: "Get the pull request's changes as a unified diff.",
      input: { url: prUrl },
      async run({ url }) {
        const { provider, ref } = target(url);
        return provider.getDiff(ref);
      },
    }),

    defineTool({
      name: "pr_list_threads",
      description:
        "List the comment threads on a pull request, oldest first. A thread with an anchor is " +
        "attached to a line of the diff; one without is a general comment.",
      input: {
        url: prUrl,
        unresolvedOnly: z.boolean().default(false).describe("Leave out resolved threads."),
      },
      async run({ url, unresolvedOnly }) {
        const { provider, ref } = target(url);
        const threads = await provider.listThreads(ref);
        return unresolvedOnly ? threads.filter((thread) => !thread.resolved) : threads;
      },
    }),

    defineTool({
      name: "pr_prepare_workspace",
      description:
        "Check out the pull request's head commit into a separate folder and return its path, " +
        "so the surrounding code can be read. The user's own checkout is not touched.",
      input: { url: prUrl },
      async run({ url }) {
        const { provider, ref, host } = target(url);
        return prepareWorkspace(host, await provider.getPullRequest(ref));
      },
    }),

    defineTool({
      name: "pr_publish_findings",
      description:
        "Post review findings as inline comments. A finding on a line the diff does not show, " +
        "or one already posted, is skipped and reported, so the call is safe to repeat.",
      changesHost: true,
      input: {
        url: prUrl,
        findings: z
          .array(
            z.object({
              id: z.string().describe("Your own label for the finding, echoed in the result."),
              body: z.string().min(1).describe("Comment text exactly as it should appear."),
              path: z.string().describe("File path as shown in the diff."),
              line: z.number().int().positive(),
              side: z
                .enum(["new", "old"])
                .default("new")
                .describe('"new" for an added or unchanged line, "old" for a removed line.'),
            }),
          )
          .min(1),
      },
      async run({ url, findings }) {
        const { provider, ref } = target(url);
        return publishFindings(
          provider,
          ref,
          findings.map(({ id, body, ...anchor }) => ({ id, body, anchor })),
        );
      },
    }),

    defineTool({
      name: "pr_comment",
      description: "Post a general comment on the pull request, for example a review summary.",
      changesHost: true,
      input: { url: prUrl, body: z.string().min(1) },
      async run({ url, body }) {
        const { provider, ref } = target(url);
        return provider.createThread(ref, { body });
      },
    }),

    defineTool({
      name: "pr_reply",
      description:
        "Reply to a thread, and optionally resolve it in the same call. Use the thread id from " +
        "pr_list_threads.",
      changesHost: true,
      input: {
        url: prUrl,
        threadId: z.string(),
        body: z.string().min(1),
        resolve: z.boolean().default(false).describe("Resolve the thread after replying."),
      },
      async run({ url, threadId, body, resolve }) {
        const { provider, ref } = target(url);
        const reply = await provider.replyToThread(ref, threadId, body);
        if (resolve) await provider.setThreadResolved(ref, threadId, true);
        return { reply, resolved: resolve };
      },
    }),

    defineTool({
      name: "pr_set_resolved",
      description: "Resolve or reopen a thread without replying.",
      changesHost: true,
      input: { url: prUrl, threadId: z.string(), resolved: z.boolean() },
      async run({ url, threadId, resolved }) {
        const { provider, ref } = target(url);
        await provider.setThreadResolved(ref, threadId, resolved);
        return { threadId, resolved };
      },
    }),

    defineTool({
      name: "pr_update",
      description: "Change a pull request's title, description or both.",
      changesHost: true,
      input: {
        url: prUrl,
        title: z.string().min(1).optional(),
        description: z.string().optional(),
      },
      async run({ url, title, description }) {
        if (title === undefined && description === undefined) {
          throw new Error("Give a title, a description or both.");
        }
        const { provider, ref } = target(url);
        return provider.updatePullRequest(ref, {
          ...(title !== undefined ? { title } : {}),
          ...(description !== undefined ? { description } : {}),
        });
      },
    }),

    defineTool({
      name: "pr_create",
      description: "Open a pull request. The source branch must already be pushed to the host.",
      changesHost: true,
      input: {
        repoUrl: z.string().describe("Repository URL on bitbucket.org or github.com."),
        sourceBranch: z.string().min(1),
        targetBranch: z.string().min(1),
        title: z.string().min(1),
        description: z.string(),
      },
      async run({ repoUrl, ...pullRequest }) {
        const { host, repo } = parseRepoUrl(repoUrl);
        return providers[host].createPullRequest(repo, pullRequest);
      },
    }),
  ];
}

/**
 * Runs a tool and turns its result or its failure into text for the agent.
 *
 * Every failure becomes a message the agent can act on, and everything
 * returned passes through secret redaction, because a tool result goes
 * straight into a model's context.
 */
export async function runTool(tool: Tool, args: unknown): Promise<ToolResult> {
  try {
    const result = await tool.run(args);
    const text = typeof result === "string" ? result : JSON.stringify(result, null, 2);
    return { isError: false, text: redactSecrets(text) };
  } catch (error) {
    let text: string;
    if (error instanceof ProviderError) text = `${error.code}: ${error.message}`;
    else if (error instanceof z.ZodError) text = `Invalid input: ${z.prettifyError(error)}`;
    else text = error instanceof Error ? error.message : String(error);
    return { isError: true, text: redactSecrets(text) };
  }
}
