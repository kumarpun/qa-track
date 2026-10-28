// Single source of truth for run/progress math. Used by dashboard, runs and reports.
export const EXEC_STATUSES = ["NOT_RUN", "PASSED", "FAILED", "BLOCKED", "SKIPPED", "RETEST"];

export const STATUS_LABELS = {
  NOT_RUN: "Not Run",
  PASSED: "Passed",
  FAILED: "Failed",
  BLOCKED: "Blocked",
  SKIPPED: "Skipped",
  RETEST: "Retest",
};

/**
 * counts: { NOT_RUN, PASSED, FAILED, BLOCKED, SKIPPED, RETEST } (missing keys = 0).
 *
 * - completed = PASSED + FAILED + BLOCKED + SKIPPED (a final outcome was recorded)
 * - RETEST is *pending*: it is a failed case awaiting another attempt, so it is neither
 *   completed nor passed, and it keeps the run below 100%.
 * - passRate = PASSED / total (denominator includes unexecuted + retest, so it cannot be inflated)
 * - executedPassRate = PASSED / completed (quality of what has actually been run)
 */
export function computeProgress(counts = {}) {
  const c = Object.fromEntries(EXEC_STATUSES.map((s) => [s, Number(counts[s] ?? 0)]));
  const total = EXEC_STATUSES.reduce((n, s) => n + c[s], 0);
  const completed = c.PASSED + c.FAILED + c.BLOCKED + c.SKIPPED;
  const pct = (n, d) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);
  return {
    ...c,
    total,
    completed,
    pending: total - completed,
    progressPct: pct(completed, total),
    passRate: pct(c.PASSED, total),
    executedPassRate: pct(c.PASSED, completed),
  };
}

/** Sum an array of count objects. */
export function sumCounts(list) {
  const out = Object.fromEntries(EXEC_STATUSES.map((s) => [s, 0]));
  for (const row of list) for (const s of EXEC_STATUSES) out[s] += Number(row[s] ?? 0);
  return out;
}
