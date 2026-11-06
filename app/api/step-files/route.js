import { z } from "zod";
import { requireProject } from "@/lib/server/dal";
import { AppError } from "@/lib/server/errors";
import { errorResponse } from "@/lib/server/http";
import { saveStepFile } from "@/lib/server/services/attachments";

export const runtime = "nodejs";

/** multipart/form-data: projectId + one `file` part (an image a test step uploads into a page). */
export async function POST(request) {
  try {
    const form = await request.formData();
    const projectId = z.string().uuid().safeParse(form.get("projectId"));
    if (!projectId.success) throw new AppError("Invalid project");
    const ctx = await requireProject(projectId.data, "testcase.write");
    const file = form.get("file");
    if (!file || typeof file === "string") throw new AppError("No file received");
    return Response.json(await saveStepFile(ctx, file));
  } catch (e) {
    return errorResponse(e);
  }
}
