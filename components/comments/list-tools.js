// Markdown list helpers for the comment textareas. Comments stay plain text:
//   bullet "- item", numbered "1. item", checklist "- [ ] item" / "- [x] item".

export const LIST_PREFIX = /^(\s*)(?:[-*]\s\[[ xX]\]\s|[-*]\s|\d+\.\s)/;
export const CHECK_LINE = /^(\s*)[-*]\s\[([ xX])\]\s(.*)$/;
export const BULLET_LINE = /^\s*[-*]\s(.*)$/;
export const NUMBER_LINE = /^\s*\d+\.\s(.*)$/;

const KIND_TEST = {
  bullet: (l) => BULLET_LINE.test(l) && !CHECK_LINE.test(l),
  number: (l) => NUMBER_LINE.test(l),
  check: (l) => CHECK_LINE.test(l),
};
const prefixFor = (kind, n) => (kind === "number" ? `${n}. ` : kind === "check" ? "- [ ] " : "- ");

/** Turn the selected lines into a list of `kind`; if they all already are, turn the list off. */
export function applyList(text, start, end, kind) {
  const from = text.lastIndexOf("\n", start - 1) + 1;
  const nl = text.indexOf("\n", end);
  const to = nl === -1 ? text.length : nl;
  const lines = text.slice(from, to).split("\n");
  const filled = lines.filter((l) => l.trim());
  const off = filled.length > 0 && filled.every(KIND_TEST[kind]);
  let n = 0;
  const out = lines.map((l) => {
    const bare = l.replace(LIST_PREFIX, "$1");
    if (off) return bare;
    if (!l.trim() && lines.length > 1) return l;
    return prefixFor(kind, ++n) + bare.trimStart();
  });
  const block = out.join("\n");
  return { text: text.slice(0, from) + block + text.slice(to), start: from, end: from + block.length };
}

/** Enter inside a list: start the next item, or end the list when the current item is empty. Returns null to leave Enter alone. */
export function continueList(text, pos) {
  const from = text.lastIndexOf("\n", pos - 1) + 1;
  const nl = text.indexOf("\n", pos);
  if ((nl === -1 ? text.length : nl) !== pos) return null; // only at the end of a line
  const line = text.slice(from, pos);
  const m = line.match(LIST_PREFIX);
  if (!m) return null;
  const rest = line.slice(m[0].length);
  if (!rest.trim()) return { text: text.slice(0, from) + text.slice(pos), pos: from };
  const marker = m[0].trim();
  const next = /^\d+\./.test(marker) ? `${m[1]}${parseInt(marker, 10) + 1}. ` : /\[/.test(marker) ? `${m[1]}- [ ] ` : `${m[1]}${marker[0]} `;
  return { text: `${text.slice(0, pos)}\n${next}${text.slice(pos)}`, pos: pos + 1 + next.length };
}

/** Flip the nth checklist item (in document order) between [ ] and [x]. */
export function toggleCheck(body, nth) {
  let k = -1;
  return body.split("\n").map((l) => {
    const m = l.match(CHECK_LINE);
    if (!m || ++k !== nth) return l;
    return `${m[1]}- [${m[2] === " " ? "x" : " "}] ${m[3]}`;
  }).join("\n");
}
