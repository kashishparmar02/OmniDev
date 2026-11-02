import { describe, expect, it } from "vitest";
import { parseUnifiedDiff, validateInlineAnchor } from "../../src/publishing/line-mapper.js";

const SAMPLE = `diff --git a/src/a.ts b/src/a.ts
index 111..222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -10,7 +10,8 @@ export function demo() {
   const x = 1;
   const y = 2;
-  return x + y;
+  const z = 3;
+  return x + y + z;
 }
diff --git a/src/old.ts b/src/renamed.ts
similarity index 90%
rename from src/old.ts
rename to src/renamed.ts
index 111..222 100644
--- a/src/old.ts
+++ b/src/renamed.ts
@@ -1,3 +1,4 @@
 export const value = 1;
+export const extra = 2;
diff --git a/src/gone.ts b/src/gone.ts
deleted file mode 100644
index 111..000
--- a/src/gone.ts
+++ /dev/null
@@ -1,2 +0,0 @@
-export const gone = true;
-export const also = false;
diff --git a/src/new.ts b/src/new.ts
new file mode 100644
index 000..111
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1,2 @@
+export const created = true;
+export const ok = 1;
`;

describe("parseUnifiedDiff + validateInlineAnchor", () => {
  const parsed = parseUnifiedDiff(SAMPLE);

  it("tracks added lines on modified files", () => {
    const result = validateInlineAnchor(parsed, "src/a.ts", 13, "new");
    expect(result.ok).toBe(true);
    expect(result.inline).toEqual({ path: "src/a.ts", to: 13 });
  });

  it("rejects lines outside the diff hunk", () => {
    const result = validateInlineAnchor(parsed, "src/a.ts", 999, "new");
    expect(result.ok).toBe(false);
  });

  it("handles renamed files", () => {
    const result = validateInlineAnchor(parsed, "src/renamed.ts", 2, "new");
    expect(result.ok).toBe(true);
    expect(result.inline?.path).toBe("src/renamed.ts");
  });

  it("anchors deleted lines with from", () => {
    const result = validateInlineAnchor(parsed, "src/gone.ts", 1, "old");
    expect(result.ok).toBe(true);
    expect(result.inline).toEqual({ path: "src/gone.ts", from: 1 });
  });

  it("anchors added file lines", () => {
    const result = validateInlineAnchor(parsed, "src/new.ts", 1, "new");
    expect(result.ok).toBe(true);
    expect(result.inline).toEqual({ path: "src/new.ts", to: 1 });
  });
});
