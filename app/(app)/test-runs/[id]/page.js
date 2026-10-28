import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { projectCtxById } from "@/lib/server/page";
import { getRun, getRunProjectId } from "@/lib/server/services/runs";
import { computeProgress, EXEC_STATUSES, STATUS_LABELS } from "@/lib/metrics";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { can } from "@/lib/permissions";
import { PRIORITY_TONE, label } from "../../test-cases/labels";
import { RunActions } from "./run-actions";

const fmt = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "—");

export default async function RunDetailPage({ params }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const projectId = await getRunProjectId(id);
  if (!projectId) notFound();
  const ctx = await projectCtxById(projectId, "project.read");
  const run = await getRun(ctx, id).catch(() => null);
  if (!run) notFound();
  const pr = computeProgress(run.counts);

  return (
    <>
      <PageHeader
        title={`${run.code} · ${run.name}`}
        description={[label(run.environment), run.build_version && `build ${run.build_version}`, run.platform && label(run.platform), `created by ${run.created_by_name}`].filter(Boolean).join(" · ")}
        actions={<>{can(ctx.role, "run.manage") && <RunActions projectId={ctx.project.id} runId={run.id} status={run.status} />}<StatusBadge status={run.status} /></>}
      />
      {run.description && <p className="mb-4 whitespace-pre-wrap text-sm">{run.description}</p>}

      <div className="mb-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {EXEC_STATUSES.map((s) => (
          <Card key={s} size="sm">
            <CardContent className="pt-4">
              <div className="text-2xl font-semibold" data-testid={`count-${s}`}>{run.counts[s]}</div>
              <div className="text-xs text-muted-foreground">{STATUS_LABELS[s]}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="mb-6 text-sm text-muted-foreground">
        Progress {pr.progressPct}% · Pass rate {pr.passRate}% of {pr.total} (Retest counts as pending, not passed)
      </p>

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <Card><CardHeader><CardTitle>Testers</CardTitle></CardHeader><CardContent className="text-sm">{run.testers.length ? run.testers.map((t) => t.name).join(", ") : "None assigned"}</CardContent></Card>
        <Card>
          <CardHeader><CardTitle>Suites</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {run.suites.length ? run.suites.map((s) => <div key={s.id}><Link className="hover:underline" href={`/test-suites/${s.id}`}>{s.name}</Link></div>) : "Individually selected cases"}
          </CardContent>
        </Card>
        <Card><CardHeader><CardTitle>Schedule</CardTitle></CardHeader><CardContent className="text-sm">{fmt(run.planned_start)} → {fmt(run.planned_end)}</CardContent></Card>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Snapshot</TableHead>
              <TableHead>Steps</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {run.items.map((c) => (
              <TableRow key={c.id} data-testid="run-case">
                <TableCell>{c.position}</TableCell>
                <TableCell className="font-mono text-xs">{c.code}</TableCell>
                <TableCell><Link className="hover:underline" href={`/test-runs/${run.id}/cases/${c.id}`}>{c.title}</Link></TableCell>
                <TableCell><Badge variant="secondary" className={PRIORITY_TONE[c.priority]}>{label(c.priority)}</Badge></TableCell>
                <TableCell>v{c.version}</TableCell>
                <TableCell>{c.stepCount}</TableCell>
                <TableCell><StatusBadge status={c.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
