import { activeProjectCtx } from "@/lib/server/page";
import { assigneeOptions } from "@/lib/server/services/defects";
import { PageHeader } from "@/components/page-header";
import { DefectForm } from "../defect-form";

export default async function NewDefectPage() {
  const ctx = await activeProjectCtx("defect.write");
  if (!ctx) return null;
  return (
    <>
      <PageHeader title="New defect" />
      <DefectForm projectId={ctx.project.id} assignees={await assigneeOptions(ctx)} />
    </>
  );
}
