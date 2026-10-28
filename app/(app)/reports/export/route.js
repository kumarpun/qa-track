import { z } from "zod";
import { requireProject } from "@/lib/server/dal";
import { exportReportCsv } from "@/lib/server/services/reports";

export const dynamic = "force-dynamic";

const querySchema = z.object({ project: z.string().uuid(), type: z.enum(["runs", "cases", "defects"]).default("runs") });

export async function GET(request) {
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return new Response("Bad request", { status: 400 });
  let ctx;
  try {
    ctx = await requireProject(parsed.data.project, "report.read");
  } catch (e) {
    return new Response(e.status === 401 ? "Unauthorized" : "Not found", { status: e.status === 401 ? 401 : 404 });
  }
  return new Response(await exportReportCsv(ctx, parsed.data.type), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${ctx.project.key}-report-${parsed.data.type}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
