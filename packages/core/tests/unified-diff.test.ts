import { describe, expect, it } from "vitest";
import { checkAnchor, parseUnifiedDiff } from "../src/index.js";

const modified = [
  "diff --git a/src/cart.ts b/src/cart.ts",
  "index 1111111..2222222 100644",
  "--- a/src/cart.ts",
  "+++ b/src/cart.ts",
  "@@ -10,3 +10,4 @@ export function total(cart: Cart) {",
  " const items = cart.items;",
  "-return items.reduce(sum);",
  "+if (items.length === 0) return 0;",
  "+return items.reduce(sum, 0);",
  " }",
  "@@ -40 +41 @@",
  "-old tail",
  "+new tail",
].join("\n");

describe("parseUnifiedDiff", () => {
  it("records the lines shown on each side across several hunks", () => {
    const [file] = parseUnifiedDiff(modified);

    expect(file).toMatchObject({ oldPath: "src/cart.ts", newPath: "src/cart.ts" });
    expect([...file!.oldLines]).toEqual([10, 11, 12, 40]);
    expect([...file!.newLines]).toEqual([10, 11, 12, 13, 41]);
  });

  it("reads added and deleted files", () => {
    const diff = [
      "diff --git a/new.txt b/new.txt",
      "new file mode 100644",
      "--- /dev/null",
      "+++ b/new.txt",
      "@@ -0,0 +1,2 @@",
      "+one",
      "+two",
      "diff --git a/gone.txt b/gone.txt",
      "deleted file mode 100644",
      "--- a/gone.txt",
      "+++ /dev/null",
      "@@ -1 +0,0 @@",
      "-bye",
    ].join("\n");

    const [added, deleted] = parseUnifiedDiff(diff);

    expect(added).toMatchObject({ oldPath: null, newPath: "new.txt" });
    expect([...added!.newLines]).toEqual([1, 2]);
    expect(deleted).toMatchObject({ oldPath: "gone.txt", newPath: null });
    expect([...deleted!.oldLines]).toEqual([1]);
  });

  it("reads a rename that has no content change", () => {
    const diff = [
      "diff --git a/old/name.ts b/new/name.ts",
      "similarity index 100%",
      "rename from old/name.ts",
      "rename to new/name.ts",
    ].join("\n");

    expect(parseUnifiedDiff(diff)[0]).toMatchObject({
      oldPath: "old/name.ts",
      newPath: "new/name.ts",
    });
  });

  it("treats content that looks like a file header as content", () => {
    // The removed line is the SQL comment "-- drop table", shown as "--- drop table".
    const diff = [
      "diff --git a/db.sql b/db.sql",
      "--- a/db.sql",
      "+++ b/db.sql",
      "@@ -1,2 +1,2 @@",
      "--- drop table",
      "+++ keep table",
      " select 1;",
    ].join("\n");

    const [file] = parseUnifiedDiff(diff);

    expect(file).toMatchObject({ oldPath: "db.sql", newPath: "db.sql" });
    expect([...file!.oldLines]).toEqual([1, 2]);
    expect([...file!.newLines]).toEqual([1, 2]);
  });

  it("does not count the missing-newline marker as a line", () => {
    const diff = [
      "diff --git a/a.txt b/a.txt",
      "--- a/a.txt",
      "+++ b/a.txt",
      "@@ -1 +1,2 @@",
      "-end",
      "\\ No newline at end of file",
      "+end",
      "+more",
    ].join("\n");

    expect([...parseUnifiedDiff(diff)[0]!.newLines]).toEqual([1, 2]);
  });

  it("returns no files for an empty diff", () => {
    expect(parseUnifiedDiff("")).toEqual([]);
  });
});

describe("checkAnchor", () => {
  const files = parseUnifiedDiff(modified);

  it("accepts added and context lines on the new side", () => {
    expect(checkAnchor(files, { path: "src/cart.ts", line: 11, side: "new" })).toEqual({
      ok: true,
    });
    expect(checkAnchor(files, { path: "src/cart.ts", line: 13, side: "new" })).toEqual({
      ok: true,
    });
  });

  it("accepts a removed line on the old side", () => {
    expect(checkAnchor(files, { path: "src/cart.ts", line: 11, side: "old" })).toEqual({
      ok: true,
    });
  });

  it("rejects a line outside the diff and says why", () => {
    const result = checkAnchor(files, { path: "src/cart.ts", line: 30, side: "new" });

    expect(result).toEqual({
      ok: false,
      reason: "Line 30 of src/cart.ts is not an added or unchanged line shown in the diff.",
    });
  });

  it("rejects a file that is not in the diff", () => {
    const result = checkAnchor(files, { path: "src/other.ts", line: 1, side: "new" });

    expect(result).toMatchObject({ ok: false });
  });
});
