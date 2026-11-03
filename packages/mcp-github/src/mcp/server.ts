#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAuthorPrTools } from "@omnidev/core/pr-workflow/author-tools.js";
import { redactSecrets } from "@omnidev/core/errors.js";

const server = new McpServer({
  name: "omnidev-github",
  version: "0.1.0",
});

registerAuthorPrTools(server, { toolPrefix: "github_", hostLabel: "GitHub" });

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(redactSecrets(error instanceof Error ? error.message : String(error)));
  process.exit(1);
});
