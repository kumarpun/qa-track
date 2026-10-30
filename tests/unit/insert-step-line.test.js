import { describe, expect, it } from "vitest";
import { insertStepLine } from "@/lib/numbered-list";

describe("insertStepLine", () => {
  it("fills an empty numbered line in place and renumbers the rest", () => {
    const text = "1. \n2. Visit x\n2. Enter u\n3. Click";
    const r = insertStepLine(text, 3, "Call Login");
    expect(r.text).toBe("1. Call Login\n2. Visit x\n3. Enter u\n4. Click");
    expect(r.text.slice(0, r.caret)).toBe("1. Call Login");
  });
  it("inserts below the caret line otherwise", () => {
    const r = insertStepLine("1. A\n2. B", 2, "Call L");
    expect(r.text).toBe("1. A\n2. Call L\n3. B");
  });
  it("appends with a fresh numbered line at the end; handles empty and unnumbered text", () => {
    expect(insertStepLine("1. A", 4, "Call L").text).toBe("1. A\n2. Call L\n3. ");
    expect(insertStepLine("", 0, "Call L").text).toBe("1. Call L\n2. ");
    expect(insertStepLine("Visit x", 7, "Call L").text).toBe("Visit x\nCall L\n");
  });
});
