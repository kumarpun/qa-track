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
 * Every selected case is copied into test_run_cases as a frozen JSON `snapshot` of its content and
 * steps at that moment. Later edits to the case overwrite the case only and never touch the run,
 * so historical results stay interpretable.
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
         JOIN test_cases tc ON tc.id = sc.test_case_id AND tc.project_id = ?
         WHERE sc.suite_id IN (?) ORDER BY FIELD(sc.suite_id, ?), sc.position`,
        [pid, suiteIds, suiteIds],
        conn,
      );
      rows.forEach((r) => push(r.test_case_id));
    }
    const picked = [...new Set(input.caseIds)];
    if (picked.length) {
      const ok = await query("SELECT id FROM test_cases WHERE project_id = ? AND id IN (?)", [pid, picked], conn);
      if (ok.length !== picked.length) throw new AppError("Some test cases were not found", { fieldErrors: { caseIds: "Invalid test case" } });
      picked.forEach(push);
    }
    if (!ordered.length) throw new AppError("The selection contains no active test cases", { fieldErrors: { caseIds: "No active test cases selected" } });

    // Current content per case (locked so a concurrent edit cannot slip between read and insert).
    const cases = await query("SELECT * FROM test_cases WHERE id IN (?) FOR UPDATE", [ordered], conn);
    const stepRows = await query(
      "SELECT test_case_id, action, test_data, expected FROM test_case_steps WHERE test_case_id IN (?) ORDER BY test_case_id, position",
      [ordered],
      conn,
    );
    const stepsByCase = new Map();
    for (const st of stepRows) (stepsByCase.get(st.test_case_id) ?? stepsByCase.set(st.test_case_id, []).get(st.test_case_id)).push({ action: st.action, testData: st.test_data ?? "", expected: st.expected });
    const byCase = new Map(cases.map((c) => [c.id, c]));

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
      const c = byCase.get(caseId);
      const snapshot = {
        code: c.code, title: c.title, description: c.description ?? "", preconditions: c.preconditions ?? "",
        testData: c.test_data ?? "", priority: c.priority, type: c.type, automation: c.automation,
        component: c.component ?? "", tags: asJson(c.tags, []), requirementUrl: c.requirement_url ?? "",
        defectUrls: asJson(c.defect_urls, []), steps: stepsByCase.get(caseId) ?? [],
      };
      await query(
        `INSERT INTO test_run_cases (id, run_id, test_case_id, position, snapshot) VALUES (?,?,?,?,?)`,
        [uuid(), id, caseId, i + 1, JSON.stringify(snapshot)],
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
      code: s.code, title: s.title, priority: s.priority, stepCount: s.steps?.length ?? 0,
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
                WHERE sc.suite_id = s.id) AS case_count
       FROM test_suites s WHERE s.project_id = ? AND s.archived_at IS NULL ORDER BY s.name`,
      [pid],
    ),
    query(
      "SELECT id, code, title FROM test_cases WHERE project_id = ? ORDER BY seq LIMIT ?",
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

/**
 * Permanently delete a run with its snapshots, execution history, step results, comments and
 * evidence. Defects raised from it are kept (only the links are removed). Uploaded files are removed
 * from disk after the transaction commits.
 */
export async function deleteRun(ctx, id) {
  const keys = [];
  await withTx(async (conn) => {
    const run = await queryOne("SELECT id, code, name FROM test_runs WHERE id = ? AND project_id = ? FOR UPDATE", [id, ctx.project.id], conn);
    if (!run) throw notFound("Run not found");
    const files = await query(
      `SELECT a.storage_key FROM attachments a JOIN test_executions e ON e.id = a.execution_id
       JOIN test_run_cases c ON c.id = e.run_case_id WHERE c.run_id = ?`,
      [id],
      conn,
    );
    keys.push(...files.map((f) => f.storage_key));
    const inRun = "SELECT e.id FROM test_executions e JOIN test_run_cases c ON c.id = e.run_case_id WHERE c.run_id = ?";
    await query(`DELETE FROM test_execution_steps WHERE execution_id IN (${inRun})`, [id], conn);
    await query(`DELETE FROM test_execution_defects WHERE execution_id IN (${inRun})`, [id], conn);
    await query(`DELETE FROM attachments WHERE execution_id IN (${inRun})`, [id], conn);
    await query("DELETE FROM comments WHERE run_case_id IN (SELECT id FROM test_run_cases WHERE run_id = ?)", [id], conn);
    await query("DELETE FROM test_executions WHERE run_case_id IN (SELECT id FROM test_run_cases WHERE run_id = ?)", [id], conn);
    await query("DELETE FROM test_run_cases WHERE run_id = ?", [id], conn);
    await query("DELETE FROM test_runs WHERE id = ?", [id], conn);
    await audit({ userId: ctx.user.id, projectId: ctx.project.id, action: "run.deleted", entityType: "test_run", entityId: id, metadata: { code: run.code, name: run.name, attachments: keys.length } }, conn);
  });
  return { storageKeys: keys };
}
