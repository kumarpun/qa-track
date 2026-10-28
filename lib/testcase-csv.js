// Pure mapping between test cases and the CSV format (one row per step; a row with a title starts a new case).
import { parseCsv, toCsv } from "./csv";
import { testCaseSchema } from "./validation/testcase";

export const CSV_HEADERS = [
  "code", "title", "description", "preconditions", "test_data", "priority", "type", "automation",
  "component", "tags", "requirement_url", "assignee_email", "step_action", "step_data", "step_expected",
];
export const MAX_IMPORT_CASES = 500;

export function casesToCsv(cases) {
  const rows = [CSV_HEADERS];
  for (const c of cases) {
    const steps = c.steps.length ? c.steps : [{ action: "", testData: "", expected: "" }];
    steps.forEach((s, i) => {
      const head = i === 0
        ? [c.code, c.title, c.description, c.preconditions, c.testData, c.priority, c.type, c.automation,
           c.component, (c.tags ?? []).join(";"), c.requirementUrl, c.assigneeEmail ?? ""]
        : Array(12).fill("");
      rows.push([...head, s.action, s.testData, s.expected]);
    });
  }
  return toCsv(rows);
}

// Undo the quote prefix added by safeCell() on export so round-trips are lossless.
const unquote = (v) => (/^'[=+\-@\t\r]/.test(v) ? v.slice(1) : v);

/**
 * Parse CSV text into validated test case inputs.
 * Returns { cases: [{ line, input, assigneeEmail }], errors: [{ line, message }] }. Nothing is thrown for bad rows.
 */
export function csvToCases(text) {
  let rows;
  try {
    rows = parseCsv(text);
  } catch (e) {
    return { cases: [], errors: [{ line: 1, message: e.message }] };
  }
  if (!rows.length) return { cases: [], errors: [{ line: 1, message: "File is empty" }] };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const missing = ["title", "step_action", "step_expected"].filter((h) => !header.includes(h));
  if (missing.length) return { cases: [], errors: [{ line: 1, message: `Missing column(s): ${missing.join(", ")}` }] };
  const col = (r, name) => {
    const i = header.indexOf(name);
    return i < 0 ? "" : unquote((r[i] ?? "").trim());
  };

  const drafts = [];
  const errors = [];
  rows.slice(1).forEach((r, idx) => {
    const line = idx + 2;
    const step = { action: col(r, "step_action"), testData: col(r, "step_data"), expected: col(r, "step_expected") };
    const hasStep = step.action || step.testData || step.expected;
    if (col(r, "title")) {
      drafts.push({
        line,
        assigneeEmail: col(r, "assignee_email").toLowerCase(),
        raw: {
          title: col(r, "title"),
          description: col(r, "description"),
          preconditions: col(r, "preconditions"),
          testData: col(r, "test_data"),
          priority: col(r, "priority").toUpperCase() || undefined,
          type: col(r, "type").toUpperCase() || undefined,
          automation: col(r, "automation").toUpperCase() || undefined,
          component: col(r, "component"),
          tags: col(r, "tags").split(/[;|]/).map((t) => t.trim()).filter(Boolean),
          requirementUrl: col(r, "requirement_url"),
          steps: hasStep ? [step] : [],
        },
      });
    } else if (hasStep) {
      if (!drafts.length) errors.push({ line, message: "Step row appears before any test case" });
      else drafts[drafts.length - 1].raw.steps.push(step);
    }
  });

  if (drafts.length > MAX_IMPORT_CASES)
    return { cases: [], errors: [{ line: 1, message: `Too many test cases (max ${MAX_IMPORT_CASES} per import)` }] };

  const cases = [];
  for (const d of drafts) {
    const parsed = testCaseSchema.safeParse(d.raw);
    if (!parsed.success) {
      for (const i of parsed.error.issues)
        errors.push({ line: d.line, message: `${i.path.join(".") || "row"}: ${i.message}` });
    } else cases.push({ line: d.line, input: parsed.data, assigneeEmail: d.assigneeEmail });
  }
  return { cases, errors };
}
