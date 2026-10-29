// Tolerant CSV column matching: maps whatever headers a file uses ("Test Case", "Pre-conditions", "Expected Result"…)
// onto the importer's canonical fields, and normalises common value spellings (priority "Major", type "UI/UX"…).

const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Canonical field -> { exact: normalised header names, like: substrings for the last-resort fuzzy pass }. */
const FIELDS = {
  code: { exact: ["code", "tcid", "id", "caseid", "testcaseid", "testid", "key", "number"], like: [] },
  title: {
    exact: ["title", "testcase", "testcasename", "testcasetitle", "casename", "casetitle", "testname", "name", "scenario", "testscenario", "summary"],
    like: ["title", "testcase", "scenario"],
  },
  description: { exact: ["description", "desc", "details", "objective", "purpose"], like: ["description", "objective"] },
  preconditions: { exact: ["preconditions", "precondition", "prerequisites", "prerequisite", "prereq", "setup", "given"], like: ["precondition", "prerequisite"] },
  testData: { exact: [], like: [] },
  priority: { exact: ["priority", "prio", "importance"], like: ["priority"] },
  type: { exact: ["type", "testtype", "casetype", "category", "kind"], like: ["type"] },
  automation: { exact: ["automation", "automationstatus", "automated", "executiontype", "automationtype"], like: ["automat"] },
  component: { exact: ["component", "module", "feature", "area", "functionalarea", "submodule", "section"], like: ["component", "module", "feature"] },
  tags: { exact: ["tags", "tag", "labels", "label", "keywords"], like: ["tag", "label"] },
  requirementUrl: { exact: ["requirementurl", "requirement", "requirementid", "requirementlink", "story", "userstory", "ticket", "jira"], like: ["requirement", "story"] },
  assigneeEmail: { exact: ["assigneeemail", "assignee", "assignedto", "owner", "tester"], like: ["assignee", "assigned"] },
  stepAction: {
    exact: ["stepaction", "teststeps", "teststep", "steps", "step", "action", "actions", "procedure", "testprocedure", "stepdescription", "stepstoreproduce", "stepstoexecute", "testaction"],
    like: ["step", "action", "procedure"],
  },
  stepData: { exact: ["stepdata", "testdata", "data", "inputdata", "input", "testinput"], like: ["stepdata"] },
  stepExpected: {
    exact: ["stepexpected", "expectedresult", "expectedresults", "expected", "expectedoutcome", "expectedbehavior", "expectedbehaviour", "expectedresponse"],
    like: ["expected"],
  },
  // Not case fields, but worth keeping instead of dropping.
  severity: { exact: ["severity"], like: ["severity"] },
  notes: { exact: ["remarks", "remark", "notes", "note", "comments", "comment"], like: ["remark", "note", "comment"] },
};

// Matching order matters for the fuzzy pass: more specific fields claim columns first.
const ORDER = [
  "code", "stepExpected", "stepData", "testData", "preconditions", "stepAction", "title", "description", "priority",
  "type", "automation", "component", "tags", "requirementUrl", "assigneeEmail", "severity", "notes",
];

// Never fuzzy-match a column that describes what actually happened or the pass/fail state of a past run.
const REJECT = ["actual", "status", "executed", "date", "version", "bug", "defect"];

/** The importer's own export headers (and the older snake_case ones); an exact case-insensitive match always wins over aliases. */
const CANONICAL = {
  code: ["tc id", "code"], title: ["test case", "title"], description: ["description"],
  preconditions: ["pre-conditions", "preconditions"], testData: ["additional test data", "test_data"],
  priority: ["priority"], type: ["test type", "type"], automation: ["automation"], component: ["module", "component"],
  tags: ["tags"], requirementUrl: ["requirement url", "requirement_url"], assigneeEmail: ["assignee email", "assignee_email"],
  stepAction: ["test steps", "step_action"], stepData: ["test data", "step_data"], stepExpected: ["expected result", "step_expected"],
};

/**
 * Map header cells to canonical fields in three passes: own export names, known aliases, then fuzzy substrings.
 * "Test Data" is step data (it sits next to the steps in most spreadsheets);
 * only "Additional Test Data" or the legacy `test_data` header means case-level data.
 * Returns { index: { field: columnIndex }, mapping: [{ column, field }], ignored: [column names] }.
 */
export function mapColumns(headerCells) {
  const raw = headerCells.map((h) => h.trim().toLowerCase());
  const names = headerCells.map(norm);
  const index = {};
  const claimed = new Set();
  const pass = (match) => {
    for (const field of ORDER) {
      if (index[field] != null) continue;
      const i = names.findIndex((n, k) => n && !claimed.has(k) && match(field, n, k));
      if (i >= 0) {
        index[field] = i;
        claimed.add(i);
      }
    }
  };
  pass((field, _n, k) => CANONICAL[field]?.includes(raw[k]));
  pass((field, n) => FIELDS[field].exact.includes(n));
  pass((field, n) => FIELDS[field].like.length > 0 && !REJECT.some((r) => n.includes(r)) && FIELDS[field].like.some((l) => n.includes(l)));

  const mapping = Object.entries(index).map(([field, i]) => ({ column: headerCells[i].trim(), field }));
  const ignored = headerCells.map((h, i) => (claimed.has(i) || !h.trim() ? null : h.trim())).filter(Boolean);
  return { index, mapping, ignored };
}

const lookup = (table, raw) => table[norm(raw)];

const PRIORITY = {
  critical: "CRITICAL", blocker: "CRITICAL", highest: "CRITICAL", p0: "CRITICAL", p1: "HIGH", sev1: "CRITICAL",
  high: "HIGH", major: "HIGH", p2: "MEDIUM", sev2: "HIGH",
  medium: "MEDIUM", med: "MEDIUM", normal: "MEDIUM", moderate: "MEDIUM", average: "MEDIUM", p3: "LOW", sev3: "MEDIUM",
  low: "LOW", minor: "LOW", trivial: "LOW", lowest: "LOW", p4: "LOW", sev4: "LOW",
};

const TYPE = {
  functional: "FUNCTIONAL", positive: "FUNCTIONAL", negative: "FUNCTIONAL", boundary: "FUNCTIONAL", validation: "FUNCTIONAL",
  edgecase: "FUNCTIONAL", edge: "FUNCTIONAL", acceptance: "FUNCTIONAL", uat: "FUNCTIONAL", e2e: "FUNCTIONAL", endtoend: "FUNCTIONAL",
  regression: "REGRESSION", smoke: "SMOKE", sanity: "SMOKE", integration: "INTEGRATION", api: "API", service: "API",
  ui: "UI", uiux: "UI", ux: "UI", gui: "UI", usability: "UI", visual: "UI", accessibility: "UI", frontend: "UI", compatibility: "UI",
  performance: "PERFORMANCE", load: "PERFORMANCE", stress: "PERFORMANCE", security: "SECURITY",
};

const AUTOMATION = {
  manual: "MANUAL", no: "MANUAL", false: "MANUAL", notautomated: "MANUAL",
  automated: "AUTOMATED", automation: "AUTOMATED", auto: "AUTOMATED", yes: "AUTOMATED", true: "AUTOMATED",
  tobeautomated: "TO_BE_AUTOMATED", planned: "TO_BE_AUTOMATED", candidate: "TO_BE_AUTOMATED", todo: "TO_BE_AUTOMATED",
};

/** Unknown priority/automation values are left upper-cased so validation still reports them with their line. */
export const normalizePriority = (v) => (v ? lookup(PRIORITY, v) ?? v.toUpperCase() : undefined);
export const normalizeAutomation = (v) => (v ? lookup(AUTOMATION, v) ?? v.toUpperCase() : undefined);

/**
 * Types are free-form in most spreadsheets, so nothing is rejected: unknown or non-canonical values
 * (e.g. "Negative") fall back to FUNCTIONAL and the original wording is kept as a tag.
 */
export function normalizeType(v) {
  if (!v) return { type: undefined, tag: null };
  const mapped = lookup(TYPE, v);
  const exact = norm(v) === norm(mapped ?? "");
  return { type: mapped ?? "FUNCTIONAL", tag: exact ? null : v.trim() };
}
