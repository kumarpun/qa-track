import { activeProjectCtx } from "@/lib/server/page";
import { listSuites } from "@/lib/server/services/suites";
import { PageHeader } from "@/components/page-header";
import { SuiteForm } from "../suite-form";

export default async function NewSuitePage({ searchParams }) {
  const ctx = await activeProjectCtx("suite.write");
  if (!ctx) return null;
  const sp = await searchParams;
  const parents = await listSuites(ctx);
  const parent = typeof sp.parent === "string" && parents.some((p) => p.id === sp.parent) ? sp.parent : "";
  return (
    <>
      <PageHeader title="New test suite" />
      <SuiteForm projectId={ctx.project.id} parents={parents.map((p) => ({ id: p.id, name: p.name }))} defaultParentId={parent} />
    </>
  );
}
