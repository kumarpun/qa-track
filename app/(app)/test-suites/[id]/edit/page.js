import { notFound } from "next/navigation";
import { z } from "zod";
import { projectCtxById } from "@/lib/server/page";
import { getSuiteProjectId, getSuite, listSuites } from "@/lib/server/services/suites";
import { PageHeader } from "@/components/page-header";
import { SuiteForm } from "../../suite-form";

export default async function EditSuitePage({ params }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const projectId = await getSuiteProjectId(id);
  if (!projectId) notFound();
  const ctx = await projectCtxById(projectId, "suite.write");
  const suite = await getSuite(ctx, id).catch(() => null);
  if (!suite) notFound();

  // A suite may not be nested under itself or any of its descendants.
  const all = await listSuites(ctx);
  const banned = new Set([id]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const s of all) if (s.parent_id && banned.has(s.parent_id) && !banned.has(s.id)) { banned.add(s.id); grew = true; }
  }
  const parents = all.filter((s) => !banned.has(s.id)).map((s) => ({ id: s.id, name: s.name }));

  return (
    <>
      <PageHeader title={`Edit ${suite.name}`} />
      <SuiteForm
        projectId={projectId}
        suiteId={id}
        parents={parents}
        initial={{ name: suite.name, description: suite.description, feature: suite.feature, type: suite.type, tags: suite.tags, parentId: suite.parent_id }}
      />
    </>
  );
}
