#!/usr/bin/env node
/**
 * Print absolute paths for Cursor mcp.json (after npm install from repo root).
 */
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function resolveBin(name) {
  const hoisted = join(root, "node_modules", ".bin", name);
  if (existsSync(hoisted)) return hoisted;
  return null;
}

const bitbucketBin = resolveBin("omnidev-bitbucket-mcp");
const githubBin = resolveBin("omnidev-github-mcp");

const bitbucketSh = join(root, "packages/mcp-bitbucket/bin/run-mcp.sh");
const githubSh = join(root, "packages/mcp-github/bin/run-mcp.sh");

// Prefer package run-mcp.sh (stable when workspace symlinks resolve under node_modules).
const bitbucketCommand = bitbucketSh;
const githubCommand = githubSh;

console.log("OmniDev MCP — use in ~/.cursor/mcp.json\n");
console.log("Run from repo root (stdio MCP, for debugging):");
console.log("  npm run mcp:bitbucket");
console.log("  npm run mcp:github\n");

console.log("Cursor mcp.json snippet (set BITBUCKET_* in env or use packages/mcp-bitbucket/.env):\n");
console.log(
  JSON.stringify(
    {
      mcpServers: {
        "bitbucket-pr-review": {
          command: bitbucketCommand,
          env: {
            BITBUCKET_EMAIL: "you@ei.study",
            BITBUCKET_API_TOKEN: "ATATT...",
          },
        },
        "omnidev-github": {
          command: githubCommand,
        },
      },
    },
    null,
    2,
  ),
);
