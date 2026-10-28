import "server-only";
import { query, queryOne, uuid, withTx } from "../db";
import { audit } from "../audit";
import { AppError, notFound } from "../errors";
import { csvToCases, casesToCsv } from "@/lib/testcase-csv";

export const PAGE_SIZE = 20;
const EXPORT_LIMIT = 5000;

const asJson = (v, fallback) => {
  if (v == null) return fallback;
  if (typeof v === "string") {
    try { return JSON.parse(v); } catch { return fallback; }
  }
  return v;
};

const SORT_SQL = {
  code: "tc.seq",
  title: "tc.title",
  priority: "FIELD(tc.priority,'CRITICAL','HIGH','MEDIUM','LOW')",
  type: "tc.type",
  updated_at: "tc.updated_at",
  created_at: "tc.created_at",
};

const escapeLike = (s) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Versioned content: everything a run must snapshot. Assignee/archive state are workflow metadata, not content. */
function contentOf(input) {
  return {
    title: input.title,
    description: input.description ?? "",
    preconditions: input.preconditions ?? "",
    testData: input.testData ?? "",
    priority: input.priority,
    type: input.type,
    automation: input.automation,
    component: input.component ?? "",
    tags: input.tags ?? [],
    requirementUrl: input.requirementUrl ?? "",
    defectUrls: input.defectUrls ?? [],
    steps: input.steps.map((s) => ({ action: s.action, testData: s.testData ?? "", expected: s.expected })),
  };
}

function rowToCase(r, steps = []) {
  return {
    id: r.id,
    projectId: r.project_id,
    code: r.code,
    title: r.title,
    description: r.description ?? "",
    preconditions: r.preconditions ?? "",
    testData: r.test_data ?? "",
    priority: r.priority,
    type: r.type,
    automation: r.automation,
    component: r.component ?? "",
    tags: asJson(r.tags, []),
    requirementUrl: r.requirement_url ?? "",
    defectUrls: asJson(r.defect_urls, []),
    authorId: r.author_id,
    assigneeId: r.assignee_id ?? null,
    currentVersion: r.current_version,
    archivedAt: r.archived_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    steps: steps.map((s) => ({ action: s.action, testData: s.test_data ?? "", expected: s.expected })),
  };
}

async function insertSteps(conn, caseId, steps) {
  for (const [i, s] of steps.entries()) {
    await query(
      "INSERT INTO test_case_steps (id, test_case_id, position, action, test_data, expected) VALUES (?,?,?,?,?,?)",
      [uuid(), caseId, i + 1, s.action, s.testData || null, s.expected],
      conn,
    );
  }
}

const insertVersion = (conn, caseId, version, content, userId, note) =>
  query(
    "INSERT INTO test_case_versions (id, test_case_id, version, snapshot, change_note, created_by) VALUES (?,?,?,?,?,?)",
    [uuid(), caseId, version, JSON.stringify(content), note || null, userId],
    conn,
  );

/** Allocate the next per-project number inside the caller's transaction (row lock serialises writers). */
async function nextCode(conn, project) {
  await query("UPDATE projects SET tc_seq = tc_seq + 1 WHERE id = ?", [project.id], conn);
  const row = await queryOne("SELECT tc_seq FROM projects WHERE id = ? FOR UPDATE", [project.id], conn);
  return { seq: row.tc_seq, code: `TC-${project.key}-${String(row.tc_seq).padStart(4, "0")}` };
}

async function createInTx(conn, { user, project }, input, assigneeId, note = "Created") {
  const { seq, code } = await nextCode(conn, project);
  const id = uuid();
  const c = contentOf(input);
  await query(
    `INSERT INTO test_cases (id, project_id, seq, code, title, description, preconditions, test_data, priority, type,
       automation, component, tags, requirement_url, defect_urls, author_id, assignee_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, project.id, seq, code, c.title, c.description || null, c.preconditions || null, c.testData || null,
     c.priority, c.type, c.automation, c.component || null, JSON.stringify(c.tags), c.requirementUrl || null,
     JSON.stringify(c.defectUrls), user.id, assigneeId ?? null],
    conn,
  );
  await insertSteps(conn, id, c.steps);
  await insertVersion(conn, id, 1, c, user.id, note);
  return { id, code };
}

async function assertAssignee(project, assigneeId) {
  if (!assigneeId) return;
  const m = await queryOne(
    `SELECT u.id FROM users u LEFT JOIN project_members pm ON pm.user_id = u.id AND pm.project_id = ?
     WHERE u.id = ? AND u.active = 1 AND (pm.id IS NOT NULL OR u.role = 'ADMIN')`,
    [project.id, assigneeId],
  );
  if (!m) throw new AppError("Assignee must be an active member of this project", { fieldErrors: { assigneeId: "Not a project member" } });
}

export async function createCase(ctx, input) {
  await assertAssignee(ctx.project, input.assigneeId);
  return withTx(async (conn) => {
    const res = await createInTx(conn, ctx, input, input.assigneeId, input.changeNote || "Created");
    await audit({ userId: ctx.user.id, projectId: ctx.project.id, action: "testcase.created", entityType: "test_case", entityId: res.id, metadata: { code: res.code } }, conn);
    return res;
  });
}

/** Lock and load a case that belongs to the project (cross-project ids behave as not found). */
async function lockCase(conn, project, id) {
  const row = await queryOne("SELECT * FROM test_cases WHERE id = ? AND project_id = ? FOR UPDATE", [id, project.id], conn);
  if (!row) throw notFound("Test case not found");
  return row;
}

/** Apply new content to a locked case: bumps the version only when content actually changed. */
async function applyContent(conn, ctx, row, input, note) {
  if (row.archived_at) throw new AppError("Archived test cases cannot be edited. Restore it first.", { code: "ARCHIVED", status: 409 });
  const current = await query("SELECT action, test_data, expected FROM test_case_steps WHERE test_case_id = ? ORDER BY position", [row.id], conn);
  const before = contentOf(rowToCase(row, current));
  const after = contentOf(input);
  if (JSON.stringify(before) === JSON.stringify(after)) return { changed: false, version: row.current_version };
  const version = row.current_version + 1;
  await query(
    `UPDATE test_cases SET title=?, description=?, preconditions=?, test_data=?, priority=?, type=?, automation=?,
       component=?, tags=?, requirement_url=?, defect_urls=?, current_version=? WHERE id=?`,
    [after.title, after.description || null, after.preconditions || null, after.testData || null, after.priority,
     after.type, after.automation, after.component || null, JSON.stringify(after.tags), after.requirementUrl || null,
     JSON.stringify(after.defectUrls), version, row.id],
    conn,
  );
  await query("DELETE FROM test_case_steps WHERE test_case_id = ?", [row.id], conn);
  await insertSteps(conn, row.id, after.steps);
  await insertVersion(conn, row.id, version, after, ctx.user.id, note);
  return { changed: true, version };
}

export async function updateCase(ctx, id, input) {
  await assertAssignee(ctx.project, input.assigneeId);
  return withTx(async (conn) => {
    const row = await lockCase(conn, ctx.project, id);
    const res = await applyContent(conn, ctx, row, input, input.changeNote);
    if ((row.assignee_id ?? null) !== (input.assigneeId ?? null))
      await query("UPDATE test_cases SET assignee_id = ? WHERE id = ?", [input.assigneeId ?? null, id], conn);
    if (res.changed)
      await audit({ userId: ctx.user.id, projectId: ctx.project.id, action: "testcase.updated", entityType: "test_case", entityId: id, metadata: { code: row.code, version: res.version } }, conn);
    return res;
  });
}

export async function getCase(ctx, id) {
  const row = await queryOne(
    `SELECT tc.*, a.name AS author_name, s.name AS assignee_name
     FROM test_cases tc JOIN users a ON a.id = tc.author_id LEFT JOIN users s ON s.id = tc.assignee_id
     WHERE tc.id = ? AND tc.project_id = ?`,
    [id, ctx.project.id],
  );
  if (!row) throw notFound("Test case not found");
  const steps = await query("SELECT action, test_data, expected FROM test_case_steps WHERE test_case_id = ? ORDER BY position", [id]);
  return { ...rowToCase(row, steps), authorName: row.author_name, assigneeName: row.assignee_name };
}

export async function listVersions(ctx, id) {
  const rows = await query(
    `SELECT v.version, v.snapshot, v.change_note, v.created_at, u.name AS author_name
     FROM test_case_versions v JOIN test_cases tc ON tc.id = v.test_case_id JOIN users u ON u.id = v.created_by
     WHERE v.test_case_id = ? AND tc.project_id = ? ORDER BY v.version DESC`,
    [id, ctx.project.id],
  );
  return rows.map((r) => ({ version: r.version, snapshot: asJson(r.snapshot, {}), note: r.change_note, createdAt: r.created_at, authorName: r.author_name }));
}

export async function restoreVersion(ctx, id, version) {
  const v = await queryOne(
    `SELECT v.snapshot FROM test_case_versions v JOIN test_cases tc ON tc.id = v.test_case_id
     WHERE v.test_case_id = ? AND v.version = ? AND tc.project_id = ?`,
    [id, version, ctx.project.id],
  );
  if (!v) throw notFound("Version not found");
  return withTx(async (conn) => {
    const row = await lockCase(conn, ctx.project, id);
    const res = await applyContent(conn, ctx, row, asJson(v.snapshot, {}), `Restored from v${version}`);
    if (res.changed)
      await audit({ userId: ctx.user.id, projectId: ctx.project.id, action: "testcase.restored_version", entityType: "test_case", entityId: id, metadata: { code: row.code, from: version, version: res.version } }, conn);
    return res;
  });
}

export async function setArchived(ctx, id, archived) {
  const res = await query(
    "UPDATE test_cases SET archived_at = ? WHERE id = ? AND project_id = ?",
    [archived ? new Date() : null, id, ctx.project.id],
  );
  if (!res.affectedRows) throw notFound("Test case not found");
  await audit({ userId: ctx.user.id, projectId: ctx.project.id, action: archived ? "testcase.archived" : "testcase.unarchived", entityType: "test_case", entityId: id });
}

export async function duplicateCase(ctx, id) {
  const src = await getCase(ctx, id);
  return withTx(async (conn) => {
    const res = await createInTx(conn, ctx, { ...src, title: `Copy of ${src.title}`.slice(0, 255) }, src.assigneeId, `Duplicated from ${src.code}`);
    await audit({ userId: ctx.user.id, projectId: ctx.project.id, action: "testcase.duplicated", entityType: "test_case", entityId: res.id, metadata: { from: src.code, code: res.code } }, conn);
    return res;
  });
}

/** Shared WHERE builder for list and export. */
function buildWhere(projectId, p) {
  const where = ["tc.project_id = ?"];
  const params = [projectId];
  if (p.status === "active") where.push("tc.archived_at IS NULL");
  else if (p.status === "archived") where.push("tc.archived_at IS NOT NULL");
  if (p.q) {
    where.push("(tc.title LIKE ? OR tc.code LIKE ?)");
    const like = `%${escapeLike(p.q)}%`;
    params.push(like, like);
  }
  for (const k of ["priority", "type", "automation"]) {
    if (p[k]) { where.push(`tc.${k} = ?`); params.push(p[k]); }
  }
  if (p.assignee) { where.push("tc.assignee_id = ?"); params.push(p.assignee); }
  if (p.tag) { where.push("JSON_CONTAINS(tc.tags, ?)"); params.push(JSON.stringify(p.tag)); }
  return { sql: where.join(" AND "), params };
}

export async function listCases(ctx, p) {
  const { sql, params } = buildWhere(ctx.project.id, p);
  const dir = p.dir === "desc" ? "DESC" : "ASC";
  const [{ total }] = await query(`SELECT COUNT(*) AS total FROM test_cases tc WHERE ${sql}`, params);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(p.page, pages);
  const rows = await query(
    `SELECT tc.id, tc.code, tc.title, tc.priority, tc.type, tc.automation, tc.component, tc.tags, tc.current_version,
            tc.archived_at, tc.updated_at, u.name AS assignee_name
     FROM test_cases tc LEFT JOIN users u ON u.id = tc.assignee_id
     WHERE ${sql}
     ORDER BY ${SORT_SQL[p.sort]} ${dir}, tc.seq ASC
     LIMIT ? OFFSET ?`,
    [...params, PAGE_SIZE, (page - 1) * PAGE_SIZE],
  );
  return { rows: rows.map((r) => ({ ...r, tags: asJson(r.tags, []) })), total, page, pages, pageSize: PAGE_SIZE };
}

export async function exportCsv(ctx, p) {
  const { sql, params } = buildWhere(ctx.project.id, p);
  const rows = await query(
    `SELECT tc.*, u.email AS assignee_email FROM test_cases tc LEFT JOIN users u ON u.id = tc.assignee_id
     WHERE ${sql} ORDER BY tc.seq LIMIT ?`,
    [...params, EXPORT_LIMIT],
  );
  const steps = rows.length
    ? await query(
        "SELECT test_case_id, action, test_data, expected FROM test_case_steps WHERE test_case_id IN (?) ORDER BY test_case_id, position",
        [rows.map((r) => r.id)],
      )
    : [];
  const byCase = new Map();
  for (const s of steps) (byCase.get(s.test_case_id) ?? byCase.set(s.test_case_id, []).get(s.test_case_id)).push(s);
  const cases = rows.map((r) => ({ ...rowToCase(r, byCase.get(r.id) ?? []), assigneeEmail: r.assignee_email }));
  await audit({ userId: ctx.user.id, projectId: ctx.project.id, action: "testcase.exported", entityType: "project", entityId: ctx.project.id, metadata: { count: cases.length } });
  return casesToCsv(cases);
}

/**
 * Import from CSV. All-or-nothing: any row error aborts the import and returns every error with its line number.
 * `dryRun` validates only.
 */
export async function importCsv(ctx, text, { dryRun }) {
  const { cases, errors } = csvToCases(text);
  const emails = [...new Set(cases.map((c) => c.assigneeEmail).filter(Boolean))];
  const members = emails.length
    ? await query(
        `SELECT u.id, u.email FROM users u LEFT JOIN project_members pm ON pm.user_id = u.id AND pm.project_id = ?
         WHERE u.email IN (?) AND u.active = 1 AND (pm.id IS NOT NULL OR u.role = 'ADMIN')`,
        [ctx.project.id, emails],
      )
    : [];
  const idByEmail = new Map(members.map((m) => [m.email, m.id]));
  for (const c of cases)
    if (c.assigneeEmail && !idByEmail.has(c.assigneeEmail))
      errors.push({ line: c.line, message: `assignee_email: ${c.assigneeEmail} is not an active member of this project` });

  if (errors.length || dryRun) return { created: 0, valid: errors.length ? 0 : cases.length, errors, dryRun: !!dryRun };
  const created = await withTx(async (conn) => {
    for (const c of cases) await createInTx(conn, ctx, c.input, idByEmail.get(c.assigneeEmail) ?? null, "Imported from CSV");
    await audit({ userId: ctx.user.id, projectId: ctx.project.id, action: "testcase.imported", entityType: "project", entityId: ctx.project.id, metadata: { count: cases.length } }, conn);
    return cases.length;
  });
  return { created, valid: created, errors: [], dryRun: false };
}

const CONTENT_BULK = { priority: "priority", type: "type", automation: "automation" };

/** Bulk operations. Content changes create a new version per case so run snapshots stay traceable. */
export async function bulk(ctx, { ids, op, value }) {
  if (op === "assign") await assertAssignee(ctx.project, value || null);
  return withTx(async (conn) => {
    const rows = await query("SELECT * FROM test_cases WHERE project_id = ? AND id IN (?) FOR UPDATE", [ctx.project.id, ids], conn);
    if (rows.length !== new Set(ids).size) throw notFound("Some selected test cases were not found");
    let affected = 0;
    for (const row of rows) {
      if (op === "archive" || op === "restore") {
        if (!!row.archived_at === (op === "archive")) continue;
        await query("UPDATE test_cases SET archived_at = ? WHERE id = ?", [op === "archive" ? new Date() : null, row.id], conn);
        affected++;
      } else if (op === "assign") {
        await query("UPDATE test_cases SET assignee_id = ? WHERE id = ?", [value || null, row.id], conn);
        affected++;
      } else if (CONTENT_BULK[op]) {
        if (row.archived_at || row[CONTENT_BULK[op]] === value) continue;
        const steps = await query("SELECT action, test_data, expected FROM test_case_steps WHERE test_case_id = ? ORDER BY position", [row.id], conn);
        const c = contentOf(rowToCase(row, steps));
        const res = await applyContent(conn, ctx, row, { ...c, [op]: value }, `Bulk update: ${op} → ${value}`);
        if (res.changed) affected++;
      }
    }
    await audit({ userId: ctx.user.id, projectId: ctx.project.id, action: `testcase.bulk_${op}`, entityType: "test_case", metadata: { requested: ids.length, affected, value: value ?? null } }, conn);
    return { affected };
  });
}

/** Owning project of a case, so detail pages can authorize against it regardless of the active-project cookie. */
export async function getCaseProjectId(id) {
  const row = await queryOne("SELECT project_id FROM test_cases WHERE id = ?", [id]);
  return row?.project_id ?? null;
}
