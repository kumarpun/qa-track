import { test, expect } from "@playwright/test";

const PASSWORD = "Passw0rd!demo";

async function login(page, email) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/");
}

test("signed-out users are redirected to login", async ({ page }) => {
  await page.goto("/projects");
  await expect(page).toHaveURL(/\/login/);
});

test("wrong password shows a generic error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("lead@example.com");
  await page.getByLabel("Password").fill("nope-nope-1");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("QA lead signs in, creates a project and sees it in the switcher", async ({ page }) => {
  await login(page, "lead@example.com");
  const key = "E" + Math.random().toString(36).slice(2, 7).toUpperCase();
  await page.goto("/projects/new");
  await page.getByLabel("Name").fill(`E2E ${key}`);
  await page.getByLabel("Key").fill(key);
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { name: new RegExp(`${key} · E2E`) })).toBeVisible();
  await expect(page.getByRole("button", { name: "Switch project" })).toContainText(key);
});

test("viewer cannot create projects or see user admin", async ({ page }) => {
  await login(page, "viewer@example.com");
  // notFound() streams after loading.js, so assert on the rendered 404 rather than the HTTP status.
  for (const path of ["/projects/new", "/users"]) {
    await page.goto(path);
    await expect(page.getByText("This page could not be found")).toBeVisible();
  }
});

test("viewer cannot see a project they are not a member of", async ({ page, request }) => {
  await login(page, "viewer@example.com");
  await page.goto("/projects");
  await expect(page.getByRole("link", { name: "Mobile App" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Web Portal" })).toHaveCount(0);
});
