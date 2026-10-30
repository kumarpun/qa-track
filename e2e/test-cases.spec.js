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

test("QA engineer creates a case, edits it in place, and sees the result history", async ({ page }) => {
  await login(page, "qa1@example.com");
  const title = `E2E case ${uniq()}`;
  await page.goto("/test-cases/new");
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel("Test steps", { exact: true }).fill("Do the thing");
  await page.getByLabel("Expected result").fill("Thing is done");
  await page.getByRole("button", { name: "Create test case" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  const url = page.url();

  await page.goto(`${url}/edit`);
  await page.getByLabel("Title", { exact: true }).fill(`${title} (edited)`);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { name: new RegExp(`${title} \\(edited\\)`) })).toBeVisible();
});

test("list search filters by title; delete asks for confirmation and removes the case for good", async ({ page }) => {
  await login(page, "qa1@example.com");
  const title = `Findme ${uniq()}`;
  await page.goto("/test-cases/new");
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel("Test steps", { exact: true }).fill("a");
  await page.getByLabel("Expected result").fill("b");
  await page.getByRole("button", { name: "Create test case" }).click();
  await expect(page.getByRole("heading", { name: new RegExp(title) })).toBeVisible();

  await page.goto("/test-cases");
  await page.getByPlaceholder("Search title or code…").fill(title);
  await expect(page).toHaveURL(/q=Findme/);
  await expect(page.getByRole("link", { name: title })).toBeVisible();
  await expect(page.getByRole("row")).toHaveCount(2); // header + 1 match

  await page.getByRole("link", { name: title }).click();
  await expect(page.getByRole("heading", { name: new RegExp(title) })).toBeVisible();
  const detailUrl = page.url();
  await expect(page.getByRole("button", { name: "Archive" })).toHaveCount(0);

  // Cancel keeps the case.
  await page.getByRole("button", { name: "Delete test case" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("cannot be undone");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("heading", { name: new RegExp(title) })).toBeVisible();

  // Confirm deletes it from the database.
  await page.getByRole("button", { name: "Delete test case" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(/\/test-cases$/);
  await page.goto(detailUrl);
  await expect(page.getByText("This page could not be found")).toBeVisible();

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
  const href = await qa1.locator("tbody tr").first().getByRole("link").first().getAttribute("href");
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

test("bulk delete confirms first; a case that is part of a run cannot be deleted", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page, "lead@example.com");
  const id = uniq();
  const mk = async (name) => {
    await page.goto("/test-cases/new");
    await page.getByLabel("Title", { exact: true }).fill(name);
    await page.getByLabel("Test steps", { exact: true }).fill("a");
    await page.getByLabel("Expected result").fill("b");
    await page.getByRole("button", { name: "Create test case" }).click();
    await expect(page.getByRole("heading", { name: new RegExp(name) })).toBeVisible();
    return page.url();
  };
  const inRun = `Inrun ${id}`;
  const inRunUrl = await mk(inRun);
  await mk(`Bulk ${id} one`);
  await mk(`Bulk ${id} two`);

  await page.goto("/test-runs/new");
  await page.getByLabel("Name", { exact: true }).fill(`Del run ${id}`);
  await page.getByLabel("Filter test cases").fill(id);
  await page.getByLabel(new RegExp(inRun)).check();
  await page.getByRole("button", { name: "Create run" }).click();
  await expect(page.getByRole("heading", { name: new RegExp(`Del run ${id}`) })).toBeVisible();

  // Single delete of a case used in a run is refused and the case stays.
  await page.goto(inRunUrl);
  await page.getByRole("button", { name: "Delete test case" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText(/Cannot delete: used in test runs that are not completed/).first()).toBeVisible();
  await page.goto(inRunUrl);
  await expect(page.getByRole("heading", { name: new RegExp(inRun) })).toBeVisible();

  // Once the run is completed the case can be deleted; the run keeps its snapshot.
  await page.goto("/test-runs");
  await page.getByRole("link", { name: new RegExp(`Del run ${id}`) }).first().click();
  await page.waitForURL(/\/test-runs\/[0-9a-f-]{36}/);
  const runUrl = page.url();
  await page.getByRole("button", { name: "Complete run" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Complete run" }).click();
  await expect(page.getByRole("button", { name: "Reopen run" })).toBeVisible();
  await page.goto(inRunUrl);
  await page.getByRole("button", { name: "Delete test case" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(/\/test-cases(\?|$)/);
  await page.goto(runUrl);
  await expect(page.getByText(inRun).first()).toBeVisible();

  // Bulk delete the two unused cases.
  await page.goto(`/test-cases?q=${encodeURIComponent(`Bulk ${id}`)}`);
  await page.getByLabel("Select all on page").check();
  await page.getByRole("button", { name: "Delete selected" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Delete 2 test case(s) permanently?");
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("No test cases match your filters")).toBeVisible();
});

test("list works as a checklist: result is changed from the table and persists", async ({ page }) => {
  await login(page, "qa1@example.com");
  const title = `Check ${uniq()}`;
  await page.goto("/test-cases/new");
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel("Test steps", { exact: true }).fill("a");
  await page.getByLabel("Expected result").fill("b");
  await page.getByRole("button", { name: "Create test case" }).click();
  await expect(page.getByRole("heading", { name: new RegExp(title) })).toBeVisible();

  await page.goto(`/test-cases?q=${encodeURIComponent(title)}`);
  const result = page.getByRole("combobox", { name: /^Result for/ });
  await expect(result).toHaveValue("NOT_EXECUTED");
  await page.waitForLoadState("networkidle");
  const saved = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/test-cases"));
  await result.selectOption("PASSED");
  await saved;
  await expect(result).toHaveValue("PASSED");
  await expect(result).toBeEnabled();

  await page.reload();
  await expect(page.getByRole("combobox", { name: /^Result for/ })).toHaveValue("PASSED");
});

test("viewer sees results in the list but cannot change them", async ({ page }) => {
  await login(page, "viewer@example.com");
  await page.goto("/test-cases");
  await expect(page.getByRole("columnheader", { name: "Results" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: /^Result for/ })).toHaveCount(0);
});

test("dragging the fill handle copies a result down the column", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page, "qa1@example.com");
  const id = uniq();
  for (const n of ["a", "b", "c"]) {
    await page.goto("/test-cases/new");
    await page.getByLabel("Title", { exact: true }).fill(`Fill ${id} ${n}`);
    await page.getByLabel("Test steps", { exact: true }).fill("x");
    await page.getByLabel("Expected result").fill("y");
    await page.getByRole("button", { name: "Create test case" }).click();
    await expect(page.getByRole("heading", { name: new RegExp(`Fill ${id}`) })).toBeVisible();
  }
  await page.goto(`/test-cases?q=${id}&sort=title&dir=asc`);
  await page.waitForLoadState("networkidle");
  const results = page.getByRole("combobox", { name: /^Result for/ });
  await expect(results).toHaveCount(3);
  const saved = page.waitForResponse((r) => r.request().method() === "POST");
  await results.first().selectOption("PASSED");
  await saved;
  await expect(results.first()).toBeEnabled();

  const cell = (i) => page.locator("[data-fill-group=cases]").nth(i);
  const from = await cell(0).boundingBox();
  const to = await cell(2).boundingBox();
  await cell(0).hover();
  await page.mouse.move(from.x + from.width - 4, from.y + from.height - 4);
  await page.mouse.down();
  await page.mouse.move(to.x + 20, to.y + to.height / 2, { steps: 8 });
  const filled = page.waitForResponse((r) => r.request().method() === "POST");
  await page.mouse.up();
  await filled;
  await expect(results.nth(1)).toHaveValue("PASSED");
  await expect(results.nth(2)).toHaveValue("PASSED");
});

test("Run in browser executes keyword steps against a real page, sets status and logs the run", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page, "qa1@example.com");
  const base = new URL(page.url()).origin;
  const create = async (title, steps, expected) => {
    await page.goto("/test-cases/new");
    await page.getByLabel("Title", { exact: true }).fill(title);
    await page.getByLabel("Test steps", { exact: true }).fill(steps);
    await page.getByLabel("Expected result").fill(expected);
    await page.getByRole("button", { name: "Create test case" }).click();
    await expect(page.getByRole("heading", { name: new RegExp(title) })).toBeVisible();
  };

  // Passing case: points at this app's own login page.
  const pass = `Browser pass ${uniq()}`;
  await create(pass, `1. Visit: ${base}/login\n2. Text should present: Sign in\n3. Click Sign in`, `Should naviagte to url: ${base}/login`);
  await page.getByRole("button", { name: "Run in browser" }).click();
  const card = page.getByTestId("auto-run");
  await expect(card).toHaveCount(1, { timeout: 60_000 });
  await expect(card).toContainText("Pass"); // header always shown
  await expect(card.getByRole("list")).toHaveCount(0); // step log collapsed by default
  await card.getByRole("button", { name: "Browser run details" }).click();
  await expect(card.getByRole("listitem").first()).toBeVisible();
  await card.getByRole("button", { name: "Browser run details" }).click();
  await expect(card.getByRole("list")).toHaveCount(0);
  await page.getByRole("button", { name: /Result history/ }).click(); // collapsed by default
  await expect(page.getByTestId("result-history")).toContainText("Browser run");

  // Failing case: text that is not on the page → Failed with a screenshot.
  const fail = `Browser fail ${uniq()}`;
  await create(fail, `Visit ${base}/login\nText should present: this text does not exist anywhere`, "Should see Sign in");
  await page.getByRole("button", { name: "Run in browser" }).click();
  await expect(page.getByTestId("auto-run")).toHaveCount(1, { timeout: 60_000 });
  await expect(page.getByTestId("auto-run").first()).toContainText("Fail");
  await page.getByRole("button", { name: "Browser run details" }).click();
  await expect(page.getByAltText("Screenshot at the failed step")).toBeVisible();

  // Unsupported wording is refused before any browser opens, and the status is untouched.
  const bad = `Browser bad ${uniq()}`;
  await create(bad, "Do the thing", "Thing is done");
  await page.getByRole("button", { name: "Run in browser" }).click();
  await expect(page.getByText(/Cannot run in a browser/).first()).toBeVisible();
  await expect(page.getByTestId("auto-run")).toHaveCount(0);

  // Viewers never get the button.
  await page.context().clearCookies();
  await login(page, "viewer@example.com");
  await page.goto(`/test-cases?q=${encodeURIComponent(pass)}`);
  await page.getByRole("link", { name: pass }).click();
  await expect(page.getByRole("button", { name: "Run in browser" })).toHaveCount(0);
});

test("suite list runs a suite in the browser from its row icon; bulk button is shown; viewers get neither", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page, "qa1@example.com");
  const base = new URL(page.url()).origin;
  const id = uniq();
  const title = `Suite list run ${id}`;
  await page.goto("/test-cases/new");
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel("Test steps", { exact: true }).fill(`Visit: ${base}/login\nText should present: Sign in`);
  await page.getByLabel("Expected result").fill("Should see Sign in");
  await page.getByRole("button", { name: "Create test case" }).click();
  await expect(page.getByRole("heading", { name: new RegExp(title) })).toBeVisible();

  const suiteName = `Run suite ${id}`;
  await page.goto("/test-suites/new");
  await page.getByLabel("Name", { exact: true }).fill(suiteName);
  await page.getByRole("button", { name: "Create suite" }).click();
  await expect(page.getByRole("heading", { name: suiteName })).toBeVisible();
  await page.getByRole("button", { name: "Add test cases" }).click();
  await page.getByLabel("Search cases to add").fill(id);
  await page.getByLabel(new RegExp(title)).check();
  await page.getByRole("button", { name: /Add 1 selected/ }).click();
  await expect(page.getByTestId("suite-case")).toHaveCount(1);

  await page.goto("/test-suites");
  await expect(page.getByRole("button", { name: "Run all in browser" })).toBeVisible();
  await page.waitForLoadState("networkidle"); // let React hydrate before clicking
  await page.getByRole("button", { name: `Run suite ${suiteName} in browser` }).click();
  await expect(page.locator("[data-sonner-toast]").first()).toHaveText(/All 1 cases passed\./, { timeout: 60_000 });

  await page.context().clearCookies();
  await login(page, "viewer@example.com");
  await page.goto("/test-suites");
  await expect(page.getByRole("button", { name: "Run all in browser" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Run suite .* in browser$/ })).toHaveCount(0);
});

test("case list has no Assignee/Tags columns and runs a case in the browser from its row icon; viewers get none", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page, "qa1@example.com");
  const base = new URL(page.url()).origin;
  const id = uniq();
  const title = `List run ${id}`;
  await page.goto("/test-cases/new");
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel("Test steps", { exact: true }).fill(`Visit: ${base}/login\nText should present: Sign in`);
  await page.getByLabel("Expected result").fill("Should see Sign in");
  await page.getByRole("button", { name: "Create test case" }).click();
  await expect(page.getByRole("heading", { name: new RegExp(title) })).toBeVisible();

  await page.goto(`/test-cases?q=${id}`);
  await expect(page.getByRole("columnheader", { name: "Assignee" })).toHaveCount(0);
  await expect(page.getByRole("columnheader", { name: "Tags" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Run all in browser" })).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /^Run .* in browser$/ }).filter({ hasNotText: "all" }).first().click();
  await expect(page.locator("[data-sonner-toast]").first()).toHaveText(/Case passed\./, { timeout: 60_000 });

  await page.context().clearCookies();
  await login(page, "viewer@example.com");
  await page.goto("/test-cases");
  await expect(page.getByRole("button", { name: "Run all in browser" })).toHaveCount(0);
});

test("test steps box continues numbering on Enter and ends the list on a second Enter", async ({ page }) => {
  await login(page, "qa1@example.com");
  await page.goto("/test-cases/new");
  await page.waitForLoadState("networkidle");
  const steps = page.getByLabel("Test steps", { exact: true });
  await steps.click();
  await page.keyboard.type("1. open");
  await page.keyboard.press("Enter");
  await expect(steps).toHaveValue("1. open\n2. ");
  await page.keyboard.type("click");
  await page.keyboard.press("Enter");
  await expect(steps).toHaveValue("1. open\n2. click\n3. ");
  await page.keyboard.press("Enter");
  await expect(steps).toHaveValue("1. open\n2. click\n");
  await page.keyboard.type("plain");
  await expect(steps).toHaveValue("1. open\n2. click\nplain");
});
