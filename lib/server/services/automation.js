import "server-only";
import { AppError } from "../errors";
import { parseCaseSteps } from "@/lib/automation/parse-steps";
import { browserRunsEnabled } from "../automation/config";
import { blockedReason } from "../automation/url-guard";
import { runInBrowser } from "../automation/browser-runner";
import { saveShot } from "../automation/storage";
import { getCase, recordAutoRun } from "./testcases";
import { getRunCase, recordExecution } from "./executions";

/** Parse steps and refuse (before launching anything) when they are empty, outside the grammar, or target blocked URLs. */
function prepareInstructions(steps) {
  const { instructions, unsupported } = parseCaseSteps(steps);
  if (!instructions.length && !unsupported.length) throw new AppError("This test case has no steps to run");
  if (unsupported.length) {
    const list = unsupported.slice(0, 4).map((u) => `“${u.line}”`).join(", ");
    throw new AppError(`Cannot run in a browser. Unsupported ${unsupported.length === 1 ? "line" : "lines"}: ${list}`, { code: "NOT_AUTOMATABLE" });
  }
  // Refuse before launching anything: the browser may only visit public web pages (see url-guard.js).
  for (const ins of instructions) {
    const reason = ins.url ? blockedReason(ins.url) : null;
    if (reason) throw new AppError(`Cannot run in a browser. “${ins.source}” is blocked: ${reason}`, { code: "BLOCKED_URL" });
  }
  return instructions;
}

const assertEnabled = () => {
  if (!browserRunsEnabled()) throw new AppError("Browser runs are disabled on this server (set ENABLE_BROWSER_RUNS=1)", { code: "DISABLED", status: 403 });
};

/** Run a case's keyword-grammar steps in a real browser, then store the log and set the case status. */
export async function runCaseInBrowser(ctx, id, options = {}) {
  assertEnabled();
  const tc = await getCase(ctx, id);
  const instructions = prepareInstructions(tc.steps);
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
  assertEnabled();
  const rc = await getRunCase(ctx, runCaseId);
  if (rc.runStatus !== "DRAFT" && rc.runStatus !== "IN_PROGRESS") {
    throw new AppError(`This run is ${rc.runStatus.toLowerCase()}; reopen it to record results`, { code: "RUN_CLOSED", status: 409 });
  }
  const instructions = prepareInstructions(rc.snapshot.steps);
  const res = await runInBrowser(instructions, options);
  if (res.busy) throw new AppError("Another browser run is in progress. Try again in a moment.", { code: "BUSY", status: 409 });
  const failedAt = res.log.find((l) => !l.ok)?.detail ?? null;
  const logText = res.log.map((l) => `${l.ok ? "✓" : "✗"} ${l.n}. ${l.line}${l.detail ? ` — ${l.detail}` : ""}`).join("\n");
  await recordExecution(ctx, runCaseId, {
    status: res.status,
    actualResult: res.status === "FAILED" ? (failedAt ?? "Browser run failed").slice(0, 2000) : null,
    comment: `Browser run (${options.headless ? "headless" : "visible"}):\n${logText}`.slice(0, 4000),
    steps: [],
    defectIds: [],
  });
  return { status: res.status, failedAt };
}
