import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { query, queryOne } from "./db";
import { readSessionUserId } from "./session";
import { AppError, forbidden, notFound, unauthorized } from "./errors";
import { can, effectiveProjectRole, hasRole } from "@/lib/permissions";

/** Current user from DB (so disabled users / role changes take effect immediately). */
export const getCurrentUser = cache(async () => {
  const id = await readSessionUserId();
  if (!id) return null;
  const u = await queryOne("SELECT id, org_id, email, name, role, active FROM users WHERE id = ?", [id]);
  return u && u.active ? u : null;
});

/** For pages: redirect to /login when signed out. */
export async function requireUserPage() {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

/** For server actions / services: throw instead of redirect. */
export async function requireUser() {
  const u = await getCurrentUser();
  if (!u) throw unauthorized();
  return u;
}

export async function requireGlobalRole(min) {
  const u = await requireUser();
  if (!hasRole(u.role, min)) throw forbidden();
  return u;
}

/**
 * Authorize access to a project. Returns { user, project, role }.
 * Non-members get 404 (not 403) to avoid leaking which projects exist.
 * Optional `action` enforces the permission matrix (e.g. "testcase.write").
 */
export async function requireProject(projectId, action = "project.read") {
  const user = await requireUser();
  const { member_role, ...project } = (await queryOne(
    `SELECT p.*, (SELECT m.role FROM project_members m WHERE m.project_id = p.id AND m.user_id = ?) AS member_role
     FROM projects p WHERE p.id = ?`,
    [user.id, projectId],
  )) ?? {};
  // Another organization's project is indistinguishable from a missing one, even for an ADMIN.
  if (!project.id || project.org_id !== user.org_id) throw notFound("Project not found");
  const role = effectiveProjectRole(user.role, member_role);
  if (!role) throw notFound("Project not found");
  if (!can(role, action)) throw forbidden();
  if (project.status === "ARCHIVED" && action !== "project.read" && action !== "report.read" && action !== "project.manage")
    throw new AppError("Project is archived", { code: "ARCHIVED", status: 409 });
  return { user, project, role };
}

/** Projects the user may access (admins: all in their organization). */
export const listAccessibleProjects = cache(async (user) => {
  if (user.role === "ADMIN") {
    return query("SELECT id, `key`, name, status FROM projects WHERE org_id = ? ORDER BY status, name", [user.org_id]);
  }
  return query(
    `SELECT p.id, p.\`key\`, p.name, p.status FROM projects p
     JOIN project_members m ON m.project_id = p.id AND m.user_id = ?
     WHERE p.org_id = ?
     ORDER BY p.status, p.name`,
    [user.id, user.org_id],
  );
});

const ACTIVE_COOKIE = "qa_project";

/** Active project from cookie, re-validated against accessible projects on every call. */
export const getActiveProject = cache(async (user) => {
  const projects = await listAccessibleProjects(user);
  const id = (await cookies()).get(ACTIVE_COOKIE)?.value;
  return projects.find((p) => p.id === id) ?? projects.find((p) => p.status === "ACTIVE") ?? projects[0] ?? null;
});

export { ACTIVE_COOKIE };
