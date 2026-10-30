import "server-only";
import { query, queryOne, uuid, withTx } from "../db";
import { AppError, notFound } from "../errors";
import { toCsv } from "@/lib/csv";

/**
 * Defect module. createDefect/pickableDefects/linkDefects serve the execution screen (quick defect from a
 * failed result); the rest below backs the defects pages (list, detail, edit, status, delete, CSV export).
 */
export async function createDefect(ctx, input, conn) {
  const run = async (c) => {
    await query("UPDATE projects SET defect_seq = defect_seq + 1 WHERE id = ?", [ctx.project.id], c);
    const { defect_seq: seq } = await queryOne("SELECT defect_seq FROM projects WHERE id = ? FOR UPDATE", [ctx.project.id], c);
    const id = uuid();
    const code = `DEF-${ctx.project.key}-${String(seq).padStart(4, "0")}`;
    await query(
      `INSERT INTO defects (id, project_id, seq, code, title, description, severity, priority, external_url, reporter_id)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [id, ctx.project.id, seq, code, input.title, input.description || null, input.severity, input.priority, input.externalUrl || null, ctx.user.id],
      c,
    );
    return { id, code, title: input.title };
  };
  return conn ? run(conn) : withTx(run);
}

/** Defects of the project that can still be linked (everything except CLOSED), newest first. */
export async function pickableDefects(ctx, limit = 200) {
  return query(
    "SELECT id, code, title, status FROM defects WHERE project_id = ? AND status <> 'CLOSED' ORDER BY seq DESC LIMIT ?",
    [ctx.project.id, limit],
  );
}

/** Link defects to an execution. Every id must belong to the same project; links are idempotent. */
export async function linkDefects(ctx, executionId, defectIds, conn) {
  const ids = [...new Set(defectIds)];
  if (!ids.length) return 0;
  const ok = await query("SELECT id FROM defects WHERE project_id = ? AND id IN (?)", [ctx.project.id, ids], conn);
  if (ok.length !== ids.length) throw new AppError("Some defects were not found", { fieldErrors: { defectIds: "Invalid defect" } });
  for (const d of ids) {
    await query("INSERT IGNORE INTO test_execution_defects (execution_id, defect_id, linked_by) VALUES (?,?,?)", [executionId, d, ctx.user.id], conn);
  }
  return ids.length;
}

// ---- Phase 5: full defect module ----

export const DEFECT_PAGE_SIZE = 20;
const escapeLike = (s) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function getDefectProjectId(id) {
  const row = await queryOne("SELECT project_id FROM defects WHERE id = ?", [id]);
  return row?.project_id ?? null;
}

/** Assignee must be an active, non-viewer member of the project. */
async function assertAssignee(ctx, assigneeId, conn) {
  if (!assigneeId) return null;
  const ok = await queryOne(
    `SELECT u.id FROM project_members pm JOIN users u ON u.id = pm.user_id
     WHERE pm.project_id = ? AND u.id = ? AND u.active = 1 AND pm.role <> 'VIEWER'`,
    [ctx.project.id, assigneeId],
    conn,
  );
  if (!ok) throw new AppError("Assignee must be an active, non-viewer project member", { fieldErrors: { assigneeId: "Invalid assignee" } });
  return assigneeId;
}

export async function assigneeOptions(ctx) {
  return query(
    `SELECT u.id, u.name FROM project_members pm JOIN users u ON u.id = pm.user_id
     WHERE pm.project_id = ? AND u.active = 1 AND pm.role <> 'VIEWER' ORDER BY u.name`,
    [ctx.project.id],
  );
}

function listWhere(ctx, p) {
  const where = ["d.project_id = ?"];
  const params = [ctx.project.id];
  if (p.q) {
    where.push("(d.title LIKE ? OR d.code LIKE ?)");
    const like = `%${escapeLike(p.q)}%`;
    params.push(like, like);
  }
  for (const [col, v] of [["status", p.status], ["severity", p.severity], ["priority", p.priority], ["assignee_id", p.assignee]]) {
    if (v) { where.push(`d.${col} = ?`); params.push(v); }
  }
  return { w: where.join(" AND "), params };
}

export async function listDefects(ctx, p) {
  const { w, params } = listWhere(ctx, p);
  const { n } = await queryOne(`SELECT COUNT(*) AS n FROM defects d WHERE ${w}`, params);
  const rows = await query(
    `SELECT d.id, d.code, d.title, d.severity, d.priority, d.status, d.external_url, d.created_at,
            a.name AS assignee_name,
            (SELECT COUNT(*) FROM test_execution_defects x WHERE x.defect_id = d.id) AS execution_count
     FROM defects d LEFT JOIN users a ON a.id = d.assignee_id
     WHERE ${w} ORDER BY d.seq DESC LIMIT ? OFFSET ?`,
    [...params, DEFECT_PAGE_SIZE, (p.page - 1) * DEFECT_PAGE_SIZE],
  );
  return { rows, total: Number(n), page: p.page, pageCount: Math.max(1, Math.ceil(n / DEFECT_PAGE_SIZE)) };
}

/** A defect with every execution that references it (many executions → one defect), newest first. */
export async function getDefect(ctx, id) {
  const d = await queryOne(
    `SELECT d.*, a.name AS assignee_name, r.name AS reporter_name
     FROM defects d LEFT JOIN users a ON a.id = d.assignee_id JOIN users r ON r.id = d.reporter_id
     WHERE d.id = ? AND d.project_id = ?`,
    [id, ctx.project.id],
  );
  if (!d) throw notFound("Defect not found");
  const executions = await query(
    `SELECT e.id, e.status, e.executed_at, u.name AS executed_by_name,
            c.id AS run_case_id, c.snapshot, r.id AS run_id, r.code AS run_code, r.name AS run_name
     FROM test_execution_defects x
     JOIN test_executions e ON e.id = x.execution_id
     JOIN test_run_cases c ON c.id = e.run_case_id
     JOIN test_runs r ON r.id = c.run_id
     JOIN users u ON u.id = e.executed_by
     WHERE x.defect_id = ? AND r.project_id = ? ORDER BY e.executed_at DESC, e.id`,
    [id, ctx.project.id],
  );
  return {
    ...d,
    executions: executions.map((e) => {
      let snap = e.snapshot;
      if (typeof snap === "string") { try { snap = JSON.parse(snap); } catch { snap = {}; } }
      return { ...e, snapshot: undefined, caseCode: snap?.code, caseTitle: snap?.title };
    }),
  };
}

export async function createFullDefect(ctx, input) {
  return withTx(async (conn) => {
    const assignee = await assertAssignee(ctx, input.assigneeId, conn);
    await query("UPDATE projects SET defect_seq = defect_seq + 1 WHERE id = ?", [ctx.project.id], conn);
    const { defect_seq: seq } = await queryOne("SELECT defect_seq FROM projects WHERE id = ? FOR UPDATE", [ctx.project.id], conn);
    const id = uuid();
    const code = `DEF-${ctx.project.key}-${String(seq).padStart(4, "0")}`;
    await query(
      `INSERT INTO defects (id, project_id, seq, code, title, description, steps_to_reproduce, expected_result, actual_result,
         severity, priority, environment, build_version, external_url, assignee_id, reporter_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, ctx.project.id, seq, code, input.title, input.description || null, input.stepsToReproduce || null,
       input.expectedResult || null, input.actualResult || null, input.severity, input.priority, input.environment || null,
       input.buildVersion || null, input.externalUrl || null, assignee, ctx.user.id],
      conn,
    );
    return { id, code };
  });
}

export async function updateDefect(ctx, id, input) {
  return withTx(async (conn) => {
    const cur = await queryOne("SELECT id, code FROM defects WHERE id = ? AND project_id = ? FOR UPDATE", [id, ctx.project.id], conn);
    if (!cur) throw notFound("Defect not found");
    const assignee = await assertAssignee(ctx, input.assigneeId, conn);
    await query(
      `UPDATE defects SET title=?, description=?, steps_to_reproduce=?, expected_result=?, actual_result=?, severity=?, priority=?,
         environment=?, build_version=?, external_url=?, assignee_id=? WHERE id = ?`,
      [input.title, input.description || null, input.stepsToReproduce || null, input.expectedResult || null, input.actualResult || null,
       input.severity, input.priority, input.environment || null, input.buildVersion || null, input.externalUrl || null, assignee, id],
      conn,
    );
  });
}

export async function setDefectStatus(ctx, id, status) {
  return withTx(async (conn) => {
    const cur = await queryOne("SELECT code, status FROM defects WHERE id = ? AND project_id = ? FOR UPDATE", [id, ctx.project.id], conn);
    if (!cur) throw notFound("Defect not found");
    if (cur.status === status) return;
    await query("UPDATE defects SET status = ? WHERE id = ?", [status, id], conn);
  });
}

/** Deleting is blocked once a defect is linked to any execution: that history must stay intact. */
export async function deleteDefect(ctx, id) {
  return withTx(async (conn) => {
    const cur = await queryOne("SELECT code FROM defects WHERE id = ? AND project_id = ? FOR UPDATE", [id, ctx.project.id], conn);
    if (!cur) throw notFound("Defect not found");
    const { n } = await queryOne("SELECT COUNT(*) AS n FROM test_execution_defects WHERE defect_id = ?", [id], conn);
    if (Number(n) > 0) throw new AppError("This defect is linked to test executions and cannot be deleted. Close it instead.", { code: "DEFECT_LINKED", status: 409 });
    await query("DELETE FROM defects WHERE id = ?", [id], conn);
  });
}

export async function exportDefectsCsv(ctx, p) {
  const { w, params } = listWhere(ctx, p);
  const rows = await query(
    `SELECT d.code, d.title, d.status, d.severity, d.priority, d.environment, d.build_version, d.external_url,
            a.name AS assignee, r.name AS reporter, d.created_at,
            (SELECT COUNT(*) FROM test_execution_defects x WHERE x.defect_id = d.id) AS executions
     FROM defects d LEFT JOIN users a ON a.id = d.assignee_id JOIN users r ON r.id = d.reporter_id
     WHERE ${w} ORDER BY d.seq`,
    params,
  );
  return toCsv([
    ["Code", "Title", "Status", "Severity", "Priority", "Environment", "Build", "External URL", "Assignee", "Reporter", "Created", "Linked executions"],
    ...rows.map((r) => [r.code, r.title, r.status, r.severity, r.priority, r.environment ?? "", r.build_version ?? "", r.external_url ?? "",
      r.assignee ?? "", r.reporter, new Date(r.created_at).toISOString(), r.executions]),
  ]);
}
