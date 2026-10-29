/**
 * @mentions are stored in a comment body as `@[Name](user-uuid)` and shown as `@Name`.
 * The editor works with the plain `@Name` form; encode/decode convert between the two.
 */
export const MENTION_RE = /@\[([^\]\n]{1,100})\]\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/g;

/** Names go into `[...]`, so brackets/parens cannot appear in them. */
export const mentionName = (name) => String(name).replace(/[[\]()\n]/g, "").trim();

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Unique user ids mentioned in a stored body. */
export function parseMentionIds(body) {
  return [...new Set([...String(body ?? "").matchAll(MENTION_RE)].map((m) => m[2]))];
}

/** Plain editor text + picked mentions [{id,name}] -> stored body. Only `@Name` that is a whole word is converted. */
export function encodeMentions(text, mentions) {
  let out = text;
  for (const m of [...mentions].sort((a, b) => b.name.length - a.name.length)) {
    out = out.replace(new RegExp(`(?<![\\w@\\]])@${esc(m.name)}(?![\\w])`, "g"), `@[${m.name}](${m.id})`);
  }
  return out;
}

/** Stored body -> { text: editor text, mentions: [{id,name}] }. */
export function decodeMentions(body) {
  const mentions = new Map();
  const text = String(body ?? "").replace(MENTION_RE, (_, name, id) => {
    mentions.set(id, { id, name });
    return `@${name}`;
  });
  return { text, mentions: [...mentions.values()] };
}

/** Body with mentions flattened to `@Name` (notification snippets, plain text). */
export const plainMentions = (body) => String(body ?? "").replace(MENTION_RE, "@$1");
