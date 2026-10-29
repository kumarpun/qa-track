import Link from "next/link";
import { PlayCircle, Plus } from "lucide-react";
import { activeProjectCtx } from "@/lib/server/page";
import { listRuns } from "@/lib/server/services/runs";
import { runListSchema } from "@/lib/validation/run";
import { computeProgress } from "@/lib/metrics";
import { can } from "@/lib/permissions";
import { PageHeader, EmptyState } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RunFilters } from "./run-filters";
import { DeleteRunButton } from "./delete-run-button";

export default async function TestRunsPage({ searchParams }) {
  const ctx = await activeProjectCtx();
  if (!ctx) return <><PageHeader title="Test Runs" /><EmptyState icon={PlayCircle} title="No project selected" description="Create or join a project first." /></>;
  const sp = await searchParams;
  const parsed = runListSchema.safeParse(Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])));
  const params = parsed.success ? parsed.data : runListSchema.parse({});
  const result = await listRuns(ctx, params);
  const canManage = can(ctx.role, "run.manage");
  const filtered = Boolean(params.q || params.status || params.environment || params.build);
  const href = (page) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v).map(([k, v]) => [k, String(v)]));
    qs.set("page", String(page));
    return `/test-runs?${qs}`;
  };

  return (
    <>
      <PageHeader
        title="Test Runs"
        description={`${result.total} ${result.total === 1 ? "run" : "runs"} in ${ctx.project.key}`}
        actions={canManage && <Link href="/test-runs/new" className={buttonVariants({ size: "sm" })}><Plus /> New run</Link>}
      />
      <RunFilters params={params} />
      {result.total === 0 ? (
        <EmptyState
          icon={PlayCircle}
          title={filtered ? "No runs match your filters" : "No test runs yet"}
          description={filtered ? "Try clearing a filter or search term." : canManage ? "Create a run from suites or individual test cases." : "No runs have been created for this project."}
          action={!filtered && canManage ? <Link href="/test-runs/new" className={buttonVariants({ size: "sm" })}><Plus /> New run</Link> : null}
        />
      ) : (
        <>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Environment</TableHead>
                  <TableHead>Build</TableHead>
                  <TableHead className="text-right">Cases</TableHead>
                  <TableHead className="text-right">Pass rate</TableHead>
                  {canManage && <TableHead className="w-10"><span className="sr-only">Actions</span></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.map((r) => {
                  // Only PASSED counts toward pass rate; unexecuted and Retest cases stay in the denominator.
                  const pr = computeProgress(r.counts);
                  return (
                    <TableRow key={r.id} data-testid="run-row">
                      <TableCell className="font-mono text-xs"><Link className="hover:underline" href={`/test-runs/${r.id}`}>{r.code}</Link></TableCell>
                      <TableCell><Link className="hover:underline" href={`/test-runs/${r.id}`}>{r.name}</Link></TableCell>
                      <TableCell><StatusBadge status={r.status} /></TableCell>
                      <TableCell>{r.environment}</TableCell>
                      <TableCell>{r.build_version || "—"}</TableCell>
                      <TableCell className="text-right">{r.total}</TableCell>
                      <TableCell className="text-right">{r.total ? `${pr.passRate}%` : "—"}</TableCell>
                      {canManage && <TableCell className="text-right"><DeleteRunButton projectId={ctx.project.id} runId={r.id} code={r.code} /></TableCell>}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {result.pageCount > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Page {result.page} of {result.pageCount}</span>
              <div className="flex gap-2">
                {result.page > 1 && <Link className={buttonVariants({ variant: "outline", size: "sm" })} href={href(result.page - 1)}>Previous</Link>}
                {result.page < result.pageCount && <Link className={buttonVariants({ variant: "outline", size: "sm" })} href={href(result.page + 1)}>Next</Link>}
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
