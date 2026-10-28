import "server-only";
import { query, queryOne, uuid, withTx } from "../db";
import { audit } from "../audit";
import { AppError, forbidden, notFound } from "../errors";
import { canCreateProject } from "@/lib/permissions";

export async function listProjects(user) {
  const scope = user.role === "ADMIN" ? "" : "JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = ?";
  return query(
    `SELECT p.id, p.\`key\`, p.name, p.description, p.status, p.created_at,
            u.name AS owner_name,
            (SELECT COUNT(*) FROM project_members WHERE project_id = p.id) AS member_count,
            (SELECT COUNT(*) FROM test_cases WHERE project_id = p.id AND archived_at IS NULL) AS case_count,
            (SELECT COUNT(*) FROM test_suites WHERE project_id = p.id AND archived_at IS NULL) AS suite_count,
            (SELECT COUNT(*) FROM test_runs WHERE project_id = p.id) AS run_count
     FROM projects p JOIN users u ON u.id = p.owner_id ${scope}
     ORDER BY p.status, p.name`,
    user.role === "ADMIN" ? [] : [user.id],
  );
}

export async function createProject(user, input) {
  if (!canCreateProject(user.role)) throw forbidden("Only Admins and QA Leads can create projects");
  return withTx(async (conn) => {
    const id = uuid();
    try {
      await query(
        "INSERT INTO projects (id, `key`, name, description, owner_id) VALUES (?,?,?,?,?)",
        [id, input.key, input.name, input.description || null, user.id],
        conn,
      );
    } catch (e) {
      if (e.code === "ER_DUP_ENTRY")
        throw new AppError("Project key already in use", { fieldErrors: { key: "Already in use" } });
      throw e;
    }
    // Owner is always a member (as QA Lead) so access rules stay uniform.
    await query(
      "INSERT INTO project_members (id, project_id, user_id, role) VALUES (?,?,?,'QA_LEAD')",
      [uuid(), id, user.id],
      conn,
    );
    await audit({ userId: user.id, projectId: id, action: "project.created", entityType: "project", entityId: id, metadata: { key: input.key } }, conn);
    return { id };
  });
}

export async function updateProject(user, project, input) {
  const owner = await queryOne("SELECT id, active FROM users WHERE id = ?", [input.ownerId]);
  if (!owner?.active) throw new AppError("Owner not found", { fieldErrors: { ownerId: "Invalid user" } });
  await withTx(async (conn) => {
    await query(
      "UPDATE projects SET name=?, description=?, status=?, owner_id=? WHERE id=?",
      [input.name, input.description || null, input.status, input.ownerId, project.id],
      conn,
    );
    // Ensure new owner is a member with lead rights.
    await query(
      `INSERT INTO project_members (id, project_id, user_id, role) VALUES (?,?,?,'QA_LEAD')
       ON DUPLICATE KEY UPDATE role='QA_LEAD'`,
      [uuid(), project.id, input.ownerId],
      conn,
    );
    await audit({ userId: user.id, projectId: project.id, action: "project.updated", entityType: "project", entityId: project.id, metadata: input }, conn);
  });
}

export async function listMembers(projectId) {
  return query(
    `SELECT m.user_id, m.role, u.name, u.email, u.active, (p.owner_id = m.user_id) AS is_owner
     FROM project_members m JOIN users u ON u.id = m.user_id JOIN projects p ON p.id = m.project_id
     WHERE m.project_id = ? ORDER BY is_owner DESC, u.name`,
    [projectId],
  );
}

export async function upsertMember(user, project, { userId, role }) {
  const target = await queryOne("SELECT id, active FROM users WHERE id = ?", [userId]);
  if (!target?.active) throw notFound("User not found");
  if (project.owner_id === userId) throw new AppError("The project owner is always a QA Lead");
  await query(
    `INSERT INTO project_members (id, project_id, user_id, role) VALUES (?,?,?,?)
     ON DUPLICATE KEY UPDATE role = VALUES(role)`,
    [uuid(), project.id, userId, role],
  );
  await audit({ userId: user.id, projectId: project.id, action: "project.member_set", entityType: "project", entityId: project.id, metadata: { userId, role } });
}

export async function removeMember(user, project, userId) {
  if (project.owner_id === userId) throw new AppError("Cannot remove the project owner");
  await query("DELETE FROM project_members WHERE project_id = ? AND user_id = ?", [project.id, userId]);
  await audit({ userId: user.id, projectId: project.id, action: "project.member_removed", entityType: "project", entityId: project.id, metadata: { userId } });
}
