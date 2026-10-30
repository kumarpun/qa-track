import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { chromium } from "@playwright/test";

vi.mock("server-only", () => ({}));
const { findClickable } = await import("@/lib/server/automation/browser-runner");

const HTML = `
  <nav><a href="#a1">Auditors</a><a href="#g">Groups</a></nav>
  <main><table><tr><td><a href="#auditor">Auditor</a></td></tr><tr><td><a href="#doctor">Doctor</a></td></tr></table></main>
  <footer><a href="#f">Groups</a></footer>`;

let browser, page;
beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
  await page.setContent(HTML);
});
afterAll(() => browser?.close());

const href = async (text, scope) => (await findClickable(page, text, scope)).getAttribute("href");

describe("findClickable", () => {
  it("prefers the exact label over one that merely contains it", async () => {
    expect(await href("Auditor")).toBe("#auditor"); // not the "Auditors" nav link that comes first
  });
  it("still finds a partial label when nothing matches exactly", async () => {
    expect(await href("Audit")).toBe("#a1");
  });
  it("searches the named region first", async () => {
    expect(await href("Groups", "footer")).toBe("#f");
    expect(await href("Groups", "nav")).toBe("#g");
    expect(await href("Auditor", "content")).toBe("#auditor");
  });
  it("falls back to the whole page and names the region when nothing matches", async () => {
    expect(await href("Doctor", "nav")).toBe("#doctor");
    await expect(findClickable(page, "Nope", "nav")).rejects.toThrow('Nothing clickable matches "Nope" in the nav');
  });
});
