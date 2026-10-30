import { notFound } from "next/navigation";
import { z } from "zod";
import { projectCtxById } from "@/lib/server/page";
import { getCase, getCaseProjectId, listCaseOptions } from "@/lib/server/services/testcases";
import { listMembers } from "@/lib/server/services/projects";
import { CaseForm } from "../../case-form";

export default async function EditTestCasePage({ params }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const projectId = await getCaseProjectId(id);
  if (!projectId) notFound();
  const ctx = await projectCtxById(projectId, "testcase.write");
  const [tc, members, linkable] = await Promise.all([getCase(ctx, id).catch(() => null), listMembers(projectId), listCaseOptions(ctx)]);
  if (!tc) notFound();
  return (
    <>
      <CaseForm
        projectId={projectId}
        caseId={id}
        initial={tc}
        linkable={linkable}
        members={members.filter((m) => m.active || m.user_id === tc.assigneeId).map((m) => ({ id: m.user_id, name: m.name }))}
      />
    </>
  );
}
