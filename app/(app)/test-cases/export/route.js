import { z } from "zod";
import { requireProject } from "@/lib/server/dal";
import { listParamsSchema } from "@/lib/validation/testcase";
import { exportCsv } from "@/lib/server/services/testcases";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const sp = Object.fromEntries(request.nextUrl.searchParams);
  const projectId = z.string().uuid().safeParse(sp.project);
  const params = listParamsSchema.safeParse(sp);
  if (!projectId.success || !params.success) return new Response("Bad request", { status: 400 });
  let ctx;
  try {
    ctx = await requireProject(projectId.data, "project.read");
  } catch (e) {
    return new Response(e.status === 401 ? "Unauthorized" : "Not found", { status: e.status === 401 ? 401 : 404 });
  }
  const csv = await exportCsv(ctx, params.data);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${ctx.project.key}-test-cases.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
