import "server-only";
import { query } from "../db";
import { toCsv } from "@/lib/csv";
import { computeProgress, EXEC_STATUSES, STATUS_LABELS, sumCounts } from "@/lib/metrics";
import { DEFECT_STATUSES, SEVERITIES } from "@/lib/validation/defect";

export const REPORT_RUN_LIMIT = 200;
const asJson = (v) => (typeof v === "string" ? JSON.parse(v) : v ?? {});

async function runsWithCounts(ctx) {
  const runs = await query(
    `SELECT id, code, name, status, environment, build_version, created_at
     FROM test_runs WHERE project_id = ? ORDER BY seq DESC LIMIT ?`,
    [ctx.project.id, REPORT_RUN_LIMIT],
  );
  const counts = new Map(runs.map((r) => [r.id, {}]));
  if (runs.length) {
    const grouped = await query(
      "SELECT run_id, status, COUNT(*) AS n FROM test_run_cases WHERE run_id IN (?) GROUP BY run_id, status",
      [runs.map((r) => r.id)],
    );
    for (const g of grouped) counts.get(g.run_id)[g.status] = Number(g.n);
  }
  return runs.map((r) => ({ ...r, progress: computeProgress(counts.get(r.id)) }));
}

/** Everything the reports page shows, from live DB rows. Pass rate uses computeProgress (Retest stays pending). */
export async function getReport(ctx) {
  const pid = ctx.project.id;
  const runs = await runsWithCounts(ctx);
  const overall = computeProgress(sumCounts(runs.map((r) => r.progress)));

  const defectRows = await query("SELECT status, severity, COUNT(*) AS n FROM defects WHERE project_id = ? GROUP BY status, severity", [pid]);
  const bySeverity = Object.fromEntries(SEVERITIES.map((s) => [s, 0]));
  const byStatus = Object.fromEntries(DEFECT_STATUSES.map((s) => [s, 0]));
  for (const d of defectRows) { bySeverity[d.severity] += Number(d.n); byStatus[d.status] += Number(d.n); }

  const topFailing = await query(
    `SELECT tc.code, tc.title, COUNT(*) AS failures
     FROM test_executions e JOIN test_run_cases c ON c.id = e.run_case_id JOIN test_runs r ON r.id = c.run_id
     JOIN test_cases tc ON tc.id = c.test_case_id
     WHERE r.project_id = ? AND e.status = 'FAILED'
     GROUP BY tc.id, tc.code, tc.title ORDER BY failures DESC, tc.code LIMIT 10`,
    [pid],
  );
  return { runs, overall, defects: { bySeverity, byStatus, total: Object.values(byStatus).reduce((a, b) => a + b, 0) }, topFailing: topFailing.map((t) => ({ ...t, failures: Number(t.failures) })) };
}

const pctCell = (p, total) => (total ? `${p}%` : "");

export async function exportReportCsv(ctx, type) {
  if (type === "defects") {
    const rows = await query(
      `SELECT d.code, d.title, d.status, d.severity, d.priority, a.name AS assignee,
              (SELECT COUNT(*) FROM test_execution_defects x WHERE x.defect_id = d.id) AS executions
       FROM defects d LEFT JOIN users a ON a.id = d.assignee_id WHERE d.project_id = ? ORDER BY d.seq`,
      [ctx.project.id],
    );
    return toCsv([["Code", "Title", "Status", "Severity", "Priority", "Assignee", "Linked executions"],
      ...rows.map((r) => [r.code, r.title, r.status, r.severity, r.priority, r.assignee ?? "", r.executions])]);
  }
  if (type === "cases") {
    const rows = await query(
      `SELECT r.code AS run_code, r.name AS run_name, c.status, c.last_executed_at, c.snapshot
       FROM test_run_cases c JOIN test_runs r ON r.id = c.run_id
       WHERE r.project_id = ? ORDER BY r.seq DESC, c.position`,
      [ctx.project.id],
    );
    return toCsv([["Run", "Run name", "Case", "Title", "Priority", "Status", "Last executed"],
      ...rows.map((r) => {
        const s = asJson(r.snapshot);
        return [r.run_code, r.run_name, s.code, s.title, s.priority ?? "", STATUS_LABELS[r.status], r.last_executed_at ? new Date(r.last_executed_at).toISOString() : ""];
      })]);
  }
  const runs = await runsWithCounts(ctx);
  return toCsv([["Run", "Name", "Status", "Environment", "Build", ...EXEC_STATUSES.map((s) => STATUS_LABELS[s]), "Total", "Progress %", "Pass rate %"],
    ...runs.map((r) => [r.code, r.name, r.status, r.environment, r.build_version ?? "", ...EXEC_STATUSES.map((s) => r.progress[s]),
      r.progress.total, pctCell(r.progress.progressPct, r.progress.total), pctCell(r.progress.passRate, r.progress.total)])]);
}
