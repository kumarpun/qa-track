import { test, expect } from "@playwright/test";

const PASSWORD = "Passw0rd!demo";

async function login(page, email, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("audit log: lead and admin can read it, qa engineer and viewer get 404 and no nav link", async ({ browser }) => {
  for (const email of ["qa1@example.com", "viewer@example.com"]) {
    const page = await (await browser.newContext()).newPage();
    await login(page, email);
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("link", { name: "Audit Log" })).toHaveCount(0);
    await page.goto("/audit-log");
    await expect(page.getByText("This page could not be found")).toBeVisible();
  }
  for (const email of ["lead@example.com", "admin@example.com"]) {
    const page = await (await browser.newContext()).newPage();
    await login(page, email);
    await expect(page).toHaveURL("/");
    await page.getByRole("link", { name: "Audit Log" }).first().click();
    await expect(page.getByRole("heading", { name: "Audit Log" })).toBeVisible();
    await expect(page.getByTestId("audit-row").first()).toBeVisible();
  }
});

test("admin audit log records sign-in attempts and filters by action", async ({ browser, page }) => {
  await login(page, "admin@example.com");
  await expect(page).toHaveURL("/");
  await page.goto("/audit-log?action=auth.login");
  await expect(page.getByTestId("audit-row").first()).toContainText("auth.login");
  await page.goto("/audit-log?action=zzz.nothing");
  await expect(page.getByText("No entries match your filters")).toBeVisible();
});

test("login locks out after repeated failures, with a generic error before that", async ({ page }) => {
  const email = `lock-${Math.random().toString(36).slice(2, 8)}@example.com`;
  for (let i = 0; i < 5; i++) {
    await login(page, email, "wrong-password-1");
    await expect(page.getByRole("alert").filter({ hasText: "Invalid email or password" })).toBeVisible();
  }
  await login(page, email, "wrong-password-1");
  await expect(page.getByRole("alert").filter({ hasText: /Too many failed attempts/ })).toBeVisible();
  // Lockout is keyed on the submitted email, so other accounts are unaffected.
  await login(page, "viewer@example.com");
  await expect(page).toHaveURL("/");
});

test("security headers are present", async ({ request }) => {
  const res = await request.get("/login");
  expect(res.headers()["x-content-type-options"]).toBe("nosniff");
  expect(res.headers()["x-frame-options"]).toBe("DENY");
  expect(res.headers()["x-powered-by"]).toBeUndefined();
});
