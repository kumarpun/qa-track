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
  const u = await queryOne("SELECT id, email, name, role, active FROM users WHERE id = ?", [id]);
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
  const project = await queryOne("SELECT * FROM projects WHERE id = ?", [projectId]);
  if (!project) throw notFound("Project not found");
  const membership = await queryOne(
    "SELECT role FROM project_members WHERE project_id = ? AND user_id = ?",
    [projectId, user.id],
  );
  const role = effectiveProjectRole(user.role, membership?.role);
  if (!role) throw notFound("Project not found");
  if (!can(role, action)) throw forbidden();
  if (project.status === "ARCHIVED" && action !== "project.read" && action !== "report.read" && action !== "project.manage")
    throw new AppError("Project is archived", { code: "ARCHIVED", status: 409 });
  return { user, project, role };
}

/** Projects the user may access (admins: all). */
export const listAccessibleProjects = cache(async (user) => {
  if (user.role === "ADMIN") {
    return query("SELECT id, `key`, name, status FROM projects ORDER BY status, name");
  }
  return query(
    `SELECT p.id, p.\`key\`, p.name, p.status FROM projects p
     JOIN project_members m ON m.project_id = p.id AND m.user_id = ?
     ORDER BY p.status, p.name`,
    [user.id],
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
