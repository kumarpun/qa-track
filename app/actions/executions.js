"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { run } from "@/lib/server/action";
import { requireProject } from "@/lib/server/dal";
import { commentSchema, executionSchema, quickDefectSchema } from "@/lib/validation/execution";
import * as exec from "@/lib/server/services/executions";
import * as defects from "@/lib/server/services/defects";

const uuid = z.string().uuid();

export async function recordExecutionAction(projectId, runCaseId, input) {
  return run(executionSchema, input, async (data) => {
    const ctx = await requireProject(uuid.parse(projectId), "run.execute");
    const res = await exec.recordExecution(ctx, uuid.parse(runCaseId), data);
    revalidatePath("/test-runs", "layout");
    revalidatePath("/execution");
    return res;
  });
}

export async function addCommentAction(projectId, runCaseId, input) {
  return run(commentSchema, input, async (data) => {
    const ctx = await requireProject(uuid.parse(projectId), "run.execute");
    await exec.addComment(ctx, uuid.parse(runCaseId), data.body);
    revalidatePath("/test-runs", "layout");
  });
}

export async function createDefectAction(projectId, input) {
  return run(quickDefectSchema, input, async (data) => {
    const ctx = await requireProject(uuid.parse(projectId), "defect.write");
    return defects.createDefect(ctx, data);
  });
}

export async function linkDefectsAction(projectId, executionId, defectIds) {
  return run(z.object({ executionId: uuid, defectIds: z.array(uuid).min(1).max(20) }), { executionId, defectIds }, async (d) => {
    const ctx = await requireProject(uuid.parse(projectId), "defect.write");
    await exec.linkExecutionDefects(ctx, d.executionId, d.defectIds);
    revalidatePath("/test-runs", "layout");
  });
}
