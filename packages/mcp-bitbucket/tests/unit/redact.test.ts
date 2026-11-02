import { describe, expect, it } from "vitest";
import { redactSecrets } from "../../src/utils/errors.js";

describe("redactSecrets", () => {
  it("redacts Bitbucket API tokens", () => {
    const raw =
      "token=ATATT3xFfGF0sfVeYyoy78tr9MiZq8bNM0YuJL80ug5h63DhTmDah-0H0jaafsF8MoCIwylvMdhfFxVUmo7s9dyE6w73H4ohzTYKUyV-RjFHi5iJ99hTYQdnBc-dEoWti3zbAxX3ybUQjKbPmPnSivgqDBUR_UnxHB6N2qhAEc8M30ld8UoPmFA=DCF740FA";
    expect(redactSecrets(raw)).toContain("[REDACTED_TOKEN]");
    expect(redactSecrets(raw)).not.toContain("ATATT3");
  });
});
