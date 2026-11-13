// The one place where OmniDev sends an HTTP request to a code host.
//
// Every provider goes through sendHostRequest, so timeouts, retries and the
// translation of HTTP failures into ProviderError are written once and behave
// the same for every host.

import { redactSecrets } from "../safety/redact.js";
import { ProviderError, type ProviderErrorCode } from "./errors.js";

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface HostRequest {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  url: string;
  headers?: Record<string, string>;
  /** Sent as JSON when present. */
  body?: unknown;
}

export interface HostResponse {
  status: number;
  body: string;
}

export interface HostRequestOptions {
  /** Replaced in tests with a fake of the host. */
  fetch?: FetchLike;
  /** Extra attempts after the first one. */
  maxRetries?: number;
  timeoutMs?: number;
  /** Replaced in tests so that retries do not really wait. */
  sleep?: (milliseconds: number) => Promise<void>;
}

const MAX_RETRY_DELAY_MS = 30_000;
const ERROR_EXCERPT_LENGTH = 300;

function classify(response: Response): ProviderErrorCode {
  const { status } = response;
  if (status === 404 || status === 410) return "not_found";
  if (status === 401) return "unauthorized";
  if (status === 429) return "rate_limited";
  if (status === 403) {
    // GitHub reports an exhausted rate limit as 403 with this header at zero.
    return response.headers.get("x-ratelimit-remaining") === "0" ? "rate_limited" : "unauthorized";
  }
  return status >= 500 ? "unavailable" : "invalid_request";
}

function retryDelay(response: Response | undefined, attempt: number): number {
  const retryAfterSeconds = Number(response?.headers.get("retry-after"));
  const delay = retryAfterSeconds > 0 ? retryAfterSeconds * 1000 : 500 * 2 ** attempt;
  return Math.min(delay, MAX_RETRY_DELAY_MS);
}

/**
 * Sends one request and returns the response body of a successful call.
 * Any failure is rejected as a ProviderError with secrets removed from the
 * message.
 *
 * Retries are deliberately narrow. A rate-limited call was refused before it
 * did anything, so it is always safe to repeat. A server error or a network
 * failure is only repeated for GET: the host may have carried out a POST
 * before failing, and repeating it could post the same comment twice.
 */
export async function sendHostRequest(
  request: HostRequest,
  options: HostRequestOptions = {},
): Promise<HostResponse> {
  const send = options.fetch ?? fetch;
  const maxRetries = options.maxRetries ?? 2;
  const sleep =
    options.sleep ??
    ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const method = request.method ?? "GET";
  const host = new URL(request.url).host;
  const hasBody = request.body !== undefined;

  for (let attempt = 0; ; attempt += 1) {
    const canRetry = attempt < maxRetries;
    let response: Response;
    try {
      response = await send(request.url, {
        method,
        headers: { ...request.headers, ...(hasBody ? { "Content-Type": "application/json" } : {}) },
        ...(hasBody ? { body: JSON.stringify(request.body) } : {}),
        signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
      });
    } catch (cause) {
      if (method === "GET" && canRetry) {
        await sleep(retryDelay(undefined, attempt));
        continue;
      }
      throw new ProviderError("unavailable", `Could not reach ${host}.`, { cause });
    }

    const body = await response.text();
    if (response.ok) return { status: response.status, body };

    const code = classify(response);
    const safeToRepeat = code === "rate_limited" || (code === "unavailable" && method === "GET");
    if (safeToRepeat && canRetry) {
      await sleep(retryDelay(response, attempt));
      continue;
    }
    const excerpt = body.slice(0, ERROR_EXCERPT_LENGTH);
    throw new ProviderError(code, redactSecrets(`${host} answered ${response.status}: ${excerpt}`));
  }
}
