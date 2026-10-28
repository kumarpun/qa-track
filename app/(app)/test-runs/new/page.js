import { activeProjectCtx } from "@/lib/server/page";
import { runFormOptions, FORM_CASE_LIMIT } from "@/lib/server/services/runs";
import { PageHeader } from "@/components/page-header";
import { RunForm } from "../run-form";

export default async function NewRunPage({ searchParams }) {
  const ctx = await activeProjectCtx("run.manage");
  if (!ctx) return null;
  const sp = await searchParams;
  const options = await runFormOptions(ctx);
  const suite = typeof sp.suite === "string" && options.suites.some((s) => s.id === sp.suite) ? sp.suite : null;
  return (
    <>
      <PageHeader title="New test run" description="Case content is snapshotted at creation; later edits to test cases do not change this run." />
      <RunForm
        projectId={ctx.project.id}
        options={{
          suites: options.suites.map((s) => ({ id: s.id, name: s.name, caseCount: Number(s.case_count) })),
          cases: options.cases.map((c) => ({ id: c.id, code: c.code, title: c.title })),
          testers: options.testers.map((t) => ({ id: t.id, name: t.name })),
        }}
        caseLimit={FORM_CASE_LIMIT}
        defaultSuiteId={suite}
      />
    </>
  );
}
