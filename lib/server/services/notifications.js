import "server-only";
import { query, queryOne, uuid } from "../db";
import { mentionName, parseMentionIds, plainMentions } from "@/lib/mentions";

/**
 * Notify users @mentioned in a comment. Only active users who can open the project are notified, never the author,
 * and a user is notified once per comment (editing a comment only notifies newly added mentions).
 */
export async function notifyMentions(ctx, { commentId, body, href, label }) {
  const ids = parseMentionIds(body).filter((id) => id !== ctx.user.id);
  if (!ids.length) return;
  const users = await query(
    `SELECT u.id FROM users u
     WHERE u.active = 1 AND u.id IN (?)
       AND (u.role = 'ADMIN' OR u.id IN (SELECT user_id FROM project_members WHERE project_id = ?))`,
    [ids, ctx.project.id],
  );
  const snippet = plainMentions(body).replace(/!\[[^\]]*\]\([^)]*\)/g, "[image]").replace(/\s+/g, " ").trim().slice(0, 200);
  for (const u of users) {
    // The unique (comment, user) key makes a repeat a no-op.
    await query(
      `INSERT IGNORE INTO notifications (id, user_id, actor_id, project_id, comment_id, type, label, snippet, href)
       VALUES (?,?,?,?,?,'MENTION',?,?,?)`,
      [uuid(), u.id, ctx.user.id, ctx.project.id, commentId, label.slice(0, 255), snippet || "(no text)", href],
    );
  }
}

export async function listNotifications(user, limit = 20) {
  const [rows, { n }] = await Promise.all([query(
    `SELECT n.id, n.label, n.snippet, n.href, n.read_at, n.created_at, a.name AS actor_name
     FROM notifications n JOIN users a ON a.id = n.actor_id
     WHERE n.user_id = ? ORDER BY n.created_at DESC, n.id LIMIT ?`,
    [user.id, limit],
  ), queryOne("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL", [user.id])]);
  return {
    unread: Number(n),
    items: rows.map((r) => ({ id: r.id, label: r.label, snippet: r.snippet, href: r.href, read: !!r.read_at, actor: r.actor_name, at: r.created_at })),
  };
}

export async function markNotificationRead(user, id) {
  await query("UPDATE notifications SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP(3)) WHERE id = ? AND user_id = ?", [id, user.id]);
}

export async function markAllNotificationsRead(user) {
  await query("UPDATE notifications SET read_at = CURRENT_TIMESTAMP(3) WHERE user_id = ? AND read_at IS NULL", [user.id]);
}

/** Active project members the current user can @mention (never themselves). */
export async function mentionableMembers(ctx) {
  const rows = await query(
    `SELECT u.id, u.name FROM project_members m JOIN users u ON u.id = m.user_id
     WHERE m.project_id = ? AND u.active = 1 AND u.id <> ? ORDER BY u.name`,
    [ctx.project.id, ctx.user.id],
  );
  return rows.map((r) => ({ id: r.id, name: mentionName(r.name) })).filter((r) => r.name);
}
