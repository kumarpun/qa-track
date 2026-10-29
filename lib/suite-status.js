/**
 * A suite has no stored status: it is derived from its test cases so it can never drift.
 * counts: { PASSED, FAILED, BLOCKED, SKIPPED, IN_PROGRESS, NOT_EXECUTED } (missing keys = 0).
 *
 * - any case failed -> FAILED (one failure fails the suite)
 * - else any blocked -> BLOCKED
 * - else every case passed -> PASSED; every case skipped -> SKIPPED; none executed (or empty) -> NOT_EXECUTED
 * - otherwise work is partly done -> IN_PROGRESS
 */
export function deriveSuiteStatus(counts = {}) {
  const n = (k) => Number(counts[k] ?? 0);
  const total = ["PASSED", "FAILED", "BLOCKED", "SKIPPED", "IN_PROGRESS", "NOT_EXECUTED"].reduce((a, k) => a + n(k), 0);
  if (n("FAILED") > 0) return "FAILED";
  if (n("BLOCKED") > 0) return "BLOCKED";
  if (total === 0 || n("NOT_EXECUTED") === total) return "NOT_EXECUTED";
  if (n("PASSED") === total) return "PASSED";
  if (n("SKIPPED") === total) return "SKIPPED";
  return "IN_PROGRESS";
}
