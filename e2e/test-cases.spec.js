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

test("QA engineer creates a case, edits it (v2), and sees history + restore", async ({ page }) => {
  await login(page, "qa1@example.com");
  const title = `E2E case ${uniq()}`;
  await page.goto("/test-cases/new");
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel("Action").first().fill("Do the thing");
  await page.getByLabel("Expected result").first().fill("Thing is done");
  await page.getByRole("button", { name: "Create test case" }).click();
  await expect(page.getByRole("heading", { name: new RegExp(`TC-[A-Z0-9]+-\\d{4} · ${title}`) })).toBeVisible();
  await expect(page.getByText(/^Version 1 ·/)).toBeVisible();
  const url = page.url();

  await page.goto(`${url}/edit`);
  await page.getByLabel("Title", { exact: true }).fill(`${title} (edited)`);
  await page.getByLabel("Change note").fill("renamed");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { name: new RegExp(`${title} \\(edited\\)`) })).toBeVisible();
  await expect(page.getByText(/^Version 2 ·/)).toBeVisible();

  const history = page.getByTestId("version-list");
  await expect(history.getByText("v1")).toBeVisible();
  await expect(history.getByText("— renamed")).toBeVisible();

  // Restore v1 → creates v3 with the original title; v1 and v2 stay intact.
  await history.locator("li", { hasText: "v1" }).getByRole("button", { name: "Restore" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Restore" }).click();
  await expect(page.getByRole("heading", { name: new RegExp(`· ${title}$`) })).toBeVisible();
  await expect(page.getByText(/^Version 3 ·/)).toBeVisible();
  await expect(history.locator("li")).toHaveCount(3);
});

test("list search filters by title and archived cases leave the default view", async ({ page }) => {
  await login(page, "qa1@example.com");
  const title = `Findme ${uniq()}`;
  await page.goto("/test-cases/new");
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel("Action").first().fill("a");
  await page.getByLabel("Expected result").first().fill("b");
  await page.getByRole("button", { name: "Create test case" }).click();
  await expect(page.getByRole("heading", { name: new RegExp(title) })).toBeVisible();

  await page.goto("/test-cases");
  await page.getByPlaceholder("Search title or code…").fill(title);
  await expect(page).toHaveURL(/q=Findme/);
  await expect(page.getByRole("link", { name: title })).toBeVisible();
  await expect(page.getByRole("row")).toHaveCount(2); // header + 1 match

  await page.getByRole("link", { name: title }).click();
  await page.getByRole("button", { name: "Archive" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Archive" }).click();
  await expect(page.getByText("This test case is archived")).toBeVisible();

  await page.goto(`/test-cases?q=${encodeURIComponent(title)}`);
  await expect(page.getByText("No test cases match your filters")).toBeVisible();
});

test("viewer can read cases but has no write controls and cannot open write pages", async ({ page }) => {
  await login(page, "viewer@example.com");
  await page.goto("/test-cases");
  await expect(page.getByRole("heading", { name: "Test Cases" })).toBeVisible();
  await expect(page.getByRole("link", { name: "New test case" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Import", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Export CSV" })).toBeVisible();
  for (const path of ["/test-cases/new", "/test-cases/import"]) {
    await page.goto(path);
    await expect(page.getByText("This page could not be found")).toBeVisible();
  }
});

test("a case from another project cannot be opened by someone who is not a member", async ({ browser }) => {
  // qa2 is a member of APP only; WEB cases must be invisible to them even by direct URL.
  const qa1 = await (await browser.newContext()).newPage();
  await login(qa1, "qa1@example.com");
  await qa1.goto("/projects");
  await qa1.getByRole("button", { name: "Switch project" }).click();
  await qa1.getByRole("menuitem", { name: /^WEB/ }).click();
  await expect(qa1.getByRole("button", { name: "Switch project" })).toContainText("WEB");
  await qa1.goto("/test-cases");
  const href = await qa1.getByRole("link", { name: /^TC-WEB-0001$/ }).getAttribute("href");
  expect(href).toMatch(/^\/test-cases\//);

  const qa2 = await (await browser.newContext()).newPage();
  await login(qa2, "qa2@example.com");
  await qa2.goto(href);
  await expect(qa2.getByText("This page could not be found")).toBeVisible();
  await qa2.goto(`${href}/edit`);
  await expect(qa2.getByText("This page could not be found")).toBeVisible();
});

test("CSV import previews errors with line numbers, then imports valid files", async ({ page }) => {
  await login(page, "qa1@example.com");
  await page.goto("/test-cases/import");
  await page.waitForLoadState("networkidle"); // let React hydrate before the file input fires change
  const header = "code,title,description,preconditions,test_data,priority,type,automation,component,tags,requirement_url,assignee_email,step_action,step_data,step_expected";

  await page.getByLabel("CSV file").setInputFiles({
    name: "bad.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(`${header}\n,Bad row,,,,URGENT,,,,,,,step,,expected\n`),
  });
  await expect(page.getByText("Nothing was imported")).toBeVisible();
  await expect(page.getByText(/Line 2/)).toBeVisible();

  const title = `Imported ${uniq()}`;
  await page.getByLabel("CSV file").setInputFiles({
    name: "good.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(`${header}\n,${title},,,,HIGH,SMOKE,MANUAL,,csv;e2e,,,Click,,Works\n,,,,,,,,,,,,Second,,Also works\n`),
  });
  await expect(page.getByText("ready to import")).toBeVisible();
  await page.getByRole("button", { name: "Confirm import" }).click();
  await expect(page).toHaveURL(/\/test-cases$/);
  await page.getByPlaceholder("Search title or code…").fill(title);
  await expect(page).toHaveURL(/q=Imported/);
  await expect(page.getByRole("row")).toHaveCount(2);
  await page.getByRole("link", { name: title }).click();
  await expect(page.getByTestId("step")).toHaveCount(2);
});
