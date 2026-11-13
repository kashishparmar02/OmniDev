#!/usr/bin/env node
// Entry point of the OmniDev MCP server.
//
// An MCP client such as Cursor or Claude Code starts this process and talks
// to it over standard input and output. This file only wires things together:
// it reads the configuration, builds one provider per host and registers the
// tools from tools.ts.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { redactSecrets } from "@omnidev/core";
import { BitbucketProvider } from "@omnidev/provider-bitbucket";
import { GitHubProvider } from "@omnidev/provider-github";
import { loadConfig } from "./config.js";
import { createTools, runTool } from "./tools.js";
import { prepareWorkspace } from "./workspace.js";

const config = loadConfig(process.env);

const tools = createTools({
  providers: {
    bitbucket: new BitbucketProvider(config.bitbucket),
    github: new GitHubProvider(config.github),
  },
  prepareWorkspace: (host, pullRequest) => prepareWorkspace(config, host, pullRequest),
});

const server = new McpServer({ name: "omnidev", version: "0.0.0" });

for (const tool of tools) {
  server.registerTool(
    tool.name,
    { description: tool.description, inputSchema: tool.input },
    async (args: unknown) => {
      const result = await runTool(tool, args);
      return { content: [{ type: "text" as const, text: result.text }], isError: result.isError };
    },
  );
}

try {
  await server.connect(new StdioServerTransport());
} catch (error) {
  // Standard output carries the protocol, so problems are reported on stderr.
  console.error(redactSecrets(error instanceof Error ? error.message : String(error)));
  process.exit(1);
}
