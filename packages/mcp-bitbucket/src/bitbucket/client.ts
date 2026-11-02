import { buildAuthHeaders } from "./auth.js";
import type { ReviewConfig } from "../utils/config.js";
import { AppError, redactSecrets } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import type { Paginated } from "./pagination.js";

const DEFAULT_BASE = "https://api.bitbucket.org/2.0";

export interface RequestOptions {
  method?: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  accept?: string;
  raw?: boolean;
  retries?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildUrl(base: string, path: string, query?: RequestOptions["query"]): string {
  const url = new URL(path.startsWith("http") ? path : `${base}${path.startsWith("/") ? path : `/${path}`}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

export class BitbucketClient {
  readonly config: ReviewConfig;
  readonly baseUrl: string;

  constructor(config: ReviewConfig, baseUrl = DEFAULT_BASE) {
    this.config = config;
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async request<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
    const method = options.method ?? (options.body ? "POST" : "GET");
    const retries = options.retries ?? 3;
    const url = buildUrl(this.baseUrl, path, options.query);
    const headers: Record<string, string> = {
      ...buildAuthHeaders(this.config),
    };
    if (options.accept) headers.Accept = options.accept;
    if (options.body !== undefined) headers["Content-Type"] = "application/json";

    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      attempt += 1;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60_000);
      try {
        const response = await fetch(url, {
          method,
          headers,
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
          redirect: "follow",
          signal: controller.signal,
        });

        if (response.status === 429 || (response.status >= 500 && response.status <= 599)) {
          if (attempt <= retries) {
            const retryAfter = Number(response.headers.get("retry-after") || 0);
            const backoff = retryAfter > 0 ? retryAfter * 1000 : Math.min(1000 * 2 ** (attempt - 1), 8000);
            logger.warn("Transient Bitbucket API failure; retrying", {
              status: response.status,
              attempt,
              backoffMs: backoff,
              path,
            });
            await sleep(backoff);
            continue;
          }
        }

        if (!response.ok) {
          const text = await response.text();
          let details: unknown = text;
          try {
            details = JSON.parse(text);
          } catch {
            // keep text
          }
          const message =
            typeof details === "object" &&
            details &&
            "error" in details &&
            typeof (details as { error?: { message?: string } }).error?.message === "string"
              ? (details as { error: { message: string } }).error.message
              : `Bitbucket API ${response.status}`;
          throw new AppError("BITBUCKET_API_ERROR", redactSecrets(message), {
            status: response.status,
            details,
          });
        }

        if (response.status === 204) {
          return undefined as T;
        }

        if (options.raw || (options.accept && options.accept.includes("text"))) {
          return (await response.text()) as T;
        }

        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json") || contentType.includes("+json")) {
          return (await response.json()) as T;
        }
        return (await response.text()) as T;
      } catch (error) {
        if (error instanceof AppError) throw error;
        if (attempt <= retries) {
          const backoff = Math.min(1000 * 2 ** (attempt - 1), 8000);
          logger.warn("Network error talking to Bitbucket; retrying", {
            attempt,
            backoffMs: backoff,
            path,
          });
          await sleep(backoff);
          continue;
        }
        throw new AppError("BITBUCKET_NETWORK_ERROR", "Failed to reach Bitbucket API", {
          cause: error,
        });
      } finally {
        clearTimeout(timeout);
      }
    }
  }

  getPaginated<T>(path: string, query?: RequestOptions["query"]): Promise<Paginated<T>> {
    return this.request<Paginated<T>>(path, { query });
  }

  async getAbsolute<T>(absoluteUrl: string): Promise<T> {
    return this.request<T>(absoluteUrl);
  }

  async getAbsolutePaginated<T>(absoluteUrl: string): Promise<Paginated<T>> {
    return this.request<Paginated<T>>(absoluteUrl);
  }
}
