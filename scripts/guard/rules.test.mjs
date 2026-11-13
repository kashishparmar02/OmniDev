import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkCommitMessage, checkDiff, checkPath, parsePrivateTerms } from "./rules.mjs";

// Fake credentials are assembled at runtime so that this file never contains a
// token-shaped literal that the guard itself would have to block.
const fakeAtlassianToken = ["ATATT", "3", "x".repeat(40)].join("");
const terms = parsePrivateTerms("# names that must stay private\n\nacme-internal\nPROJ-\\d+\n");

function diffAdding(path, ...addedLines) {
  return [
    `diff --git a/${path} b/${path}`,
    `--- a/${path}`,
    `+++ b/${path}`,
    `@@ -0,0 +10,${addedLines.length} @@`,
    ...addedLines.map((line) => `+${line}`),
  ].join("\n");
}

describe("parsePrivateTerms", () => {
  it("ignores comments and blank lines and matches case-insensitively", () => {
    assert.equal(terms.length, 2);
    assert.ok(terms[0].test("see ACME-Internal wiki"));
  });
});

describe("checkCommitMessage", () => {
  it("accepts a conventional subject with a body", () => {
    assert.deepEqual(checkCommitMessage("feat(core): add secret redaction\n\nWhy it matters."), []);
  });

  it("rejects a subject without a type", () => {
    assert.equal(checkCommitMessage("Add secret redaction").length, 1);
  });

  it("rejects a subject longer than the limit", () => {
    const problems = checkCommitMessage(`fix: ${"a".repeat(80)}`);
    assert.match(problems.join("\n"), /limit is 72/);
  });

  it("rejects AI tool attribution", () => {
    const withTrailer = "fix: handle empty diff\n\nCo-Authored-By: Claude <noreply@anthropic.com>";
    const withFooter = "fix: handle empty diff\n\nGenerated with Claude Code";
    assert.match(checkCommitMessage(withTrailer).join("\n"), /AI tool attribution/);
    assert.match(checkCommitMessage(withFooter).join("\n"), /AI tool attribution/);
  });

  it("accepts a human co-author", () => {
    const message = "fix: handle empty diff\n\nCo-Authored-By: Sam Doe <sam@example.com>";
    assert.deepEqual(checkCommitMessage(message), []);
  });

  it("rejects a private term anywhere in the message", () => {
    const problems = checkCommitMessage("fix: handle empty diff\n\nRefs PROJ-123.", terms);
    assert.match(problems.join("\n"), /private-terms/);
  });

  it("ignores git's own comment lines", () => {
    assert.deepEqual(checkCommitMessage("# Please enter the message\nfix: handle empty diff"), []);
  });
});

describe("checkPath", () => {
  it("blocks env files and keys but allows the example file", () => {
    assert.equal(checkPath("packages/a/.env").length, 1);
    assert.equal(checkPath(".env.local").length, 1);
    assert.equal(checkPath("certs/server.pem").length, 1);
    assert.deepEqual(checkPath("packages/a/.env.example"), []);
    assert.deepEqual(checkPath("src/environment.ts"), []);
  });

  it("blocks a path containing a private term", () => {
    assert.equal(checkPath("docs/acme-internal/setup.md", terms).length, 1);
  });
});

describe("checkDiff", () => {
  it("reports a secret with its file and line but not its value", () => {
    const problems = checkDiff(
      diffAdding("src/a.ts", "const ok = 1;", `t = "${fakeAtlassianToken}"`),
    );

    assert.deepEqual(problems, ["src/a.ts:11: possible Atlassian API token."]);
  });

  it("reports a private term in an added line", () => {
    const problems = checkDiff(diffAdding("README.md", "Clone acme-internal first."), terms);

    assert.deepEqual(problems, ["README.md:10: contains a term from the private-terms list."]);
  });

  it("ignores removed lines", () => {
    const diff = [
      "diff --git a/a.ts b/a.ts",
      "--- a/a.ts",
      "+++ b/a.ts",
      "@@ -3,1 +3,0 @@",
      `-t = "${fakeAtlassianToken}"`,
    ].join("\n");

    assert.deepEqual(checkDiff(diff, terms), []);
  });
});
