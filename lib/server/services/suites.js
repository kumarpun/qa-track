import "server-only";
import { query, queryOne, uuid, withTx } from "../db";
import { audit } from "../audit";
import { AppError, notFound } from "../errors";

const asJson = (v, fallback) => {
  if (v == null) return fallback;
  if (typeof v === "string") {
    try { return JSON.parse(v); } catch { return fallback; }
  }
  return v;
};

/** Load a suite that belongs to the project; cross-project ids behave as not found. */
async function lockSuite(conn, project, id) {
  const row = await queryOne("SELECT * FROM test_suites WHERE id = ? AND project_id = ? FOR UPDATE", [id, project.id], conn);
  if (!row) throw notFound("Suite not found");
  return row;
}

/** Walk up from `parentId`; a suite cannot become its own ancestor. Returns the parent row. */
async function assertParent(conn, project, suiteId, parentId) {
  if (!parentId) return null;
  const parent = await queryOne("SELECT id, parent_id, archived_at FROM test_suites WHERE id = ? AND project_id = ?", [parentId, project.id], conn);
  if (!parent) throw new AppError("Parent suite not found", { fieldErrors: { parentId: "Parent suite not found" } });
  if (parent.archived_at) throw new AppError("Cannot nest under an archived suite", { fieldErrors: { parentId: "Archived suite" } });
  let cur = parent;
  for (let depth = 0; cur && depth < 100; depth++) {
    if (suiteId && cur.id === suiteId) throw new AppError("A suite cannot be moved inside itself", { fieldErrors: { parentId: "Would create a cycle" } });
    cur = cur.parent_id ? await queryOne("SELECT id, parent_id FROM test_suites WHERE id = ?", [cur.parent_id], conn) : null;
  }
  return parent;
}

async function nextPosition(conn, projectId, parentId) {
  const row = await queryOne(
    "SELECT COALESCE(MAX(position), 0) + 1 AS p FROM test_suites WHERE project_id = ? AND parent_id <=> ?",
    [projectId, parentId ?? null],
    conn,
  );
  return row.p;
}

/** Flat list with case counts; the UI builds the tree. */
export async function listSuites(ctx, { includeArchived = false } = {}) {
  const rows = await query(
    `SELECT s.id, s.parent_id, s.name, s.description, s.feature, s.type, s.tags, s.position, s.archived_at,
            (SELECT COUNT(*) FROM test_suite_cases sc JOIN test_cases tc ON tc.id = sc.test_case_id
              WHERE sc.suite_id = s.id AND tc.archived_at IS NULL) AS case_count
     FROM test_suites s
     WHERE s.project_id = ? ${includeArchived ? "" : "AND s.archived_at IS NULL"}
     ORDER BY s.parent_id IS NOT NULL, s.position, s.name`,
    [ctx.project.id],
  );
  return rows.map((r) => ({ ...r, tags: asJson(r.tags, []) }));
}

export async function createSuite(ctx, input) {
  return withTx(async (conn) => {
    await assertParent(conn, ctx.project, null, input.parentId);
    const id = uuid();
    await query(
      `INSERT INTO test_suites (id, project_id, parent_id, name, description, feature, type, tags, position, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [id, ctx.project.id, input.parentId, input.name, input.description || null, input.feature || null, input.type || null,
       JSON.stringify(input.tags), await nextPosition(conn, ctx.project.id, input.parentId), ctx.user.id],
      conn,
    );
    await audit({ userId: ctx.user.id, projectId: ctx.project.id, action: "suite.created", entityType: "test_suite", entityId: id, metadata: { name: input.name } }, conn);
    return { id };
  });
}

export async function updateSuite(ctx, id, input) {
  return withTx(async (conn) => {
    const row = await lockSuite(conn, ctx.project, id);
    if (row.archived_at) throw new AppError("Archived suites cannot be edited. Restore it first.", { code: "ARCHIVED", status: 409 });
    const parentChanged = (row.parent_id ?? null) !== (input.parentId ?? null);
    if (parentChanged) await assertParent(conn, ctx.project, id, input.parentId);
    await query(
      "UPDATE test_suites SET name=?, description=?, feature=?, type=?, tags=?, parent_id=?, position=? WHERE id=?",
      [input.name, input.description || null, input.feature || null, input.type || null, JSON.stringify(input.tags),
       input.parentId, parentChanged ? await nextPosition(conn, ctx.project.id, input.parentId) : row.position, id],
      conn,
    );
    await audit({ userId: ctx.user.id, projectId: ctx.project.id, action: "suite.updated", entityType: "test_suite", entityId: id, metadata: { name: input.name } }, conn);
  });
}

export async function getSuite(ctx, id) {
  const row = await queryOne(
    `SELECT s.*, u.name AS created_by_name, p.name AS parent_name
     FROM test_suites s JOIN users u ON u.id = s.created_by LEFT JOIN test_suites p ON p.id = s.parent_id
     WHERE s.id = ? AND s.project_id = ?`,
    [id, ctx.project.id],
  );
  if (!row) throw notFound("Suite not found");
  const cases = await query(
    `SELECT tc.id, tc.code, tc.title, tc.priority, tc.type, tc.current_version, tc.archived_at, sc.position
     FROM test_suite_cases sc JOIN test_cases tc ON tc.id = sc.test_case_id
     WHERE sc.suite_id = ? ORDER BY sc.position, tc.seq`,
    [id],
  );
  const children = await query(
    "SELECT id, name, archived_at FROM test_suites WHERE parent_id = ? AND project_id = ? ORDER BY position, name",
    [id, ctx.project.id],
  );
  return { ...row, tags: asJson(row.tags, []), cases, children };
}

/** Archive/restore. Archiving a suite also needs its active children archived first so nothing is orphaned silently. */
export async function setSuiteArchived(ctx, id, archived) {
  return withTx(async (conn) => {
    const row = await lockSuite(conn, ctx.project, id);
    if (!!row.archived_at === archived) return;
    if (archived) {
      const kids = await queryOne("SELECT COUNT(*) AS n FROM test_suites WHERE parent_id = ? AND archived_at IS NULL", [id], conn);
      if (kids.n) throw new AppError("Archive or move the nested suites first", { code: "HAS_CHILDREN", status: 409 });
    } else if (row.parent_id) {
      const parent = await queryOne("SELECT archived_at FROM test_suites WHERE id = ?", [row.parent_id], conn);
      if (parent?.archived_at) throw new AppError("Restore the parent suite first", { code: "PARENT_ARCHIVED", status: 409 });
    }
    await query("UPDATE test_suites SET archived_at = ? WHERE id = ?", [archived ? new Date() : null, id], conn);
    await audit({ userId: ctx.user.id, projectId: ctx.project.id, action: archived ? "suite.archived" : "suite.unarchived", entityType: "test_suite", entityId: id }, conn);
  });
}

/** Copies the suite and its case links (not nested suites). The new suite sits next to the original. */
export async function duplicateSuite(ctx, id) {
  return withTx(async (conn) => {
    const row = await lockSuite(conn, ctx.project, id);
    const newId = uuid();
    await query(
      `INSERT INTO test_suites (id, project_id, parent_id, name, description, feature, type, tags, position, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [newId, ctx.project.id, row.parent_id, `Copy of ${row.name}`.slice(0, 191), row.description, row.feature, row.type,
       row.tags == null ? null : typeof row.tags === "string" ? row.tags : JSON.stringify(row.tags),
       await nextPosition(conn, ctx.project.id, row.parent_id), ctx.user.id],
      conn,
    );
    await query(
      "INSERT INTO test_suite_cases (id, suite_id, test_case_id, position) SELECT UUID(), ?, test_case_id, position FROM test_suite_cases WHERE suite_id = ?",
      [newId, id],
      conn,
    );
    await audit({ userId: ctx.user.id, projectId: ctx.project.id, action: "suite.duplicated", entityType: "test_suite", entityId: newId, metadata: { from: id } }, conn);
    return { id: newId };
  });
}

export async function addCases(ctx, suiteId, caseIds) {
  return withTx(async (conn) => {
    const suite = await lockSuite(conn, ctx.project, suiteId);
    if (suite.archived_at) throw new AppError("Archived suites cannot be changed", { code: "ARCHIVED", status: 409 });
    const ids = [...new Set(caseIds)];
    const found = await query("SELECT id FROM test_cases WHERE project_id = ? AND archived_at IS NULL AND id IN (?)", [ctx.project.id, ids], conn);
    if (found.length !== ids.length) throw notFound("Some test cases were not found or are archived");
    const existing = new Set((await query("SELECT test_case_id FROM test_suite_cases WHERE suite_id = ?", [suiteId], conn)).map((r) => r.test_case_id));
    const { m } = await queryOne("SELECT COALESCE(MAX(position), 0) AS m FROM test_suite_cases WHERE suite_id = ?", [suiteId], conn);
    let pos = m;
    let added = 0;
    for (const cid of ids) {
      if (existing.has(cid)) continue;
      await query("INSERT INTO test_suite_cases (id, suite_id, test_case_id, position) VALUES (?,?,?,?)", [uuid(), suiteId, cid, ++pos], conn);
      added++;
    }
    if (added) await audit({ userId: ctx.user.id, projectId: ctx.project.id, action: "suite.cases_added", entityType: "test_suite", entityId: suiteId, metadata: { count: added } }, conn);
    return { added };
  });
}

export async function removeCase(ctx, suiteId, caseId) {
  return withTx(async (conn) => {
    const suite = await lockSuite(conn, ctx.project, suiteId);
    if (suite.archived_at) throw new AppError("Archived suites cannot be changed", { code: "ARCHIVED", status: 409 });
    const res = await query("DELETE FROM test_suite_cases WHERE suite_id = ? AND test_case_id = ?", [suiteId, caseId], conn);
    if (!res.affectedRows) throw notFound("Test case is not in this suite");
    await audit({ userId: ctx.user.id, projectId: ctx.project.id, action: "suite.case_removed", entityType: "test_suite", entityId: suiteId, metadata: { caseId } }, conn);
  });
}

/** Persist a new order. `orderedIds` must be exactly the suite's current case ids. */
export async function reorderCases(ctx, suiteId, orderedIds) {
  return withTx(async (conn) => {
    const suite = await lockSuite(conn, ctx.project, suiteId);
    if (suite.archived_at) throw new AppError("Archived suites cannot be changed", { code: "ARCHIVED", status: 409 });
    const current = (await query("SELECT test_case_id FROM test_suite_cases WHERE suite_id = ?", [suiteId], conn)).map((r) => r.test_case_id);
    if (current.length !== orderedIds.length || new Set(orderedIds).size !== orderedIds.length || !orderedIds.every((i) => current.includes(i)))
      throw new AppError("The suite changed; reload and try again", { code: "CONFLICT", status: 409 });
    for (const [i, cid] of orderedIds.entries())
      await query("UPDATE test_suite_cases SET position = ? WHERE suite_id = ? AND test_case_id = ?", [i + 1, suiteId, cid], conn);
  });
}

/** Active cases not yet in the suite, for the "add cases" picker. */
export async function pickableCases(ctx, suiteId, q = "") {
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return query(
    `SELECT tc.id, tc.code, tc.title FROM test_cases tc
     WHERE tc.project_id = ? AND tc.archived_at IS NULL
       AND tc.id NOT IN (SELECT test_case_id FROM test_suite_cases WHERE suite_id = ?)
       AND (? = '' OR tc.title LIKE ? OR tc.code LIKE ?)
     ORDER BY tc.seq LIMIT 50`,
    [ctx.project.id, suiteId, q, like, like],
  );
}

/** Suites that contain a case (used to warn before archiving it). */
export async function suitesForCase(ctx, caseId) {
  return query(
    `SELECT s.id, s.name FROM test_suite_cases sc JOIN test_suites s ON s.id = sc.suite_id
     WHERE sc.test_case_id = ? AND s.project_id = ? AND s.archived_at IS NULL ORDER BY s.name`,
    [caseId, ctx.project.id],
  );
}

/** Owning project of a suite, so pages reached by id can authorize against the right project. */
export async function getSuiteProjectId(id) {
  const row = await queryOne("SELECT project_id FROM test_suites WHERE id = ?", [id]);
  return row?.project_id ?? null;
}
