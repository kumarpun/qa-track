import Link from "next/link";
import { PlayCircle } from "lucide-react";
import { activeProjectCtx } from "@/lib/server/page";
import { listRuns } from "@/lib/server/services/runs";
import { computeProgress } from "@/lib/metrics";
import { PageHeader, EmptyState } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default async function ExecutionPage() {
  const ctx = await activeProjectCtx();
  if (!ctx) return <><PageHeader title="Test Execution" /><EmptyState icon={PlayCircle} title="No project selected" description="Create or join a project first." /></>;
  const [draft, active] = await Promise.all([
    listRuns(ctx, { page: 1, status: "DRAFT" }),
    listRuns(ctx, { page: 1, status: "IN_PROGRESS" }),
  ]);
  const runs = [...active.rows, ...draft.rows];

  return (
    <>
      <PageHeader title="Test Execution" description={`Open runs in ${ctx.project.key}`} />
      {runs.length === 0 ? (
        <EmptyState icon={PlayCircle} title="Nothing to execute" description="Open runs (draft or in progress) appear here. Create a run from the Test Runs page." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {runs.map((r) => {
            const pr = computeProgress(r.counts);
            return (
              <Card key={r.id} data-testid="open-run">
                <CardContent className="space-y-3 pt-4">
                  <div className="flex items-center justify-between gap-2">
                    <div><span className="font-mono text-xs">{r.code}</span> <span className="font-medium">{r.name}</span></div>
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="h-2 overflow-hidden rounded bg-muted" role="progressbar" aria-valuenow={pr.progressPct} aria-valuemin={0} aria-valuemax={100} aria-label={`${r.code} progress`}>
                    <div className="h-full bg-primary" style={{ width: `${pr.progressPct}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground">{pr.completed} of {pr.total} done · {pr.pending} pending · pass rate {pr.passRate}%</p>
                  <Link href={`/test-runs/${r.id}`} className={buttonVariants({ size: "sm" })}>Open run</Link>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
