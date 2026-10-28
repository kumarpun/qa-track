import { notFound } from "next/navigation";
import { requireUserPage, requireProject } from "@/lib/server/dal";
import { listMembers } from "@/lib/server/services/projects";
import { listActiveUsers } from "@/lib/server/services/users";
import { can } from "@/lib/permissions";
import { AppError } from "@/lib/server/errors";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { ProjectSettings } from "./project-settings";
import { Members } from "./members";

export default async function ProjectPage({ params }) {
  const { id } = await params;
  const user = await requireUserPage();
  let ctx;
  try {
    ctx = await requireProject(id);
  } catch (e) {
    if (e instanceof AppError || e?.status) notFound();
    throw e;
  }
  const { project, role } = ctx;
  const canManage = can(role, "project.manage");
  const [members, users] = await Promise.all([listMembers(project.id), canManage ? listActiveUsers() : []]);
  return (
    <>
      <PageHeader
        title={`${project.key} · ${project.name}`}
        description={project.description || "No description"}
        actions={<StatusBadge status={project.status} />}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <ProjectSettings
          canManage={canManage}
          project={{ id: project.id, name: project.name, description: project.description ?? "", status: project.status, ownerId: project.owner_id }}
          owners={users.map((u) => ({ id: u.id, name: u.name }))}
        />
        <Members
          projectId={project.id}
          canManage={canManage}
          members={members.map((m) => ({ userId: m.user_id, role: m.role, name: m.name, email: m.email, isOwner: !!m.is_owner, active: !!m.active }))}
          users={users.filter((u) => !members.some((m) => m.user_id === u.id)).map((u) => ({ id: u.id, name: u.name, email: u.email }))}
        />
      </div>
    </>
  );
}
