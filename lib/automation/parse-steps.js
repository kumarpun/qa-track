/**
 * Keyword grammar for browser-automated test cases. Pure and deterministic: every line of the
 * steps / expected result is either a known instruction or reported as unsupported (the case is
 * then not runnable). Case-insensitive, numbering ("1." / "2)") and a colon after the keyword are optional.
 *
 *   Visit | Open | Go to | Navigate to  [site|page|url] <url>
 *   Click | Select | Press [on] <text> [button|link]
 *                                          optional region: "Click Groups in sidenav" (also header / footer) looks there first
 *   Type | Enter <value> into | in <field>
 *   Click | Check | Tick checkbox of | for | next to <row text>   (ticks the checkbox in the table row / list item containing that text)
 *   Select <field>: <value>               (a dropdown / searchable select, e.g. "Select author: me@x.com")
 *   Upload | Attach <field>: <file name>   (an image uploaded with the case form's "Upload image" button)
 *   Enter | Type | Fill <field>: <value>      (e.g. "Enter Email: me@x.com")
 *   Scroll [down] to <field or text>  (also "Scroll to top / bottom")
 *   Text should present | Should see | Should contain  <text>
 *   Should navigate to [url]  <url>        (also tolerates typos such as "naviagte")
 *   Validation message: '<text>'           (text on the page, or an input's own validation message)
 *   Form does not submit                   (the page URL is unchanged after the last click)
 *   Call | Run | Include | Use [test case] <title or code>   (e.g. "Call Willow admin login" / "Call TC-WILLOW-0091")
 *                                          runs that case's steps here; resolved at run time, not by this parser
 * A line may hold several of these separated by ";" (e.g. "Validation message: 'Bad email'; form does not submit").
 */

const unquote = (s) => s.trim().replace(/^(["'“”‘’`])(.*)\1$/, "$2").replace(/^[“‘](.*)[”’]$/, "$1").trim();
/** A long value may be fenced: `Enter content: """` ... paragraphs ... `"""`. Returns the text between the fences (or the value unchanged). */
export const FENCE = '"""';
const unfence = (s) => {
  const m = s.trim().match(/^"""[ \t]*\n?([\s\S]*?)\n?[ \t]*"""$/);
  return m ? m[1].trim() : s;
};
const isHttpUrl = (s) => {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
};

// "Groups in sidenav" / "Save button in the header": the part after in/on/from names where to look, not the label.
const SCOPES = [
  { scope: "nav", re: /(?:side\s*-?\s*nav(?:igation)?(?:\s*bar)?|side\s*-?\s*bar|sidebar\s*menu|left\s+(?:nav|menu|sidebar)|navigation(?:\s+(?:bar|menu))?|nav\s*-?\s*bar|nav(?:\s+menu)?|main\s+menu|menu)/ },
  { scope: "header", re: /(?:top\s*-?\s*bar|top\s+(?:nav|menu)|header|toolbar|app\s*bar)/ },
  { scope: "footer", re: /footer/ },
  { scope: "content", re: /(?:(?:main\s+)?content|main(?:\s+(?:area|content|page))?|(?:data\s+|results?\s+)?(?:table|list|grid)|page\s+body|body)/ },
];
const KIND_WORDS = /\s+(?:button|link|tab|menu\s*item|menu\s*option|nav\s*item|icon|option)$/i;

/** Splits a click phrase into the visible label and an optional page region. */
export function parseClickTarget(raw) {
  // "Click button: Add article" -> the label is "Add article"; the kind word before the colon only describes it.
  let text = unquote(unquote(raw).replace(/^(?:button|link|tab|menu\s*item|menu\s*option|nav\s*item|icon|option)\s*:\s*/i, ""));
  let scope;
  for (const sc of SCOPES) {
    const m = text.match(new RegExp(`^(.+?)\\s+(?:in|on|from|at|under|inside|within)\\s+(?:the\\s+)?${sc.re.source}(?:\\s+(?:menu|section|panel|items?))?$`, "i"));
    if (m) { text = m[1]; scope = sc.scope; break; }
  }
  text = unquote(unquote(text).replace(KIND_WORDS, "").replace(/^the\s+/i, ""));
  return scope ? { target: text, scope } : { target: text };
}

// Order matters: the URL assertion must be tried before the generic "navigate to" action.
const RULES = [
  { kind: "call", re: /^(?:call|run|include|use)(?:\s+(?:the\s+)?(?:test\s*case|case))?\s*:?\s*(.+)$/i, build: (m) => ({ ref: unquote(m[1]) }) },
  { kind: "urlIs", re: /^should\s+navi\w*\s+to(?:\s+(?:the\s+)?url)?\s*:?\s*(\S+)$/i, build: (m) => ({ url: unquote(m[1]) }) },
  { kind: "urlIs", re: /^url\s+should\s+(?:be|equal)\s*:?\s*(\S+)$/i, build: (m) => ({ url: unquote(m[1]) }) },
  { kind: "goto", re: /^(?:visit|open|go\s*to|navigate\s+to)(?:\s+(?:the\s+)?(?:site|page|url|website|link))?\s*:?\s*(\S+)$/i, build: (m) => ({ url: unquote(m[1]) }) },
  { kind: "type", re: /^(?:enter|type|fill(?:\s+in)?)\s+([^:]+?)\s*:\s*(.+)$/is, build: (m) => ({ field: unquote(m[1]), value: unquote(unfence(m[2])) }) },
  { kind: "type", re: /^(?:type|enter)\s*:?\s*(.+?)\s+(?:into|in)\s+(?:the\s+)?(.+)$/is, build: (m) => ({ value: unquote(unfence(m[1])), field: unquote(m[2]) }) },
  { kind: "upload", re: /^(?:upload|attach)\s+([^:\n]+?)\s*:\s*([^\n]+)$/i, build: (m) => ({ field: unquote(m[1]), value: unquote(m[2]) }) },
  { kind: "check", re: /^(?:click|check|tick|select|mark)(?:\s+on)?\s+(?:the\s+)?(?:check\s*-?\s*box|tick\s*-?\s*box)\s*(?:of|for|in|on|next\s+to|beside|with|at)?\s*(?:the\s+)?(?:row\s+)?(?:of\s+|with\s+)?:?\s*(.+)$/i, build: (m) => ({ target: unquote(m[1]) }) },
  // "Select author: me@x.com": pick a value in a dropdown field. "Select button: Save" (a kind word before the colon) stays a click.
  { kind: "choose", re: /^select\s+(?!(?:button|link|tab|menu\s*item|menu\s*option|nav\s*item|icon|option)\s*:)([^:\n]+?)\s*:\s*(.+)$/i, build: (m) => ({ field: unquote(m[1]), value: unquote(m[2]) }) },
  { kind: "click", re: /^(?:click|press|select)(?:\s+on)?\s*:?\s*(?!.+\s+from\s(?!(?:the\s+)?(?:side|nav|menu|top|header|footer|left|main|toolbar|app)))(.+)$/i, build: (m) => parseClickTarget(m[1]) },
  { kind: "scroll", re: /^scroll(?:\s+(?:down|up))?(?:\s+(?:to|until|into\s+view))?\s*:?\s*(?:the\s+)?(.+)$/i, build: (m) => ({ target: unquote(m[1]).replace(/\s+(?:field|section|input|area|into\s+view)$/i, "") }) },
  { kind: "validation", re: /^(?:validation|error)\s+message(?:\s+should\s+(?:be|appear|show|read))?\s*:?\s*(.+)$/is, build: (m) => ({ text: unquote(m[1]) }) },
  { kind: "noSubmit", re: /^(?:the\s+)?form\s+(?:does\s+not|doesn['’]?t|should\s+not|is\s+not)\s+(?:be\s+)?submit(?:ted)?$/i, build: () => ({ negative: true }) },
  // "Text should not be present: Foo": the text must be absent from the page (waits briefly for it to go away).
  { kind: "notText", re: /^(?:text\s+should\s+not\s+(?:be\s+)?(?:present|visible|appear|exist|display(?:ed)?|shown?)|should\s+not\s+(?:see|contain)|verify\s+text\s+(?:is\s+)?(?:not|absent)(?:\s+present)?|(?:do\s+not|don['’]?t)\s+see)\s*:?\s*(.+)$/is, build: (m) => ({ text: unquote(m[1]) }) },
  { kind: "seeText", re: /^(?:text\s+should\s+(?:be\s+)?(?:present|visible|appear|exist|display(?:ed)?|shown?)|should\s+(?:see|contain)|verify\s+text|see)\s*:?\s*(.+)$/is, build: (m) => ({ text: unquote(m[1]) }) },
  // "<label> display: <text>" (also displays / displayed / shown / appears): the text must be on the page. A repeated "<label>:" in the text is dropped ("Title display: title: Foo" -> "Foo").
  {
    kind: "seeText",
    re: /^([^:\n]{1,40}?)\s+(?:display(?:s|ed)?|show(?:s|n)?|appear(?:s|ed)?)\s*:\s*(.+)$/is,
    build: (m) => {
      const label = m[1].trim().replace(/\s+/g, " ");
      const rest = m[2].trim().replace(new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:\\s*`, "i"), "");
      return { text: unquote(rest) };
    },
  },
];

/** Parse one line; returns an instruction or null when it is not in the grammar. */
export function parseLine(raw) {
  const line = String(raw ?? "").replace(/^\s*\d+\s*[.)]\s*/, "").trim();
  if (!line) return null;
  for (const rule of RULES) {
    const m = line.match(rule.re);
    if (!m) continue;
    const args = rule.build(m);
    if ((rule.kind === "goto" || rule.kind === "urlIs") && !isHttpUrl(args.url)) return null;
    if (Object.values(args).some((v) => v === "" || v == null)) return null;
    return { kind: rule.kind, ...args, source: line };
  }
  return null;
}

/** A line with ";" is tried as several instructions first (all parts must parse), then whole (text or URLs may contain ";"). */
function parseSegments(line) {
  if (line.includes(";")) {
    const parts = line.split(";").map((p) => p.trim()).filter(Boolean).map(parseLine);
    if (parts.length > 1 && parts.every(Boolean)) return parts;
  }
  const whole = parseLine(line);
  return whole ? [whole] : null;
}

const NUMBERED_LINE = /^\s*\d+\s*[.)](?:\s|$)/;

/**
 * Splits step text into one block per step. When the text has numbered lines ("1. ...", "2) ..."), an unnumbered line
 * (or a blank one) continues the step above it, so a long value such as "Enter content: <several paragraphs>" stays one step.
 * Without any numbering every non-blank line is its own step, as before.
 */
export function stepBlocks(text) {
  const raw = String(text ?? "").split(/\r?\n/).map((l) => l.trim());
  // A line that opens a """ fence swallows everything up to the closing fence, blank lines included, even without numbering.
  const all = [];
  let open = false;
  for (const l of raw) {
    const fences = l.split(FENCE).length - 1;
    if (open) all[all.length - 1] += `\n${l}`;
    else all.push(l);
    if (fences % 2 === 1) open = !open;
  }
  if (!all.some((l) => NUMBERED_LINE.test(l))) return all.filter(Boolean);
  const blocks = [];
  for (const l of all) {
    if (NUMBERED_LINE.test(l) || !blocks.length) blocks.push(l);
    else blocks[blocks.length - 1] += `\n${l}`;
  }
  return blocks.map((b) => b.trim()).filter(Boolean);
}
const lines = stepBlocks;

/**
 * Turn a case's steps ([{ action, expected }]) into an ordered instruction list: all actions first, then all expected assertions.
 * Returns { instructions, unsupported } — run only when `unsupported` is empty and there is at least one instruction.
 */
export function parseCaseSteps(steps) {
  const instructions = [];
  const unsupported = [];
  const take = (text, section) => {
    for (const line of lines(text)) {
      const ins = parseSegments(line);
      if (ins) instructions.push(...ins);
      else unsupported.push({ section, line });
    }
  };
  for (const s of steps ?? []) take(s.action, "Test steps");
  for (const s of steps ?? []) take(s.expected, "Expected result");
  return { instructions, unsupported };
}

/** Regex source that ignores spacing/case inside a label so "login" matches the "Log in" link. */
export function looseSource(text) {
  return [...String(text).replace(/\s+/g, "")]
    .map((c) => c.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&"))
    .join("\\s*");
}

/** Compare URLs ignoring a trailing slash and the #fragment. */
export function sameUrl(actual, expected) {
  const norm = (u) => {
    try {
      const x = new URL(u);
      x.hash = "";
      return x.href.replace(/\/$/, "");
    } catch {
      return String(u);
    }
  };
  return norm(actual) === norm(expected);
}
