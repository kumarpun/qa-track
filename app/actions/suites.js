"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { run } from "@/lib/server/action";
import { requireProject } from "@/lib/server/dal";
import { suiteSchema, idList } from "@/lib/validation/suite";
import * as svc from "@/lib/server/services/suites";

const uuidSchema = z.string().uuid();

const ctxFor = (projectId) => requireProject(uuidSchema.parse(projectId), "suite.write");
const refresh = () => revalidatePath("/test-suites", "layout");

export async function createSuiteAction(projectId, input) {
  return run(suiteSchema, input, async (data) => {
    const res = await svc.createSuite(await ctxFor(projectId), data);
    refresh();
    return res;
  });
}

export async function updateSuiteAction(projectId, suiteId, input) {
  return run(suiteSchema, input, async (data) => {
    await svc.updateSuite(await ctxFor(projectId), uuidSchema.parse(suiteId), data);
    refresh();
  });
}

export async function archiveSuiteAction(projectId, suiteId, archived) {
  return run(z.boolean(), archived, async (a) => {
    await svc.setSuiteArchived(await ctxFor(projectId), uuidSchema.parse(suiteId), a);
    refresh();
  });
}

export async function duplicateSuiteAction(projectId, suiteId) {
  return run(null, null, async () => {
    const res = await svc.duplicateSuite(await ctxFor(projectId), uuidSchema.parse(suiteId));
    refresh();
    return res;
  });
}

export async function addCasesAction(projectId, suiteId, caseIds) {
  return run(idList, caseIds, async (ids) => {
    const res = await svc.addCases(await ctxFor(projectId), uuidSchema.parse(suiteId), ids);
    refresh();
    return res;
  });
}

export async function removeCaseAction(projectId, suiteId, caseId) {
  return run(null, null, async () => {
    await svc.removeCase(await ctxFor(projectId), uuidSchema.parse(suiteId), uuidSchema.parse(caseId));
    refresh();
  });
}

export async function reorderCasesAction(projectId, suiteId, orderedIds) {
  return run(z.array(z.string().uuid()).max(2000), orderedIds, async (ids) => {
    await svc.reorderCases(await ctxFor(projectId), uuidSchema.parse(suiteId), ids);
    refresh();
  });
}

/** Read-only helper for the picker; still requires write permission since it feeds a write flow. */
export async function searchPickableCasesAction(projectId, suiteId, q) {
  return run(z.string().max(100), q ?? "", async (term) =>
    svc.pickableCases(await ctxFor(projectId), uuidSchema.parse(suiteId), term),
  );
}
