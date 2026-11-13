import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Starts the built server as a real child process and talks to it over the
// MCP protocol, the same way an editor does. No call here reaches a network.

const client = new Client({ name: "omnidev-test", version: "0.0.0" });

beforeAll(async () => {
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [fileURLToPath(new URL("../dist/main.js", import.meta.url))],
    }),
  );
});

afterAll(async () => {
  await client.close();
});

describe("the server process", () => {
  it("offers the pull request tools with their input schemas", async () => {
    const { tools } = await client.listTools();

    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "pr_comment",
      "pr_create",
      "pr_get",
      "pr_get_diff",
      "pr_list_threads",
      "pr_prepare_workspace",
      "pr_publish_findings",
      "pr_reply",
      "pr_set_resolved",
      "pr_update",
    ]);
    const comment = tools.find((tool) => tool.name === "pr_comment");
    expect(comment?.inputSchema.required).toEqual(["url", "body", "confirmed"]);
  });

  it("returns a tool failure as an error result, not a protocol error", async () => {
    const result = await client.callTool({
      name: "pr_get",
      arguments: { url: "https://example.com/not-a-pull-request" },
    });

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      {
        type: "text",
        text: "example.com is not a supported host. Use bitbucket.org or github.com.",
      },
    ]);
  });

  it("refuses an unconfirmed change before contacting any host", async () => {
    const result = await client.callTool({
      name: "pr_comment",
      arguments: {
        url: "https://github.com/acme/sample-app/pull/7",
        body: "hello",
        confirmed: false,
      },
    });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("pr_comment was not run");
  });
});
