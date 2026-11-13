// Secret redaction for any text that leaves the process.
//
// Every tool result, error message and log line passes through redactSecrets
// before an agent or a terminal sees it. Host APIs sometimes echo credentials
// back in error bodies, and git prints remote URLs that can embed them, so
// redacting at the output boundary is the only place that catches all of it.

const REDACTED = "[REDACTED]";

// Each entry is a pattern and its replacement. Order matters only for the
// header rule, which keeps the scheme word so the output stays readable.
const SECRET_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  // HTTP Authorization header values.
  [/\b(Basic|Bearer)\s+[A-Za-z0-9+/._~-]{8,}=*/gi, `$1 ${REDACTED}`],
  // Atlassian API tokens.
  [/ATATT[A-Za-z0-9_\-=]{10,}/g, REDACTED],
  // GitHub personal, OAuth, user, server and refresh tokens.
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/g, REDACTED],
  // GitHub fine-grained personal access tokens.
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/g, REDACTED],
  // Passwords embedded in URLs, such as https://user:password@host/repo.git.
  [/(\/\/[^/\s:@]+):[^/\s@]+@/g, `$1:${REDACTED}@`],
];

/**
 * Returns the text with every recognised credential replaced by a placeholder.
 *
 * This is a safety net, not a guarantee: it only knows the token formats
 * listed above, so a secret in an unknown format passes through unchanged.
 */
export function redactSecrets(text: string): string {
  let result = text;
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}
