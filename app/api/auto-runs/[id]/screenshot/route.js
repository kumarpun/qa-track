import { z } from "zod";
import { requireProject } from "@/lib/server/dal";
import { AppError } from "@/lib/server/errors";
import { errorResponse } from "@/lib/server/http";
import { getAutoRunShot } from "@/lib/server/services/testcases";
import { readShot } from "@/lib/server/automation/storage";

export const runtime = "nodejs";

export async function GET(_request, { params }) {
  try {
    const { id } = await params;
    const notFound = () => new AppError("Not found", { status: 404, code: "NOT_FOUND" });
    if (!z.string().uuid().safeParse(id).success) throw notFound();
    const row = await getAutoRunShot(id);
    if (!row?.screenshot_key) throw notFound();
    await requireProject(row.project_id, "project.read");
    const bytes = await readShot(row.screenshot_key).catch(() => null);
    if (!bytes) throw notFound();
    return new Response(bytes, { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" } });
  } catch (e) {
    return errorResponse(e);
  }
}
