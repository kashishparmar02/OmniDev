import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { AppError } from "../errors.js";

const execFileAsync = promisify(execFile);

export async function runGit(cwd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      maxBuffer: 50 * 1024 * 1024,
      encoding: "utf8",
    });
    return stdout.trimEnd();
  } catch (error) {
    const err = error as { stderr?: string; message?: string };
    throw new AppError("GIT_ERROR", err.stderr?.trim() || err.message || "git command failed", {
      details: { cwd, args },
      cause: error,
    });
  }
}
