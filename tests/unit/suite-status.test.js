import { describe, it, expect } from "vitest";
import { deriveSuiteStatus } from "@/lib/suite-status";

describe("deriveSuiteStatus", () => {
  it("is Not Executed for an empty suite or untouched cases", () => {
    expect(deriveSuiteStatus({})).toBe("NOT_EXECUTED");
    expect(deriveSuiteStatus({ NOT_EXECUTED: 3 })).toBe("NOT_EXECUTED");
  });
  it("is Passed only when every case passed", () => {
    expect(deriveSuiteStatus({ PASSED: 4 })).toBe("PASSED");
    expect(deriveSuiteStatus({ PASSED: 3, NOT_EXECUTED: 1 })).toBe("IN_PROGRESS");
  });
  it("one failure fails the suite, even when others passed", () => {
    expect(deriveSuiteStatus({ PASSED: 5, FAILED: 1, BLOCKED: 1 })).toBe("FAILED");
  });
  it("blocked beats partial progress", () => {
    expect(deriveSuiteStatus({ PASSED: 2, BLOCKED: 1 })).toBe("BLOCKED");
  });
  it("all skipped is Skipped", () => {
    expect(deriveSuiteStatus({ SKIPPED: 2 })).toBe("SKIPPED");
  });
});
