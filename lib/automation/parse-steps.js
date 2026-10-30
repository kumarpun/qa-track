/**
 * Keyword grammar for browser-automated test cases. Pure and deterministic: every line of the
 * steps / expected result is either a known instruction or reported as unsupported (the case is
 * then not runnable). Case-insensitive, numbering ("1." / "2)") and a colon after the keyword are optional.
 *
 *   Visit | Open | Go to | Navigate to  [site|page|url] <url>
 *   Click | Select | Press [on] <text> [button|link]
 *                                          optional region: "Click Groups in sidenav" (also header / footer) looks there first
 *   Type | Enter <value> into | in <field>
 *   Enter | Type | Fill <field>: <value>      (e.g. "Enter Email: me@x.com")
 *   Text should present | Should see | Should contain  <text>
 *   Should navigate to [url]  <url>        (also tolerates typos such as "naviagte")
 *   Validation message: '<text>'           (text on the page, or an input's own validation message)
 *   Form does not submit                   (the page URL is unchanged after the last click)
 *   Call | Run | Include | Use [test case] <title or code>   (e.g. "Call Willow admin login" / "Call TC-WILLOW-0091")
 *                                          runs that case's steps here; resolved at run time, not by this parser
 * A line may hold several of these separated by ";" (e.g. "Validation message: 'Bad email'; form does not submit").
 */

const unquote = (s) => s.trim().replace(/^(["'“”‘’`])(.*)\1$/, "$2").replace(/^[“‘](.*)[”’]$/, "$1").trim();
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
  let text = unquote(raw);
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
  { kind: "type", re: /^(?:enter|type|fill(?:\s+in)?)\s+([^:]+?)\s*:\s*(.+)$/i, build: (m) => ({ field: unquote(m[1]), value: unquote(m[2]) }) },
  { kind: "type", re: /^(?:type|enter)\s*:?\s*(.+?)\s+(?:into|in)\s+(?:the\s+)?(.+)$/i, build: (m) => ({ value: unquote(m[1]), field: unquote(m[2]) }) },
  { kind: "click", re: /^(?:click|press|select)(?:\s+on)?\s*:?\s*(?!.+\s+from\s(?!(?:the\s+)?(?:side|nav|menu|top|header|footer|left|main|toolbar|app)))(.+)$/i, build: (m) => parseClickTarget(m[1]) },
  { kind: "validation", re: /^(?:validation|error)\s+message(?:\s+should\s+(?:be|appear|show|read))?\s*:?\s*(.+)$/i, build: (m) => ({ text: unquote(m[1]) }) },
  { kind: "noSubmit", re: /^(?:the\s+)?form\s+(?:does\s+not|doesn['’]?t|should\s+not|is\s+not)\s+(?:be\s+)?submit(?:ted)?$/i, build: () => ({ negative: true }) },
  { kind: "seeText", re: /^(?:text\s+should\s+(?:be\s+)?(?:present|visible|appear|exist)|should\s+(?:see|contain)|verify\s+text|see)\s*:?\s*(.+)$/i, build: (m) => ({ text: unquote(m[1]) }) },
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

const lines = (text) => String(text ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

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
