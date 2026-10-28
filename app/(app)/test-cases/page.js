import Link from "next/link";
import { FileCheck2, Plus, Upload, Download } from "lucide-react";
import { activeProjectCtx } from "@/lib/server/page";
import { listCases } from "@/lib/server/services/testcases";
import { listMembers } from "@/lib/server/services/projects";
import { listParamsSchema } from "@/lib/validation/testcase";
import { can } from "@/lib/permissions";
import { PageHeader, EmptyState } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Filters } from "./filters";
import { CaseList } from "./case-list";

export default async function TestCasesPage({ searchParams }) {
  const ctx = await activeProjectCtx();
  if (!ctx) return <><PageHeader title="Test Cases" /><EmptyState icon={FileCheck2} title="No project selected" description="Create or join a project first." /></>;
  const sp = await searchParams;
  const parsed = listParamsSchema.safeParse(Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])));
  const params = parsed.success ? parsed.data : listParamsSchema.parse({});
  const canWrite = can(ctx.role, "testcase.write");
  const [result, members] = await Promise.all([listCases(ctx, params), listMembers(ctx.project.id)]);
  const exportQs = new URLSearchParams({ project: ctx.project.id });
  for (const [k, v] of Object.entries(params)) if (v && !["page", "sort", "dir"].includes(k)) exportQs.set(k, String(v));
  const filtered = Boolean(params.q || params.priority || params.type || params.automation || params.assignee || params.tag || params.status !== "active");

  return (
    <>
      <PageHeader
        title="Test Cases"
        description={`${result.total} ${result.total === 1 ? "case" : "cases"} in ${ctx.project.key}`}
        actions={
          <>
            <a href={`/test-cases/export?${exportQs}`} className={buttonVariants({ variant: "outline", size: "sm" })}><Download /> Export CSV</a>
            {canWrite && <Link href="/test-cases/import" className={buttonVariants({ variant: "outline", size: "sm" })}><Upload /> Import</Link>}
            {canWrite && <Link href="/test-cases/new" className={buttonVariants({ size: "sm" })}><Plus /> New test case</Link>}
          </>
        }
      />
      <Filters params={params} members={members.map((m) => ({ id: m.user_id, name: m.name }))} />
      {result.total === 0 ? (
        <EmptyState
          icon={FileCheck2}
          title={filtered ? "No test cases match your filters" : "No test cases yet"}
          description={filtered ? "Try clearing a filter or search term." : canWrite ? "Create your first test case or import a CSV." : "Nothing has been added to this project yet."}
          action={!filtered && canWrite ? <Link href="/test-cases/new" className={buttonVariants({ size: "sm" })}><Plus /> New test case</Link> : null}
        />
      ) : (
        <CaseList
          projectId={ctx.project.id}
          rows={result.rows.map((r) => ({ ...r, archived_at: r.archived_at ? 1 : 0, updated_at: new Date(r.updated_at).toISOString() }))}
          page={result.page}
          pages={result.pages}
          total={result.total}
          params={params}
          canWrite={canWrite}
          members={members.map((m) => ({ id: m.user_id, name: m.name }))}
        />
      )}
    </>
  );
}
