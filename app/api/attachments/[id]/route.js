import { z } from "zod";
import { requireProject } from "@/lib/server/dal";
import { AppError } from "@/lib/server/errors";
import { errorResponse } from "@/lib/server/http";
import { deleteAttachment, getAttachmentProjectId, readAttachment } from "@/lib/server/services/attachments";

export const runtime = "nodejs";

async function authorize(params, action) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) throw new AppError("Not found", { status: 404, code: "NOT_FOUND" });
  const projectId = await getAttachmentProjectId(id);
  if (!projectId) throw new AppError("Not found", { status: 404, code: "NOT_FOUND" });
  return { id, ctx: await requireProject(projectId, action) };
}

export async function GET(_request, { params }) {
  try {
    const { id, ctx } = await authorize(params, "project.read");
    const { bytes, headers } = await readAttachment(ctx, id);
    return new Response(bytes, { headers });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_request, { params }) {
  try {
    const { id, ctx } = await authorize(params, "run.execute");
    await deleteAttachment(ctx, id);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
