import "server-only";
import { query, uuid } from "./db";

/** Record an important action. Pass `conn` to join a transaction. Never throws into the caller's flow. */
export async function audit({ userId, projectId = null, action, entityType, entityId = null, metadata = null }, conn) {
  try {
    await query(
      "INSERT INTO audit_logs (id, user_id, project_id, action, entity_type, entity_id, metadata) VALUES (?,?,?,?,?,?,?)",
      [uuid(), userId ?? null, projectId, action, entityType, entityId, metadata ? JSON.stringify(metadata) : null],
      conn,
    );
  } catch (e) {
    console.error("audit log failed", action, e.message);
  }
}
