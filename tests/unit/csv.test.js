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
      CSV_HEADERS,
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
      CSV_HEADERS,
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
