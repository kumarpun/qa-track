import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Pencil } from "lucide-react";
import { projectCtxById } from "@/lib/server/page";
import { getCase, getCaseProjectId, listVersions } from "@/lib/server/services/testcases";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { label, PRIORITY_TONE } from "../labels";
import { CaseActions } from "./case-actions";
import { VersionHistory } from "./version-history";

const fmt = (d) => new Date(d).toISOString().replace("T", " ").slice(0, 16) + " UTC";

function Meta({ name, children }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{name}</dt>
      <dd className="mt-0.5 text-sm">{children || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );
}

const Text = ({ children }) => (children ? <p className="whitespace-pre-wrap text-sm">{children}</p> : null);

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

  return (
    <>
      <PageHeader
        title={`${tc.code} · ${tc.title}`}
        description={`Version ${tc.currentVersion} · created by ${tc.authorName}`}
        actions={
          canWrite && (
            <>
              {!tc.archivedAt && <Link href={`/test-cases/${id}/edit`} className={buttonVariants({ variant: "outline", size: "sm" })}><Pencil /> Edit</Link>}
              <CaseActions projectId={projectId} caseId={id} archived={Boolean(tc.archivedAt)} />
            </>
          )
        }
      />
      {tc.archivedAt && <p className="mb-4 rounded-md border bg-muted px-3 py-2 text-sm">This test case is archived. Restore it to edit or add it to new runs.</p>}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {tc.preconditions && <div><h4 className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Preconditions</h4><Text>{tc.preconditions}</Text></div>}
              {tc.testData && <div><h4 className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Test data</h4><Text>{tc.testData}</Text></div>}
              {!tc.preconditions && !tc.testData && <p className="text-sm text-muted-foreground">No preconditions or test data.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Steps</CardTitle></CardHeader>
            <CardContent>
              <ol className="space-y-3">
                {tc.steps.map((s, i) => (
                  <li key={i} className="rounded-lg border p-3" data-testid="step">
                    <div className="mb-1 text-xs font-medium text-muted-foreground">Step {i + 1}</div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div><div className="text-xs text-muted-foreground">Action</div><Text>{s.action}</Text></div>
                      <div><div className="text-xs text-muted-foreground">Test data</div><Text>{s.testData || "—"}</Text></div>
                      <div><div className="text-xs text-muted-foreground">Expected</div><Text>{s.expected}</Text></div>
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Version history</CardTitle></CardHeader>
            <CardContent>
              <VersionHistory
                projectId={projectId}
                caseId={id}
                current={tc.currentVersion}
                canRestore={canWrite && !tc.archivedAt}
                versions={versions.map((v) => ({ ...v, createdAt: fmt(v.createdAt) }))}
              />
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardContent className="pt-6">
            <dl className="space-y-4">
              <Meta name="Priority"><Badge variant="secondary" className={PRIORITY_TONE[tc.priority]}>{label(tc.priority)}</Badge></Meta>
              <Meta name="Type">{label(tc.type)}</Meta>
              <Meta name="Automation">{label(tc.automation)}</Meta>
              <Meta name="Component">{tc.component}</Meta>
              <Meta name="Assignee">{tc.assigneeName}</Meta>
              <Meta name="Tags">{tc.tags.length ? <span className="flex flex-wrap gap-1">{tc.tags.map((t) => <Badge key={t} variant="outline">{t}</Badge>)}</span> : null}</Meta>
              <Meta name="Requirement">{tc.requirementUrl && <a className="break-all text-primary underline" href={tc.requirementUrl} target="_blank" rel="noopener noreferrer">{tc.requirementUrl}</a>}</Meta>
              <Meta name="Related defects">
                {tc.defectUrls.length ? tc.defectUrls.map((u) => <a key={u} className="block break-all text-primary underline" href={u} target="_blank" rel="noopener noreferrer">{u}</a>) : null}
              </Meta>
              <Meta name="Created">{fmt(tc.createdAt)}</Meta>
              <Meta name="Updated">{fmt(tc.updatedAt)}</Meta>
            </dl>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
