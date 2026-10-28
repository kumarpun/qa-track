import "server-only";
import { query, queryOne, uuid, withTx } from "../db";
import { audit } from "../audit";
import { AppError, notFound } from "../errors";

export const RUN_PAGE_SIZE = 20;

const asJson = (v, fallback) => {
  if (v == null) return fallback;
  if (typeof v === "string") {
    try { return JSON.parse(v); } catch { return fallback; }
  }
  return v;
};
const escapeLike = (s) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
const toDate = (s) => (s ? new Date(s) : null);

async function nextRunCode(conn, project) {
  await query("UPDATE projects SET run_seq = run_seq + 1 WHERE id = ?", [project.id], conn);
  const row = await queryOne("SELECT run_seq FROM projects WHERE id = ? FOR UPDATE", [project.id], conn);
  return { seq: row.run_seq, code: `RUN-${project.key}-${String(row.run_seq).padStart(4, "0")}` };
}

/**
 * Create a run and freeze its test cases.
 *
 * Every selected case is copied into test_run_cases together with the content of its *latest
 * version row* (`snapshot`) and a pointer to that version. Later edits to the case create new
 * versions and never touch the run, so historical results stay interpretable.
 * Cases come from the chosen suites (direct members) plus individually picked cases, de-duplicated
 * in suite order first. Archived cases are skipped; a run needs at least one case.
 */
export async function createRun(ctx, input) {
  return withTx(async (conn) => {
    const pid = ctx.project.id;

    const suiteIds = [...new Set(input.suiteIds)];
    if (suiteIds.length) {
      const ok = await query("SELECT id FROM test_suites WHERE project_id = ? AND archived_at IS NULL AND id IN (?)", [pid, suiteIds], conn);
      if (ok.length !== suiteIds.length) throw new AppError("Some suites were not found or are archived", { fieldErrors: { suiteIds: "Invalid suite" } });
    }

    const testerIds = [...new Set(input.testerIds)];
    if (testerIds.length) {
      const ok = await query(
        `SELECT u.id FROM project_members pm JOIN users u ON u.id = pm.user_id
         WHERE pm.project_id = ? AND u.active = 1 AND pm.role <> 'VIEWER' AND u.id IN (?)`,
        [pid, testerIds],
        conn,
      );
      if (ok.length !== testerIds.length) throw new AppError("Testers must be active, non-viewer project members", { fieldErrors: { testerIds: "Invalid tester" } });
    }

    // Ordered, de-duplicated case ids: suite cases (suite order, then position), then picked cases.
    const ordered = [];
    const seen = new Set();
    const push = (id) => { if (!seen.has(id)) { seen.add(id); ordered.push(id); } };
    if (suiteIds.length) {
      const rows = await query(
        `SELECT sc.test_case_id FROM test_suite_cases sc
         JOIN test_cases tc ON tc.id = sc.test_case_id AND tc.project_id = ? AND tc.archived_at IS NULL
         WHERE sc.suite_id IN (?) ORDER BY FIELD(sc.suite_id, ?), sc.position`,
        [pid, suiteIds, suiteIds],
        conn,
      );
      rows.forEach((r) => push(r.test_case_id));
    }
    const picked = [...new Set(input.caseIds)];
    if (picked.length) {
      const ok = await query("SELECT id FROM test_cases WHERE project_id = ? AND archived_at IS NULL AND id IN (?)", [pid, picked], conn);
      if (ok.length !== picked.length) throw new AppError("Some test cases were not found or are archived", { fieldErrors: { caseIds: "Invalid test case" } });
      picked.forEach(push);
    }
    if (!ordered.length) throw new AppError("The selection contains no active test cases", { fieldErrors: { caseIds: "No active test cases selected" } });

    // Latest version row per case (locked so a concurrent edit cannot slip between read and insert).
    const versions = await query(
      `SELECT v.id, v.test_case_id, v.version, v.snapshot, tc.code
       FROM test_cases tc JOIN test_case_versions v ON v.test_case_id = tc.id AND v.version = tc.current_version
       WHERE tc.id IN (?) FOR UPDATE`,
      [ordered],
      conn,
    );
    const byCase = new Map(versions.map((v) => [v.test_case_id, v]));

    const id = uuid();
    const { seq, code } = await nextRunCode(conn, ctx.project);
    await query(
      `INSERT INTO test_runs (id, project_id, seq, code, name, description, environment, build_version, platform,
         status, planned_start, planned_end, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,'DRAFT',?,?,?)`,
      [id, pid, seq, code, input.name, input.description || null, input.environment, input.buildVersion || null,
       input.platform || "WEB", toDate(input.plannedStart), toDate(input.plannedEnd), ctx.user.id],
      conn,
    );
    for (const uid of testerIds) await query("INSERT INTO test_run_testers (run_id, user_id) VALUES (?,?)", [id, uid], conn);
    for (const sid of suiteIds) await query("INSERT INTO test_run_suites (run_id, suite_id) VALUES (?,?)", [id, sid], conn);

    for (const [i, caseId] of ordered.entries()) {
      const v = byCase.get(caseId);
      if (!v) throw new AppError("A test case has no version history", { code: "INTEGRITY", status: 500 });
      const content = asJson(v.snapshot, {});
      const snapshot = { ...content, code: v.code, version: v.version };
      await query(
        `INSERT INTO test_run_cases (id, run_id, test_case_id, test_case_version_id, position, snapshot)
         VALUES (?,?,?,?,?,?)`,
        [uuid(), id, caseId, v.id, i + 1, JSON.stringify(snapshot)],
        conn,
      );
    }
    await audit({
      userId: ctx.user.id, projectId: pid, action: "run.created", entityType: "test_run", entityId: id,
      metadata: { code, cases: ordered.length, suites: suiteIds.length },
    }, conn);
    return { id, code, cases: ordered.length };
  });
}

const STATUS_KEYS = ["NOT_RUN", "PASSED", "FAILED", "BLOCKED", "SKIPPED", "RETEST"];

export async function listRuns(ctx, p) {
  const where = ["r.project_id = ?"];
  const params = [ctx.project.id];
  if (p.q) {
    where.push("(r.name LIKE ? OR r.code LIKE ?)");
    const like = `%${escapeLike(p.q)}%`;
    params.push(like, like);
  }
  if (p.status) { where.push("r.status = ?"); params.push(p.status); }
  if (p.environment) { where.push("r.environment = ?"); params.push(p.environment); }
  if (p.build) { where.push("r.build_version LIKE ?"); params.push(`%${escapeLike(p.build)}%`); }
  const w = where.join(" AND ");

  const { n } = await queryOne(`SELECT COUNT(*) AS n FROM test_runs r WHERE ${w}`, params);
  const rows = await query(
    `SELECT r.id, r.code, r.name, r.environment, r.build_version, r.platform, r.status, r.created_at, r.started_at, r.completed_at
     FROM test_runs r WHERE ${w}
     ORDER BY r.seq DESC LIMIT ? OFFSET ?`,
    [...params, RUN_PAGE_SIZE, (p.page - 1) * RUN_PAGE_SIZE],
  );
  // One grouped query for the page's runs instead of a correlated subquery per status.
  const countsByRun = new Map(rows.map((r) => [r.id, Object.fromEntries(STATUS_KEYS.map((k) => [k, 0]))]));
  if (rows.length) {
    const grouped = await query(
      "SELECT run_id, status, COUNT(*) AS n FROM test_run_cases WHERE run_id IN (?) GROUP BY run_id, status",
      [rows.map((r) => r.id)],
    );
    for (const g of grouped) countsByRun.get(g.run_id)[g.status] = Number(g.n);
  }
  const withCounts = rows.map((r) => {
    const counts = countsByRun.get(r.id);
    return { ...r, counts, total: Object.values(counts).reduce((a, b) => a + b, 0) };
  });
  return { rows: withCounts, total: n, page: p.page, pageCount: Math.max(1, Math.ceil(n / RUN_PAGE_SIZE)) };
}

export async function getRun(ctx, id) {
  const run = await queryOne(
    `SELECT r.*, u.name AS created_by_name FROM test_runs r JOIN users u ON u.id = r.created_by
     WHERE r.id = ? AND r.project_id = ?`,
    [id, ctx.project.id],
  );
  if (!run) throw notFound("Run not found");
  const cases = await query(
    `SELECT c.id, c.test_case_id, c.position, c.status, c.last_executed_at, c.snapshot, a.name AS assignee_name
     FROM test_run_cases c LEFT JOIN users a ON a.id = c.assignee_id
     WHERE c.run_id = ? ORDER BY c.position`,
    [id],
  );
  const counts = Object.fromEntries(STATUS_KEYS.map((k) => [k, 0]));
  const items = cases.map((c) => {
    counts[c.status]++;
    const s = asJson(c.snapshot, {});
    return {
      id: c.id, testCaseId: c.test_case_id, position: c.position, status: c.status,
      lastExecutedAt: c.last_executed_at, assigneeName: c.assignee_name,
      code: s.code, title: s.title, priority: s.priority, version: s.version, stepCount: s.steps?.length ?? 0,
    };
  });
  const testers = await query(
    "SELECT u.id, u.name FROM test_run_testers t JOIN users u ON u.id = t.user_id WHERE t.run_id = ? ORDER BY u.name",
    [id],
  );
  const suites = await query(
    "SELECT s.id, s.name FROM test_run_suites rs JOIN test_suites s ON s.id = rs.suite_id WHERE rs.run_id = ? ORDER BY s.name",
    [id],
  );
  return { ...run, counts, total: items.length, items, testers, suites };
}

/** Choices for the "new run" form: active suites, active cases (capped), and assignable testers. */
export const FORM_CASE_LIMIT = 500;
export async function runFormOptions(ctx) {
  const pid = ctx.project.id;
  const [suites, cases, testers] = await Promise.all([
    query(
      `SELECT s.id, s.name,
              (SELECT COUNT(*) FROM test_suite_cases sc JOIN test_cases tc ON tc.id = sc.test_case_id
                WHERE sc.suite_id = s.id AND tc.archived_at IS NULL) AS case_count
       FROM test_suites s WHERE s.project_id = ? AND s.archived_at IS NULL ORDER BY s.name`,
      [pid],
    ),
    query(
      "SELECT id, code, title FROM test_cases WHERE project_id = ? AND archived_at IS NULL ORDER BY seq LIMIT ?",
      [pid, FORM_CASE_LIMIT],
    ),
    query(
      `SELECT u.id, u.name FROM project_members pm JOIN users u ON u.id = pm.user_id
       WHERE pm.project_id = ? AND u.active = 1 AND pm.role <> 'VIEWER' ORDER BY u.name`,
      [pid],
    ),
  ]);
  return { suites, cases, testers };
}

export async function getRunProjectId(id) {
  const row = await queryOne("SELECT project_id FROM test_runs WHERE id = ?", [id]);
  return row?.project_id ?? null;
}
