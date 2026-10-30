"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { run } from "@/lib/server/action";
import { requireProject } from "@/lib/server/dal";
import { suiteSchema, idList } from "@/lib/validation/suite";
import { CASE_STATUSES } from "@/lib/validation/testcase";
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

export async function deleteSuiteAction(projectId, suiteId) {
  return run(z.string().uuid(), suiteId, async (id) => {
    const pid = uuidSchema.parse(projectId);
    await requireProject(pid, "testcase.write"); // deleting a suite deletes its cases
    const res = await svc.deleteSuite(await ctxFor(pid), id);
    revalidatePath("/test-cases", "layout");
    refresh();
    return res;
  });
}

export async function setSuiteStatusAction(projectId, suiteId, status) {
  return run(z.enum(CASE_STATUSES), status, async (s) => {
    const res = await svc.setSuiteCasesStatus(await requireProject(uuidSchema.parse(projectId), "testcase.write"), uuidSchema.parse(suiteId), s);
    revalidatePath("/test-cases", "layout");
    refresh();
    return res;
  });
}

export async function fillSuiteStatusAction(projectId, suiteIds, status) {
  return run(z.object({ ids: z.array(z.string().uuid()).min(1).max(200), status: z.enum(CASE_STATUSES) }), { ids: suiteIds, status }, async (d) => {
    const ctx = await requireProject(uuidSchema.parse(projectId), "testcase.write");
    let affected = 0, total = 0;
    for (const id of new Set(d.ids)) {
      const r = await svc.setSuiteCasesStatus(ctx, id, d.status);
      affected += r.affected;
      total += r.total;
    }
    revalidatePath("/test-cases", "layout");
    refresh();
    return { affected, total };
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

export async function setCaseSuiteAction(projectId, caseId, suiteId) {
  return run(z.string().uuid().nullable(), suiteId, async (sid) => {
    await svc.setCaseSuite(await ctxFor(projectId), uuidSchema.parse(caseId), sid);
    refresh();
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
