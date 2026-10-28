import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ChevronLeft, ChevronRight, FastForward, Paperclip } from "lucide-react";
import { projectCtxById } from "@/lib/server/page";
import { getRunCase, getRunCaseProjectId } from "@/lib/server/services/executions";
import { pickableDefects } from "@/lib/server/services/defects";
import { can, hasRole } from "@/lib/permissions";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PRIORITY_TONE, label } from "../../../../test-cases/labels";
import { ExecutionForm } from "./execution-form";
import { CommentForm } from "./comment-form";
import { AttachmentDelete } from "./attachment-delete";

const uuid = z.string().uuid();
const fmt = (d) => new Date(d).toISOString().replace("T", " ").slice(0, 16) + " UTC";
const kb = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export default async function RunCasePage({ params }) {
  const { id, runCaseId } = await params;
  if (!uuid.safeParse(id).success || !uuid.safeParse(runCaseId).success) notFound();
  const projectId = await getRunCaseProjectId(runCaseId);
  if (!projectId) notFound();
  const ctx = await projectCtxById(projectId, "project.read");
  const rc = await getRunCase(ctx, runCaseId).catch(() => null);
  if (!rc || rc.runId !== id) notFound();

  const s = rc.snapshot;
  const steps = (s.steps ?? []).map((st, i) => ({ ...st, position: i + 1 }));
  const open = rc.runStatus === "DRAFT" || rc.runStatus === "IN_PROGRESS";
  const canExecute = can(ctx.role, "run.execute");
  const defects = open && canExecute ? await pickableDefects(ctx) : [];
  const base = `/test-runs/${id}/cases`;

  return (
    <>
      <PageHeader
        title={`${s.code} · ${s.title}`}
        description={`${rc.runCode} · ${rc.runName} · case ${rc.index} of ${rc.total} · snapshot v${s.version}`}
        actions={<StatusBadge status={rc.status} />}
      />
      <nav aria-label="Case navigation" className="mb-4 flex flex-wrap gap-2">
        <Link className={buttonVariants({ variant: "outline", size: "sm" })} href={`/test-runs/${id}`}>Back to run</Link>
        {rc.prevId && <Link className={buttonVariants({ variant: "outline", size: "sm" })} href={`${base}/${rc.prevId}`}><ChevronLeft /> Previous</Link>}
        {rc.nextId && <Link className={buttonVariants({ variant: "outline", size: "sm" })} href={`${base}/${rc.nextId}`}>Next <ChevronRight /></Link>}
        {rc.nextPendingId && <Link className={buttonVariants({ variant: "outline", size: "sm" })} href={`${base}/${rc.nextPendingId}`}><FastForward /> Next pending</Link>}
      </nav>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Test case (frozen at run creation)</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary" className={PRIORITY_TONE[s.priority]}>{label(s.priority)}</Badge>
                {s.type && <Badge variant="outline">{label(s.type)}</Badge>}
              </div>
              {s.description && <p className="whitespace-pre-wrap">{s.description}</p>}
              {s.preconditions && <div><div className="font-medium">Preconditions</div><p className="whitespace-pre-wrap">{s.preconditions}</p></div>}
              {s.testData && <div><div className="font-medium">Test data</div><p className="whitespace-pre-wrap">{s.testData}</p></div>}
              <ol className="space-y-2">
                {steps.map((st) => (
                  <li key={st.position} className="rounded-md border p-2" data-testid="snapshot-step">
                    <div><span className="text-muted-foreground">{st.position}.</span> {st.action}</div>
                    {st.testData && <div className="text-xs text-muted-foreground">Data: {st.testData}</div>}
                    <div className="text-xs">Expected: {st.expected}</div>
                  </li>
                ))}
                {steps.length === 0 && <li className="text-muted-foreground">No steps.</li>}
              </ol>
            </CardContent>
          </Card>

          {!open ? (
            <p role="status" className="rounded-md border p-3 text-sm text-muted-foreground">This run is {rc.runStatus.toLowerCase().replace("_", " ")}. Reopen it to record results.</p>
          ) : !canExecute ? (
            <p role="status" className="rounded-md border p-3 text-sm text-muted-foreground">Your role is read-only; you cannot record results.</p>
          ) : (
            <ExecutionForm projectId={ctx.project.id} runCaseId={rc.id} steps={steps} defects={defects} canReportDefects={can(ctx.role, "defect.write")} />
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Execution history ({rc.executions.length})</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {rc.executions.length === 0 && <p className="text-sm text-muted-foreground">Not executed yet.</p>}
              {rc.executions.map((e) => (
                <div key={e.id} className="space-y-1 rounded-md border p-3 text-sm" data-testid="execution">
                  <div className="flex items-center justify-between gap-2">
                    <StatusBadge status={e.status} />
                    <span className="text-xs text-muted-foreground">{e.executedByName} · {fmt(e.executedAt)}</span>
                  </div>
                  {e.actualResult && <p className="whitespace-pre-wrap"><span className="font-medium">Actual:</span> {e.actualResult}</p>}
                  {e.comment && <p className="whitespace-pre-wrap text-muted-foreground">{e.comment}</p>}
                  {e.steps.length > 0 && (
                    <ul className="text-xs text-muted-foreground">
                      {e.steps.map((st) => <li key={st.position}>Step {st.position}: {st.status.replace("_", " ").toLowerCase()}{st.actualResult ? ` — ${st.actualResult}` : ""}</li>)}
                    </ul>
                  )}
                  {e.defects.length > 0 && (
                    <div className="flex flex-wrap gap-2 text-xs">
                      {e.defects.map((d) => (
                        <span key={d.id} className="rounded bg-red-500/10 px-1.5 py-0.5" data-testid="exec-defect">
                          {d.external_url ? <a className="underline" href={d.external_url} target="_blank" rel="noopener noreferrer">{d.code}</a> : d.code} {d.title}
                        </span>
                      ))}
                    </div>
                  )}
                  {e.attachments.length > 0 && (
                    <ul className="flex flex-wrap gap-3 text-xs">
                      {e.attachments.map((a) => (
                        <li key={a.id} className="flex items-center gap-1" data-testid="attachment">
                          <Paperclip className="size-3" />
                          <a className="underline" href={`/api/attachments/${a.id}`} target="_blank" rel="noopener noreferrer">{a.file_name}</a>
                          <span className="text-muted-foreground">({kb(a.size_bytes)})</span>
                          {canExecute && open && (a.uploaded_by === ctx.user.id || hasRole(ctx.role, "QA_LEAD")) && <AttachmentDelete id={a.id} name={a.file_name} />}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Comments ({rc.comments.length})</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {rc.comments.map((c) => (
                <div key={c.id} className="text-sm" data-testid="comment">
                  <div className="text-xs text-muted-foreground">{c.author_name} · {fmt(c.created_at)}</div>
                  <p className="whitespace-pre-wrap">{c.body}</p>
                </div>
              ))}
              {canExecute && <CommentForm projectId={ctx.project.id} runCaseId={rc.id} />}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
