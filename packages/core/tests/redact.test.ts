import { describe, expect, it } from "vitest";
import { redactSecrets } from "../src/index.js";

// Fake credentials are assembled at runtime so that no token-shaped literal
// ever exists in this repository. See CONTRIBUTING.md, "Secrets in tests".
const filler = "x".repeat(40);
const fakes = {
  atlassian: ["ATATT", "3", filler].join(""),
  githubClassic: ["ghp", filler].join("_"),
  githubFineGrained: ["github", "pat", filler].join("_"),
};

describe("redactSecrets", () => {
  it.each(Object.entries(fakes))("removes a %s token", (_name, token) => {
    const output = redactSecrets(`request failed: token=${token} (401)`);

    expect(output).not.toContain(token);
    expect(output).toBe("request failed: token=[REDACTED] (401)");
  });

  it("removes Authorization header values but keeps the scheme", () => {
    const output = redactSecrets(`Authorization: Bearer ${filler}`);

    expect(output).toBe("Authorization: Bearer [REDACTED]");
  });

  it("removes a password embedded in a git remote URL", () => {
    const output = redactSecrets(
      `fatal: unable to access 'https://dev:${filler}@example.com/a/b.git'`,
    );

    expect(output).toBe("fatal: unable to access 'https://dev:[REDACTED]@example.com/a/b.git'");
  });

  it("leaves ordinary text and credential-free URLs unchanged", () => {
    const text = "GET https://example.com:8443/repos/a/b returned 404 at 12:30:05";

    expect(redactSecrets(text)).toBe(text);
  });
});
