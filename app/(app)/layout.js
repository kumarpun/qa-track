import { requireUserPage, listAccessibleProjects, getActiveProject } from "@/lib/server/dal";
import { AppShell } from "@/components/layout/app-shell";

export default async function AppLayout({ children }) {
  const user = await requireUserPage();
  const [projects, active] = await Promise.all([listAccessibleProjects(user), getActiveProject(user)]);
  return (
    <AppShell user={user} projects={projects} activeProjectId={active?.id ?? null}>
      {children}
    </AppShell>
  );
}
