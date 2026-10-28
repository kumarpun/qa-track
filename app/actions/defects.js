"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { run } from "@/lib/server/action";
import { requireProject } from "@/lib/server/dal";
import { defectSchema, defectStatusSchema } from "@/lib/validation/defect";
import * as svc from "@/lib/server/services/defects";

const uuid = z.string().uuid();
const ctxFor = (projectId, action = "defect.write") => requireProject(uuid.parse(projectId), action);
const refresh = () => revalidatePath("/defects", "layout");

export async function createDefectFullAction(projectId, input) {
  return run(defectSchema, input, async (data) => {
    const res = await svc.createFullDefect(await ctxFor(projectId), data);
    refresh();
    return res;
  });
}

export async function updateDefectAction(projectId, defectId, input) {
  return run(defectSchema, input, async (data) => {
    await svc.updateDefect(await ctxFor(projectId), uuid.parse(defectId), data);
    refresh();
    revalidatePath("/test-runs", "layout");
  });
}

export async function setDefectStatusAction(projectId, defectId, status) {
  return run(defectStatusSchema, status, async (s) => {
    await svc.setDefectStatus(await ctxFor(projectId), uuid.parse(defectId), s);
    refresh();
    revalidatePath("/test-runs", "layout");
  });
}

export async function deleteDefectAction(projectId, defectId) {
  return run(null, null, async () => {
    await svc.deleteDefect(await ctxFor(projectId, "defect.delete"), uuid.parse(defectId));
    refresh();
  });
}
