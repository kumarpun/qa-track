// Pure mapping between test cases and the CSV format (one row per step; a row with a title starts a new case).
import { parseCsv, toCsv } from "./csv";
import { testCaseSchema } from "./validation/testcase";
import { mapColumns, normalizePriority, normalizeType, normalizeAutomation } from "./csv-columns";

// Header names follow common spreadsheet wording; csv-columns.js still accepts the older snake_case names and many aliases.
export const CSV_HEADERS = [
  "TC ID", "Module", "Test Case", "Description", "Pre-conditions", "Test Steps", "Test Data", "Expected Result",
  "Priority", "Test Type", "Automation", "Tags", "Requirement URL", "Assignee Email", "Additional Test Data",
];
export const MAX_IMPORT_CASES = 500;

export function casesToCsv(cases) {
  const rows = [CSV_HEADERS];
  for (const c of cases) {
    const steps = c.steps.length ? c.steps : [{ action: "", testData: "", expected: "" }];
    steps.forEach((s, i) => {
      const head = i === 0
        ? {
            "TC ID": c.code, Module: c.component, "Test Case": c.title, Description: c.description,
            "Pre-conditions": c.preconditions, Priority: c.priority, "Test Type": c.type, Automation: c.automation,
            Tags: (c.tags ?? []).join(";"), "Requirement URL": c.requirementUrl, "Assignee Email": c.assigneeEmail ?? "",
            "Additional Test Data": c.testData,
          }
        : {};
      const row = { ...head, "Test Steps": s.action, "Test Data": s.testData, "Expected Result": s.expected };
      rows.push(CSV_HEADERS.map((h) => row[h] ?? ""));
    });
  }
  return toCsv(rows);
}

// Undo the quote prefix added by safeCell() on export so round-trips are lossless.
const unquote = (v) => (/^'[=+\-@\t\r]/.test(v) ? v.slice(1) : v);

/**
 * Parse CSV text into validated test case inputs.
 * Returns { cases: [{ line, input, assigneeEmail }], errors: [{ line, message }], mapping, ignored } where mapping shows which file column fed which field. Nothing is thrown for bad rows.
 */
export function csvToCases(text) {
  let rows;
  try {
    rows = parseCsv(text);
  } catch (e) {
    return { cases: [], errors: [{ line: 1, message: e.message }] };
  }
  if (!rows.length) return { cases: [], errors: [{ line: 1, message: "File is empty" }] };
  const { index, mapping, ignored } = mapColumns(rows[0]);
  const missing = [["title", "Test Case"], ["stepAction", "Test Steps"], ["stepExpected", "Expected Result"]]
    .filter(([f]) => index[f] == null)
    .map(([, name]) => name);
  if (missing.length)
    return {
      cases: [],
      errors: [{ line: 1, message: `Missing column(s): ${missing.join(", ")}. Found: ${rows[0].map((h) => h.trim()).filter(Boolean).join(", ") || "none"}` }],
    };
  const col = (r, field) => {
    const i = index[field];
    return i == null ? "" : unquote((r[i] ?? "").trim());
  };

  const drafts = [];
  const errors = [];
  rows.slice(1).forEach((r, idx) => {
    const line = idx + 2;
    const step = { action: col(r, "stepAction"), testData: col(r, "stepData"), expected: col(r, "stepExpected") };
    const hasStep = step.action || step.testData || step.expected;
    if (col(r, "title")) {
      const { type, tag: typeTag } = normalizeType(col(r, "type"));
      const severity = col(r, "severity");
      const notes = col(r, "notes");
      const description = [col(r, "description"), notes && `Remarks: ${notes}`].filter(Boolean).join("\n\n");
      const tags = [...col(r, "tags").split(/[;|,]/), typeTag, severity && `severity: ${severity}`]
        .map((t) => (t ?? "").trim().slice(0, 40))
        .filter(Boolean);
      drafts.push({
        line,
        assigneeEmail: col(r, "assigneeEmail").toLowerCase(),
        raw: {
          title: col(r, "title"),
          description,
          preconditions: col(r, "preconditions"),
          testData: col(r, "testData"),
          priority: normalizePriority(col(r, "priority")),
          type,
          automation: normalizeAutomation(col(r, "automation")),
          component: col(r, "component"),
          tags,
          requirementUrl: col(r, "requirementUrl"),
          steps: hasStep ? [step] : [],
        },
      });
    } else if (hasStep) {
      if (!drafts.length) errors.push({ line, message: "Step row appears before any test case" });
      else drafts[drafts.length - 1].raw.steps.push(step);
    }
  });

  if (drafts.length > MAX_IMPORT_CASES)
    return { cases: [], mapping, ignored, errors: [{ line: 1, message: `Too many test cases (max ${MAX_IMPORT_CASES} per import)` }] };

  const cases = [];
  for (const d of drafts) {
    const parsed = testCaseSchema.safeParse(d.raw);
    if (!parsed.success) {
      for (const i of parsed.error.issues)
        errors.push({ line: d.line, message: `${i.path.join(".") || "row"}: ${i.message}` });
    } else cases.push({ line: d.line, input: parsed.data, assigneeEmail: d.assigneeEmail });
  }
  return { cases, errors, mapping, ignored };
}
