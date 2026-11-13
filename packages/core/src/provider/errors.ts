/**
 * Why a provider call failed, in terms a capability can act on:
 *
 * - `not_found`: the pull request or thread does not exist, or is not visible
 *   to the current credentials.
 * - `unauthorized`: the credentials are missing, wrong or lack permission.
 * - `rate_limited`: the host refused the call for now; retrying later may work.
 * - `unavailable`: the host could not be reached or returned a server error.
 */
export type ProviderErrorCode = "not_found" | "unauthorized" | "rate_limited" | "unavailable";

/** The only error type an ICodeHostProvider method is allowed to reject with. */
export class ProviderError extends Error {
  readonly code: ProviderErrorCode;

  constructor(code: ProviderErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ProviderError";
    this.code = code;
  }
}
