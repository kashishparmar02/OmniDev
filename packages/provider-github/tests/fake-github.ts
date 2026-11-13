// A small in-memory imitation of GitHub's REST and GraphQL APIs, used as the
// `fetch` of a GitHubProvider in tests.
//
// It keeps real state, so that a comment posted through the provider can be
// listed back, and it mimics the parts of GitHub that shape the provider:
// general comments and review threads live in separate stores, review threads
// are only reachable through GraphQL, and GraphQL reports errors with HTTP 200.

import type { FetchLike } from "@omnidev/core";

type Json = Record<string, unknown>;
interface Thread extends Json {
  id: string;
  isResolved: boolean;
  comments: { nodes: Json[] };
}

export const API_URL = "https://api.github.test";
const REPO_PATH = "/repos/acme/sample-app";
const THREADS_PER_PAGE = 2;

export const SAMPLE_DIFF = [
  "diff --git a/src/cart.ts b/src/cart.ts",
  "--- a/src/cart.ts",
  "+++ b/src/cart.ts",
  "@@ -10,2 +10,3 @@",
  " export function total(cart: Cart) {",
  "+  if (cart.items.length === 0) return 0;",
  "   return cart.items.reduce(sum, 0);",
].join("\n");

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const notFound = () => json(404, { message: "Not Found" });
const graphqlNotFound = (id: unknown) =>
  json(200, {
    data: null,
    errors: [
      { type: "NOT_FOUND", message: `Could not resolve to a node with the global id of '${id}'` },
    ],
  });

export function createFakeGitHub() {
  const requests: Array<{ method: string; url: string; headers: Record<string, string> }> = [];
  const pulls = new Map<number, Json>();
  const issueComments = new Map<number, Json[]>();
  const threads = new Map<number, Thread[]>();
  let nextNumber = 7;
  let nextId = 100;
  let clock = Date.parse("2026-01-01T00:00:00Z");
  const now = () => new Date((clock += 1000)).toISOString();

  function addPull(fields: { title: string; body: string; head: string; base: string }): Json {
    const number = nextNumber++;
    const pull: Json = {
      number,
      title: fields.title,
      body: fields.body,
      state: "open",
      merged_at: null,
      user: { login: "sam" },
      head: { ref: fields.head, sha: `c0ffee${number}` },
      base: { ref: fields.base },
      html_url: `https://github.test/acme/sample-app/pull/${number}`,
    };
    pulls.set(number, pull);
    issueComments.set(number, []);
    threads.set(number, []);
    return pull;
  }

  /** Adds a general comment directly, for tests that need many of them. */
  function addIssueComment(number: number, body: string): Json {
    const comment = { id: nextId++, body, user: { login: "sam" }, created_at: now() };
    issueComments.get(number)!.push(comment);
    return comment;
  }

  function newThreadComment(body: string): Json {
    return { databaseId: nextId++, author: { login: "sam" }, body, createdAt: now() };
  }

  function findThread(id: unknown): Thread | undefined {
    return [...threads.values()].flat().find((thread) => thread.id === id);
  }

  function graphql(query: string, variables: Json): Response {
    if (query.includes("reviewThreads")) {
      const list = threads.get(Number(variables.number));
      if (!list) return json(200, { data: { repository: { pullRequest: null } } });
      const start = Number(variables.after ?? 0);
      const end = start + THREADS_PER_PAGE;
      return json(200, {
        data: {
          repository: {
            pullRequest: {
              reviewThreads: {
                pageInfo: { hasNextPage: end < list.length, endCursor: String(end) },
                nodes: list.slice(start, end),
              },
            },
          },
        },
      });
    }

    const thread = findThread(variables.threadId);
    if (!thread) return graphqlNotFound(variables.threadId);
    if (query.includes("addPullRequestReviewThreadReply")) {
      const comment = newThreadComment(String(variables.body));
      thread.comments.nodes.push(comment);
      return json(200, { data: { addPullRequestReviewThreadReply: { comment } } });
    }
    // "unresolveReviewThread" contains "resolveReviewThread", so test it first.
    thread.isResolved = !query.includes("unresolveReviewThread");
    return json(200, { data: {} });
  }

  addPull({ title: "Handle empty cart", body: "Avoids a crash.", head: "fix/cart", base: "main" });

  const send: FetchLike = async (url, init) => {
    const { pathname, searchParams } = new URL(url);
    const method = init.method ?? "GET";
    const headers = { ...(init.headers as Record<string, string>) };
    requests.push({ method, url, headers });
    const body = init.body ? (JSON.parse(String(init.body)) as Json) : {};

    if (pathname === "/graphql") {
      if (!headers.Authorization) return json(401, { message: "Requires authentication" });
      return graphql(String(body.query), body.variables as Json);
    }

    const route = /^\/(pulls|issues)(?:\/(\d+)(\/comments)?)?$/.exec(
      pathname.startsWith(REPO_PATH) ? pathname.slice(REPO_PATH.length) : "",
    );
    if (!route) return notFound();
    const [, kind, numberText, isComments] = route;

    if (!numberText) {
      if (kind !== "pulls" || method !== "POST") return notFound();
      if (body.head === "no-such-branch") return json(422, { message: "Validation Failed" });
      return json(
        201,
        addPull(body as { title: string; body: string; head: string; base: string }),
      );
    }

    const number = Number(numberText);
    const pull = pulls.get(number);
    if (!pull) return notFound();

    if (kind === "issues") {
      if (!isComments) return notFound();
      if (method === "POST") return json(201, addIssueComment(number, String(body.body)));
      const perPage = Number(searchParams.get("per_page") ?? "30");
      const start = (Number(searchParams.get("page") ?? "1") - 1) * perPage;
      return json(200, issueComments.get(number)!.slice(start, start + perPage));
    }

    if (isComments) {
      // Creating a review comment starts a new thread, visible only via GraphQL.
      if (body.commit_id !== (pull.head as { sha: string }).sha) {
        return json(422, { message: "commit_id is not part of the pull request" });
      }
      const comment = newThreadComment(String(body.body));
      threads.get(number)!.push({
        id: `PRRT_${nextId++}`,
        isResolved: false,
        path: body.path,
        line: body.line,
        originalLine: body.line,
        diffSide: body.side,
        comments: { nodes: [comment] },
      });
      return json(201, { id: comment.databaseId });
    }

    if (method === "PATCH") Object.assign(pull, body);
    if (headers.Accept === "application/vnd.github.diff") {
      return new Response(SAMPLE_DIFF, { status: 200 });
    }
    return json(200, pull);
  };

  return { fetch: send, requests, addIssueComment };
}
