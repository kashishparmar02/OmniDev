// A small in-memory imitation of the Bitbucket Cloud REST API, used as the
// `fetch` of a BitbucketProvider in tests.
//
// It keeps real state, so that a comment posted through the provider can be
// listed back, and it mimics the awkward parts of the real API on purpose:
// tiny pages, replies that point at their parent, a 409 for a repeated
// resolve, and deleted comments that still appear in listings.

import type { FetchLike } from "@omnidev/core";

type Json = Record<string, unknown>;

export const BASE_URL = "https://api.bitbucket.test/2.0";
const REPO_PATH = "/2.0/repositories/acme/sample-app";
const PAGE_SIZE = 2;

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

const notFound = () => json(404, { type: "error", error: { message: "Not found" } });

export function createFakeBitbucket() {
  const requests: Array<{ method: string; url: string; headers: Record<string, string> }> = [];
  const pullRequests = new Map<number, Json>();
  const comments = new Map<number, Json[]>();
  let nextPullRequestId = 7;
  let nextCommentId = 100;
  let clock = Date.parse("2026-01-01T00:00:00Z");

  function addPullRequest(fields: { title: string; description: string; source: string }): Json {
    const id = nextPullRequestId++;
    const pullRequest: Json = {
      id,
      title: fields.title,
      description: fields.description,
      state: "OPEN",
      author: { display_name: "Sam Doe" },
      source: { branch: { name: fields.source }, commit: { hash: `c0ffee${id}` } },
      destination: { branch: { name: "main" } },
      links: { html: { href: `https://bitbucket.test/acme/sample-app/pull-requests/${id}` } },
    };
    pullRequests.set(id, pullRequest);
    comments.set(id, []);
    return pullRequest;
  }

  /** Adds a comment directly, for tests that need data the provider cannot create. */
  function addComment(pullRequestId: number, fields: Json): Json {
    clock += 1000;
    const comment: Json = {
      id: nextCommentId++,
      content: { raw: "" },
      user: { display_name: "Sam Doe" },
      created_on: new Date(clock).toISOString(),
      ...fields,
    };
    comments.get(pullRequestId)!.push(comment);
    return comment;
  }

  addPullRequest({
    title: "Handle empty cart",
    description: "Avoids a crash.",
    source: "fix/cart",
  });

  const send: FetchLike = async (url, init) => {
    const { pathname, searchParams } = new URL(url);
    const method = init.method ?? "GET";
    requests.push({ method, url, headers: { ...(init.headers as Record<string, string>) } });
    const body = init.body ? (JSON.parse(String(init.body)) as Json) : {};

    const route = /^\/pullrequests(?:\/(\d+)(\/diff|\/comments(?:\/(\d+)(\/resolve)?)?)?)?$/.exec(
      pathname.startsWith(REPO_PATH) ? pathname.slice(REPO_PATH.length) : "",
    );
    if (!route) return notFound();
    const [, idText, rest, commentIdText, resolve] = route;

    if (!idText) {
      if (method !== "POST") return notFound();
      const source = (body.source as { branch: { name: string } }).branch.name;
      if (source === "no-such-branch") {
        return json(400, { type: "error", error: { message: "source branch not found" } });
      }
      const { title, description } = body as { title: string; description: string };
      return json(201, addPullRequest({ title, description, source }));
    }

    const id = Number(idText);
    const pullRequest = pullRequests.get(id);
    if (!pullRequest) return notFound();
    const list = comments.get(id)!;

    if (!rest) {
      if (method === "PUT") {
        // Like the real API, an update without a title is refused.
        if (typeof body.title !== "string") return json(400, { error: { message: "title" } });
        Object.assign(pullRequest, body);
      }
      return json(200, pullRequest);
    }
    if (rest === "/diff") return new Response(SAMPLE_DIFF, { status: 200 });

    if (!commentIdText) {
      if (method === "POST") {
        const parent = body.parent as { id: number } | undefined;
        if (parent && !list.some((comment) => comment.id === parent.id)) return notFound();
        return json(201, addComment(id, body));
      }
      const page = Number(searchParams.get("page") ?? "1");
      const start = (page - 1) * PAGE_SIZE;
      const hasMore = start + PAGE_SIZE < list.length;
      return json(200, {
        values: list.slice(start, start + PAGE_SIZE),
        ...(hasMore ? { next: `${BASE_URL}${pathname.slice(4)}?page=${page + 1}` } : {}),
      });
    }

    const comment = list.find((candidate) => candidate.id === Number(commentIdText));
    if (!comment) return notFound();
    if (!resolve) return json(200, comment);
    if (method === "POST") {
      if (comment.resolution) return json(409, { error: { message: "already resolved" } });
      comment.resolution = { type: "comment_resolution" };
      return json(200, comment.resolution);
    }
    delete comment.resolution;
    return new Response(null, { status: 204 });
  };

  return { fetch: send, requests, addComment };
}
