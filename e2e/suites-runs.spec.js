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
  return page.url();
}

test("suite: add + reorder cases, then the run keeps its frozen copy after the case is edited", async ({ page }) => {
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
  const runUrl = page.url();

  // Edit case A in place; the run keeps the content it was created with.
  await page.goto(`${urlA}/edit`);
  await page.getByLabel("Title", { exact: true }).fill(`${titleA} edited`);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { name: `${titleA} edited` })).toBeVisible();

  await page.goto(runUrl);
  const run = page.getByTestId("run-case");
  await expect(run.filter({ hasText: titleA }).first()).toBeVisible();
  await expect(run.filter({ hasText: `${titleA} edited` })).toHaveCount(0);

  // Run shows in the list.
  await page.goto("/test-runs");
  await page.getByPlaceholder("Search name or code…").fill(`Run ${id}`);
  await expect(page.getByTestId("run-row")).toHaveCount(1);

  // No archive feature any more; the suite is hard-deleted. Refused while its cases sit in an unfinished run.
  await page.goto(suiteUrl);
  await expect(page.getByRole("button", { name: "Archive" })).toHaveCount(0);
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete suite and cases" }).click();
  await expect(page.getByText(/Cannot delete: used in test runs that are not completed/).first()).toBeVisible();

  // Once the run is completed the suite (and its cases) can be deleted; the run keeps its snapshots.
  await page.goto(runUrl);
  await page.getByRole("button", { name: "Complete run" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Complete run" }).click();
  await expect(page.getByRole("button", { name: "Reopen run" })).toBeVisible();
  await page.goto(suiteUrl);
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete suite and cases" }).click();
  await expect(page).toHaveURL(/\/test-suites$/);
  await page.goto(runUrl);
  await expect(page.getByTestId("run-case")).toHaveCount(2);
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

test("a suite and a run from another project cannot be opened by someone who is not a member", async ({ browser }) => {
  test.setTimeout(120_000);
  // lead belongs to APP and WEB; qa2 belongs to APP only.
  const lead = await (await browser.newContext()).newPage();
  await login(lead, "lead@example.com");
  await lead.goto("/projects");
  await lead.getByRole("button", { name: "Switch project" }).click();
  await lead.getByRole("menuitem", { name: /^WEB/ }).click();
  await expect(lead.getByRole("button", { name: "Switch project" })).toContainText("WEB");

  const id = uniq();
  await lead.goto("/test-suites/new");
  await lead.getByLabel("Name", { exact: true }).fill(`Iso suite ${id}`);
  await lead.getByRole("button", { name: "Create suite" }).click();
  await expect(lead.getByRole("heading", { name: `Iso suite ${id}` })).toBeVisible();
  const suiteUrl = lead.url();

  await lead.goto("/test-runs/new");
  await lead.getByLabel("Name", { exact: true }).fill(`Iso run ${id}`);
  await lead.getByLabel(new RegExp("^TC-WEB-0001")).check();
  await lead.getByRole("button", { name: "Create run" }).click();
  await expect(lead.getByRole("heading", { name: new RegExp(`Iso run ${id}`) })).toBeVisible();
  const runUrl = lead.url();

  const qa2 = await (await browser.newContext()).newPage();
  await login(qa2, "qa2@example.com");
  for (const url of [suiteUrl, `${suiteUrl}/edit`, runUrl]) {
    await qa2.goto(url);
    await expect(qa2.getByText("This page could not be found")).toBeVisible();
  }
});

test("suite table: setting a result updates all its cases; one failed case fails the suite", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page, "lead@example.com");
  const id = uniq();
  const titleA = `Sres A ${id}`;
  const titleB = `Sres B ${id}`;
  await createCase(page, titleA);
  await createCase(page, titleB);
  const suiteName = `Sres ${id}`;
  await page.goto("/test-suites/new");
  await page.getByLabel("Name", { exact: true }).fill(suiteName);
  await page.getByRole("button", { name: "Create suite" }).click();
  await expect(page.getByRole("heading", { name: suiteName })).toBeVisible();
  await page.getByRole("button", { name: "Add test cases" }).click();
  await page.getByLabel("Search cases to add").fill(id);
  await page.getByLabel(new RegExp(titleA)).check();
  await page.getByLabel(new RegExp(titleB)).check();
  await page.getByRole("button", { name: /Add 2 selected/ }).click();
  await expect(page.getByTestId("suite-case")).toHaveCount(2);
  // Each case can be marked from the suite page too.
  await page.waitForLoadState("networkidle");
  const one = page.waitForResponse((r) => r.request().method() === "POST");
  await page.getByRole("combobox", { name: /^Result for TC-/ }).first().selectOption("BLOCKED");
  await one;
  await expect(page.getByRole("combobox", { name: /^Result for TC-/ }).first()).toHaveValue("BLOCKED");

  await page.goto("/test-suites");
  await page.waitForLoadState("networkidle");
  const suiteResult = page.getByRole("combobox", { name: `Result for suite ${suiteName}` });
  await expect(suiteResult).toHaveValue("BLOCKED"); // one blocked case set from the suite page
  const saved = page.waitForResponse((r) => r.request().method() === "POST");
  await suiteResult.selectOption("PASSED");
  await saved;
  await expect(page.getByText("Updated 2 of 2 test case(s)")).toBeVisible();

  await page.goto(`/test-cases?q=${id}`);
  const results = page.getByRole("combobox", { name: /^Result for/ });
  await expect(results).toHaveCount(2);
  await expect(results.first()).toHaveValue("PASSED");
  await expect(results.nth(1)).toHaveValue("PASSED");

  // One failing case makes the suite fail.
  await page.waitForLoadState("networkidle");
  const failed = page.waitForResponse((r) => r.request().method() === "POST");
  await results.first().selectOption("FAILED");
  await failed;
  await page.goto("/test-suites");
  await expect(page.getByRole("combobox", { name: `Result for suite ${suiteName}` })).toHaveValue("FAILED");
});

test("suite page: New test case opens the case form and adds the case to that suite", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page, "lead@example.com");
  const id = uniq();
  const suiteName = `Snew ${id}`;
  await page.goto("/test-suites/new");
  await page.getByLabel("Name", { exact: true }).fill(suiteName);
  await page.getByRole("button", { name: "Create suite" }).click();
  await expect(page.getByRole("heading", { name: suiteName })).toBeVisible();
  const suiteUrl = page.url();
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: "New test case" }).click();
  await expect(page).toHaveURL(/\/test-cases\/new\?suite=/);
  const title = `Inline case ${id}`;
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel("Test steps", { exact: true }).fill("Open the page");
  await page.getByLabel("Expected result").fill("Page opens");
  await page.getByRole("button", { name: "Create test case" }).click();

  await expect(page).toHaveURL(suiteUrl);
  await expect(page.getByTestId("suite-case")).toHaveCount(1);
  await expect(page.getByTestId("suite-case")).toContainText(title);
});

test("QA lead can delete a run; it disappears from the list", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page, "lead@example.com");
  const id = uniq();
  const title = `Del case ${id}`;
  await createCase(page, title);
  await page.goto("/test-runs/new");
  await page.getByLabel("Name", { exact: true }).fill(`Del run ${id}`);
  await page.getByLabel(new RegExp(title)).check();
  await page.getByRole("button", { name: "Create run" }).click();
  await expect(page.getByRole("heading", { name: new RegExp(`Del run ${id}`) })).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete run" }).click();
  await expect(page).toHaveURL(/\/test-runs$/);
  await page.getByPlaceholder("Search name or code…").fill(`Del run ${id}`);
  await expect(page.getByTestId("run-row")).toHaveCount(0);
});

test("QA lead can delete a run from the run list", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page, "lead@example.com");
  const id = uniq();
  const title = `Dellist case ${id}`;
  await createCase(page, title);
  await page.goto("/test-runs/new");
  await page.getByLabel("Name", { exact: true }).fill(`Dellist run ${id}`);
  await page.getByLabel(new RegExp(title)).check();
  await page.getByRole("button", { name: "Create run" }).click();
  await expect(page.getByRole("heading", { name: new RegExp(`Dellist run ${id}`) })).toBeVisible();
  await page.goto("/test-runs");
  await page.getByPlaceholder("Search name or code…").fill(`Dellist run ${id}`);
  await expect(page.getByTestId("run-row")).toHaveCount(1);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /^Delete RUN-/ }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete run" }).click();
  await expect(page.getByTestId("run-row")).toHaveCount(0);
});
