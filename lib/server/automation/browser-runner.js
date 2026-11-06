import "server-only";
import { chromium } from "playwright-core";
import { looseSource, sameUrl } from "@/lib/automation/parse-steps";
import { requestBlockedReason } from "./url-guard";

const BASE_ARGS = ["--disable-dev-shm-usage", "--disable-extensions", "--disable-background-networking"];

/** On Vercel (Linux serverless, no Chromium installed) use the bundled @sparticuz/chromium build, always headless. */
async function launchBrowser(headless) {
  if (!process.env.VERCEL) return chromium.launch({ headless, slowMo: headless ? 0 : SLOW_MO_MS, args: BASE_ARGS });
  const { default: sparticuz } = await import("@sparticuz/chromium");
  return chromium.launch({ headless: true, executablePath: await sparticuz.executablePath(), args: [...sparticuz.args, ...BASE_ARGS] });
}

const STEP_TIMEOUT = 15_000;
const OVERALL_TIMEOUT = 120_000;
const HOLD_OPEN_MS = 1_000; // keep the window up briefly so the tester can see the end state

const SLOW_MO_MS = 120; // visible mode only: enough to follow along without making every action wait
const g = globalThis;
// DNS verdicts are shared across runs (suite runs launch one browser per case) and expire so changes are picked up.
const DNS_TTL_MS = 60_000;
const dnsCache = () => {
  if (!g.__qaDnsCache || Date.now() - g.__qaDnsCache.at > DNS_TTL_MS) g.__qaDnsCache = { at: Date.now(), map: new Map() };
  return g.__qaDnsCache.map;
};

const loose = (text) => new RegExp(looseSource(text), "i");
const norm = (s) => s.replace(/\s+/g, " ").trim().toLowerCase();

const SCOPE_SELECTOR = {
  nav: "nav, aside, [role=navigation], [role=menu], [role=menubar]",
  header: "header, [role=banner], [role=toolbar]",
  footer: "footer, [role=contentinfo]",
  content: "main, [role=main], #content, table, [role=table], [role=grid]",
};

/**
 * Clickable thing by visible label. In each search area (the named region first, then the whole page) a label that
 * matches exactly ("Auditor") wins over one that only contains it ("Auditors", "Auditor logs"); link/button/tab come before plain text.
 */
export async function findClickable(page, text, scope) {
  const alnum = looseSource(text);
  const exact = new RegExp(`^\\s*${alnum}\\s*$`, "i");
  const partial = loose(text);
  const roots = scope && SCOPE_SELECTOR[scope] ? [page.locator(SCOPE_SELECTOR[scope]), page] : [page];
  for (const root of roots) {
    for (const re of [exact, partial]) {
      for (const loc of [root.getByRole("link", { name: re }), root.getByRole("button", { name: re }), root.getByRole("menuitem", { name: re }), root.getByRole("tab", { name: re }), root.getByText(re)]) {
        if (await loc.count()) return loc.first();
      }
    }
  }
  throw new Error(`Nothing clickable matches "${text}"${scope ? ` in the ${scope}` : ""}`);
}

/** "invalid email format" / "valid password" name the input by its role: drop the qualifiers to get "email" / "password". */
const simplifyField = (field) =>
  field.replace(/\b(?:an?|the|invalid|valid|incorrect|wrong|correct|new|empty|existing|registered|unregistered)\b/gi, " ").replace(/\b(?:format|value|field|input|address)\b/gi, " ").replace(/\s+/g, " ").trim();

async function findField(page, field) {
  try {
    return await findFieldExact(page, field);
  } catch (e) {
    const simple = simplifyField(field);
    if (!simple || simple.toLowerCase() === field.toLowerCase()) throw e;
    return findFieldExact(page, simple).catch(() => { throw e; });
  }
}

async function findFieldExact(page, field) {
  // Ignore spacing and punctuation so "Email" finds a field labelled or placeholdered "E-mail".
  const alnum = [...field].filter((c) => /[\p{L}\p{N}]/u.test(c)).join("").toLowerCase();
  const re = alnum ? new RegExp([...alnum].map((c) => c.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&")).join("[\\s._-]*"), "i") : loose(field);
  const candidates = [page.getByLabel(re), page.getByPlaceholder(re), page.getByRole("textbox", { name: re })];
  for (const loc of candidates) {
    if (await loc.count()) return loc.first();
  }
  // Fall back to the input's own attributes (name / id / autocomplete), then its type for email and password.
  const byAttr = await page.locator("input:not([type=hidden])").evaluateAll(
    (els, src) => {
      const r = new RegExp(src, "i");
      return els.findIndex((e) => r.test(e.getAttribute("name") || "") || r.test(e.id || "") || r.test(e.getAttribute("autocomplete") || ""));
    },
    re.source,
  );
  if (byAttr >= 0) return page.locator("input:not([type=hidden])").nth(byAttr);
  if (alnum === "email") { const l = page.locator("input[type=email]"); if (await l.count()) return l.first(); }
  if (/^pass(word)?$/.test(alnum)) { const l = page.locator("input[type=password]"); if (await l.count()) return l.first(); }
  throw new Error(`No input matches "${field}"`);
}

/**
 * Rich-text editors (CKEditor 4 in the Django admin) hide the real <textarea> and edit inside an iframe, so a plain
 * fill() on the textarea times out. When the field is such a hidden textarea, set the editor content instead
 * (blank-line separated paragraphs become <p> blocks). Returns false when the field is an ordinary input.
 */
async function fillRichText(page, el, value) {
  // The matched element may be the hidden textarea itself or something inside the editor (its toolbar/iframe): resolve both to the textarea id.
  // CKEditor registers itself right after load but only hides the textarea once ready, so wait briefly for it before deciding.
  const info = await el
    .evaluate(async (e) => {
      const wrap = e.closest?.(".cke");
      if (wrap) return { id: wrap.id.replace(/^cke_/, "") };
      if (e.tagName !== "TEXTAREA" || !e.id) return null;
      const expected = !!document.querySelector('script[src*="ckeditor" i]') || !!window.CKEDITOR;
      for (let i = 0; i < 50; i++) {
        if (window.CKEDITOR?.instances?.[e.id] || getComputedStyle(e).display === "none") return { id: e.id };
        if (!expected) return null;
        await new Promise((r) => setTimeout(r, 100));
      }
      return null;
    })
    .catch(() => null);
  if (!info?.id) return false;
  const html = value
    .split(/\n\s*\n/)
    .map((p) => `<p>${p.trim().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}</p>`)
    .join("");
  const done = await page
    .evaluate(
      ({ id, html }) => {
        const ck = window.CKEDITOR?.instances?.[id];
        if (!ck) return false;
        ck.setData(html);
        ck.updateElement();
        return true;
      },
      { id: info.id, html },
    )
    .catch(() => false);
  if (done) return true;
  const body = page.frameLocator(`#cke_${info.id} iframe`).locator("body");
  if (await body.count()) {
    await body.fill(value, { timeout: STEP_TIMEOUT });
    return true;
  }
  return false;
}

/**
 * "Select <field>: <value>": a native <select> is set by its option label; a searchable dropdown (select2 in the Django admin,
 * other comboboxes) is opened, the value typed into its search box, and the matching option clicked.
 */
async function chooseOption(page, field, value) {
  const alnum = [...field].filter((c) => /[\p{L}\p{N}]/u.test(c)).join("");
  const labelRe = alnum ? loose(alnum) : loose(field);
  const valRe = loose(value);
  const native = page.locator("select").and(page.getByLabel(labelRe));
  if (await native.count()) {
    const sel = native.first();
    const opts = await sel.locator("option").evaluateAll((os) => os.map((o) => ({ v: o.value, t: o.textContent.trim() })));
    const hit = opts.find((o) => valRe.test(o.t) || valRe.test(o.v));
    if (hit && (await sel.isVisible())) { await sel.selectOption(hit.v, { timeout: STEP_TIMEOUT }); return `selected "${hit.t}" in "${field}"`; }
  }
  // Searchable dropdown: the widget sits next to the label's <select>/<input> (select2) or is a combobox named by the label.
  const label = page.locator("label").filter({ hasText: labelRe }).first();
  let trigger = null;
  if (await label.count()) {
    const id = await label.getAttribute("for");
    if (id) {
      const s2 = page.locator(`#${id.replace(/([^\w-])/g, "\\$1")} ~ .select2 .select2-selection, #${id.replace(/([^\w-])/g, "\\$1")} + .select2 .select2-selection`);
      if (await s2.count()) trigger = s2.first();
    }
    if (!trigger) {
      const near = label.locator("xpath=ancestor::*[self::div or self::tr or self::li][1]").locator(".select2-selection, [role=combobox]");
      if (await near.count()) trigger = near.first();
    }
  }
  if (!trigger) {
    const combo = page.getByRole("combobox", { name: labelRe });
    if (await combo.count()) trigger = combo.first();
  }
  if (!trigger) throw new Error(`No dropdown matches "${field}"`);
  await trigger.click({ timeout: STEP_TIMEOUT });
  // Only a real text input can be filled: select2's trigger is a focused <span role=combobox>, which fill() rejects.
  const search = page.locator(".select2-search__field, input[type=search]:focus, input[role=combobox]:focus, textarea[role=combobox]:focus").filter({ visible: true }).first();
  const found = await search.waitFor({ state: "visible", timeout: 2000 }).then(() => true, () => false);
  if (found) await search.fill(value, { timeout: STEP_TIMEOUT });
  else await page.keyboard.type(value, { delay: 30 });
  const option = page.locator(".select2-results__option, [role=option]").filter({ hasText: valRe }).first();
  await option.waitFor({ state: "visible", timeout: STEP_TIMEOUT }).catch(() => { throw new Error(`No option matches "${value}" in "${field}"`); });
  await option.click({ timeout: STEP_TIMEOUT });
  return `selected "${value}" in "${field}"`;
}

/** The <input type=file> for a label ("Image:"), falling back to its name/id, then to the only file input on the page. */
async function findFileInput(page, field) {
  const files = page.locator("input[type=file]");
  const alnum = [...field].filter((c) => /[\p{L}\p{N}]/u.test(c)).join("");
  const re = loose(alnum || field);
  const byLabel = files.and(page.getByLabel(re));
  if (await byLabel.count()) return byLabel.first();
  const idx = await files.evaluateAll((els, src) => els.findIndex((e) => new RegExp(src, "i").test(`${e.name} ${e.id}`)), re.source);
  if (idx >= 0) return files.nth(idx);
  const n = await files.count();
  if (n === 1) return files.first();
  throw new Error(n ? `No file input matches "${field}"` : "No file input on the page");
}

/** Execute one instruction; returns { page } (a click can open a new tab) and a short detail string. */
async function execute(ins, page, context, state) {
  switch (ins.kind) {
    case "goto":
      await page.goto(ins.url, { waitUntil: "domcontentloaded", timeout: STEP_TIMEOUT });
      return { page, detail: page.url() };
    case "click": {
      const el = await findClickable(page, ins.target, ins.scope);
      await el.waitFor({ state: "visible", timeout: STEP_TIMEOUT });
      const opensTab = (await el.getAttribute("target")) === "_blank";
      const popup = opensTab ? context.waitForEvent("page", { timeout: STEP_TIMEOUT }) : null;
      state.urlBeforeClick = page.url();
      await el.click({ timeout: STEP_TIMEOUT });
      const next = popup ? await popup : page;
      await next.waitForLoadState("domcontentloaded", { timeout: STEP_TIMEOUT }).catch(() => {});
      return { page: next, detail: next.url() };
    }
    case "upload": {
      if (!ins.fileUrl) throw new Error(`File "${ins.value}" is not available to this runner`);
      const u = new URL(ins.fileUrl);
      if (u.protocol !== "https:" || !/^(?:freeimage\.host|iili\.io)$/i.test(u.hostname)) throw new Error(`Refusing to download "${ins.value}" from ${u.hostname}`);
      const input = await findFileInput(page, ins.field);
      const res = await fetch(u, { signal: AbortSignal.timeout(STEP_TIMEOUT) });
      if (!res.ok) throw new Error(`Could not download "${ins.value}" (HTTP ${res.status})`);
      const ext = ins.value.split(".").pop().toLowerCase();
      const mimeType = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" }[ext] ?? "application/octet-stream";
      await input.setInputFiles({ name: ins.value, mimeType, buffer: Buffer.from(await res.arrayBuffer()) }, { timeout: STEP_TIMEOUT });
      return { page, detail: `uploaded "${ins.value}" to "${ins.field}"` };
    }
    case "check": {
      // The checkbox in the table row (or list item) whose text matches: exact cell text first, then any row that contains it.
      const re = loose(ins.target);
      const rows = page.locator("tr, li, [role=row]").filter({ hasText: re }).filter({ has: page.locator("input[type=checkbox], [role=checkbox]") });
      if (!(await rows.count())) throw new Error(`No row with a checkbox matches "${ins.target}"`);
      // Several matches: prefer the tightest row (fewest characters) so a parent list never wins over the item itself.
      const lens = await rows.evaluateAll((els) => els.map((e) => e.textContent.length));
      const box = rows.nth(lens.indexOf(Math.min(...lens))).locator("input[type=checkbox], [role=checkbox]").first();
      await box.check({ timeout: STEP_TIMEOUT });
      return { page, detail: `checked the row "${ins.target}"` };
    }
    case "choose":
      return { page, detail: await chooseOption(page, ins.field, ins.value) };
    case "type": {
      const el = await findField(page, ins.field);
      if (await fillRichText(page, el, ins.value)) return { page, detail: `filled "${ins.field}" (rich text editor)` };
      await el.fill(ins.value, { timeout: STEP_TIMEOUT });
      return { page, detail: `filled "${ins.field}"` };
    }
    case "scroll": {
      const t = ins.target.toLowerCase();
      if (/^(?:the\s+)?(?:bottom|end|footer)(?:\s+of\s+(?:the\s+)?page)?$/.test(t) || t === "down") await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      else if (/^(?:the\s+)?(?:top|start)(?:\s+of\s+(?:the\s+)?page)?$/.test(t) || t === "up") await page.evaluate(() => window.scrollTo(0, 0));
      else {
        // A field/label first, then any element with that text; a hidden rich-text field scrolls via its editor wrapper.
        const el = await findField(page, ins.target).catch(() => page.getByText(loose(ins.target)).first());
        await el.evaluate((e) => (e.closest(".cke") || (e.id && document.getElementById(`cke_${e.id}`)) || e).scrollIntoView({ block: "center" }));
      }
      return { page, detail: `scrolled to "${ins.target}"` };
    }
    case "seeText": {
      // "title: The article … was added" : a short "label:" in front names where the text shows, so the page may only hold the rest.
      const lead = ins.text.match(/^[^:\n]{1,30}:\s+(\S[\s\S]*)$/);
      const wants = [norm(ins.text), ...(lead ? [norm(lead[1])] : [])];
      await page.waitForFunction((ts) => {
          const n = (x) => (x || "").replace(/\s+/g, " ").toLowerCase();
          // Visible text, or a filled-in field ("Title display: Foo" after typing Foo into the title input).
          const body = n(document.body.innerText);
          const fields = [...document.querySelectorAll("input,textarea")].map((e) => n(e.value));
          return ts.some((t) => body.includes(t) || fields.some((v) => v.includes(t)));
        },
        wants, { timeout: STEP_TIMEOUT });
      return { page, detail: "text found" };
    }
    case "notText": {
      const want = norm(ins.text);
      try {
        await page.waitForFunction((t) => !(document.body.innerText || "").replace(/\s+/g, " ").toLowerCase().includes(t), want, { timeout: STEP_TIMEOUT });
      } catch {
        throw new Error(`Text "${ins.text}" is still present on the page`);
      }
      return { page, detail: "text absent" };
    }
    case "validation": {
      const want = norm(ins.text);
      try {
        await page.waitForFunction(
          (t) => {
            const n = (s) => (s || "").replace(/\s+/g, " ").toLowerCase();
            return n(document.body.innerText).includes(t) || [...document.querySelectorAll("input,select,textarea")].some((e) => n(e.validationMessage).includes(t));
          },
          want,
          { timeout: STEP_TIMEOUT },
        );
      } catch {
        throw new Error(`Validation message "${ins.text}" not shown`);
      }
      return { page, detail: "validation message shown" };
    }
    case "noSubmit": {
      if (!state.urlBeforeClick) throw new Error("No click before 'form does not submit'");
      await page.waitForTimeout(500); // give a wrongly accepted submit time to navigate
      if (!sameUrl(page.url(), state.urlBeforeClick)) throw new Error(`Form submitted: browser moved to ${page.url()}`);
      return { page, detail: "form not submitted" };
    }
    case "urlIs":
      try {
        await page.waitForURL((u) => sameUrl(u.href, ins.url), { timeout: STEP_TIMEOUT, waitUntil: "commit" });
      } catch {
        throw new Error(`Expected URL ${ins.url} but the browser is on ${page.url()}`);
      }
      return { page, detail: page.url() };
    default:
      throw new Error(`Unknown instruction ${ins.kind}`);
  }
}

/**
 * Run parsed instructions in a real Chromium window (visible or headless). Stops at the first failure and takes a screenshot of it.
 * Only one run at a time per server process. Returns { status, log, finalUrl, screenshot }.
 */
export async function runInBrowser(instructions, { headless: wantHeadless } = {}) {
  if (g.__qaBrowserBusy) return { busy: true };
  g.__qaBrowserBusy = true;
  const headless = wantHeadless ?? process.env.BROWSER_RUNS_HEADLESS === "1";
  const log = [];
  let browser;
  let page;
  let screenshot = null;
  let status = "PASSED";
  const blocked = [];
  const state = {};
  const killer = { id: null };
  try {
    browser = await launchBrowser(headless);
    killer.id = setTimeout(() => browser.close().catch(() => {}), OVERALL_TIMEOUT);
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: "block", acceptDownloads: false, permissions: [] });
    // Every request (navigations, redirects, subresources) is checked, so a public page cannot bounce the browser to an internal address.
    const dns = dnsCache();
    await context.route("**/*", async (route) => {
      // Headless runs skip fonts and media: they never affect step results, only load time.
      if (headless && ["font", "media"].includes(route.request().resourceType())) return route.abort();
      const reason = await requestBlockedReason(route.request().url(), dns);
      if (!reason) return route.continue();
      blocked.push(`${new URL(route.request().url()).host}: ${reason}`);
      return route.abort("blockedbyclient");
    });
    page = await context.newPage();
    for (const [i, ins] of instructions.entries()) {
      const t0 = Date.now();
      try {
        const res = await execute(ins, page, context, state);
        page = res.page;
        log.push({ n: i + 1, line: ins.source, ok: true, detail: res.detail, ms: Date.now() - t0 });
      } catch (e) {
        status = "FAILED";
        const message = blocked.length && /ERR_BLOCKED_BY_CLIENT/.test(String(e?.message)) ? `Blocked request to ${blocked[0]}` : String(e?.message ?? e).split("\n")[0].slice(0, 300);
        log.push({ n: i + 1, line: ins.source, ok: false, detail: message, ms: Date.now() - t0 });
        screenshot = await page.screenshot({ type: "png" }).catch(() => null);
        break;
      }
    }
    const finalUrl = page.url();
    if (!headless) await page.waitForTimeout(HOLD_OPEN_MS).catch(() => {});
    return { status, log, finalUrl, screenshot };
  } catch (e) {
    // Browser failed to start (e.g. Chromium not installed) or was killed by the overall cap.
    const message = String(e?.message ?? e).split("\n")[0].slice(0, 300);
    log.push({ n: log.length + 1, line: "Browser", ok: false, detail: message, ms: 0 });
    return { status: "FAILED", log, finalUrl: page?.url?.() ?? null, screenshot, infra: true };
  } finally {
    clearTimeout(killer.id);
    await browser?.close().catch(() => {});
    g.__qaBrowserBusy = false;
  }
}
