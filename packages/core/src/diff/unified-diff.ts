// Reads a git unified diff and answers one question: can an inline comment be
// attached to this line?
//
// A code host only accepts an inline comment on a line that appears in the
// pull request diff. Hosts disagree on what happens otherwise (an error, or a
// comment silently attached somewhere else), so OmniDev checks every anchor
// here before a provider is asked to post anything.

import type { InlineAnchor } from "../provider/code-host.js";

export interface DiffFile {
  /** Path before the change, or null when the file was added. */
  oldPath: string | null;
  /** Path after the change, or null when the file was deleted. */
  newPath: string | null;
  /** Old-file line numbers shown in the diff: removed lines and context lines. */
  oldLines: Set<number>;
  /** New-file line numbers shown in the diff: added lines and context lines. */
  newLines: Set<number>;
}

export type AnchorCheck = { ok: true } | { ok: false; reason: string };

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

// Header paths look like "a/src/x.ts" or "b/src/x.ts", "/dev/null" for a file
// that does not exist on that side, and are wrapped in double quotes when the
// name has unusual characters. Escape sequences inside quoted names are not
// decoded, so such a file will not match an anchor.
function parseHeaderPath(raw: string): string | null {
  const path = raw.split("\t")[0]!.replace(/^"(.*)"$/, "$1");
  if (path === "/dev/null") return null;
  return path.replace(/^[ab]\//, "");
}

/**
 * Parses a unified diff into the files it touches and the lines it shows.
 *
 * Hunk bodies are read by counting lines against the hunk header rather than
 * by looking at prefixes alone. Without that, a removed line whose own text
 * starts with "-- " reads as "--- " and would be mistaken for a file header.
 */
export function parseUnifiedDiff(diffText: string): DiffFile[] {
  const files: DiffFile[] = [];
  let current: DiffFile | undefined;
  let oldLine = 0;
  let newLine = 0;
  let oldRemaining = 0;
  let newRemaining = 0;

  for (const line of diffText.split(/\r?\n/)) {
    // Inside a hunk body: every line is content until both counts reach zero.
    if (current && (oldRemaining > 0 || newRemaining > 0)) {
      if (line.startsWith("+")) {
        current.newLines.add(newLine++);
        newRemaining -= 1;
      } else if (line.startsWith("-")) {
        current.oldLines.add(oldLine++);
        oldRemaining -= 1;
      } else if (!line.startsWith("\\")) {
        // A context line. "\ No newline at end of file" is the one marker
        // that is neither content nor counted.
        current.oldLines.add(oldLine++);
        current.newLines.add(newLine++);
        oldRemaining -= 1;
        newRemaining -= 1;
      }
      continue;
    }

    // Outside a hunk body: only headers matter.
    if (line.startsWith("diff --git ")) {
      current = { oldPath: null, newPath: null, oldLines: new Set(), newLines: new Set() };
      files.push(current);
      continue;
    }
    if (!current) continue;

    // A rename with no content change has no "---" and "+++" lines, so the
    // paths come from the rename lines instead.
    if (line.startsWith("--- ")) current.oldPath = parseHeaderPath(line.slice(4));
    else if (line.startsWith("+++ ")) current.newPath = parseHeaderPath(line.slice(4));
    else if (line.startsWith("rename from ")) current.oldPath = line.slice("rename from ".length);
    else if (line.startsWith("rename to ")) current.newPath = line.slice("rename to ".length);
    else {
      const hunk = HUNK_HEADER.exec(line);
      if (hunk) {
        oldLine = Number(hunk[1]);
        oldRemaining = hunk[2] === undefined ? 1 : Number(hunk[2]);
        newLine = Number(hunk[3]);
        newRemaining = hunk[4] === undefined ? 1 : Number(hunk[4]);
      }
    }
  }
  return files;
}

/**
 * Says whether an inline comment can be attached at the anchor, and why not.
 *
 * An anchor on the "new" side must name the file's path after the change and a
 * line that is added or context; one on the "old" side must name the path
 * before the change and a line that is removed or context.
 */
export function checkAnchor(files: DiffFile[], anchor: InlineAnchor): AnchorCheck {
  const onNewSide = anchor.side === "new";
  const file = files.find(
    (candidate) => (onNewSide ? candidate.newPath : candidate.oldPath) === anchor.path,
  );
  if (!file) {
    return { ok: false, reason: `${anchor.path} is not changed on the ${anchor.side} side.` };
  }

  const lines = onNewSide ? file.newLines : file.oldLines;
  if (!lines.has(anchor.line)) {
    const kind = onNewSide ? "an added or unchanged" : "a removed or unchanged";
    return {
      ok: false,
      reason: `Line ${anchor.line} of ${anchor.path} is not ${kind} line shown in the diff.`,
    };
  }
  return { ok: true };
}
