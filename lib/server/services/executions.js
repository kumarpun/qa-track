import "server-only";
import { query, queryOne, uuid, withTx } from "../db";
import { notifyMentions } from "./notifications";
import { AppError, notFound } from "../errors";
import { linkDefects } from "./defects";

const asJson = (v, fallback) => {
  if (v == null) return fallback;
  if (typeof v === "string") {
    try { return JSON.parse(v); } catch { return fallback; }
  }
  return v;
};

const OPEN_RUN = new Set(["DRAFT", "IN_PROGRESS"]);

/** Project that owns a run case (null when it does not exist). Used to authorize before loading. */
export async function getRunCaseProjectId(runCaseId) {
  const row = await queryOne(
    "SELECT r.project_id FROM test_run_cases c JOIN test_runs r ON r.id = c.run_id WHERE c.id = ?",
    [runCaseId],
  );
  return row?.project_id ?? null;
}

/** Load one run case with its run; the run must belong to the authorized project. */
async function loadRunCase(ctx, runCaseId, conn, lock = false) {
  const row = await queryOne(
    `SELECT c.id, c.run_id, c.test_case_id, c.position, c.status, c.snapshot, c.last_executed_at,
            r.code AS run_code, r.name AS run_name, r.status AS run_status
     FROM test_run_cases c JOIN test_runs r ON r.id = c.run_id
     WHERE c.id = ? AND r.project_id = ? ${lock ? "FOR UPDATE" : ""}`,
    [runCaseId, ctx.project.id],
    conn,
  );
  if (!row) throw notFound("Run case not found");
  return row;
}

/** Everything the execution page needs: frozen content, history (append-only), comments, neighbours. */
export async function getRunCase(ctx, runCaseId) {
  const rc = await loadRunCase(ctx, runCaseId);
  const snapshot = asJson(rc.snapshot, {});

  const executions = await query(
    `SELECT e.id, e.status, e.actual_result, e.comment, e.executed_at, u.name AS executed_by_name
     FROM test_executions e JOIN users u ON u.id = e.executed_by
     WHERE e.run_case_id = ? ORDER BY e.executed_at DESC, e.id`,
    [runCaseId],
  );
  const ids = executions.map((e) => e.id);
  const [steps, defects, attachments] = ids.length
    ? await Promise.all([
        query("SELECT execution_id, step_position, status, actual_result FROM test_execution_steps WHERE execution_id IN (?) ORDER BY step_position", [ids]),
        query(
          `SELECT x.execution_id, d.id, d.code, d.title, d.status, d.external_url
           FROM test_execution_defects x JOIN defects d ON d.id = x.defect_id WHERE x.execution_id IN (?) ORDER BY d.seq`,
          [ids],
        ),
        query(
          "SELECT id, execution_id, file_name, mime_type, size_bytes, uploaded_by FROM attachments WHERE execution_id IN (?) ORDER BY created_at",
          [ids],
        ),
      ])
    : [[], [], []];
  const by = (rows) => rows.reduce((m, r) => ((m[r.execution_id] ??= []).push(r), m), {});
  const stepsBy = by(steps), defectsBy = by(defects), filesBy = by(attachments);

  const comments = await query(
    `SELECT m.id, m.body, m.created_at, m.edited_at, m.author_id, m.parent_id, u.name AS author_name
     FROM comments m JOIN users u ON u.id = m.author_id WHERE m.run_case_id = ? ORDER BY m.created_at, m.id`,
    [runCaseId],
  );
  const siblings = await query("SELECT id, position, status FROM test_run_cases WHERE run_id = ? ORDER BY position", [rc.run_id]);
  const idx = siblings.findIndex((s) => s.id === runCaseId);

  return {
    id: rc.id, runId: rc.run_id, runCode: rc.run_code, runName: rc.run_name, runStatus: rc.run_status,
    position: rc.position, status: rc.status, lastExecutedAt: rc.last_executed_at,
    snapshot, total: siblings.length, index: idx + 1,
    prevId: siblings[idx - 1]?.id ?? null,
    nextId: siblings[idx + 1]?.id ?? null,
    nextPendingId: siblings.slice(idx + 1).find((s) => s.status === "NOT_RUN" || s.status === "RETEST")?.id ?? null,
    executions: executions.map((e) => ({
      id: e.id, status: e.status, actualResult: e.actual_result, comment: e.comment, executedAt: e.executed_at, executedByName: e.executed_by_name,
      steps: (stepsBy[e.id] ?? []).map((s) => ({ position: s.step_position, status: s.status, actualResult: s.actual_result })),
      defects: defectsBy[e.id] ?? [],
      attachments: filesBy[e.id] ?? [],
    })),
    comments,
  };
}

/** Run result -> test case status (Retest means work is still in flight). */
const CASE_STATUS_FOR_RESULT = { PASSED: "PASSED", FAILED: "FAILED", BLOCKED: "BLOCKED", SKIPPED: "SKIPPED", RETEST: "IN_PROGRESS", NOT_RUN: "NOT_EXECUTED" };

/**
 * Save a result. Never updates an old execution: each save appends a row and refreshes the cached
 * status on test_run_cases, so history stays complete and Retest is just another status in that history.
 */
export async function recordExecution(ctx, runCaseId, input) {
  return withTx(async (conn) => {
    const rc = await loadRunCase(ctx, runCaseId, conn, true);
    if (!OPEN_RUN.has(rc.run_status)) throw new AppError(`This run is ${rc.run_status.toLowerCase()}; reopen it to record results`, { code: "RUN_CLOSED", status: 409 });

    const stepCount = asJson(rc.snapshot, {}).steps?.length ?? 0;
    const positions = new Set();
    for (const s of input.steps) {
      if (s.position > stepCount || positions.has(s.position)) throw new AppError("Invalid step result", { fieldErrors: { steps: "Invalid step" } });
      positions.add(s.position);
    }

    const id = uuid();
    await query(
      "INSERT INTO test_executions (id, run_case_id, executed_by, status, actual_result, comment) VALUES (?,?,?,?,?,?)",
      [id, runCaseId, ctx.user.id, input.status, input.actualResult || null, input.comment || null],
      conn,
    );
    for (const s of input.steps) {
      await query(
        "INSERT INTO test_execution_steps (id, execution_id, step_position, status, actual_result) VALUES (?,?,?,?,?)",
        [uuid(), id, s.position, s.status, s.actualResult || null],
        conn,
      );
    }
    await linkDefects(ctx, id, input.defectIds, conn);

    const now = new Date();
    await query("UPDATE test_run_cases SET status = ?, last_executed_at = ? WHERE id = ?", [input.status, now, runCaseId], conn);
    // Keep the case checklist in step with the latest run result. No status-history row: the execution itself is the history entry.
    await query("UPDATE test_cases SET status = ? WHERE id = ?", [CASE_STATUS_FOR_RESULT[input.status], rc.test_case_id], conn);
    if (rc.run_status === "DRAFT") {
      await query("UPDATE test_runs SET status = 'IN_PROGRESS', started_at = ? WHERE id = ?", [now, rc.run_id], conn);
    }
    return { id, status: input.status };
  });
}

/** Link more defects to an existing execution (the execution must be in this project and run must be open). */
export async function linkExecutionDefects(ctx, executionId, defectIds) {
  return withTx(async (conn) => {
    const ex = await queryOne(
      `SELECT e.id, r.status AS run_status FROM test_executions e
       JOIN test_run_cases c ON c.id = e.run_case_id JOIN test_runs r ON r.id = c.run_id
       WHERE e.id = ? AND r.project_id = ?`,
      [executionId, ctx.project.id],
      conn,
    );
    if (!ex) throw notFound("Execution not found");
    if (!OPEN_RUN.has(ex.run_status)) throw new AppError(`This run is ${ex.run_status.toLowerCase()}; reopen it to change results`, { code: "RUN_CLOSED", status: 409 });
    await linkDefects(ctx, executionId, defectIds, conn);
  });
}

/** Where a mention notification points: the run case page. */
function runCaseLink(rc) {
  const snap = asJson(rc.snapshot, {});
  return { href: `/test-runs/${rc.run_id}/cases/${rc.id}`, label: `${rc.run_code} · ${snap.code ?? ""} ${snap.title ?? ""}`.trim() };
}

export async function addComment(ctx, runCaseId, body, parentId = null) {
  const rc = await loadRunCase(ctx, runCaseId);
  if (parentId) {
    const p = await queryOne("SELECT id FROM comments WHERE id = ? AND run_case_id = ? AND parent_id IS NULL", [parentId, runCaseId]);
    if (!p) throw notFound("Comment");
  }
  const id = uuid();
  await query("INSERT INTO comments (id, author_id, body, run_case_id, parent_id) VALUES (?,?,?,?,?)", [id, ctx.user.id, body, runCaseId, parentId]);
  await notifyMentions(ctx, { commentId: id, body, ...runCaseLink(rc) });
  return { id };
}

/** Only the author may change or remove a comment; nobody else, whatever their role. */
async function ownComment(ctx, runCaseId, commentId, conn) {
  const rc = await loadRunCase(ctx, runCaseId, conn);
  const c = await queryOne("SELECT author_id FROM comments WHERE id = ? AND run_case_id = ?", [commentId, runCaseId], conn);
  if (!c) throw notFound("Comment");
  if (c.author_id !== ctx.user.id) throw new AppError("You can only change your own comments.", { code: "FORBIDDEN", status: 403 });
  return rc;
}

export async function updateComment(ctx, runCaseId, commentId, body) {
  const rc = await ownComment(ctx, runCaseId, commentId);
  await query("UPDATE comments SET body = ?, edited_at = CURRENT_TIMESTAMP(3) WHERE id = ?", [body, commentId]);
  await notifyMentions(ctx, { commentId, body, ...runCaseLink(rc) });
}

export async function deleteComment(ctx, runCaseId, commentId) {
  await ownComment(ctx, runCaseId, commentId);
  await query("DELETE FROM comments WHERE id = ? AND author_id = ?", [commentId, ctx.user.id]);
}

const TRANSITIONS = {
  DRAFT: ["COMPLETED", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: ["IN_PROGRESS"],
  CANCELLED: ["IN_PROGRESS"],
};

/** Complete / cancel a run, or reopen a closed one. Results are only recordable while it is open. */
export async function setRunStatus(ctx, runId, status) {
  return withTx(async (conn) => {
    const run = await queryOne("SELECT id, code, status FROM test_runs WHERE id = ? AND project_id = ? FOR UPDATE", [runId, ctx.project.id], conn);
    if (!run) throw notFound("Run not found");
    if (!TRANSITIONS[run.status]?.includes(status)) throw new AppError(`A ${run.status.toLowerCase().replace("_", " ")} run cannot become ${status.toLowerCase().replace("_", " ")}`, { code: "BAD_TRANSITION", status: 409 });
    const now = new Date();
    await query(
      "UPDATE test_runs SET status = ?, completed_at = ?, started_at = COALESCE(started_at, ?) WHERE id = ?",
      [status, status === "IN_PROGRESS" ? null : now, status === "IN_PROGRESS" ? now : null, runId],
      conn,
    );
  });
}
