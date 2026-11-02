import { z } from "zod";

export const ReviewSeveritySchema = z.enum([
  "critical",
  "high",
  "medium",
  "low",
  "informational",
]);

export const ReviewCategorySchema = z.enum([
  "correctness",
  "regression",
  "architecture",
  "performance",
  "sql",
  "security",
  "concurrency",
  "memory",
  "code-quality",
  "testing",
  "api-contract",
]);

export const ReviewFindingSchema = z.object({
  id: z.string().min(1),
  category: ReviewCategorySchema,
  severity: ReviewSeveritySchema,
  confidence: z.enum(["high", "medium", "low"]),
  filePath: z.string().min(1),
  line: z.number().int().positive(),
  side: z.enum(["new", "old"]).default("new"),
  title: z.string().min(1),
  explanation: z.string().min(1),
  impact: z.string().min(1),
  suggestion: z.string().optional(),
  evidence: z.array(z.string()).default([]),
  validationStatus: z.enum(["validated", "requires-investigation", "rejected"]),
  publishable: z.boolean(),
  commentBody: z.string().min(1).optional(),
});

export type ReviewFinding = z.infer<typeof ReviewFindingSchema>;

export const ReviewReportSchema = z.object({
  workspace: z.string(),
  repoSlug: z.string(),
  pullRequestId: z.number().int().positive(),
  title: z.string(),
  filesReviewed: z.number().int().nonnegative(),
  findings: z.array(ReviewFindingSchema),
  areasInspected: z.array(z.string()).default([]),
  areasUnverified: z.array(z.string()).default([]),
});

export type ReviewReport = z.infer<typeof ReviewReportSchema>;
