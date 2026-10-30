import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Pencil } from "lucide-react";
import { projectCtxById } from "@/lib/server/page";
import { LocalTime } from "@/components/local-time";
import { getCase, getCaseProjectId, listCaseOptions, listAutoRuns, listCaseComments, listCaseResults } from "@/lib/server/services/testcases";
import { listSuites, suitesForCase } from "@/lib/server/services/suites";
import { can } from "@/lib/permissions";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { label, CASE_STATUS_LABELS, PRIORITY_TONE } from "../labels";
import { CaseActions } from "./case-actions";
import { LinkedText } from "../linked-text";
import { SampleFormat } from "../sample-format";
import { StatusSelect } from "./status-select";
import { SuitePicker } from "./suite-picker";
import { StatusBadge } from "@/components/status-badge";
import { browserRunsEnabled } from "@/lib/server/automation/config";
import { RunInBrowser } from "./run-in-browser";
import { ResultHistory } from "./result-history";
import { AutoRunCard } from "./auto-run-card";
import { mentionableMembers } from "@/lib/server/services/notifications";
import { CommentList } from "@/components/comments/comment-list";
import { toThreads } from "@/components/comments/format";
import { addCaseCommentAction, updateCaseCommentAction, deleteCaseCommentAction } from "@/app/actions/testcases";


function Meta({ name, children }) {
  return (
    <div className="flex items-baseline gap-3">
      <dt className="w-24 shrink-0 text-sm text-muted-foreground">{name}</dt>
      <dd className="min-w-0 flex-1 text-sm">{children || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );
}

const Text = ({ children }) => (children ? <p className="whitespace-pre-wrap text-sm leading-relaxed">{children}</p> : null);

function Section({ title, children }) {
  return (
    <section className="space-y-1.5">
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/** One block per step; several steps (e.g. CSV import) get a "n." prefix so the order stays clear. */
const numbered = (steps, i, text) => (steps.length > 1 ? `${i + 1}. ${text}` : text);

export default async function TestCaseDetailPage({ params }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const projectId = await getCaseProjectId(id);
  if (!projectId) notFound();
  const ctx = await projectCtxById(projectId, "project.read");
  const tc = await getCase(ctx, id).catch(() => null);
  if (!tc) notFound();
  const [results, autoRuns, comments, linkable] = await Promise.all([listCaseResults(ctx, id), listAutoRuns(ctx, id), listCaseComments(ctx, id), listCaseOptions(ctx)]);
  const canWrite = can(ctx.role, "testcase.write");
  const canRunBrowser = canWrite && browserRunsEnabled();
  const canSuite = can(ctx.role, "suite.write");
  const [caseSuites, allSuites] = await Promise.all([suitesForCase(ctx, id), canSuite ? listSuites(ctx) : []]);

  const steps = tc.steps;
  const withData = steps.map((s, i) => ({ i, text: s.testData })).filter((s) => s.text);

  return (
    <>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight">{tc.title}</h1>
            </div>
            {canWrite && (
              <div className="flex items-center gap-2">
                {canRunBrowser && <RunInBrowser projectId={projectId} caseId={id} />}
                <Link href={`/test-cases/${id}/edit`} className={buttonVariants({ variant: "outline", size: "sm" })}><Pencil /> Edit</Link>
                <CaseActions projectId={projectId} caseId={id} />
              </div>
            )}
          </div>

          <SampleFormat />
          {tc.preconditions && <Section title="Preconditions"><Text>{tc.preconditions}</Text></Section>}
          <Section title="Test steps">
            <div className="space-y-1.5">
              {steps.map((s, i) => <div key={i} data-testid="step"><LinkedText cases={linkable}>{numbered(steps, i, s.action)}</LinkedText></div>)}
            </div>
          </Section>
          {withData.length > 0 && (
            <Section title="Test data">
              {withData.map((s) => <Text key={s.i}>{numbered(steps, s.i, s.text)}</Text>)}
            </Section>
          )}
          <Section title="Expected result">
            {steps.map((s, i) => <Text key={i}>{numbered(steps, i, s.expected)}</Text>)}
          </Section>
          {tc.testData && <Section title="Additional test data"><Text>{tc.testData}</Text></Section>}

          {autoRuns.length > 0 && (
            <Section title="Browser runs">
              <ul className="space-y-4" data-testid="auto-runs">
                {autoRuns.slice(0, 1).map((r) => ( // newest first; older runs stay in Result history
                  <AutoRunCard
                    key={r.id}
                    header={
                      <>
                        <StatusBadge status={r.status} label={CASE_STATUS_LABELS[r.status]} />
                        <span className="text-muted-foreground"><LocalTime value={r.started_at} /></span>
                        <span className="ml-auto text-muted-foreground">{r.triggered_by_name}</span>
                      </>
                    }
                  >
                    <ol className="space-y-1">
                      {r.log.map((l) => (
                        <li key={l.n} className="flex gap-2">
                          <span className={l.ok ? "text-emerald-600" : "text-red-600"} aria-label={l.ok ? "passed" : "failed"}>{l.ok ? "✓" : "✗"}</span>
                          <span className="min-w-0 flex-1"><span>{l.line}</span><span className="block break-all text-xs text-muted-foreground">{l.detail}</span></span>
                        </li>
                      ))}
                    </ol>
                    {r.has_screenshot && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/auto-runs/${r.id}/screenshot`} alt="Screenshot at the failed step" className="max-h-80 rounded border" />
                    )}
                  </AutoRunCard>
                ))}
              </ul>
            </Section>
          )}

          <ResultHistory
              projectId={projectId}
              caseId={id}
              authorName={tc.authorName}
              createdAt={tc.createdAt}
              canDelete={canWrite}
              rows={results.map((r) => ({ id: r.id, status: r.status, runId: r.run_id, runCaseId: r.run_case_id, runCode: r.run_code, runName: r.run_name, autoRun: !!r.auto_run_id, by: r.executed_by_name, at: r.executed_at }))}
          />

          <Section title={`Comments (${comments.length})`}>
            <CommentList
              projectId={projectId}
              targetId={id}
              threads={toThreads(comments, ctx.user.id)}
              canEdit={canWrite}
              userName={ctx.user.name}
              members={await mentionableMembers(ctx)}
              onAdd={addCaseCommentAction}
              onUpdate={updateCaseCommentAction}
              onDelete={deleteCaseCommentAction}
            />
          </Section>
        </div>

        <aside className="h-fit space-y-8">
          <div className="space-y-3">
            <h3 className="text-sm text-muted-foreground">Properties</h3>
            <dl className="space-y-3">
              <Meta name="Status">{canWrite ? <StatusSelect projectId={projectId} caseId={id} status={tc.status} /> : <StatusBadge status={tc.status} label={CASE_STATUS_LABELS[tc.status]} />}</Meta>
              <Meta name="Priority"><Badge variant="secondary" className={PRIORITY_TONE[tc.priority]}>{label(tc.priority)}</Badge></Meta>
              <Meta name="Type">{label(tc.type)}</Meta>
              <Meta name="Automation">{label(tc.automation)}</Meta>
              <Meta name="Assignee">{tc.assigneeName}</Meta>
              <Meta name="Component">{tc.component}</Meta>
            </dl>
          </div>
          <div className="space-y-3">
            <h3 className="text-sm text-muted-foreground">Test suites</h3>
            {canSuite
              ? <SuitePicker projectId={projectId} caseId={id} suites={allSuites.map((s) => ({ id: s.id, name: s.name }))} memberOf={caseSuites.map((s) => s.id)} />
              : caseSuites.length ? <div className="flex flex-wrap gap-1">{caseSuites.map((s) => <Badge key={s.id} variant="outline">{s.name}</Badge>)}</div> : <p className="text-sm text-muted-foreground">None</p>}
          </div>
          <div className="space-y-3">
            <h3 className="text-sm text-muted-foreground">Labels</h3>
            {tc.tags.length ? <div className="flex flex-wrap gap-1">{tc.tags.map((t) => <Badge key={t} variant="outline">{t}</Badge>)}</div> : <p className="text-sm text-muted-foreground">None</p>}
          </div>
          <div className="space-y-3">
            <h3 className="text-sm text-muted-foreground">Links</h3>
            <dl className="space-y-3">
              <Meta name="Requirement">{tc.requirementUrl && <a className="break-all text-primary underline" href={tc.requirementUrl} target="_blank" rel="noopener noreferrer">{tc.requirementUrl}</a>}</Meta>
              <Meta name="Defects">
                {tc.defectUrls.length ? tc.defectUrls.map((u) => <a key={u} className="block break-all text-primary underline" href={u} target="_blank" rel="noopener noreferrer">{u}</a>) : null}
              </Meta>
            </dl>
          </div>
          <div className="space-y-3">
            <h3 className="text-sm text-muted-foreground">Activity</h3>
            <dl className="space-y-3">
              <Meta name="Created"><LocalTime value={tc.createdAt} /></Meta>
              <Meta name="Updated"><LocalTime value={tc.updatedAt} /></Meta>
            </dl>
          </div>
        </aside>
      </div>
    </>
  );
}
