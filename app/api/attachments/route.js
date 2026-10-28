import { z } from "zod";
import { requireProject } from "@/lib/server/dal";
import { AppError } from "@/lib/server/errors";
import { errorResponse } from "@/lib/server/http";
import { getExecutionProjectId, saveAttachment } from "@/lib/server/services/attachments";

export const runtime = "nodejs";

/** multipart/form-data: executionId + one or more `file` parts. */
export async function POST(request) {
  try {
    const form = await request.formData();
    const executionId = z.string().uuid().safeParse(form.get("executionId"));
    if (!executionId.success) throw new AppError("Invalid execution");
    const projectId = await getExecutionProjectId(executionId.data);
    if (!projectId) throw new AppError("Execution not found", { status: 404, code: "NOT_FOUND" });
    const ctx = await requireProject(projectId, "run.execute");
    const files = form.getAll("file").filter((f) => typeof f !== "string");
    if (!files.length) throw new AppError("No file received");
    const saved = [];
    for (const f of files) saved.push(await saveAttachment(ctx, executionId.data, f));
    return Response.json({ saved });
  } catch (e) {
    return errorResponse(e);
  }
}
