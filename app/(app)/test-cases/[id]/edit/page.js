import { notFound } from "next/navigation";
import { z } from "zod";
import { projectCtxById } from "@/lib/server/page";
import { getCase, getCaseProjectId } from "@/lib/server/services/testcases";
import { listMembers } from "@/lib/server/services/projects";
import { PageHeader } from "@/components/page-header";
import { CaseForm } from "../../case-form";

export default async function EditTestCasePage({ params }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const projectId = await getCaseProjectId(id);
  if (!projectId) notFound();
  const ctx = await projectCtxById(projectId, "testcase.write");
  const [tc, members] = await Promise.all([getCase(ctx, id).catch(() => null), listMembers(projectId)]);
  if (!tc || tc.archivedAt) notFound();
  return (
    <>
      <PageHeader title={`Edit ${tc.code}`} description={`Currently version ${tc.currentVersion}. Saving changes creates version ${tc.currentVersion + 1}.`} />
      <CaseForm
        projectId={projectId}
        caseId={id}
        initial={tc}
        members={members.filter((m) => m.active || m.user_id === tc.assigneeId).map((m) => ({ id: m.user_id, name: m.name }))}
      />
    </>
  );
}
