"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { run } from "@/lib/server/action";
import { requireProject } from "@/lib/server/dal";
import { suiteCaseIds } from "@/lib/server/services/suites";
import { runCaseInBrowser, runRunCaseInBrowser, finishCaseRun, finishRunCaseRun } from "@/lib/server/services/automation";

const uuidSchema = z.string().uuid();
const optionsSchema = z.object({ headless: z.boolean(), where: z.enum(["hosted", "local"]) }).partial().default({});

/** Opens a real browser window on the server machine and runs the case's steps; sets the case to Passed/Failed. */
export async function runCaseInBrowserAction(projectId, caseId, options) {
  return run(null, null, async () => {
    const ctx = await requireProject(uuidSchema.parse(projectId), "testcase.write");
    const res = await runCaseInBrowser(ctx, uuidSchema.parse(caseId), optionsSchema.parse(options));
    revalidatePath("/test-cases");
    return res;
  });
}

/** Runs a run case's frozen steps in a real browser and records the result as an execution (needs run.execute). */
export async function runRunCaseInBrowserAction(projectId, runCaseId, options) {
  return run(null, null, async () => {
    const ctx = await requireProject(uuidSchema.parse(projectId), "run.execute");
    const res = await runRunCaseInBrowser(ctx, uuidSchema.parse(runCaseId), optionsSchema.parse(options));
    revalidatePath("/test-runs", "layout");
    revalidatePath("/");
    revalidatePath("/execution");
    return res;
  });
}

// What the user's local runner reports back (local mode only). Bounded so a tampered client cannot store arbitrary blobs.
const reportSchema = z.object({
  status: z.enum(["PASSED", "FAILED"]),
  finalUrl: z.string().max(2048).nullable().optional(),
  log: z.array(z.object({
    n: z.number().int().min(1).max(1000),
    line: z.string().max(500),
    ok: z.boolean(),
    detail: z.string().max(500).nullable().optional(),
    ms: z.number().optional(),
  })).min(1).max(500),
});
const startedSchema = z.string().datetime();

/** Local mode: records the outcome of a case run that the user's own machine executed. */
export async function finishCaseRunAction(projectId, caseId, report, startedAt) {
  return run(null, null, async () => {
    const ctx = await requireProject(uuidSchema.parse(projectId), "testcase.write");
    const res = await finishCaseRun(ctx, uuidSchema.parse(caseId), reportSchema.parse(report), startedSchema.parse(startedAt));
    revalidatePath("/test-cases");
    return res;
  });
}

/** Local mode: records the outcome of a run case that the user's own machine executed. */
export async function finishRunCaseRunAction(projectId, runCaseId, report, options) {
  return run(null, null, async () => {
    const ctx = await requireProject(uuidSchema.parse(projectId), "run.execute");
    const res = await finishRunCaseRun(ctx, uuidSchema.parse(runCaseId), reportSchema.parse(report), optionsSchema.parse(options));
    revalidatePath("/test-runs", "layout");
    revalidatePath("/");
    revalidatePath("/execution");
    return res;
  });
}

/** Case ids of the given suites, so the client can run them one by one (each run is its own request). */
export async function suiteCaseIdsAction(projectId, suiteIds) {
  return run(null, null, async () => {
    const ctx = await requireProject(uuidSchema.parse(projectId), "testcase.write");
    return suiteCaseIds(ctx, z.array(uuidSchema).max(500).parse(suiteIds));
  });
}
