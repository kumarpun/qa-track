import "server-only";
import { query, queryOne, uuid, withTx } from "../db";
import { notifyMentions } from "./notifications";
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
  // First suite name alphabetically; cases in no suite sort last when ascending.
  suite: `COALESCE((SELECT MIN(s.name) FROM test_suite_cases sc JOIN test_suites s ON s.id = sc.suite_id
                     WHERE sc.test_case_id = tc.id AND s.archived_at IS NULL), '~')`,
};

const escapeLike = (s) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Case content: everything a run snapshots. Assignee and status are workflow metadata, not content. */
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
    status: r.status,
    component: r.component ?? "",
    tags: asJson(r.tags, []),
    requirementUrl: r.requirement_url ?? "",
    defectUrls: asJson(r.defect_urls, []),
    authorId: r.author_id,
    assigneeId: r.assignee_id ?? null,
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

/** Allocate the next per-project number inside the caller's transaction (row lock serialises writers). */
async function nextCode(conn, project) {
  await query("UPDATE projects SET tc_seq = tc_seq + 1 WHERE id = ?", [project.id], conn);
  const row = await queryOne("SELECT tc_seq FROM projects WHERE id = ? FOR UPDATE", [project.id], conn);
  return { seq: row.tc_seq, code: `TC-${project.key}-${String(row.tc_seq).padStart(4, "0")}` };
}

async function createInTx(conn, { user, project }, input, assigneeId) {
  const { seq, code } = await nextCode(conn, project);
  const id = uuid();
  const c = contentOf(input);
  await query(
    `INSERT INTO test_cases (id, project_id, seq, code, title, description, preconditions, test_data, priority, type,
       automation, component, tags, requirement_url, defect_urls, author_id, assignee_id, status)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, project.id, seq, code, c.title, c.description || null, c.preconditions || null, c.testData || null,
     c.priority, c.type, c.automation, c.component || null, JSON.stringify(c.tags), c.requirementUrl || null,
     JSON.stringify(c.defectUrls), user.id, assigneeId ?? null, "NOT_EXECUTED"],
    conn,
  );
  await insertSteps(conn, id, c.steps);
  return { id, code };
}

async function assertAssignee(project, assigneeId) {
  if (!assigneeId) return;
  const m = await queryOne(
    `SELECT u.id FROM users u LEFT JOIN project_members pm ON pm.user_id = u.id AND pm.project_id = ?
     WHERE u.id = ? AND u.active = 1 AND u.org_id = ? AND (pm.id IS NOT NULL OR u.role = 'ADMIN')`,
    [project.id, assigneeId, project.org_id],
  );
  if (!m) throw new AppError("Assignee must be an active member of this project", { fieldErrors: { assigneeId: "Not a project member" } });
}

export async function createCase(ctx, input) {
  await assertAssignee(ctx.project, input.assigneeId);
  return withTx(async (conn) => {
    const res = await createInTx(conn, ctx, input, input.assigneeId);
    return res;
  });
}

/** Lock and load a case that belongs to the project (cross-project ids behave as not found). */
async function lockCase(conn, project, id) {
  const row = await queryOne("SELECT * FROM test_cases WHERE id = ? AND project_id = ? FOR UPDATE", [id, project.id], conn);
  if (!row) throw notFound("Test case not found");
  return row;
}

/** Overwrite a locked case in place (no history kept). Returns whether anything actually changed. */
async function applyContent(conn, row, input) {
  const current = await query("SELECT action, test_data, expected FROM test_case_steps WHERE test_case_id = ? ORDER BY position", [row.id], conn);
  const before = contentOf(rowToCase(row, current));
  const after = contentOf(input);
  if (JSON.stringify(before) === JSON.stringify(after)) return { changed: false };
  await query(
    `UPDATE test_cases SET title=?, description=?, preconditions=?, test_data=?, priority=?, type=?, automation=?,
       component=?, tags=?, requirement_url=?, defect_urls=? WHERE id=?`,
    [after.title, after.description || null, after.preconditions || null, after.testData || null, after.priority,
     after.type, after.automation, after.component || null, JSON.stringify(after.tags), after.requirementUrl || null,
     JSON.stringify(after.defectUrls), row.id],
    conn,
  );
  await query("DELETE FROM test_case_steps WHERE test_case_id = ?", [row.id], conn);
  await insertSteps(conn, row.id, after.steps);
  return { changed: true };
}

export async function updateCase(ctx, id, input) {
  await assertAssignee(ctx.project, input.assigneeId);
  return withTx(async (conn) => {
    const row = await lockCase(conn, ctx.project, id);
    const res = await applyContent(conn, row, input);
    if ((row.assignee_id ?? null) !== (input.assigneeId ?? null)) {
      await query("UPDATE test_cases SET assignee_id = ? WHERE id = ?", [input.assigneeId ?? null, id], conn);
      return { changed: true };
    }
    return res;
  });
}

/** Status is workflow metadata ; each change is logged for the result history. */
async function changeStatus(conn, ctx, id, status, autoRunId = null) {
  await query("UPDATE test_cases SET status = ? WHERE id = ?", [status, id], conn);
  await query("INSERT INTO test_case_status_history (id, test_case_id, status, changed_by, auto_run_id) VALUES (?,?,?,?,?)", [uuid(), id, status, ctx.user.id, autoRunId], conn);
}

/** Store a browser run (log + screenshot key), and set the case status from its outcome, in one transaction. */
export async function recordAutoRun(ctx, id, { status, startedAt, finishedAt, log, finalUrl, screenshotKey }) {
  return withTx(async (conn) => {
    await lockCase(conn, ctx.project, id);
    const runId = uuid();
    await query(
      `INSERT INTO test_case_auto_runs (id, test_case_id, status, triggered_by, started_at, finished_at, log, final_url, screenshot_key)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [runId, id, status, ctx.user.id, startedAt, finishedAt, JSON.stringify(log), finalUrl?.slice(0, 2048) ?? null, screenshotKey ?? null],
      conn,
    );
    await changeStatus(conn, ctx, id, status, runId);
    return { id: runId };
  });
}

export async function listAutoRuns(ctx, id, limit = 10) {
  const rows = await query(
    `SELECT r.id, r.status, r.started_at, r.finished_at, r.log, r.final_url, r.screenshot_key IS NOT NULL AS has_screenshot, u.name AS triggered_by_name
     FROM test_case_auto_runs r JOIN test_cases tc ON tc.id = r.test_case_id JOIN users u ON u.id = r.triggered_by
     WHERE r.test_case_id = ? AND tc.project_id = ? ORDER BY r.started_at DESC LIMIT ?`,
    [id, ctx.project.id, limit],
  );
  return rows.map((r) => ({ ...r, has_screenshot: !!r.has_screenshot, log: typeof r.log === "string" ? JSON.parse(r.log) : r.log }));
}

/** Storage key of a run's failure screenshot plus its project, for the access-checked image route. */
export async function getAutoRunShot(runId) {
  return queryOne(
    "SELECT r.screenshot_key, tc.project_id FROM test_case_auto_runs r JOIN test_cases tc ON tc.id = r.test_case_id WHERE r.id = ?",
    [runId],
  );
}

/** Quick status change from the case page. */
export async function setCaseStatus(ctx, id, status) {
  return withTx(async (conn) => {
    const row = await lockCase(conn, ctx.project, id);
    if (row.status !== status) await changeStatus(conn, ctx, id, status);
  });
}

/** Set the same status on many cases (spreadsheet-style fill). Returns how many actually changed. */
export async function setCasesStatus(ctx, ids, status) {
  const unique = [...new Set(ids)];
  return withTx(async (conn) => {
    const rows = await query("SELECT id, status FROM test_cases WHERE project_id = ? AND id IN (?) FOR UPDATE", [ctx.project.id, unique], conn);
    if (rows.length !== unique.length) throw notFound("Some selected test cases were not found");
    const changing = rows.filter((r) => r.status !== status);
    for (const r of changing) await changeStatus(conn, ctx, r.id, status);
    return { affected: changing.length, total: rows.length };
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

/** Every case of the project as { id, code, title }, for the "Link test case" picker. */
export const listCaseOptions = (ctx) =>
  query("SELECT id, code, title FROM test_cases WHERE project_id = ? ORDER BY seq", [ctx.project.id]);

/** Case referenced by a "Call <title or code>" step, looked up in the current project (never across projects). Returns { id, code, title, steps }. */
export async function findCaseByRef(ctx, ref) {
  const rows = await query(
    "SELECT id, code, title FROM test_cases WHERE project_id = ? AND (LOWER(code) = LOWER(?) OR LOWER(title) = LOWER(?)) LIMIT 3",
    [ctx.project.id, ref, ref],
  );
  if (!rows.length) throw new AppError(`Called test case “${ref}” not found in this project`, { code: "NOT_AUTOMATABLE" });
  if (rows.length > 1) throw new AppError(`“${ref}” matches more than one test case; call it by code (e.g. ${rows[0].code})`, { code: "NOT_AUTOMATABLE" });
  const steps = await query("SELECT action, expected FROM test_case_steps WHERE test_case_id = ? ORDER BY position", [rows[0].id]);
  return { ...rows[0], steps };
}

/** Delete manual / browser-run entries from a case's result history. Run executions are append-only and never match here. The case's current status is untouched. */
export async function deleteCaseHistory(ctx, caseId, historyIds) {
  const unique = [...new Set(historyIds)];
  return withTx(async (conn) => {
    await lockCase(conn, ctx.project, caseId);
    const res = await query("DELETE FROM test_case_status_history WHERE test_case_id = ? AND id IN (?)", [caseId, unique], conn);
    const deleted = res.affectedRows ?? 0;
    return { deleted };
  });
}

/** Run results and manual status changes for a case, newest first. Manual rows have no run. */
export async function listCaseResults(ctx, id) {
  const runs = await query(
    `SELECT e.id, e.status, e.executed_at, u.name AS executed_by_name,
            r.id AS run_id, r.code AS run_code, r.name AS run_name, rc.id AS run_case_id
     FROM test_executions e
     JOIN test_run_cases rc ON rc.id = e.run_case_id
     JOIN test_runs r ON r.id = rc.run_id
     JOIN users u ON u.id = e.executed_by
     WHERE rc.test_case_id = ? AND r.project_id = ?
     ORDER BY e.executed_at DESC, e.id`,
    [id, ctx.project.id],
  );
  const manual = await query(
    `SELECT h.id, h.status, h.changed_at AS executed_at, u.name AS executed_by_name, h.auto_run_id
     FROM test_case_status_history h JOIN test_cases tc ON tc.id = h.test_case_id JOIN users u ON u.id = h.changed_by
     WHERE h.test_case_id = ? AND tc.project_id = ?`,
    [id, ctx.project.id],
  );
  return [...runs, ...manual].sort((a, b) => new Date(b.executed_at) - new Date(a.executed_at));
}

/**
 * Run results are history, so a case in a run that is still open (draft / in progress / cancelled) cannot be
 * deleted. Once every run containing it is COMPLETED it can: the run keeps its frozen snapshot and results.
 */
export async function assertNotInRuns(conn, ids) {
  const used = await query(
    `SELECT tc.code, COUNT(DISTINCT rc.run_id) AS runs
     FROM test_run_cases rc JOIN test_cases tc ON tc.id = rc.test_case_id JOIN test_runs r ON r.id = rc.run_id
     WHERE rc.test_case_id IN (?) AND r.status <> 'COMPLETED' GROUP BY tc.id, tc.code ORDER BY tc.code`,
    [ids],
    conn,
  );
  if (!used.length) return;
  const list = used.slice(0, 5).map((u) => `${u.code} (${u.runs} unfinished run${u.runs > 1 ? "s" : ""})`).join(", ");
  throw new AppError(
    `Cannot delete: used in test runs that are not completed yet — ${list}${used.length > 5 ? ", …" : ""}. Complete or delete those runs first.`,
    { code: "IN_RUNS", status: 409 },
  );
}

/** Permanently remove cases with their steps and suite membership. */
export async function deleteRows(conn, ids) {
  await query("DELETE FROM test_suite_cases WHERE test_case_id IN (?)", [ids], conn);
  await query("DELETE FROM comments WHERE test_case_id IN (?)", [ids], conn);
  await query("DELETE FROM test_cases WHERE id IN (?)", [ids], conn); // steps cascade
}

export async function deleteCase(ctx, id) {
  return withTx(async (conn) => {
    const row = await lockCase(conn, ctx.project, id);
    await assertNotInRuns(conn, [id]);
    await deleteRows(conn, [id]);
  });
}

export async function duplicateCase(ctx, id) {
  const src = await getCase(ctx, id);
  return withTx(async (conn) => {
    const res = await createInTx(conn, ctx, { ...src, title: `Copy of ${src.title}`.slice(0, 255) }, src.assigneeId);
    return res;
  });
}

/** Shared WHERE builder for list and export. */
function buildWhere(projectId, p) {
  const where = ["tc.project_id = ?"];
  const params = [projectId];
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
    `SELECT tc.id, tc.code, tc.title, tc.priority, tc.type, tc.automation, tc.component, tc.tags,
            tc.status, tc.updated_at, u.name AS assignee_name,
            (SELECT GROUP_CONCAT(s.name ORDER BY s.name SEPARATOR '\n') FROM test_suite_cases sc
               JOIN test_suites s ON s.id = sc.suite_id
              WHERE sc.test_case_id = tc.id AND s.archived_at IS NULL) AS suite_names
     FROM test_cases tc LEFT JOIN users u ON u.id = tc.assignee_id
     WHERE ${sql}
     ORDER BY ${SORT_SQL[p.sort]} ${dir}, tc.seq ASC
     LIMIT ? OFFSET ?`,
    [...params, PAGE_SIZE, (page - 1) * PAGE_SIZE],
  );
  return { rows: rows.map(({ suite_names, ...r }) => ({ ...r, tags: asJson(r.tags, []), suites: suite_names ? suite_names.split("\n") : [] })), total, page, pages, pageSize: PAGE_SIZE };
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
  return casesToCsv(cases);
}

/**
 * Import from CSV. All-or-nothing: any row error aborts the import and returns every error with its line number.
 * `dryRun` validates only.
 */
export async function importCsv(ctx, text, { dryRun }) {
  const { cases, errors, mapping, ignored } = csvToCases(text);
  const emails = [...new Set(cases.map((c) => c.assigneeEmail).filter(Boolean))];
  const members = emails.length
    ? await query(
        `SELECT u.id, u.email FROM users u LEFT JOIN project_members pm ON pm.user_id = u.id AND pm.project_id = ?
         WHERE u.email IN (?) AND u.active = 1 AND u.org_id = ? AND (pm.id IS NOT NULL OR u.role = 'ADMIN')`,
        [ctx.project.id, emails, ctx.project.org_id],
      )
    : [];
  const idByEmail = new Map(members.map((m) => [m.email, m.id]));
  for (const c of cases)
    if (c.assigneeEmail && !idByEmail.has(c.assigneeEmail))
      errors.push({ line: c.line, message: `assignee_email: ${c.assigneeEmail} is not an active member of this project` });

  if (errors.length || dryRun) return { created: 0, valid: errors.length ? 0 : cases.length, errors, mapping: mapping ?? [], ignored: ignored ?? [], dryRun: !!dryRun };
  const created = await withTx(async (conn) => {
    for (const c of cases) await createInTx(conn, ctx, c.input, idByEmail.get(c.assigneeEmail) ?? null);
    return cases.length;
  });
  return { created, valid: created, errors: [], dryRun: false };
}

const CONTENT_BULK = { priority: "priority", type: "type", automation: "automation" };

/** Bulk operations. */
export async function bulk(ctx, { ids, op, value }) {
  if (op === "assign") await assertAssignee(ctx.project, value || null);
  return withTx(async (conn) => {
    const rows = await query("SELECT * FROM test_cases WHERE project_id = ? AND id IN (?) FOR UPDATE", [ctx.project.id, ids], conn);
    if (rows.length !== new Set(ids).size) throw notFound("Some selected test cases were not found");
    if (op === "delete") {
      await assertNotInRuns(conn, rows.map((r) => r.id));
      await deleteRows(conn, rows.map((r) => r.id));
      return { affected: rows.length };
    }
    let affected = 0;
    for (const row of rows) {
      if (op === "assign") {
        await query("UPDATE test_cases SET assignee_id = ? WHERE id = ?", [value || null, row.id], conn);
        affected++;
      } else if (CONTENT_BULK[op]) {
        if (row[CONTENT_BULK[op]] === value) continue;
        const steps = await query("SELECT action, test_data, expected FROM test_case_steps WHERE test_case_id = ? ORDER BY position", [row.id], conn);
        const c = contentOf(rowToCase(row, steps));
        const res = await applyContent(conn, row, { ...c, [op]: value });
        if (res.changed) affected++;
      }
    }
    return { affected };
  });
}

/** Owning project of a case, so detail pages can authorize against it regardless of the active-project cookie. */
export async function getCaseProjectId(id) {
  const row = await queryOne("SELECT project_id FROM test_cases WHERE id = ?", [id]);
  return row?.project_id ?? null;
}

/** Comments on a test case, oldest first. */
export async function listCaseComments(ctx, caseId) {
  await getCase(ctx, caseId);
  return query(
    `SELECT m.id, m.body, m.created_at, m.edited_at, m.author_id, m.parent_id, u.name AS author_name
     FROM comments m JOIN users u ON u.id = m.author_id WHERE m.test_case_id = ? ORDER BY m.created_at, m.id`,
    [caseId],
  );
}

const caseLink = (c) => ({ href: `/test-cases/${c.id}`, label: `${c.code} · ${c.title}` });

export async function addCaseComment(ctx, caseId, body, parentId = null) {
  const tc = await getCase(ctx, caseId);
  if (parentId) {
    const p = await queryOne("SELECT id FROM comments WHERE id = ? AND test_case_id = ? AND parent_id IS NULL", [parentId, caseId]);
    if (!p) throw notFound("Comment");
  }
  const id = uuid();
  await query("INSERT INTO comments (id, author_id, body, test_case_id, parent_id) VALUES (?,?,?,?,?)", [id, ctx.user.id, body, caseId, parentId]);
  await notifyMentions(ctx, { commentId: id, body, ...caseLink(tc) });
  return { id };
}

/** Only the author may change or remove a comment; nobody else, whatever their role. */
async function ownCaseComment(ctx, caseId, commentId) {
  const tc = await getCase(ctx, caseId);
  const c = await queryOne("SELECT author_id FROM comments WHERE id = ? AND test_case_id = ?", [commentId, caseId]);
  if (!c) throw notFound("Comment");
  if (c.author_id !== ctx.user.id) throw new AppError("You can only change your own comments.", { code: "FORBIDDEN", status: 403 });
  return tc;
}

export async function updateCaseComment(ctx, caseId, commentId, body) {
  const tc = await ownCaseComment(ctx, caseId, commentId);
  await query("UPDATE comments SET body = ?, edited_at = CURRENT_TIMESTAMP(3) WHERE id = ?", [body, commentId]);
  await notifyMentions(ctx, { commentId, body, ...caseLink(tc) });
}

export async function deleteCaseComment(ctx, caseId, commentId) {
  await ownCaseComment(ctx, caseId, commentId);
  await query("DELETE FROM comments WHERE id = ? AND author_id = ?", [commentId, ctx.user.id]);
}
