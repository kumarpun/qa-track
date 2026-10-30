"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { run } from "@/lib/server/action";
import { requireProject } from "@/lib/server/dal";
import { suiteCaseIds } from "@/lib/server/services/suites";
import { runCaseInBrowser, runRunCaseInBrowser } from "@/lib/server/services/automation";

const uuidSchema = z.string().uuid();
const optionsSchema = z.object({ headless: z.boolean() }).partial().default({});

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

/** Case ids of the given suites, so the client can run them one by one (each run is its own request). */
export async function suiteCaseIdsAction(projectId, suiteIds) {
  return run(null, null, async () => {
    const ctx = await requireProject(uuidSchema.parse(projectId), "testcase.write");
    return suiteCaseIds(ctx, z.array(uuidSchema).max(500).parse(suiteIds));
  });
}
