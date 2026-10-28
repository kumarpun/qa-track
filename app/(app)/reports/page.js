import Link from "next/link";
import { BarChart3, Download } from "lucide-react";
import { activeProjectCtx } from "@/lib/server/page";
import { getReport } from "@/lib/server/services/reports";
import { PageHeader, EmptyState } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EXEC_STATUSES, STATUS_LABELS } from "@/lib/metrics";
import { label } from "../test-cases/labels";
import { PrintButton } from "./print-button";

function Stat({ title, value, testid }) {
  return (
    <Card><CardContent className="pt-6"><div className="text-sm text-muted-foreground">{title}</div><div className="text-2xl font-semibold" data-testid={testid}>{value}</div></CardContent></Card>
  );
}

export default async function ReportsPage() {
  const ctx = await activeProjectCtx("report.read");
  if (!ctx) return <><PageHeader title="Reports" /><EmptyState icon={BarChart3} title="No project selected" description="Create or join a project first." /></>;
  const r = await getReport(ctx);
  const exp = (type) => `/reports/export?project=${ctx.project.id}&type=${type}`;
  const linkCls = buttonVariants({ variant: "outline", size: "sm" });

  return (
    <>
      <PageHeader
        title="Reports"
        description={`Live results for ${ctx.project.key} · ${new Date().toISOString().slice(0, 10)}`}
        actions={<span className="flex flex-wrap gap-2 print:hidden">
          <a className={linkCls} href={exp("runs")}><Download /> Runs CSV</a>
          <a className={linkCls} href={exp("cases")}><Download /> Cases CSV</a>
          <a className={linkCls} href={exp("defects")}><Download /> Defects CSV</a>
          <PrintButton />
        </span>}
      />
      {r.runs.length === 0 && r.defects.total === 0 ? (
        <EmptyState icon={BarChart3} title="Nothing to report yet" description="Create a test run or log a defect and results will appear here." />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat title="Runs" value={r.runs.length} testid="rep-runs" />
            <Stat title="Case results (all runs)" value={r.overall.total} testid="rep-total" />
            <Stat title="Pass rate" value={r.overall.total ? `${r.overall.passRate}%` : "—"} testid="rep-passrate" />
            <Stat title="Defects" value={r.defects.total} testid="rep-defects" />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Results by status</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {EXEC_STATUSES.map((s) => (
                  <div key={s} className="flex items-center justify-between"><StatusBadge status={s} /><span data-testid={`rep-status-${s}`}>{r.overall[s]}</span></div>
                ))}
                <p className="pt-2 text-xs text-muted-foreground">Retest counts as pending, never as passed. Pass rate = Passed ÷ all cases.</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Defects</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-1">
                  <div className="font-medium">By severity</div>
                  {Object.entries(r.defects.bySeverity).map(([k, n]) => <div key={k} className="flex justify-between"><span>{label(k)}</span><span>{n}</span></div>)}
                </div>
                <div className="space-y-1">
                  <div className="font-medium">By status</div>
                  {Object.entries(r.defects.byStatus).map(([k, n]) => <div key={k} className="flex justify-between"><span>{label(k)}</span><span>{n}</span></div>)}
                </div>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader><CardTitle>Runs</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Run</TableHead><TableHead>Status</TableHead>
                    {EXEC_STATUSES.map((s) => <TableHead key={s} className="text-right">{STATUS_LABELS[s]}</TableHead>)}
                    <TableHead className="text-right">Pass rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {r.runs.map((run) => (
                    <TableRow key={run.id} data-testid="report-run-row">
                      <TableCell><Link className="hover:underline" href={`/test-runs/${run.id}`}>{run.code} · {run.name}</Link></TableCell>
                      <TableCell><StatusBadge status={run.status} /></TableCell>
                      {EXEC_STATUSES.map((s) => <TableCell key={s} className="text-right">{run.progress[s]}</TableCell>)}
                      <TableCell className="text-right">{run.progress.total ? `${run.progress.passRate}%` : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Top failing cases</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              {r.topFailing.length === 0 && <p className="text-muted-foreground">No failed executions recorded.</p>}
              {r.topFailing.map((t) => <div key={t.code} className="flex justify-between"><span>{t.code} · {t.title}</span><span>{t.failures}×</span></div>)}
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
