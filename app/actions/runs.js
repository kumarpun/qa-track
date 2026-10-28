"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { run } from "@/lib/server/action";
import { requireProject } from "@/lib/server/dal";
import { runSchema } from "@/lib/validation/run";
import { runStatusSchema } from "@/lib/validation/execution";
import * as svc from "@/lib/server/services/runs";
import * as runSvc from "@/lib/server/services/executions";

export async function createRunAction(projectId, input) {
  return run(runSchema, input, async (data) => {
    const ctx = await requireProject(z.string().uuid().parse(projectId), "run.manage");
    const res = await svc.createRun(ctx, data);
    revalidatePath("/test-runs", "layout");
    return res;
  });
}

export async function setRunStatusAction(projectId, runId, status) {
  return run(z.object({ runId: z.string().uuid(), status: runStatusSchema }), { runId, status }, async (d) => {
    const ctx = await requireProject(z.string().uuid().parse(projectId), "run.manage");
    await runSvc.setRunStatus(ctx, d.runId, d.status);
    revalidatePath("/test-runs", "layout");
  });
}
