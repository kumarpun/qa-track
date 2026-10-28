"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { run } from "@/lib/server/action";
import { requireProject } from "@/lib/server/dal";
import { AppError } from "@/lib/server/errors";
import { testCaseSchema, bulkSchema, PRIORITIES, TYPES, AUTOMATION } from "@/lib/validation/testcase";
import * as svc from "@/lib/server/services/testcases";

const uuidSchema = z.string().uuid();
const MAX_CSV_BYTES = 2 * 1024 * 1024;

// Every action derives the project from the active project the caller passes, then re-authorizes membership + role.
const ctxFor = (projectId) => requireProject(uuidSchema.parse(projectId), "testcase.write");
const refresh = () => revalidatePath("/test-cases");

export async function createCaseAction(projectId, input) {
  return run(testCaseSchema, input, async (data) => {
    const res = await svc.createCase(await ctxFor(projectId), data);
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

export async function restoreVersionAction(projectId, caseId, version) {
  return run(z.number().int().min(1), version, async (v) => {
    const res = await svc.restoreVersion(await ctxFor(projectId), uuidSchema.parse(caseId), v);
    refresh();
    return res;
  });
}

export async function archiveCaseAction(projectId, caseId, archived) {
  return run(z.boolean(), archived, async (a) => {
    await svc.setArchived(await ctxFor(projectId), uuidSchema.parse(caseId), a);
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
