#!/usr/bin/env node
import { loadConfig } from "./utils/config.js";
import { BitbucketClient } from "./bitbucket/client.js";
import { parseBitbucketPrUrl } from "./bitbucket/url.js";
import {
  getCurrentUser,
  getPullRequest,
  getPullRequestDiff,
  getPullRequestDiffstat,
} from "./bitbucket/pull-request.js";
import { listPullRequestComments } from "./bitbucket/comments.js";
import { resolveLocalRepository } from "./repository/resolver.js";
import { redactSecrets, isAppError } from "./utils/errors.js";

async function cmdAuth() {
  const config = loadConfig();
  const client = new BitbucketClient(config);
  const user = await getCurrentUser(client);
  console.log(
    JSON.stringify(
      {
        ok: true,
        username: user.username,
        display_name: user.display_name,
        account_id: user.account_id,
        workspaceDefault: config.workspace,
      },
      null,
      2,
    ),
  );
}

async function cmdPr(url: string) {
  const config = loadConfig();
  const client = new BitbucketClient(config);
  const parsed = parseBitbucketPrUrl(url);
  const pr = await getPullRequest(client, parsed.workspace, parsed.repoSlug, parsed.pullRequestId);
  const files = await getPullRequestDiffstat(
    client,
    parsed.workspace,
    parsed.repoSlug,
    parsed.pullRequestId,
  );
  const diff = await getPullRequestDiff(
    client,
    parsed.workspace,
    parsed.repoSlug,
    parsed.pullRequestId,
  );
  const comments = await listPullRequestComments(
    client,
    parsed.workspace,
    parsed.repoSlug,
    parsed.pullRequestId,
  );
  const local = await resolveLocalRepository(config, parsed.workspace, parsed.repoSlug);
  console.log(
    JSON.stringify(
      {
        ok: true,
        parsed,
        pr: {
          id: pr.id,
          title: pr.title,
          state: pr.state,
          source: pr.source?.branch?.name,
          destination: pr.destination?.branch?.name,
          sourceCommit: pr.source?.commit?.hash,
          destCommit: pr.destination?.commit?.hash,
        },
        files: files.length,
        diffBytes: Buffer.byteLength(diff, "utf8"),
        comments: comments.length,
        localRepo: local,
      },
      null,
      2,
    ),
  );
}

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  if (!cmd || cmd === "help" || cmd === "--help") {
    console.log(`Usage:
  npm run check:auth
  npm run check:pr -- <bitbucket-pr-url>
  npm run cli -- auth
  npm run cli -- pr <url>`);
    process.exit(0);
  }
  if (cmd === "auth") {
    await cmdAuth();
    return;
  }
  if (cmd === "pr") {
    if (!arg) throw new Error("PR URL required");
    await cmdPr(arg);
    return;
  }
  throw new Error(`Unknown command: ${cmd}`);
}

main().catch((error) => {
  const message = isAppError(error)
    ? `${error.code}: ${error.message}`
    : error instanceof Error
      ? error.message
      : String(error);
  console.error(redactSecrets(message));
  process.exit(1);
});
