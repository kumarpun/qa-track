import "server-only";
import { query } from "../db";
import { computeProgress } from "@/lib/metrics";

/** All dashboard numbers for one project, straight from the DB. Execution cards describe the latest run (newest created_at); the trend spans all runs. */
export async function getDashboard(projectId) {
  const [[cases], [suites], runs, defectRows, recentRuns, trend] = await Promise.all([
    query("SELECT COUNT(*) AS n FROM test_cases WHERE project_id = ?", [projectId]),
    query("SELECT COUNT(*) AS n FROM test_suites WHERE project_id = ? AND archived_at IS NULL", [projectId]),
    query("SELECT status, COUNT(*) AS n FROM test_runs WHERE project_id = ? GROUP BY status", [projectId]),
    query("SELECT status, COUNT(*) AS n FROM defects WHERE project_id = ? GROUP BY status", [projectId]),
    query(
      `SELECT r.id, r.code, r.name, r.status, r.environment, r.created_at,
              SUM(trc.status='NOT_RUN') AS NOT_RUN, SUM(trc.status='PASSED') AS PASSED, SUM(trc.status='FAILED') AS FAILED,
              SUM(trc.status='BLOCKED') AS BLOCKED, SUM(trc.status='SKIPPED') AS SKIPPED, SUM(trc.status='RETEST') AS RETEST
       FROM test_runs r LEFT JOIN test_run_cases trc ON trc.run_id = r.id
       WHERE r.project_id = ? GROUP BY r.id ORDER BY r.created_at DESC LIMIT 5`,
      [projectId],
    ),
    query(
      `SELECT DATE_FORMAT(r.created_at, '%Y-%m-%d') AS day,
              SUM(trc.status='PASSED') AS PASSED, SUM(trc.status='FAILED') AS FAILED,
              SUM(trc.status='BLOCKED') AS BLOCKED, SUM(trc.status='SKIPPED') AS SKIPPED,
              SUM(trc.status='NOT_RUN') AS NOT_RUN, SUM(trc.status='RETEST') AS RETEST
       FROM test_runs r JOIN test_run_cases trc ON trc.run_id = r.id
       WHERE r.project_id = ? AND r.created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
       GROUP BY day ORDER BY day`,
      [projectId],
    ),
  ]);
  const byStatus = (rows) => Object.fromEntries(rows.map((r) => [r.status, Number(r.n)]));
  const runCounts = byStatus(runs);
  const defects = byStatus(defectRows);
  return {
    totalCases: Number(cases.n),
    totalSuites: Number(suites.n),
    runCounts,
    totalRuns: Object.values(runCounts).reduce((a, b) => a + b, 0),
    latestRun: recentRuns[0] ? { id: recentRuns[0].id, code: recentRuns[0].code, name: recentRuns[0].name } : null,
    progress: computeProgress(recentRuns[0]),
    defects,
    openDefects: ["OPEN", "IN_PROGRESS", "REOPENED", "RETEST"].reduce((n, s) => n + (defects[s] ?? 0), 0),
    recentRuns: recentRuns.map((r) => ({ ...r, progress: computeProgress(r) })),
    trend: trend.map((t) => ({ day: t.day, passRate: computeProgress(t).passRate })),
  };
}
