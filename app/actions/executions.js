"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { run } from "@/lib/server/action";
import { requireProject } from "@/lib/server/dal";
import { commentSchema, executionSchema, quickDefectSchema } from "@/lib/validation/execution";
import * as exec from "@/lib/server/services/executions";
import * as defects from "@/lib/server/services/defects";
import { AppError } from "@/lib/server/errors";

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
    await exec.addComment(ctx, uuid.parse(runCaseId), data.body, data.parentId);
    revalidatePath("/test-runs", "layout");
  });
}

export async function updateCommentAction(projectId, runCaseId, commentId, input) {
  return run(commentSchema, input, async (data) => {
    const ctx = await requireProject(uuid.parse(projectId), "run.execute");
    await exec.updateComment(ctx, uuid.parse(runCaseId), uuid.parse(commentId), data.body);
    revalidatePath("/test-runs", "layout");
  });
}

export async function deleteCommentAction(projectId, runCaseId, commentId) {
  return run(null, null, async () => {
    const ctx = await requireProject(uuid.parse(projectId), "run.execute");
    await exec.deleteComment(ctx, uuid.parse(runCaseId), uuid.parse(commentId));
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

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Upload one comment image to freeimage.host (key stays server-side) and return its public URL. */
export async function uploadCommentImageAction(projectId, formData) {
  return run(null, null, async () => {
    await requireProject(uuid.parse(projectId), "run.execute");
    const key = process.env.FREEIMAGE_API_KEY;
    if (!key) throw new AppError("Image upload is not configured (FREEIMAGE_API_KEY)");
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) throw new AppError("Choose an image to upload");
    if (!IMAGE_TYPES.includes(file.type)) throw new AppError("Only PNG, JPG, GIF or WebP images are allowed");
    if (file.size > MAX_IMAGE_BYTES) throw new AppError("Image must be 5 MB or smaller");
    const body = new FormData();
    body.set("key", key);
    body.set("action", "upload");
    body.set("format", "json");
    body.set("source", file);
    const res = await fetch("https://freeimage.host/api/1/upload", { method: "POST", body, signal: AbortSignal.timeout(30_000) });
    const json = await res.json().catch(() => null);
    const url = json?.image?.url;
    if (!res.ok || typeof url !== "string" || !url.startsWith("https://")) throw new AppError("Image upload failed. Please try again.");
    return { url };
  });
}
