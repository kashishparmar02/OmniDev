import { describe, expect, it } from "vitest";
import { sendHostRequest, type FetchLike, type HostRequestOptions } from "../src/index.js";

const url = "https://host.example.com/api/thing";

// Returns a fetch that answers with the queued responses in order, and records
// what it was asked and how long each retry would have waited.
function scripted(...answers: Array<Response | Error>) {
  const calls: RequestInit[] = [];
  const waits: number[] = [];
  const send: FetchLike = async (_url, init) => {
    calls.push(init);
    const answer = answers.shift();
    if (!answer) throw new Error("the test queued too few responses");
    if (answer instanceof Error) throw answer;
    return answer;
  };
  const options: HostRequestOptions = {
    fetch: send,
    sleep: async (milliseconds) => void waits.push(milliseconds),
  };
  return { calls, waits, options };
}

describe("sendHostRequest", () => {
  it("returns the body of a successful call and sends the body as JSON", async () => {
    const { calls, options } = scripted(new Response("created", { status: 201 }));

    const response = await sendHostRequest({ method: "POST", url, body: { a: 1 } }, options);

    expect(response).toEqual({ status: 201, body: "created" });
    expect(calls[0]).toMatchObject({
      method: "POST",
      body: '{"a":1}',
      headers: { "Content-Type": "application/json" },
    });
  });

  it("repeats a GET after a server error and after a network failure", async () => {
    const { calls, options } = scripted(
      new Response("down", { status: 503 }),
      new TypeError("fetch failed"),
      new Response("ok"),
    );

    expect((await sendHostRequest({ url }, options)).body).toBe("ok");
    expect(calls).toHaveLength(3);
  });

  it("does not repeat a POST after a server error, to avoid a duplicate write", async () => {
    const { calls, options } = scripted(new Response("down", { status: 502 }));

    await expect(sendHostRequest({ method: "POST", url, body: {} }, options)).rejects.toMatchObject(
      { code: "unavailable" },
    );
    expect(calls).toHaveLength(1);
  });

  it("repeats a rate-limited POST after the delay the host asked for", async () => {
    const { waits, options } = scripted(
      new Response("slow down", { status: 429, headers: { "retry-after": "3" } }),
      new Response("ok"),
    );

    await sendHostRequest({ method: "POST", url, body: {} }, options);

    expect(waits).toEqual([3000]);
  });

  it("gives up after the configured number of retries", async () => {
    const { calls, options } = scripted(
      new Response("", { status: 500 }),
      new Response("", { status: 500 }),
    );

    await expect(sendHostRequest({ url }, { ...options, maxRetries: 1 })).rejects.toMatchObject({
      code: "unavailable",
    });
    expect(calls).toHaveLength(2);
  });

  it.each([
    [404, {}, "not_found"],
    [401, {}, "unauthorized"],
    [403, {}, "unauthorized"],
    [403, { "x-ratelimit-remaining": "0" }, "rate_limited"],
    [422, {}, "invalid_request"],
  ])("maps status %i with headers %o to %s", async (status, headers, code) => {
    const { options } = scripted(new Response("no", { status, headers }));

    await expect(sendHostRequest({ url }, { ...options, maxRetries: 0 })).rejects.toMatchObject({
      code,
    });
  });

  it("reports a network failure as unavailable", async () => {
    const { options } = scripted(new TypeError("fetch failed"));

    await expect(sendHostRequest({ url }, { ...options, maxRetries: 0 })).rejects.toMatchObject({
      code: "unavailable",
      message: "Could not reach host.example.com.",
    });
  });

  it("removes credentials that the host echoes back in an error", async () => {
    const token = ["ghp", "x".repeat(40)].join("_");
    const { options } = scripted(new Response(`bad token ${token}`, { status: 400 }));

    await expect(sendHostRequest({ url }, options)).rejects.toMatchObject({
      message: "host.example.com answered 400: bad token [REDACTED]",
    });
  });
});
