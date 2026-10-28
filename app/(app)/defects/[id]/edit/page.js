import { notFound } from "next/navigation";
import { z } from "zod";
import { projectCtxById } from "@/lib/server/page";
import { assigneeOptions, getDefect, getDefectProjectId } from "@/lib/server/services/defects";
import { PageHeader } from "@/components/page-header";
import { DefectForm } from "../../defect-form";

export default async function EditDefectPage({ params }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const projectId = await getDefectProjectId(id);
  if (!projectId) notFound();
  const ctx = await projectCtxById(projectId, "defect.write");
  const d = await getDefect(ctx, id).catch(() => null);
  if (!d) notFound();
  return (
    <>
      <PageHeader title={`Edit ${d.code}`} />
      <DefectForm
        projectId={projectId}
        defectId={id}
        assignees={await assigneeOptions(ctx)}
        initial={{
          title: d.title, description: d.description ?? "", stepsToReproduce: d.steps_to_reproduce ?? "",
          expectedResult: d.expected_result ?? "", actualResult: d.actual_result ?? "", severity: d.severity, priority: d.priority,
          environment: d.environment ?? "", buildVersion: d.build_version ?? "", externalUrl: d.external_url ?? "", assigneeId: d.assignee_id ?? "",
        }}
      />
    </>
  );
}
