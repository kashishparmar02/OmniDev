import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { AppError } from "../errors.js";

const execFileAsync = promisify(execFile);

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
export const scriptsDir = join(packageRoot, "scripts", "pr-workflow");
export const prTemplatePath = join(packageRoot, "templates", "PR_TEMPLATE.md");

async function assertExecutable(path: string): Promise<void> {
  await access(path, constants.X_OK);
}

export async function runBashScript(
  repoRoot: string,
  scriptName: string,
  args: string[],
): Promise<string> {
  const scriptPath = join(scriptsDir, scriptName);
  await assertExecutable(scriptPath);
  try {
    const { stdout, stderr } = await execFileAsync("bash", [scriptPath, ...args], {
      cwd: repoRoot,
      maxBuffer: 20 * 1024 * 1024,
      encoding: "utf8",
      env: {
        ...process.env,
        PR_COMMENTS_SCRIPT: join(scriptsDir, "pull-pr-comments.sh"),
      },
    });
    return [stdout, stderr].filter(Boolean).join("\n").trimEnd();
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    const message = [err.stderr, err.stdout, err.message].filter(Boolean).join("\n").trim();
    throw new AppError("SCRIPT_FAILED", message || `Script ${scriptName} failed`, {
      details: { scriptName, args },
      cause: error,
    });
  }
}
