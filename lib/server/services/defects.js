import "server-only";
import { query, queryOne, uuid, withTx } from "../db";
import { audit } from "../audit";
import { AppError } from "../errors";

/**
 * Phase 4 slice of the defect module: create a defect (e.g. straight from a failed execution),
 * list candidates to link, and link a defect to an execution. Phase 5 adds the full defect UI.
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
    await audit({ userId: ctx.user.id, projectId: ctx.project.id, action: "defect.created", entityType: "defect", entityId: id, metadata: { code } }, c);
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
