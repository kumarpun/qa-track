import { test, expect } from "@playwright/test";

const PASSWORD = "Passw0rd!demo";

async function login(page, email) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
}

const uniq = () => Math.random().toString(36).slice(2, 8);

async function createCase(page, title) {
  await page.goto("/test-cases/new");
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel("Action").first().fill("Do the thing");
  await page.getByLabel("Expected result").first().fill("Thing is done");
  await page.getByRole("button", { name: "Create test case" }).click();
  await expect(page.getByRole("heading", { name: new RegExp(title) })).toBeVisible();
  return page.url();
}

test("suite: add + reorder cases, then run snapshot stays on v1 after the case is edited", async ({ page }) => {
  test.setTimeout(120_000); // long journey against a remote DB
  await login(page, "lead@example.com");
  const id = uniq();
  const titleA = `Suite case A ${id}`;
  const titleB = `Suite case B ${id}`;
  const urlA = await createCase(page, titleA);
  await createCase(page, titleB);

  const suiteName = `Suite ${id}`;
  await page.goto("/test-suites/new");
  await page.getByLabel("Name", { exact: true }).fill(suiteName);
  await page.getByRole("button", { name: "Create suite" }).click();
  await expect(page.getByRole("heading", { name: suiteName })).toBeVisible();

  await page.getByRole("button", { name: "Add test cases" }).click();
  await page.getByLabel("Search cases to add").fill(id);
  await page.getByLabel(new RegExp(titleA)).check();
  await page.getByLabel(new RegExp(titleB)).check();
  await page.getByRole("button", { name: /Add 2 selected/ }).click();
  const rows = page.getByTestId("suite-case");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText(titleA);

  // Reorder: move A down → B first.
  await rows.first().getByRole("button", { name: /Move .* down/ }).click();
  await expect(rows.first()).toContainText(titleB);
  await page.reload();
  await expect(page.getByTestId("suite-case").first()).toContainText(titleB);
  const suiteUrl = page.url();

  // Create a run from the suite.
  await page.getByRole("link", { name: "Create run" }).click();
  await expect(page.getByRole("heading", { name: "New test run" })).toBeVisible();
  await expect(page.getByLabel(new RegExp(`^${suiteName}`))).toBeChecked();
  await page.getByLabel("Name", { exact: true }).fill(`Run ${id}`);
  await page.getByRole("button", { name: "Create run" }).click();
  await expect(page.getByRole("heading", { name: new RegExp(`RUN-[A-Z0-9]+-\\d{4} · Run ${id}`) })).toBeVisible();
  await expect(page.getByTestId("run-case")).toHaveCount(2);
  await expect(page.getByTestId("count-NOT_RUN")).toHaveText("2");
  await expect(page.getByTestId("run-case").first()).toContainText("v1");
  const runUrl = page.url();

  // Edit case A → v2; the run keeps v1 content.
  await page.goto(`${urlA}/edit`);
  await page.getByLabel("Title", { exact: true }).fill(`${titleA} edited`);
  await page.getByLabel("Change note").fill("changed");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(/^Version 2 ·/)).toBeVisible();

  await page.goto(runUrl);
  const run = page.getByTestId("run-case");
  await expect(run.filter({ hasText: titleA }).first()).toContainText("v1");
  await expect(run.filter({ hasText: `${titleA} edited` })).toHaveCount(0);

  // Run shows in the list.
  await page.goto("/test-runs");
  await page.getByPlaceholder("Search name or code…").fill(`Run ${id}`);
  await expect(page.getByTestId("run-row")).toHaveCount(1);

  // Archive the suite; it can no longer be edited.
  await page.goto(suiteUrl);
  await page.getByRole("button", { name: "Archive" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Archive" }).click();
  await expect(page.getByText(/This suite is archived/)).toBeVisible();
});

test("run creation requires a scope", async ({ page }) => {
  await login(page, "lead@example.com");
  await page.goto("/test-runs/new");
  await page.getByLabel("Name", { exact: true }).fill(`Empty ${uniq()}`);
  await page.getByRole("button", { name: "Create run" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /at least one suite or test case/i })).toBeVisible();
});

test("QA engineer cannot create runs; viewer is read-only; unknown ids 404", async ({ page }) => {
  await login(page, "qa1@example.com");
  await page.goto("/test-runs");
  await expect(page.getByRole("link", { name: "New run" })).toHaveCount(0);
  await page.goto("/test-runs/new");
  await expect(page.getByText("This page could not be found")).toBeVisible();
  await page.goto("/test-suites/00000000-0000-4000-8000-000000000000");
  await expect(page.getByText("This page could not be found")).toBeVisible();
  await page.goto("/test-runs/00000000-0000-4000-8000-000000000000");
  await expect(page.getByText("This page could not be found")).toBeVisible();

  await page.context().clearCookies();
  await login(page, "viewer@example.com");
  await page.goto("/test-suites");
  await expect(page.getByRole("link", { name: "New suite" })).toHaveCount(0);
  await page.goto("/test-suites/new");
  await expect(page.getByText("This page could not be found")).toBeVisible();
  await page.goto("/test-runs/new");
  await expect(page.getByText("This page could not be found")).toBeVisible();
});
