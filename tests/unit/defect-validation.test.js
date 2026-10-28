import { describe, it, expect } from "vitest";
import { defectSchema, defectListSchema, defectStatusSchema } from "@/lib/validation/defect";
import { can } from "@/lib/permissions";

describe("defectSchema", () => {
  it("requires a title and applies defaults", () => {
    expect(defectSchema.safeParse({ title: "  " }).success).toBe(false);
    const d = defectSchema.parse({ title: " Crash " });
    expect(d).toMatchObject({ title: "Crash", severity: "MAJOR", priority: "MEDIUM", externalUrl: "", assigneeId: "" });
  });

  it("accepts only http(s) external URLs", () => {
    expect(defectSchema.safeParse({ title: "x", externalUrl: "https://tracker.example.com/BUG-1" }).success).toBe(true);
    for (const bad of ["javascript:alert(1)", "ftp://x.y", "data:text/html,hi", "not a url"])
      expect(defectSchema.safeParse({ title: "x", externalUrl: bad }).success).toBe(false);
  });

  it("rejects unknown severities and non-uuid assignees", () => {
    expect(defectSchema.safeParse({ title: "x", severity: "HUGE" }).success).toBe(false);
    expect(defectSchema.safeParse({ title: "x", assigneeId: "bob" }).success).toBe(false);
  });
});

describe("defect status and list params", () => {
  it("knows the lifecycle statuses", () => {
    expect(defectStatusSchema.safeParse("REOPENED").success).toBe(true);
    expect(defectStatusSchema.safeParse("DONE").success).toBe(false);
  });
  it("coerces page and defaults", () => {
    expect(defectListSchema.parse({ page: "3" }).page).toBe(3);
    expect(defectListSchema.safeParse({ page: "0" }).success).toBe(false);
  });
});

describe("defect permissions", () => {
  it("lets engineers write but only leads delete", () => {
    expect(can("QA_ENGINEER", "defect.write")).toBe(true);
    expect(can("QA_ENGINEER", "defect.delete")).toBe(false);
    expect(can("QA_LEAD", "defect.delete")).toBe(true);
    expect(can("VIEWER", "defect.write")).toBe(false);
    expect(can("VIEWER", "report.read")).toBe(true);
  });
});
