import { test, expect } from "@playwright/test";

const PASSWORD = "Passw0rd1x";

async function signUp(page, tag) {
  const email = `${tag}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Company name").fill(`Co ${tag}`);
  await page.getByLabel("Your name").fill(`Owner ${tag}`);
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirm password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  return email;
}

test("two companies sign up and cannot see each other's projects or users", async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  const emailA = await signUp(a, "a");
  await signUp(b, "b");

  // A creates a project.
  const key = `T${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  await a.goto("/projects/new");
  await a.getByLabel("Name").fill(`Tenant ${key}`);
  await a.getByLabel("Key").fill(key);
  await a.getByRole("button", { name: "Create project" }).click();
  await expect(a.getByRole("heading", { name: new RegExp(`${key} · Tenant`) })).toBeVisible();
  const url = a.url();

  // B: not in list, direct URL 404 even though B is an ADMIN.
  await b.goto("/projects");
  await expect(b.getByText(`Tenant ${key}`)).toHaveCount(0);
  await b.goto(url);
  await expect(b.getByText("This page could not be found")).toBeVisible();

  // B's user list shows only B's company; seeded demo company and A are absent.
  await b.goto("/users");
  await expect(b.getByText(emailA)).toHaveCount(0);
  await expect(b.getByText("admin@example.com")).toHaveCount(0);

  // The same key is free in another company.
  await b.goto("/projects/new");
  await b.getByLabel("Name").fill(`Tenant ${key}`);
  await b.getByLabel("Key").fill(key);
  await b.getByRole("button", { name: "Create project" }).click();
  await expect(b.getByRole("heading", { name: new RegExp(`${key} · Tenant`) })).toBeVisible();

  // Duplicate email is rejected.
  const c = await (await browser.newContext()).newPage();
  await c.goto("/signup");
  await c.getByLabel("Company name").fill("Dup");
  await c.getByLabel("Your name").fill("Dup");
  await c.getByLabel("Work email").fill(emailA);
  await c.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await c.getByLabel("Confirm password").fill(PASSWORD);
  await c.getByRole("button", { name: "Create account" }).click();
  await expect(c.getByText("Already registered")).toBeVisible();
});

test("demo company admin does not see signed-up company projects", async ({ page, browser }) => {
  const p = await (await browser.newContext()).newPage();
  await signUp(p, "iso");
  await page.goto("/login");
  await page.getByLabel("Email").fill("admin@example.com");
  await page.getByLabel("Password").fill("Passw0rd!demo");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/");
  await page.goto("/users");
  await expect(page.getByText(/^iso-/)).toHaveCount(0);
});
