import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ExternalLink, Pencil } from "lucide-react";
import { projectCtxById } from "@/lib/server/page";
import { getDefect, getDefectProjectId } from "@/lib/server/services/defects";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PRIORITY_TONE, label } from "../../test-cases/labels";
import { DefectActions } from "./defect-actions";

const fmt = (d) => new Date(d).toISOString().replace("T", " ").slice(0, 16) + " UTC";

function Block({ title, text }) {
  if (!text) return null;
  return <div><div className="font-medium">{title}</div><p className="whitespace-pre-wrap">{text}</p></div>;
}

export default async function DefectDetailPage({ params }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const projectId = await getDefectProjectId(id);
  if (!projectId) notFound();
  const ctx = await projectCtxById(projectId, "project.read");
  const d = await getDefect(ctx, id).catch(() => null);
  if (!d) notFound();
  const canWrite = can(ctx.role, "defect.write");

  return (
    <>
      <PageHeader
        title={`${d.code} · ${d.title}`}
        description={`Reported by ${d.reporter_name} · ${fmt(d.created_at)}`}
        actions={<>
          {canWrite && <Link href={`/defects/${id}/edit`} className={buttonVariants({ variant: "outline", size: "sm" })}><Pencil /> Edit</Link>}
          <DefectActions projectId={projectId} defectId={id} status={d.status} canWrite={canWrite} canDelete={can(ctx.role, "defect.delete")} />
          <StatusBadge status={d.status} />
        </>}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">Severity: {label(d.severity)}</Badge>
              <Badge variant="secondary" className={PRIORITY_TONE[d.priority]}>Priority: {label(d.priority)}</Badge>
              {d.environment && <Badge variant="outline">{label(d.environment)}</Badge>}
              {d.build_version && <Badge variant="outline">build {d.build_version}</Badge>}
            </div>
            <div>Assignee: {d.assignee_name ?? "Unassigned"}</div>
            {d.external_url && (
              <a className="inline-flex items-center gap-1 underline" href={d.external_url} target="_blank" rel="noopener noreferrer" data-testid="defect-external">
                <ExternalLink className="size-3" /> {d.external_url}
              </a>
            )}
            <Block title="Description" text={d.description} />
            <Block title="Steps to reproduce" text={d.steps_to_reproduce} />
            <Block title="Expected result" text={d.expected_result} />
            <Block title="Actual result" text={d.actual_result} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Linked executions ({d.executions.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {d.executions.length === 0 && <p className="text-muted-foreground">Not linked to any test execution.</p>}
            {d.executions.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-2 rounded-md border p-2" data-testid="defect-execution">
                <div>
                  <Link className="underline" href={`/test-runs/${e.run_id}/cases/${e.run_case_id}`}>{e.caseCode} · {e.caseTitle}</Link>
                  <div className="text-xs text-muted-foreground">{e.run_code} · {e.executed_by_name} · {fmt(e.executed_at)}</div>
                </div>
                <StatusBadge status={e.status} />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
