"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { run } from "@/lib/server/action";
import { requireProject } from "@/lib/server/dal";
import { AppError } from "@/lib/server/errors";
import { commentSchema } from "@/lib/validation/execution";
import { testCaseSchema, bulkSchema, PRIORITIES, TYPES, AUTOMATION, CASE_STATUSES } from "@/lib/validation/testcase";
import * as svc from "@/lib/server/services/testcases";
import { addCases as addCasesToSuite } from "@/lib/server/services/suites";

const uuidSchema = z.string().uuid();
const MAX_CSV_BYTES = 2 * 1024 * 1024;

// Every action derives the project from the active project the caller passes, then re-authorizes membership + role.
const ctxFor = (projectId) => requireProject(uuidSchema.parse(projectId), "testcase.write");
const refresh = () => revalidatePath("/test-cases");

/** With `suiteId` the new case is also added to that suite (opened from the suite page). */
export async function createCaseAction(projectId, input, suiteId) {
  return run(testCaseSchema, input, async (data) => {
    const sid = suiteId ? uuidSchema.parse(suiteId) : null;
    if (sid) await requireProject(uuidSchema.parse(projectId), "suite.write");
    const ctx = await ctxFor(projectId);
    const res = await svc.createCase(ctx, data);
    if (sid) {
      await addCasesToSuite(ctx, sid, [res.id]);
      revalidatePath("/test-suites", "layout");
    }
    refresh();
    return res;
  });
}

export async function updateCaseAction(projectId, caseId, input) {
  return run(testCaseSchema, input, async (data) => {
    const res = await svc.updateCase(await ctxFor(projectId), uuidSchema.parse(caseId), data);
    refresh();
    return res;
  });
}

export async function setCaseStatusAction(projectId, caseId, status) {
  return run(z.enum(CASE_STATUSES), status, async (s) => {
    await svc.setCaseStatus(await ctxFor(projectId), uuidSchema.parse(caseId), s);
    refresh();
    revalidatePath("/test-suites", "layout"); // suite results derive from case status
  });
}

export async function fillCaseStatusAction(projectId, ids, status) {
  return run(z.object({ ids: z.array(z.string().uuid()).min(1).max(500), status: z.enum(CASE_STATUSES) }), { ids, status }, async (d) => {
    const res = await svc.setCasesStatus(await ctxFor(projectId), d.ids, d.status);
    refresh();
    revalidatePath("/test-suites", "layout");
    return res;
  });
}

export async function deleteCaseHistoryAction(projectId, caseId, ids) {
  return run(z.object({ caseId: uuidSchema, ids: z.array(uuidSchema).min(1).max(500) }), { caseId, ids }, async (d) => {
    const res = await svc.deleteCaseHistory(await ctxFor(projectId), d.caseId, d.ids);
    revalidatePath(`/test-cases/${d.caseId}`);
    return res;
  });
}

export async function deleteCaseAction(projectId, caseId) {
  return run(null, null, async () => {
    await svc.deleteCase(await ctxFor(projectId), uuidSchema.parse(caseId));
    refresh();
  });
}

export async function duplicateCaseAction(projectId, caseId) {
  return run(null, null, async () => {
    const res = await svc.duplicateCase(await ctxFor(projectId), uuidSchema.parse(caseId));
    refresh();
    return res;
  });
}

const BULK_VALUES = { priority: PRIORITIES, type: TYPES, automation: AUTOMATION };

export async function bulkAction(projectId, input) {
  return run(bulkSchema, input, async (data) => {
    if (BULK_VALUES[data.op] && !BULK_VALUES[data.op].includes(data.value)) throw new AppError("Invalid value");
    if (data.op === "assign" && data.value) uuidSchema.parse(data.value);
    const res = await svc.bulk(await ctxFor(projectId), data);
    refresh();
    return res;
  });
}

export async function importCsvAction(projectId, text, dryRun) {
  return run(z.string().max(MAX_CSV_BYTES, "File is too large (max 2 MB)"), text, async (t) => {
    const res = await svc.importCsv(await ctxFor(projectId), t, { dryRun: !!dryRun });
    if (!dryRun && res.created) refresh();
    return res;
  });
}

export async function addCaseCommentAction(projectId, caseId, input) {
  return run(commentSchema, input, async (data) => {
    const ctx = await ctxFor(projectId);
    await svc.addCaseComment(ctx, uuidSchema.parse(caseId), data.body, data.parentId);
    revalidatePath(`/test-cases/${caseId}`);
  });
}

export async function updateCaseCommentAction(projectId, caseId, commentId, input) {
  return run(commentSchema, input, async (data) => {
    const ctx = await ctxFor(projectId);
    await svc.updateCaseComment(ctx, uuidSchema.parse(caseId), uuidSchema.parse(commentId), data.body);
    revalidatePath(`/test-cases/${caseId}`);
  });
}

export async function deleteCaseCommentAction(projectId, caseId, commentId) {
  return run(null, null, async () => {
    const ctx = await ctxFor(projectId);
    await svc.deleteCaseComment(ctx, uuidSchema.parse(caseId), uuidSchema.parse(commentId));
    revalidatePath(`/test-cases/${caseId}`);
  });
}
