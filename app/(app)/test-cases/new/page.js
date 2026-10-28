import { notFound } from "next/navigation";
import { activeProjectCtx } from "@/lib/server/page";
import { listMembers } from "@/lib/server/services/projects";
import { PageHeader } from "@/components/page-header";
import { CaseForm } from "../case-form";

export default async function NewTestCasePage() {
  const ctx = await activeProjectCtx("testcase.write");
  if (!ctx) notFound();
  const members = await listMembers(ctx.project.id);
  return (
    <>
      <PageHeader title="New test case" description={`Project ${ctx.project.key}`} />
      <CaseForm projectId={ctx.project.id} members={members.filter((m) => m.active).map((m) => ({ id: m.user_id, name: m.name }))} />
    </>
  );
}
