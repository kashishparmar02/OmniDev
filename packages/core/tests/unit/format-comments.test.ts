import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const scriptsDir = join(fileURLToPath(new URL("../../scripts/pr-workflow", import.meta.url)));

describe("format_comments.py", () => {
  it("passes self-check", async () => {
    const { stdout } = await execFileAsync("python3", [join(scriptsDir, "format_comments.py"), "--self-check"], {
      encoding: "utf8",
    });
    expect(stdout.trim()).toBe("ok");
  });
});
