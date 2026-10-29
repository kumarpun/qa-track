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
  await page.getByLabel("Test steps", { exact: true }).fill("Do the thing");
  await page.getByLabel("Expected result").fill("Thing is done");
  await page.getByRole("button", { name: "Create test case" }).click();
  await expect(page.getByRole("heading", { name: new RegExp(title) })).toBeVisible();
}

async function createRun(page, id, caseTitle) {
  await page.goto("/test-runs/new");
  await page.getByLabel("Name", { exact: true }).fill(`Exec run ${id}`);
  await page.getByLabel("Filter test cases").fill(id);
  await page.getByLabel(new RegExp(caseTitle)).check();
  await page.getByRole("button", { name: "Create run" }).click();
  await expect(page.getByRole("heading", { name: new RegExp(`Exec run ${id}`) })).toBeVisible();
  return page.url();
}

// Click the visible label: the real radio is sr-only, so a forced click on it can hit whatever overlaps its position.
async function pick(page, name) {
  const radio = page.getByRole("radio", { name, exact: true });
  await page.locator("label").filter({ has: radio }).click();
  await expect(radio).toBeChecked();
}

test("execute Passed → Failed → Retest → Passed keeps history, attachments, defects, counts", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page, "lead@example.com");
  const id = uniq();
  const title = `Exec case ${id}`;
  await createCase(page, title);
  const runUrl = await createRun(page, id, title);
  await expect(page.getByText("Draft", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: title }).click();
  await expect(page).toHaveURL(/\/cases\//);
  await expect(page.getByTestId("snapshot-step")).toHaveCount(1);
  const caseUrl = page.url();

  // Failed requires an actual result.
  await pick(page, "Failed");
  await page.getByRole("button", { name: "Save result" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /actual result is required/i })).toBeVisible();

  // Failed with actual result + new defect + attachment + comment.
  await page.locator("#actualResult").fill("Server returned 500");
  await page.getByRole("button", { name: "Report new defect" }).click();
  await page.getByLabel("Defect title").fill(`Crash ${id}`);
  await page.getByLabel("External URL").fill("https://tracker.example.com/BUG-1");
  await page.getByRole("button", { name: "Create defect" }).click();
  await expect(page.getByLabel(new RegExp(`Crash ${id}`))).toBeChecked();
  await page.locator("#files").setInputFiles({ name: "evidence.txt", mimeType: "text/plain", buffer: Buffer.from("stack trace here") });
  await page.getByRole("button", { name: "Save result" }).click();
  const ex = page.getByTestId("execution");
  await expect(ex).toHaveCount(1);
  await expect(ex.first()).toContainText("Failed");
  await expect(ex.first().getByTestId("exec-defect")).toContainText(`Crash ${id}`);
  await expect(ex.first().getByTestId("attachment")).toContainText("evidence.txt");

  const href = await ex.first().getByTestId("attachment").getByRole("link").getAttribute("href");
  const dl = await page.request.get(href);
  expect(dl.status()).toBe(200);
  expect(await dl.text()).toBe("stack trace here");
  expect(dl.headers()["content-disposition"]).toContain("attachment");
  expect(dl.headers()["x-content-type-options"]).toBe("nosniff");

  await page.getByLabel("Add a comment").fill("Reproduced twice");
  await page.getByRole("button", { name: "Post comment" }).click();
  await expect(page.getByTestId("comment")).toContainText("Reproduced twice");

  // Retest: pending, pass rate stays 0.
  await pick(page, "Retest");
  await page.getByRole("button", { name: "Save result" }).click();
  await expect(page.getByTestId("execution")).toHaveCount(2);
  await page.goto(runUrl);
  await expect(page.getByTestId("count-RETEST")).toHaveText("1");
  await expect(page.getByTestId("count-PASSED")).toHaveText("0");
  await expect(page.getByText(/Pass rate 0%/)).toBeVisible();
  await expect(page.getByText("In progress", { exact: true })).toBeVisible();

  // Passed: history keeps all three, newest first.
  await page.goto(caseUrl);
  await pick(page, "Passed");
  await page.getByRole("button", { name: "Save result" }).click();
  await expect(page.getByTestId("execution")).toHaveCount(3);
  await expect(page.getByTestId("execution").first()).toContainText("Passed");
  await expect(page.getByTestId("execution").last()).toContainText("Failed");
  await page.goto(runUrl);
  await expect(page.getByTestId("count-PASSED")).toHaveText("1");
  await expect(page.getByText(/Pass rate 100%/)).toBeVisible();

  // Complete → results rejected until reopened.
  await page.getByRole("button", { name: "Complete run" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Complete run" }).click();
  await expect(page.getByRole("button", { name: "Reopen run" })).toBeVisible();
  await page.goto(caseUrl);
  await expect(page.getByText(/Reopen it to record results/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Save result" })).toHaveCount(0);
  await page.goto(runUrl);
  await page.getByRole("button", { name: "Reopen run" }).click();
  await expect(page.getByRole("button", { name: "Complete run" })).toBeVisible();

  // Work queue lists the open run.
  await page.goto("/execution");
  await expect(page.getByTestId("open-run").filter({ hasText: `Exec run ${id}` })).toBeVisible();
});

test("viewer cannot execute; non-member gets 404 on run case and attachment", async ({ browser }) => {
  test.setTimeout(180_000);
  const lead = await (await browser.newContext()).newPage();
  await login(lead, "lead@example.com");
  await lead.getByRole("button", { name: "Switch project" }).click();
  await lead.getByRole("menuitem", { name: /^APP/ }).click();
  await expect(lead.getByRole("button", { name: "Switch project" })).toContainText("APP");
  const id = uniq();
  const title = `Perm case ${id}`;
  await createCase(lead, title);
  const runUrl = await createRun(lead, id, title);
  await lead.getByRole("link", { name: title }).click();
  await expect(lead).toHaveURL(/\/cases\//);
  const caseUrl = lead.url();
  await lead.locator("#files").setInputFiles({ name: "p.txt", mimeType: "text/plain", buffer: Buffer.from("secret") });
  await pick(lead, "Skipped");
  await lead.getByRole("button", { name: "Save result" }).click();
  await expect(lead.getByTestId("attachment")).toHaveCount(1);
  const href = await lead.getByTestId("attachment").getByRole("link").getAttribute("href");

  const viewer = await (await browser.newContext()).newPage();
  await login(viewer, "viewer@example.com");
  await viewer.goto(caseUrl);
  await expect(viewer.getByText(/read-only/)).toBeVisible();
  await expect(viewer.getByRole("button", { name: "Save result" })).toHaveCount(0);
  await viewer.goto(runUrl);
  await expect(viewer.getByRole("button", { name: "Complete run" })).toHaveCount(0);

  // Move the lead to WEB where qa2 is not a member, then qa2 probes the APP-less ids.
  await lead.goto("/projects");
  await lead.getByRole("button", { name: "Switch project" }).click();
  await lead.getByRole("menuitem", { name: /^WEB/ }).click();
  await expect(lead.getByRole("button", { name: "Switch project" })).toContainText("WEB");
  await lead.goto("/test-runs/new");
  await lead.getByLabel("Name", { exact: true }).fill(`Web run ${id}`);
  await lead.getByLabel(new RegExp("^TC-WEB-0001")).check();
  await lead.getByRole("button", { name: "Create run" }).click();
  await expect(lead.getByRole("heading", { name: new RegExp(`Web run ${id}`) })).toBeVisible();
  await lead.locator('a[href*="/cases/"]').first().click();
  await expect(lead).toHaveURL(/\/cases\//);
  await lead.locator("#files").setInputFiles({ name: "w.txt", mimeType: "text/plain", buffer: Buffer.from("web only") });
  await pick(lead, "Passed");
  await lead.getByRole("button", { name: "Save result" }).click();
  await expect(lead.getByTestId("attachment")).toHaveCount(1);
  const webCase = lead.url();
  const webFile = await lead.getByTestId("attachment").getByRole("link").getAttribute("href");

  const qa2 = await (await browser.newContext()).newPage();
  await login(qa2, "qa2@example.com");
  await qa2.goto(webCase);
  await expect(qa2.getByText("This page could not be found")).toBeVisible();
  const res = await qa2.request.get(webFile);
  expect(res.status()).toBe(404);
});
