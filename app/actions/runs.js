"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { run } from "@/lib/server/action";
import { requireProject } from "@/lib/server/dal";
import { runSchema } from "@/lib/validation/run";
import * as svc from "@/lib/server/services/runs";

export async function createRunAction(projectId, input) {
  return run(runSchema, input, async (data) => {
    const ctx = await requireProject(z.string().uuid().parse(projectId), "run.manage");
    const res = await svc.createRun(ctx, data);
    revalidatePath("/test-runs", "layout");
    return res;
  });
}
