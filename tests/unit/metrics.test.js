import { describe, it, expect } from "vitest";
import { computeProgress, sumCounts } from "@/lib/metrics";

describe("computeProgress", () => {
  it("returns zeros for an empty run without dividing by zero", () => {
    const p = computeProgress({});
    expect(p.total).toBe(0);
    expect(p.passRate).toBe(0);
    expect(p.progressPct).toBe(0);
  });

  it("counts Retest as pending, so it cannot inflate pass rate or completion", () => {
    const p = computeProgress({ PASSED: 6, FAILED: 1, RETEST: 3 });
    expect(p.total).toBe(10);
    expect(p.completed).toBe(7);
    expect(p.pending).toBe(3);
    expect(p.progressPct).toBe(70);
    expect(p.passRate).toBe(60);
    expect(p.executedPassRate).toBeCloseTo(85.7, 1);
  });

  it("treats blocked and skipped as completed but not passed", () => {
    const p = computeProgress({ PASSED: 2, BLOCKED: 1, SKIPPED: 1 });
    expect(p.completed).toBe(4);
    expect(p.passRate).toBe(50);
  });

  it("accepts string counts from the database driver", () => {
    expect(computeProgress({ PASSED: "3", NOT_RUN: "1" }).passRate).toBe(75);
  });
});

describe("sumCounts", () => {
  it("adds per-status counts across rows", () => {
    expect(sumCounts([{ PASSED: 1, FAILED: 2 }, { PASSED: 3 }])).toMatchObject({ PASSED: 4, FAILED: 2, NOT_RUN: 0 });
  });
});
