import "server-only";
import { chromium } from "@playwright/test";
import { looseSource, sameUrl } from "@/lib/automation/parse-steps";
import { requestBlockedReason } from "./url-guard";

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
    case "type": {
      const el = await findField(page, ins.field);
      await el.fill(ins.value, { timeout: STEP_TIMEOUT });
      return { page, detail: `filled "${ins.field}"` };
    }
    case "seeText": {
      const want = norm(ins.text);
      await page.waitForFunction((t) => document.body.innerText.replace(/\s+/g, " ").toLowerCase().includes(t), want, { timeout: STEP_TIMEOUT });
      return { page, detail: "text found" };
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
    browser = await chromium.launch({ headless, slowMo: headless ? 0 : SLOW_MO_MS, args: ["--disable-dev-shm-usage", "--disable-extensions", "--disable-background-networking"] });
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
