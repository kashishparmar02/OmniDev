/**
 * Why a provider call failed, in terms a capability can act on:
 *
 * - `not_found`: the pull request or thread does not exist, or is not visible
 *   to the current credentials.
 * - `unauthorized`: the credentials are missing, wrong or lack permission.
 * - `rate_limited`: the host refused the call for now; retrying later may work.
 * - `unavailable`: the host could not be reached, returned a server error or
 *   returned a response OmniDev could not read.
 * - `invalid_request`: the host understood the call and refused it, for
 *   example because a branch does not exist. Retrying unchanged will not help.
 * - `unsupported`: this host has no way to do what was asked.
 */
export type ProviderErrorCode =
  "not_found" | "unauthorized" | "rate_limited" | "unavailable" | "invalid_request" | "unsupported";

/** The only error type an ICodeHostProvider method is allowed to reject with. */
export class ProviderError extends Error {
  readonly code: ProviderErrorCode;

  constructor(code: ProviderErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ProviderError";
    this.code = code;
  }
}
