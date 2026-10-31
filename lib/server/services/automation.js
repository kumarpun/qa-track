import "server-only";
import { AppError } from "../errors";
import { parseCaseSteps } from "@/lib/automation/parse-steps";
import { browserRunMode } from "../automation/config";
import { blockedReason } from "../automation/url-guard";
import { runInBrowser } from "../automation/browser-runner";
import { saveShot } from "../automation/storage";
import { getCase, findCaseByRef, recordAutoRun } from "./testcases";
import { getRunCase, recordExecution } from "./executions";

const MAX_CALL_DEPTH = 3;
const notAutomatable = (msg) => new AppError(`Cannot run in a browser. ${msg}`, { code: "NOT_AUTOMATABLE" });

/** Parse steps, expanding "Call <case>" lines into the called case's steps (depth-limited, cycle-safe). */
async function expand(ctx, steps, trail) {
  const { instructions, unsupported } = parseCaseSteps(steps);
  if (unsupported.length) {
    const list = unsupported.slice(0, 4).map((u) => `“${u.line}”`).join(", ");
    const where = trail.length ? ` in called case ${trail[trail.length - 1].code}` : "";
    throw notAutomatable(`Unsupported ${unsupported.length === 1 ? "line" : "lines"}${where}: ${list}`);
  }
  const out = [];
  for (const ins of instructions) {
    if (ins.kind !== "call") { out.push(ins); continue; }
    if (trail.length >= MAX_CALL_DEPTH) throw notAutomatable(`“${ins.source}” nests test cases deeper than ${MAX_CALL_DEPTH} levels`);
    const called = await findCaseByRef(ctx, ins.ref);
    if (trail.some((t) => t.id === called.id)) throw notAutomatable(`“${ins.source}” calls ${called.code} recursively`);
    const inner = await expand(ctx, called.steps, [...trail, called]);
    if (!inner.length) throw notAutomatable(`Called case ${called.code} has no steps`);
    out.push(...inner.map((i) => ({ ...i, source: `[${called.code}] ${i.source}` })));
  }
  return out;
}

/** Parse steps and refuse (before launching anything) when they are empty, outside the grammar, or target blocked URLs. */
async function prepareInstructions(ctx, steps, self) {
  const instructions = await expand(ctx, steps, self ? [self] : []);
  if (!instructions.length) throw new AppError("This test case has no steps to run");
  // Refuse before launching anything: the browser may only visit public web pages (see url-guard.js).
  for (const ins of instructions) {
    const reason = ins.url ? blockedReason(ins.url) : null;
    if (reason) throw new AppError(`Cannot run in a browser. “${ins.source}” is blocked: ${reason}`, { code: "BLOCKED_URL" });
  }
  return instructions;
}

/** Returns "server" or "local" (see config.js); throws when browser runs are off for this deployment. */
const runMode = () => {
  const mode = browserRunMode();
  if (!mode) throw new AppError("Browser runs are disabled on this server (set ENABLE_BROWSER_RUNS=1)", { code: "DISABLED", status: 403 });
  return mode;
};
const assertLocalMode = () => {
  if (runMode() !== "local") throw new AppError("This server runs browsers itself; local-runner results are not accepted", { code: "DISABLED", status: 403 });
};
const failedAtOf = (log) => log.find((l) => !l.ok)?.detail ?? null;
const formatLog = (log) => log.map((l) => `${l.ok ? "✓" : "✗"} ${l.n}. ${l.line}${l.detail ? ` — ${l.detail}` : ""}`).join("\n");

async function assertRunCaseOpen(ctx, runCaseId) {
  const rc = await getRunCase(ctx, runCaseId);
  if (rc.runStatus !== "DRAFT" && rc.runStatus !== "IN_PROGRESS") {
    throw new AppError(`This run is ${rc.runStatus.toLowerCase()}; reopen it to record results`, { code: "RUN_CLOSED", status: 409 });
  }
  return rc;
}

/** Local mode, step 1: validated steps for the user's own runner (nothing runs or is saved yet). */
export async function prepareCaseRun(ctx, id) {
  assertLocalMode();
  const tc = await getCase(ctx, id);
  return { instructions: await prepareInstructions(ctx, tc.steps, { id: tc.id, code: tc.code }), startedAt: new Date().toISOString() };
}

/** Local mode, step 2: store the outcome the runner reported and set the case status (no screenshot: this server's disk is ephemeral). */
export async function finishCaseRun(ctx, id, { status, log, finalUrl }, startedAt) {
  assertLocalMode();
  await getCase(ctx, id);
  await recordAutoRun(ctx, id, { status, startedAt: new Date(startedAt), finishedAt: new Date(), log, finalUrl, screenshotKey: null });
  return { status, failedAt: failedAtOf(log) };
}

export async function prepareRunCaseRun(ctx, runCaseId) {
  assertLocalMode();
  const rc = await assertRunCaseOpen(ctx, runCaseId);
  return { instructions: await prepareInstructions(ctx, rc.snapshot.steps) };
}

export async function finishRunCaseRun(ctx, runCaseId, { status, log }, options = {}) {
  assertLocalMode();
  await assertRunCaseOpen(ctx, runCaseId);
  const failedAt = failedAtOf(log);
  await recordExecution(ctx, runCaseId, {
    status,
    actualResult: status === "FAILED" ? (failedAt ?? "Browser run failed").slice(0, 2000) : null,
    comment: `Browser run on tester's machine (${options.headless ? "headless" : "visible"}):\n${formatLog(log)}`.slice(0, 4000),
    steps: [],
    defectIds: [],
  });
  return { status, failedAt };
}

/** Run a case's keyword-grammar steps in a real browser, then store the log and set the case status. */
export async function runCaseInBrowser(ctx, id, options = {}) {
  if (runMode() === "local") return { local: true, ...(await prepareCaseRun(ctx, id)) };
  const tc = await getCase(ctx, id);
  const instructions = await prepareInstructions(ctx, tc.steps, { id: tc.id, code: tc.code });
  const startedAt = new Date();
  const res = await runInBrowser(instructions, options);
  if (res.busy) throw new AppError("Another browser run is in progress. Try again in a moment.", { code: "BUSY", status: 409 });
  const screenshotKey = res.screenshot ? await saveShot(ctx.project.id, res.screenshot) : null;
  await recordAutoRun(ctx, id, { status: res.status, startedAt, finishedAt: new Date(), log: res.log, finalUrl: res.finalUrl, screenshotKey });
  return { status: res.status, failedAt: res.log.find((l) => !l.ok)?.detail ?? null };
}

/**
 * Run a run case's frozen snapshot steps in a browser and record the outcome as a normal execution
 * (appended to the run case history, so the run, reports and dashboard see it like a manual result).
 */
export async function runRunCaseInBrowser(ctx, runCaseId, options = {}) {
  if (runMode() === "local") return { local: true, ...(await prepareRunCaseRun(ctx, runCaseId)) };
  const rc = await assertRunCaseOpen(ctx, runCaseId);
  const instructions = await prepareInstructions(ctx, rc.snapshot.steps);
  const res = await runInBrowser(instructions, options);
  if (res.busy) throw new AppError("Another browser run is in progress. Try again in a moment.", { code: "BUSY", status: 409 });
  const failedAt = failedAtOf(res.log);
  const logText = formatLog(res.log);
  await recordExecution(ctx, runCaseId, {
    status: res.status,
    actualResult: res.status === "FAILED" ? (failedAt ?? "Browser run failed").slice(0, 2000) : null,
    comment: `Browser run (${options.headless ? "headless" : "visible"}):\n${logText}`.slice(0, 4000),
    steps: [],
    defectIds: [],
  });
  return { status: res.status, failedAt };
}
