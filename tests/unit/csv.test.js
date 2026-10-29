import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCsv, toCsv, safeCell } from "@/lib/csv";
import { casesToCsv, csvToCases, CSV_HEADERS } from "@/lib/testcase-csv";

describe("parseCsv / toCsv", () => {
  it("handles quotes, commas, escaped quotes, CRLF and embedded newlines", () => {
    const text = 'a,b\r\n"x, y","he said ""hi"""\r\n"line1\nline2",z\r\n';
    expect(parseCsv(text)).toEqual([["a", "b"], ["x, y", 'he said "hi"'], ["line1\nline2", "z"]]);
  });

  it("round-trips arbitrary cells", () => {
    const rows = [["a", 'q"uote', "com,ma", "new\nline", ""]];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });

  it("strips BOM and skips blank lines", () => {
    expect(parseCsv("﻿a,b\n\n1,2\n")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("rejects unterminated quotes", () => {
    expect(() => parseCsv('a,"b')).toThrow(/Unterminated/);
  });
});

describe("safeCell", () => {
  it.each(["=1+1", "+1", "-1", "@SUM(A1)", "\tx"])("prefixes %j", (v) => {
    expect(safeCell(v)).toBe(`'${v}`);
  });
  it("leaves normal text and nullish alone", () => {
    expect(safeCell("hello")).toBe("hello");
    expect(safeCell(null)).toBe("");
  });
});

// Older export format; imports of these files must keep working.
const LEGACY_HEADERS = [
  "code", "title", "description", "preconditions", "test_data", "priority", "type", "automation",
  "component", "tags", "requirement_url", "assignee_email", "step_action", "step_data", "step_expected",
];

const sample = {
  code: "TC-APP-0001",
  title: "Login works",
  description: "desc, with comma",
  preconditions: "",
  testData: "",
  priority: "HIGH",
  type: "SMOKE",
  automation: "MANUAL",
  component: "Auth",
  tags: ["login", "smoke"],
  requirementUrl: "https://example.com/r/1",
  assigneeEmail: "qa1@example.com",
  steps: [
    { action: "Open page", testData: "", expected: "Page loads" },
    { action: "Submit", testData: "user=a", expected: "Dashboard shown" },
  ],
};

describe("testcase CSV", () => {
  it("round-trips a case through export then import", () => {
    const { cases, errors } = csvToCases(casesToCsv([sample]));
    expect(errors).toEqual([]);
    expect(cases).toHaveLength(1);
    expect(cases[0].assigneeEmail).toBe("qa1@example.com");
    expect(cases[0].input).toMatchObject({ title: "Login works", priority: "HIGH", type: "SMOKE", tags: ["login", "smoke"] });
    expect(cases[0].input.steps).toEqual(sample.steps);
  });

  it("is lossless for values starting with formula characters", () => {
    const c = { ...sample, title: "=cmd|' /C calc'!A0", steps: [{ action: "-1 step", testData: "", expected: "@ok" }] };
    const csv = casesToCsv([c]);
    expect(csv).toContain("'=cmd");
    const { cases } = csvToCases(csv);
    expect(cases[0].input.title).toBe(c.title);
    expect(cases[0].input.steps[0].action).toBe("-1 step");
  });

  it("reports every bad row with its line number and imports nothing silently", () => {
    const csv = toCsv([
      LEGACY_HEADERS,
      ["", "ok title", "", "", "", "HIGH", "SMOKE", "MANUAL", "", "", "", "", "a", "", "b"],
      ["", "bad priority", "", "", "", "URGENT", "", "", "", "", "", "", "a", "", "b"],
      ["", "no steps", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ]);
    const { cases, errors } = csvToCases(csv);
    expect(cases.length).toBe(1);
    expect(errors.map((e) => e.line)).toEqual([3, 4]);
  });

  it("attaches continuation rows to the previous case", () => {
    const csv = toCsv([
      LEGACY_HEADERS,
      ["", "Case", "", "", "", "", "", "", "", "", "", "", "s1", "", "e1"],
      ["", "", "", "", "", "", "", "", "", "", "", "", "s2", "", "e2"],
    ]);
    const { cases, errors } = csvToCases(csv);
    expect(errors).toEqual([]);
    expect(cases[0].input.steps).toHaveLength(2);
  });

  it("rejects files missing required columns or empty files", () => {
    expect(csvToCases("foo,bar\n1,2").errors[0].message).toMatch(/Missing column/);
    expect(csvToCases("").errors[0].message).toMatch(/empty/i);
  });
});

describe("flexible column matching", () => {
  const sheet = toCsv([
    ["TC ID", "Module", "Test Case", "Pre-conditions", "Test Steps", "Test Data", "Expected Result", "Priority", "Severity", "Status", "Test Type", "Version", "Remarks"],
    ["AUTH-001", "Sign Up", "Email format validation", "On sign up page", "1. Enter bad email\n2. Submit", "Email: test", "Validation shown", "High", "Critical", "Pass", "Negative", "", "Security note"],
    ["AUTH-002", "Login", "Login works", "", "Open page", "", "Dashboard", "Medium", "Major", "Pass", "UI/UX", "", ""],
  ]);

  it("maps a differently named spreadsheet onto the case fields", () => {
    const { cases, errors, mapping, ignored } = csvToCases(sheet);
    expect(errors).toEqual([]);
    expect(cases).toHaveLength(2);
    expect(mapping).toContainEqual({ column: "Test Case", field: "title" });
    expect(mapping).toContainEqual({ column: "Test Steps", field: "stepAction" });
    expect(mapping).toContainEqual({ column: "Expected Result", field: "stepExpected" });
    expect(ignored).toEqual(expect.arrayContaining(["Status", "Version"]));
    const [a, b] = cases.map((c) => c.input);
    expect(a).toMatchObject({ title: "Email format validation", component: "Sign Up", preconditions: "On sign up page", priority: "HIGH", type: "FUNCTIONAL" });
    expect(a.steps).toEqual([{ action: "1. Enter bad email\n2. Submit", testData: "Email: test", expected: "Validation shown" }]);
    expect(a.tags).toEqual(expect.arrayContaining(["Negative", "severity: Critical"]));
    expect(a.description).toContain("Security note");
    expect(b).toMatchObject({ priority: "MEDIUM", type: "UI" });
  });

  it("keeps test_data (case level) and step_data apart when both exist", () => {
    const csv = toCsv([
      ["title", "test_data", "step_action", "step_data", "step_expected"],
      ["Case one", "case-level", "do", "step-level", "ok"],
    ]);
    const { cases, errors } = csvToCases(csv);
    expect(errors).toEqual([]);
    expect(cases[0].input.testData).toBe("case-level");
    expect(cases[0].input.steps[0].testData).toBe("step-level");
  });

  it("does not mistake 'Actual Result' for the expected result", () => {
    const csv = toCsv([["Name", "Steps", "Actual Result"], ["Some case", "do it", "it broke"]]);
    expect(csvToCases(csv).errors[0].message).toMatch(/Missing column\(s\): Expected Result/);
  });

  it("accepts priority synonyms but still rejects unknown priorities", () => {
    const csv = toCsv([
      ["title", "step_action", "step_expected", "priority"],
      ["Case major", "a", "b", "Major"],
      ["Case urgent", "a", "b", "URGENT"],
    ]);
    const { cases, errors } = csvToCases(csv);
    expect(cases[0].input.priority).toBe("HIGH");
    expect(errors).toHaveLength(1);
    expect(errors[0].line).toBe(3);
  });
});

describe("import template", () => {
  const text = readFileSync("public/templates/test-cases-import-template.csv", "utf8");

  it("uses exactly the canonical headers", () => {
    expect(parseCsv(text)[0]).toEqual(CSV_HEADERS);
  });

  it("imports cleanly with multi-step rows", () => {
    const { cases, errors } = csvToCases(text);
    expect(errors).toEqual([]);
    expect(cases.map((c) => c.input.steps.length)).toEqual([3, 1]);
  });
});

describe("header formats", () => {
  it("exports the spreadsheet-style headers", () => {
    expect(parseCsv(casesToCsv([sample]))[0]).toEqual(CSV_HEADERS);
    expect(CSV_HEADERS).toEqual(expect.arrayContaining(["Test Case", "Test Steps", "Expected Result", "Pre-conditions", "Test Type"]));
  });

  it("still imports the legacy snake_case format with case-level test_data", () => {
    const csv = toCsv([LEGACY_HEADERS, ["", "Legacy case", "", "", "case-level", "", "", "", "", "", "", "", "do", "step-level", "ok"]]);
    const { cases, errors } = csvToCases(csv);
    expect(errors).toEqual([]);
    expect(cases[0].input.testData).toBe("case-level");
    expect(cases[0].input.steps[0].testData).toBe("step-level");
  });

  it("round-trips case-level test data through Additional Test Data", () => {
    const { cases } = csvToCases(casesToCsv([{ ...sample, testData: "extra" }]));
    expect(cases[0].input.testData).toBe("extra");
  });
});
