import { z } from "zod";
import { requireProject } from "@/lib/server/dal";
import { defectListSchema } from "@/lib/validation/defect";
import { exportDefectsCsv } from "@/lib/server/services/defects";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const sp = Object.fromEntries(request.nextUrl.searchParams);
  const projectId = z.string().uuid().safeParse(sp.project);
  const params = defectListSchema.safeParse(sp);
  if (!projectId.success || !params.success) return new Response("Bad request", { status: 400 });
  let ctx;
  try {
    ctx = await requireProject(projectId.data, "report.read");
  } catch (e) {
    return new Response(e.status === 401 ? "Unauthorized" : "Not found", { status: e.status === 401 ? 401 : 404 });
  }
  return new Response(await exportDefectsCsv(ctx, params.data), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${ctx.project.key}-defects.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
