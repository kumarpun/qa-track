import { describe, expect, it } from "vitest";
import { executionSchema, quickDefectSchema } from "@/lib/validation/execution";
import { computeProgress } from "@/lib/metrics";

describe("executionSchema", () => {
  it("requires an actual result when a test fails", () => {
    const r = executionSchema.safeParse({ status: "FAILED", actualResult: "  " });
    expect(r.success).toBe(false);
    expect(r.error.issues[0].path).toEqual(["actualResult"]);
    expect(executionSchema.safeParse({ status: "FAILED", actualResult: "500 error" }).success).toBe(true);
  });

  it("accepts Retest, Blocked and Skipped without an actual result", () => {
    for (const status of ["RETEST", "BLOCKED", "SKIPPED", "PASSED"]) expect(executionSchema.safeParse({ status }).success).toBe(true);
  });

  it("rejects NOT_RUN as a saved result", () => {
    expect(executionSchema.safeParse({ status: "NOT_RUN" }).success).toBe(false);
  });

  it("rejects Passed when a step failed or is blocked", () => {
    for (const bad of ["FAILED", "BLOCKED"]) {
      const r = executionSchema.safeParse({ status: "PASSED", steps: [{ position: 1, status: bad }] });
      expect(r.success).toBe(false);
    }
    expect(executionSchema.safeParse({ status: "PASSED", steps: [{ position: 1, status: "PASSED" }] }).success).toBe(true);
  });
});

describe("quickDefectSchema", () => {
  it("only accepts http(s) external URLs", () => {
    expect(quickDefectSchema.safeParse({ title: "x", externalUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(quickDefectSchema.safeParse({ title: "x", externalUrl: "https://jira.example.com/BUG-1" }).success).toBe(true);
  });
});

describe("Retest does not inflate the pass rate", () => {
  it("keeps Retest pending and out of the numerator", () => {
    const before = computeProgress({ PASSED: 1, FAILED: 1, NOT_RUN: 2 });
    const after = computeProgress({ PASSED: 1, RETEST: 1, NOT_RUN: 2 });
    expect(after.passRate).toBe(before.passRate);
    expect(after.completed).toBe(1);
    expect(after.pending).toBe(3);
  });
});
