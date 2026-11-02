import { describe, expect, it } from "vitest";
import { ReviewFindingSchema } from "../../src/schemas/review-finding.js";

describe("ReviewFindingSchema", () => {
  it("accepts a valid finding", () => {
    const finding = ReviewFindingSchema.parse({
      id: "f1",
      category: "performance",
      severity: "high",
      confidence: "high",
      filePath: "src/a.ts",
      line: 42,
      title: "Sequential awaits",
      explanation: "These calls look independent.",
      impact: "Extra latency under load.",
      evidence: ["await a()", "await b()"],
      validationStatus: "validated",
      publishable: true,
    });
    expect(finding.side).toBe("new");
    expect(finding.publishable).toBe(true);
  });

  it("rejects invalid severity", () => {
    expect(() =>
      ReviewFindingSchema.parse({
        id: "f1",
        category: "performance",
        severity: "urgent",
        confidence: "high",
        filePath: "src/a.ts",
        line: 42,
        title: "x",
        explanation: "y",
        impact: "z",
        evidence: [],
        validationStatus: "validated",
        publishable: true,
      }),
    ).toThrow();
  });
});
