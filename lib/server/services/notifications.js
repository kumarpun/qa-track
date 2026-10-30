import "server-only";
import { query, queryOne, uuid } from "../db";
import { ROLE_LABELS } from "@/lib/permissions";
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
     WHERE u.active = 1 AND u.id IN (?) AND u.org_id = ?
       AND (u.role = 'ADMIN' OR u.id IN (SELECT user_id FROM project_members WHERE project_id = ?))`,
    [ids, ctx.project.org_id, ctx.project.id],
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

/** Tell a user they were added to a project; the notification opens the project. */
export async function notifyAddedToProject(actor, project, userId, role) {
  await query(
    `INSERT INTO notifications (id, user_id, actor_id, project_id, comment_id, type, label, snippet, href)
     VALUES (?,?,?,?,NULL,'PROJECT_ADDED',?,?,?)`,
    [uuid(), userId, actor.id, project.id, project.name.slice(0, 255), `Role: ${ROLE_LABELS[role] ?? role}`, `/projects/${project.id}`],
  );
}

export const NOTIFICATIONS_PAGE_SIZE = 5;

/** One page of the user's notifications, newest first. Viewed ones stay until the user deletes them. */
export async function listNotifications(user, page = 1) {
  const [{ unread, total }, pageCount] = await countNotifications(user);
  const current = Math.min(Math.max(1, page), pageCount);
  const rows = await query(
    `SELECT n.id, n.label, n.snippet, n.type, n.href, n.read_at, n.created_at, a.name AS actor_name
     FROM notifications n JOIN users a ON a.id = n.actor_id
     WHERE n.user_id = ? ORDER BY n.created_at DESC, n.id LIMIT ? OFFSET ?`,
    [user.id, NOTIFICATIONS_PAGE_SIZE, (current - 1) * NOTIFICATIONS_PAGE_SIZE],
  );
  return {
    unread, total, page: current, pageCount,
    items: rows.map((r) => ({ id: r.id, label: r.label, type: r.type, snippet: r.snippet, href: r.href, read: !!r.read_at, actor: r.actor_name, at: r.created_at })),
  };
}

async function countNotifications(user) {
  const row = await queryOne(
    "SELECT COUNT(*) AS total, COALESCE(SUM(read_at IS NULL), 0) AS unread FROM notifications WHERE user_id = ?",
    [user.id],
  );
  const total = Number(row.total);
  return [{ total, unread: Number(row.unread) }, Math.max(1, Math.ceil(total / NOTIFICATIONS_PAGE_SIZE))];
}

export async function deleteNotification(user, id) {
  await query("DELETE FROM notifications WHERE id = ? AND user_id = ?", [id, user.id]);
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
