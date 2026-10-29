import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Pencil, PlayCircle } from "lucide-react";
import { projectCtxById } from "@/lib/server/page";
import { getSuite, getSuiteProjectId } from "@/lib/server/services/suites";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { label } from "../../test-cases/labels";
import { SuiteActions } from "./suite-actions";
import { SuiteCases } from "./suite-cases";
import { RunSuiteInBrowser } from "./run-suite-in-browser";
import { browserRunsEnabled } from "@/lib/server/automation/config";

export default async function SuiteDetailPage({ params }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const projectId = await getSuiteProjectId(id);
  if (!projectId) notFound();
  const ctx = await projectCtxById(projectId, "project.read");
  const suite = await getSuite(ctx, id).catch(() => null);
  if (!suite) notFound();
  const archived = Boolean(suite.archived_at);
  const canWrite = can(ctx.role, "suite.write");
  const canRun = can(ctx.role, "run.manage");
  const canRunBrowser = can(ctx.role, "testcase.write") && browserRunsEnabled() && !archived;

  return (
    <>
      <PageHeader
        title={suite.name}
        description={[suite.parent_name && `Inside ${suite.parent_name}`, suite.feature, suite.type && label(suite.type), `created by ${suite.created_by_name}`].filter(Boolean).join(" · ")}
        actions={
          <>
            {canRunBrowser && <RunSuiteInBrowser projectId={projectId} caseIds={suite.cases.map((c) => c.id)} />}
            {canRun && !archived && <Link href={`/test-runs/new?suite=${id}`} className={buttonVariants({ size: "sm" })}><PlayCircle /> Create run</Link>}
            {canWrite && !archived && <Link href={`/test-suites/${id}/edit`} className={buttonVariants({ variant: "outline", size: "sm" })}><Pencil /> Edit</Link>}
            {canWrite && <SuiteActions projectId={projectId} suiteId={id} archived={archived} caseCount={suite.cases.length} canDelete={can(ctx.role, "testcase.write")} />}
          </>
        }
      />
      {archived && <p className="mb-4 rounded-md border bg-muted px-3 py-2 text-sm">This suite is archived. Restore it to change it or use it in new runs.</p>}
      {suite.description && <p className="mb-4 whitespace-pre-wrap text-sm">{suite.description}</p>}
      {suite.tags.length > 0 && <div className="mb-4 flex flex-wrap gap-1">{suite.tags.map((t) => <Badge key={t} variant="outline">{t}</Badge>)}</div>}

      {suite.children.length > 0 && (
        <Card className="mb-6">
          <CardHeader><CardTitle>Nested suites</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {suite.children.map((c) => (
                <li key={c.id}><Link className="hover:underline" href={`/test-suites/${c.id}`}>{c.name}</Link>{c.archived_at && <span className="ml-2 text-xs text-muted-foreground">archived</span>}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Test cases ({suite.cases.length})</CardTitle></CardHeader>
        <CardContent>
          <SuiteCases
            projectId={projectId}
            suiteId={id}
            editable={canWrite && !archived}
            canSetStatus={can(ctx.role, "testcase.write") && !archived}
            canCreate={can(ctx.role, "testcase.write")}
            cases={suite.cases.map((c) => ({ id: c.id, code: c.code, title: c.title, priority: c.priority, status: c.status }))}
          />
        </CardContent>
      </Card>
    </>
  );
}
