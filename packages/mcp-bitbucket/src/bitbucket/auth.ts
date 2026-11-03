import type { ReviewConfig } from "../utils/config.js";

export function buildBasicAuthHeader(config: Pick<ReviewConfig, "email" | "apiToken">): string {
  const token = Buffer.from(`${config.email}:${config.apiToken}`, "utf8").toString("base64");
  return `Basic ${token}`;
}

export function buildAuthHeaders(config: Pick<ReviewConfig, "email" | "apiToken">): Record<string, string> {
  return {
    Authorization: buildBasicAuthHeader(config),
    Accept: "application/json",
    "User-Agent": "omnidev-mcp-bitbucket/0.1",
  };
}
