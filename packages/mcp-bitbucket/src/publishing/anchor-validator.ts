import { parseUnifiedDiff, validateInlineAnchor, type DiffSide } from "./line-mapper.js";

export function validateCommentAgainstDiff(
  diffText: string,
  filePath: string,
  line: number,
  side: DiffSide = "new",
) {
  const parsed = parseUnifiedDiff(diffText);
  return validateInlineAnchor(parsed, filePath, line, side);
}
