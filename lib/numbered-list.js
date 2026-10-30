/**
 * Word-style numbered list for a textarea's onKeyDown: Enter after "2. text" starts "3. ";
 * Enter on an empty "3. " item removes the number and ends the list.
 * Edits go through execCommand so undo keeps working; falls back to setRangeText.
 */
const ITEM = /^(\s*)(\d+)\.[ \t]+(.*)$/;

function edit(el, start, end, text) {
  el.focus();
  el.setSelectionRange(start, end);
  const done = text ? document.execCommand("insertText", false, text) : document.execCommand("delete");
  if (!done) {
    el.setRangeText(text, start, end, "end");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

export function continueNumberedList(e) {
  if (e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || e.nativeEvent?.isComposing) return;
  const el = e.currentTarget;
  if (el.selectionStart !== el.selectionEnd) return;
  const caret = el.selectionStart;
  const lineStart = el.value.lastIndexOf("\n", caret - 1) + 1;
  const lineEndIdx = el.value.indexOf("\n", caret);
  const line = el.value.slice(lineStart, lineEndIdx === -1 ? undefined : lineEndIdx);
  const m = ITEM.exec(line);
  if (!m) return;
  const marker = line.length - m[3].length; // length of "  1. "
  if (caret - lineStart < marker) return; // caret inside the number: normal Enter
  e.preventDefault();
  if (!m[3].trim()) return edit(el, lineStart, lineStart + line.length, ""); // empty item: end the list
  edit(el, caret, caret, `\n${m[1]}${Number(m[2]) + 1}. `);
}

const NUMBERED = /^(\s*)(\d+)([.)])[ \t]*(.*)$/;

/**
 * Puts `step` on the line the caret is on (when that line is empty or just a number, e.g. "1. "), otherwise on a new line
 * below it, and renumbers the numbered lines that follow. Returns { text, caret } with the caret at the end of the inserted line
 * (or on a fresh numbered line when the step lands at the very end, so typing can continue).
 */
export function insertStepLine(text, caret, step) {
  const lines = text.split("\n");
  let at = 0;
  for (let off = 0; at < lines.length - 1 && off + lines[at].length < caret; at++) off += lines[at].length + 1;
  const m = NUMBERED.exec(lines[at]);
  const emptyHere = (m ? m[4] : lines[at]).trim() === "";
  const numbered = Boolean(m) || (!text.trim());
  const num = m ? Number(m[2]) : 1;
  const idx = emptyHere ? at : at + 1;
  const n = emptyHere ? num : num + 1;
  const mk = (k) => (numbered ? `${k}. ` : "");
  lines.splice(idx, emptyHere ? 1 : 0, `${mk(n)}${step}`);
  if (numbered) {
    let k = n;
    for (let j = idx + 1; j < lines.length; j++) {
      const x = NUMBERED.exec(lines[j]);
      if (x) lines[j] = `${x[1]}${++k}${x[3]} ${x[4]}`.trimEnd() + (x[4] ? "" : " ");
    }
  }
  const atEnd = idx === lines.length - 1;
  if (atEnd) lines.push(numbered ? mk(n + 1) : "");
  const target = atEnd ? lines.length - 1 : idx;
  const out = lines.join("\n");
  const pos = lines.slice(0, target).reduce((a, l) => a + l.length + 1, 0) + lines[target].length;
  return { text: out, caret: pos };
}
