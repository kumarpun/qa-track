import { z } from "zod";
import { requireProject } from "@/lib/server/dal";
import { AppError } from "@/lib/server/errors";
import { errorResponse } from "@/lib/server/http";
import { uploadToImageHost, MAX_FILE_BYTES } from "@/lib/server/services/attachments";

export const runtime = "nodejs";

/** multipart/form-data: projectId + one PNG `file`. Used by "My machine" runs to host their failure screenshot (the runner has no API key). */
export async function POST(request) {
  try {
    const form = await request.formData();
    const projectId = z.string().uuid().safeParse(form.get("projectId"));
    if (!projectId.success) throw new AppError("Invalid project");
    await requireProject(projectId.data, "testcase.write");
    const file = form.get("file");
    if (!file || typeof file === "string" || file.size === 0) throw new AppError("No file received");
    if (file.size > MAX_FILE_BYTES) throw new AppError("Screenshot is too large");
    const bytes = new Uint8Array(await file.arrayBuffer());
    // PNG magic number: the client-supplied type is never trusted.
    if (!(bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)) throw new AppError("Not a PNG image");
    return Response.json({ url: await uploadToImageHost(bytes, "failure.png", "image/png") });
  } catch (e) {
    return errorResponse(e);
  }
}
