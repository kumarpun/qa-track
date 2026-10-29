import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Pencil } from "lucide-react";
import { projectCtxById } from "@/lib/server/page";
import { getCase, getCaseProjectId, listVersions } from "@/lib/server/services/testcases";
import { can } from "@/lib/permissions";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { label, PRIORITY_TONE } from "../labels";
import { CaseActions } from "./case-actions";
import { VersionHistory } from "./version-history";

const fmt = (d) => new Date(d).toISOString().replace("T", " ").slice(0, 16) + " UTC";

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
  const versions = await listVersions(ctx, id);
  const canWrite = can(ctx.role, "testcase.write");

  const steps = tc.steps;
  const withData = steps.map((s, i) => ({ i, text: s.testData })).filter((s) => s.text);

  return (
    <>
      {tc.archivedAt && <p className="mb-4 rounded-md border bg-muted px-3 py-2 text-sm">This test case is archived. Restore it to edit or add it to new runs.</p>}

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm text-muted-foreground">Version {tc.currentVersion} · created by {tc.authorName}</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight"><span className="text-muted-foreground">{tc.code} · </span>{tc.title}</h1>
            </div>
            {canWrite && (
              <div className="flex items-center gap-2">
                {!tc.archivedAt && <Link href={`/test-cases/${id}/edit`} className={buttonVariants({ variant: "outline", size: "sm" })}><Pencil /> Edit</Link>}
                <CaseActions projectId={projectId} caseId={id} archived={Boolean(tc.archivedAt)} />
              </div>
            )}
          </div>

          {tc.preconditions && <Section title="Preconditions"><Text>{tc.preconditions}</Text></Section>}
          <Section title="Test steps">
            <div className="space-y-1.5">
              {steps.map((s, i) => <div key={i} data-testid="step"><Text>{numbered(steps, i, s.action)}</Text></div>)}
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

          <Section title="Version history">
            <VersionHistory
              projectId={projectId}
              caseId={id}
              current={tc.currentVersion}
              canRestore={canWrite && !tc.archivedAt}
              versions={versions.map((v) => ({ ...v, createdAt: fmt(v.createdAt) }))}
            />
          </Section>
        </div>

        <aside className="h-fit space-y-8">
          <div className="space-y-3">
            <h3 className="text-sm text-muted-foreground">Properties</h3>
            <dl className="space-y-3">
              <Meta name="Priority"><Badge variant="secondary" className={PRIORITY_TONE[tc.priority]}>{label(tc.priority)}</Badge></Meta>
              <Meta name="Type">{label(tc.type)}</Meta>
              <Meta name="Automation">{label(tc.automation)}</Meta>
              <Meta name="Assignee">{tc.assigneeName}</Meta>
              <Meta name="Component">{tc.component}</Meta>
            </dl>
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
              <Meta name="Created">{fmt(tc.createdAt)}</Meta>
              <Meta name="Updated">{fmt(tc.updatedAt)}</Meta>
            </dl>
          </div>
        </aside>
      </div>
    </>
  );
}
