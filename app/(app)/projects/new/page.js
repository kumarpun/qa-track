import { notFound } from "next/navigation";
import { requireUserPage } from "@/lib/server/dal";
import { canCreateProject } from "@/lib/permissions";
import { PageHeader } from "@/components/page-header";
import { NewProjectForm } from "./new-project-form";

export default async function NewProjectPage() {
  const user = await requireUserPage();
  if (!canCreateProject(user.role)) notFound();
  return (
    <>
      <PageHeader title="New project" />
      <NewProjectForm />
    </>
  );
}
