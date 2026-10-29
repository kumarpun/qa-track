import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ChevronLeft, ChevronRight, FastForward } from "lucide-react";
import { projectCtxById } from "@/lib/server/page";
import { getRunCase, getRunCaseProjectId } from "@/lib/server/services/executions";
import { mentionableMembers } from "@/lib/server/services/notifications";
import { can } from "@/lib/permissions";
import { browserRunsEnabled } from "@/lib/server/automation/config";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { PRIORITY_TONE, label } from "../../../../test-cases/labels";
import { CommentList } from "@/components/comments/comment-list";
import { toThreads } from "@/components/comments/format";
import { addCommentAction, updateCommentAction, deleteCommentAction } from "@/app/actions/executions";
import { ResultStatusSelect } from "./result-state";
import { RunCaseInBrowser } from "./run-case-in-browser";

const uuid = z.string().uuid();

const Text = ({ children }) => <p className="whitespace-pre-wrap text-sm leading-relaxed">{children}</p>;

function Section({ title, children }) {
  return (
    <section className="space-y-1.5">
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Meta({ name, children }) {
  return (
    <div className="flex items-baseline gap-3">
      <dt className="w-24 shrink-0 text-sm text-muted-foreground">{name}</dt>
      <dd className="min-w-0 flex-1 text-sm">{children || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );
}

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
  const base = `/test-runs/${id}/cases`;

  const numbered = (i, text) => (steps.length > 1 ? `${i + 1}. ${text}` : text);
  const withData = steps.filter((st) => st.testData);

  return (
    <>
      <nav aria-label="Case navigation" className="mb-6 flex flex-wrap gap-2">
        <Link className={buttonVariants({ variant: "outline", size: "sm" })} href={`/test-runs/${id}`}>Back to run</Link>
        {rc.prevId && <Link className={buttonVariants({ variant: "outline", size: "sm" })} href={`${base}/${rc.prevId}`}><ChevronLeft /> Previous</Link>}
        {rc.nextId && <Link className={buttonVariants({ variant: "outline", size: "sm" })} href={`${base}/${rc.nextId}`}>Next <ChevronRight /></Link>}
        {rc.nextPendingId && <Link className={buttonVariants({ variant: "outline", size: "sm" })} href={`${base}/${rc.nextPendingId}`}><FastForward /> Next pending</Link>}
      </nav>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          <div>
            <p className="text-sm text-muted-foreground">{rc.runCode} · {rc.runName} · case {rc.index} of {rc.total}</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight"><span className="text-muted-foreground">{s.code} · </span>{s.title}</h1>
          </div>

          {s.preconditions && <Section title="Preconditions"><Text>{s.preconditions}</Text></Section>}
          <Section title="Test steps">
            {steps.length === 0 && <p className="text-sm text-muted-foreground">No steps.</p>}
            {steps.map((st, i) => <div key={st.position} data-testid="snapshot-step"><Text>{numbered(i, st.action)}</Text></div>)}
          </Section>
          {withData.length > 0 && <Section title="Test data">{steps.map((st, i) => st.testData && <Text key={st.position}>{numbered(i, st.testData)}</Text>)}</Section>}
          {steps.length > 0 && <Section title="Expected result">{steps.map((st, i) => <Text key={st.position}>{numbered(i, st.expected)}</Text>)}</Section>}
          {s.testData && <Section title="Additional test data"><Text>{s.testData}</Text></Section>}

          {open && canExecute && browserRunsEnabled() && steps.length > 0 && <RunCaseInBrowser projectId={ctx.project.id} runCaseId={rc.id} />}

          {!open && <p role="status" className="rounded-md border p-3 text-sm text-muted-foreground">This run is {rc.runStatus.toLowerCase().replace("_", " ")}. Reopen it to change results.</p>}
          {open && !canExecute && <p role="status" className="rounded-md border p-3 text-sm text-muted-foreground">Your role is read-only; you cannot change results.</p>}

          <Section title={`Comments (${rc.comments.length})`}>
            <CommentList
              projectId={ctx.project.id}
              targetId={rc.id}
              threads={toThreads(rc.comments, ctx.user.id)}
              canEdit={canExecute}
              userName={ctx.user.name}
              members={await mentionableMembers(ctx)}
              onAdd={addCommentAction}
              onUpdate={updateCommentAction}
              onDelete={deleteCommentAction}
            />
          </Section>
        </div>

        <aside className="h-fit space-y-8">
          <div className="space-y-3">
            <h3 className="text-sm text-muted-foreground">Properties</h3>
            <dl className="space-y-3">
              <Meta name="Status"><ResultStatusSelect projectId={ctx.project.id} runCaseId={rc.id} current={rc.status} editable={open && canExecute} /></Meta>
              <Meta name="Priority"><Badge variant="secondary" className={PRIORITY_TONE[s.priority]}>{label(s.priority)}</Badge></Meta>
              <Meta name="Type">{s.type && label(s.type)}</Meta>
              <Meta name="Run">{rc.runName}</Meta>
              <Meta name="Case">{rc.index} of {rc.total}</Meta>
            </dl>
          </div>
        </aside>
      </div>
    </>
  );
}
