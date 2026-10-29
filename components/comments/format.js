export const fmt = (d) => new Date(d).toISOString().replace("T", " ").slice(0, 16) + " UTC";

export const ago = (d) => {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  if (m < 43200) return `${Math.floor(m / 1440)}d ago`;
  return new Date(d).toISOString().slice(0, 10);
};

/** Group flat comment rows (oldest first) into threads: each top-level comment with its replies. */
export function toThreads(rows, userId) {
  const view = (c) => ({ id: c.id, body: c.body, authorName: c.author_name, at: ago(c.created_at), title: fmt(c.created_at), edited: !!c.edited_at, mine: c.author_id === userId });
  const threads = rows.filter((c) => !c.parent_id).map((c) => ({ ...view(c), replies: [] }));
  const byId = new Map(threads.map((t) => [t.id, t]));
  for (const c of rows) if (c.parent_id) byId.get(c.parent_id)?.replies.push(view(c));
  return threads;
}
