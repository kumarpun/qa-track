import "server-only";
import { query, queryOne } from "../db";

export const AUDIT_PAGE_SIZE = 50;

/**
 * Read audit entries. `projectId` scopes to one project (QA Lead); null means all entries (Admin),
 * including project-less events such as sign-ins. Metadata is returned as parsed JSON and must be
 * rendered as text only.
 */
export async function listAuditLogs({ projectId, action, entityType, userId, from, to, page }) {
  const where = ["1=1"];
  const params = [];
  if (projectId) { where.push("a.project_id = ?"); params.push(projectId); }
  if (action) { where.push("a.action LIKE ?"); params.push(`${action.replace(/[\\%_]/g, (c) => `\\${c}`)}%`); }
  if (entityType) { where.push("a.entity_type = ?"); params.push(entityType); }
  if (userId) { where.push("a.user_id = ?"); params.push(userId); }
  if (from) { where.push("a.created_at >= ?"); params.push(new Date(`${from}T00:00:00Z`)); }
  if (to) { where.push("a.created_at < ?"); params.push(new Date(new Date(`${to}T00:00:00Z`).getTime() + 86400000)); }
  const w = where.join(" AND ");
  const { n } = await queryOne(`SELECT COUNT(*) AS n FROM audit_logs a WHERE ${w}`, params);
  const rows = await query(
    `SELECT a.id, a.action, a.entity_type, a.entity_id, a.metadata, a.created_at, a.project_id,
            u.name AS user_name, u.email AS user_email
     FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
     WHERE ${w} ORDER BY a.created_at DESC, a.id LIMIT ? OFFSET ?`,
    [...params, AUDIT_PAGE_SIZE, (page - 1) * AUDIT_PAGE_SIZE],
  );
  const entityTypes = await query(
    `SELECT DISTINCT entity_type FROM audit_logs ${projectId ? "WHERE project_id = ?" : ""} ORDER BY entity_type`,
    projectId ? [projectId] : [],
  );
  return {
    rows: rows.map((r) => ({
      ...r,
      metadata: typeof r.metadata === "string" ? safeParse(r.metadata) : r.metadata,
    })),
    total: Number(n),
    page,
    pageCount: Math.max(1, Math.ceil(Number(n) / AUDIT_PAGE_SIZE)),
    entityTypes: entityTypes.map((e) => e.entity_type),
  };
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}
