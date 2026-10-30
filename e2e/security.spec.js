import { test, expect } from "@playwright/test";

const PASSWORD = "Passw0rd!demo";

async function login(page, email, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

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
