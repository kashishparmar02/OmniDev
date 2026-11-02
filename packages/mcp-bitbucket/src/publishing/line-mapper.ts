export type DiffSide = "new" | "old";

export interface DiffFileHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
}

export interface DiffFileMap {
  oldPath: string | null;
  newPath: string | null;
  renamed: boolean;
  deleted: boolean;
  added: boolean;
  /** new-file line numbers that appear as added or context in the diff */
  anchorableToLines: Set<number>;
  /** old-file line numbers that appear as removed or context in the diff */
  anchorableFromLines: Set<number>;
  hunks: DiffFileHunk[];
}

export interface ParsedDiff {
  files: DiffFileMap[];
  byNewPath: Map<string, DiffFileMap>;
  byOldPath: Map<string, DiffFileMap>;
}

const FILE_HEADER = /^diff --git a\/(.+) b\/(.+)$/;
const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

export function parseUnifiedDiff(diffText: string): ParsedDiff {
  const lines = diffText.split(/\r?\n/);
  const files: DiffFileMap[] = [];
  let current: DiffFileMap | null = null;
  let oldLine = 0;
  let newLine = 0;

  const pushCurrent = () => {
    if (current) files.push(current);
  };

  for (const line of lines) {
    const fileMatch = FILE_HEADER.exec(line);
    if (fileMatch) {
      pushCurrent();
      const oldPath = fileMatch[1] === "/dev/null" ? null : fileMatch[1];
      const newPath = fileMatch[2] === "/dev/null" ? null : fileMatch[2];
      current = {
        oldPath,
        newPath,
        renamed: Boolean(oldPath && newPath && oldPath !== newPath),
        deleted: newPath === null,
        added: oldPath === null,
        anchorableToLines: new Set(),
        anchorableFromLines: new Set(),
        hunks: [],
      };
      oldLine = 0;
      newLine = 0;
      continue;
    }

    if (!current) continue;

    if (line.startsWith("--- ") || line.startsWith("+++ ") || line.startsWith("index ") || line.startsWith("new file") || line.startsWith("deleted file") || line.startsWith("similarity index") || line.startsWith("rename from") || line.startsWith("rename to")) {
      if (line.startsWith("--- ") && line.includes("/dev/null")) current.added = true;
      if (line.startsWith("+++ ") && line.includes("/dev/null")) current.deleted = true;
      continue;
    }

    const hunkMatch = HUNK_HEADER.exec(line);
    if (hunkMatch) {
      const oldStart = Number(hunkMatch[1]);
      const oldCount = hunkMatch[2] === undefined ? 1 : Number(hunkMatch[2]);
      const newStart = Number(hunkMatch[3]);
      const newCount = hunkMatch[4] === undefined ? 1 : Number(hunkMatch[4]);
      current.hunks.push({ oldStart, oldCount, newStart, newCount });
      oldLine = oldStart;
      newLine = newStart;
      continue;
    }

    if (line.startsWith("+") && !line.startsWith("+++")) {
      current.anchorableToLines.add(newLine);
      newLine += 1;
      continue;
    }
    if (line.startsWith("-") && !line.startsWith("---")) {
      current.anchorableFromLines.add(oldLine);
      oldLine += 1;
      continue;
    }
    if (line.startsWith(" ") || line === "") {
      // context line (empty line in diff body may appear)
      if (line.startsWith(" ")) {
        current.anchorableToLines.add(newLine);
        current.anchorableFromLines.add(oldLine);
        oldLine += 1;
        newLine += 1;
      }
      continue;
    }
    // binary or other markers ignored
  }

  pushCurrent();

  const byNewPath = new Map<string, DiffFileMap>();
  const byOldPath = new Map<string, DiffFileMap>();
  for (const file of files) {
    if (file.newPath) byNewPath.set(file.newPath, file);
    if (file.oldPath) byOldPath.set(file.oldPath, file);
  }

  return { files, byNewPath, byOldPath };
}

export interface AnchorValidationResult {
  ok: boolean;
  path: string;
  side: DiffSide;
  line: number;
  reason?: string;
  inline?: { path: string; to?: number; from?: number };
}

export function validateInlineAnchor(
  parsed: ParsedDiff,
  filePath: string,
  line: number,
  side: DiffSide = "new",
): AnchorValidationResult {
  const file =
    side === "new"
      ? parsed.byNewPath.get(filePath) || parsed.byOldPath.get(filePath)
      : parsed.byOldPath.get(filePath) || parsed.byNewPath.get(filePath);

  if (!file) {
    return { ok: false, path: filePath, side, line, reason: "File not present in PR diff" };
  }

  const pathForComment = side === "new" ? file.newPath || file.oldPath : file.oldPath || file.newPath;
  if (!pathForComment) {
    return { ok: false, path: filePath, side, line, reason: "No path available for comment anchor" };
  }

  if (side === "new") {
    if (file.deleted) {
      return { ok: false, path: filePath, side, line, reason: "Cannot anchor `to` on a deleted file" };
    }
    if (!file.anchorableToLines.has(line)) {
      return {
        ok: false,
        path: filePath,
        side,
        line,
        reason: `Line ${line} is not an added/context line in the PR diff`,
      };
    }
    return {
      ok: true,
      path: pathForComment,
      side,
      line,
      inline: { path: pathForComment, to: line },
    };
  }

  if (file.added) {
    return { ok: false, path: filePath, side, line, reason: "Cannot anchor `from` on an added file" };
  }
  if (!file.anchorableFromLines.has(line)) {
    return {
      ok: false,
      path: filePath,
      side,
      line,
      reason: `Line ${line} is not a removed/context line in the PR diff`,
    };
  }
  return {
    ok: true,
    path: pathForComment,
    side,
    line,
    inline: { path: pathForComment, from: line },
  };
}
