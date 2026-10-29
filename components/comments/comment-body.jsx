import { BULLET_LINE, CHECK_LINE, NUMBER_LINE } from "./list-tools";

import { MENTION_RE } from "@/lib/mentions";

const IMG = /!\[[^\]]*\]\((https:\/\/[^\s)]+)\)/g;
const HOSTS = ["iili.io", "freeimage.host"];

const allowed = (u) => {
  try { return HOSTS.some((h) => new URL(u).hostname === h || new URL(u).hostname.endsWith(`.${h}`)); } catch { return false; }
};

const kindOf = (l) => (CHECK_LINE.test(l) ? "check" : BULLET_LINE.test(l) ? "bullet" : NUMBER_LINE.test(l) ? "number" : null);

/** Split text into paragraphs and consecutive runs of list lines. */
function blocks(text) {
  const out = [];
  for (const line of text.split("\n")) {
    const kind = kindOf(line);
    const last = out[out.length - 1];
    if (last && last.kind === kind) last.lines.push(line);
    else out.push({ kind, lines: [line] });
  }
  return out;
}

/** Text with stored `@[Name](id)` tokens shown as highlighted @Name chips. */
function Text({ text }) {
  const out = [];
  let last = 0;
  for (const m of text.matchAll(MENTION_RE)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(<span key={m.index} data-testid="mention" className="rounded bg-primary/10 px-1 font-medium text-primary">@{m[1]}</span>);
    last = m.index + m[0].length;
  }
  out.push(text.slice(last));
  return out;
}

/**
 * Comment text: `![image](url)` as images (freeimage.host only), "- ", "1. " and "- [ ] " lines as lists.
 * With `onToggle(n)` the n-th checklist item (document order) can be ticked.
 */
export function CommentBody({ body, onToggle }) {
  const parts = [];
  let last = 0;
  for (const m of body.matchAll(IMG)) {
    if (!allowed(m[1])) continue;
    if (m.index > last) parts.push(body.slice(last, m.index));
    parts.push({ url: m[1] });
    last = m.index + m[0].length;
  }
  if (last < body.length) parts.push(body.slice(last));

  let check = 0;
  const text = (p, key) => blocks(p.replace(/^\n+|\s+$/g, "")).map((b, j) => {
    const k = `${key}-${j}`;
    if (!b.kind) return b.lines.join("\n").trim() && <p key={k} className="whitespace-pre-wrap"><Text text={b.lines.join("\n")} /></p>;
    if (b.kind === "check") {
      return (
        <ul key={k} className="space-y-1">
          {b.lines.map((l, i) => {
            const m = l.match(CHECK_LINE);
            const n = check++;
            const done = m[2] !== " ";
            return (
              <li key={i} className="flex items-start gap-2">
                <input type="checkbox" checked={done} disabled={!onToggle} onChange={() => onToggle?.(n)} aria-label={m[3]} className="mt-1" />
                <span className={done ? "text-muted-foreground line-through" : ""}><Text text={m[3]} /></span>
              </li>
            );
          })}
        </ul>
      );
    }
    const re = b.kind === "number" ? NUMBER_LINE : BULLET_LINE;
    const Tag = b.kind === "number" ? "ol" : "ul";
    return <Tag key={k} className={`pl-5 ${b.kind === "number" ? "list-decimal" : "list-disc"}`}>{b.lines.map((l, i) => <li key={i}><Text text={l.match(re)[1]} /></li>)}</Tag>;
  });

  return (
    <div className="space-y-2">
      {parts.map((p, i) => typeof p === "string"
        ? text(p, i)
        // eslint-disable-next-line @next/next/no-img-element
        : <a key={i} href={p.url} target="_blank" rel="noopener noreferrer"><img src={p.url} alt="Comment attachment" loading="lazy" className="max-h-96 rounded-lg" /></a>)}
    </div>
  );
}
