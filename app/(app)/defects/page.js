import Link from "next/link";
import { Bug, Download, Plus } from "lucide-react";
import { activeProjectCtx } from "@/lib/server/page";
import { assigneeOptions, listDefects } from "@/lib/server/services/defects";
import { defectListSchema } from "@/lib/validation/defect";
import { can } from "@/lib/permissions";
import { PageHeader, EmptyState } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PRIORITY_TONE, label } from "../test-cases/labels";
import { DefectFilters } from "./defect-filters";

export default async function DefectsPage({ searchParams }) {
  const ctx = await activeProjectCtx();
  if (!ctx) return <><PageHeader title="Defects" /><EmptyState icon={Bug} title="No project selected" description="Create or join a project first." /></>;
  const sp = await searchParams;
  const parsed = defectListSchema.safeParse(Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])));
  const params = parsed.success ? parsed.data : defectListSchema.parse({});
  const [result, assignees] = await Promise.all([listDefects(ctx, params), assigneeOptions(ctx)]);
  const canWrite = can(ctx.role, "defect.write");
  const filtered = Boolean(params.q || params.status || params.severity || params.priority || params.assignee);
  const qs = (extra = {}) => new URLSearchParams(Object.entries({ ...params, ...extra }).filter(([, v]) => v).map(([k, v]) => [k, String(v)]));
  const exportQs = qs({ page: undefined });
  exportQs.set("project", ctx.project.id);

  return (
    <>
      <PageHeader
        title="Defects"
        description={`${result.total} ${result.total === 1 ? "defect" : "defects"} in ${ctx.project.key}`}
        actions={<>
          <a href={`/defects/export?${exportQs}`} className={buttonVariants({ variant: "outline", size: "sm" })}><Download /> Export CSV</a>
          {canWrite && <Link href="/defects/new" className={buttonVariants({ size: "sm" })}><Plus /> New defect</Link>}
        </>}
      />
      <DefectFilters params={params} assignees={assignees} />
      {result.total === 0 ? (
        <EmptyState
          icon={Bug}
          title={filtered ? "No defects match your filters" : "No defects yet"}
          description={filtered ? "Try clearing a filter or search term." : "Report a defect here or straight from a failed test execution."}
          action={!filtered && canWrite ? <Link href="/defects/new" className={buttonVariants({ size: "sm" })}><Plus /> New defect</Link> : null}
        />
      ) : (
        <>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Assignee</TableHead>
                  <TableHead className="text-right">Executions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.map((d) => (
                  <TableRow key={d.id} data-testid="defect-row">
                    <TableCell className="font-mono text-xs"><Link className="hover:underline" href={`/defects/${d.id}`}>{d.code}</Link></TableCell>
                    <TableCell><Link className="hover:underline" href={`/defects/${d.id}`}>{d.title}</Link></TableCell>
                    <TableCell><StatusBadge status={d.status} /></TableCell>
                    <TableCell><Badge variant="secondary" className={PRIORITY_TONE[d.severity === "MAJOR" ? "HIGH" : d.severity === "MINOR" ? "MEDIUM" : d.severity === "TRIVIAL" ? "LOW" : "CRITICAL"]}>{label(d.severity)}</Badge></TableCell>
                    <TableCell><Badge variant="secondary" className={PRIORITY_TONE[d.priority]}>{label(d.priority)}</Badge></TableCell>
                    <TableCell>{d.assignee_name ?? "—"}</TableCell>
                    <TableCell className="text-right">{d.execution_count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {result.pageCount > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Page {result.page} of {result.pageCount}</span>
              <div className="flex gap-2">
                {result.page > 1 && <Link className={buttonVariants({ variant: "outline", size: "sm" })} href={`/defects?${qs({ page: result.page - 1 })}`}>Previous</Link>}
                {result.page < result.pageCount && <Link className={buttonVariants({ variant: "outline", size: "sm" })} href={`/defects?${qs({ page: result.page + 1 })}`}>Next</Link>}
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
