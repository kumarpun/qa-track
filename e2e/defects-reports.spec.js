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

async function pinApp(page) {
  await page.getByRole("button", { name: "Switch project" }).click();
  await page.getByRole("menuitem", { name: /^APP/ }).click();
  await expect(page.getByRole("button", { name: "Switch project" })).toContainText("APP");
}

test("defect CRUD, status, filter, delete rules and CSV export", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page, "lead@example.com");
  await pinApp(page);
  const id = uniq();

  await page.goto("/defects/new");
  await page.getByRole("button", { name: "Create defect" }).click();
  await expect(page.getByText("Title is required")).toBeVisible();
  await page.getByLabel("Title", { exact: true }).fill(`=cmd ${id}`);
  await page.getByLabel("External URL").fill("javascript:alert(1)");
  await page.getByRole("button", { name: "Create defect" }).click();
  await expect(page.getByText(/http\(s\) URL/)).toBeVisible();
  await page.getByLabel("External URL").fill("https://tracker.example.com/BUG-7");
  await page.getByRole("button", { name: "Create defect" }).click();
  await expect(page.getByRole("heading", { name: new RegExp(`DEF-APP-\\d+ · =cmd ${id}`) })).toBeVisible();
  const detail = page.url();
  const link = page.getByTestId("defect-external");
  await expect(link).toHaveAttribute("rel", /noopener/);
  await expect(link).toHaveAttribute("target", "_blank");

  // Edit
  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByLabel("Build version").fill("9.9.9");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("build 9.9.9")).toBeVisible();

  // Status
  await page.getByLabel("Change status").selectOption("CLOSED");
  await expect(page.getByText("Status set to Closed")).toBeVisible();

  // List filter + export
  await page.goto(`/defects?q=${id}&status=CLOSED`);
  await expect(page.getByTestId("defect-row")).toHaveCount(1);
  await page.goto(`/defects?q=${id}&status=OPEN`);
  await expect(page.getByText("No defects match your filters")).toBeVisible();
  await page.goto(`/defects?q=${id}`);
  const href = await page.getByRole("link", { name: /Export CSV/ }).getAttribute("href");
  const res = await page.request.get(href);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/csv");
  expect(res.headers()["content-disposition"]).toContain("attachment");
  const body = await res.text();
  expect(body).toContain(`'=cmd ${id}`); // formula injection neutralised
  expect(body).not.toMatch(new RegExp(`(^|,)=cmd ${id}`, "m"));

  // Delete
  await page.goto(detail);
  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(/\/defects$/);
});

test("one defect links to many executions; linked defect cannot be deleted; reports, print view, viewer read-only", async ({ browser }) => {
  test.setTimeout(240_000);
  const lead = await (await browser.newContext()).newPage();
  await login(lead, "lead@example.com");
  await pinApp(lead);
  const id = uniq();

  for (const n of [1, 2]) {
    await lead.goto("/test-cases/new");
    await lead.getByLabel("Title", { exact: true }).fill(`Defect case ${id} ${n}`);
    await lead.getByLabel("Test steps", { exact: true }).fill("Do");
    await lead.getByLabel("Expected result").fill("Done");
    await lead.getByRole("button", { name: "Create test case" }).click();
    await expect(lead.getByRole("heading", { name: new RegExp(`Defect case ${id} ${n}`) })).toBeVisible();
  }
  await lead.goto("/defects/new");
  await lead.getByLabel("Title", { exact: true }).fill(`Shared ${id}`);
  await lead.getByRole("button", { name: "Create defect" }).click();
  await expect(lead.getByRole("heading", { name: new RegExp(`Shared ${id}`) })).toBeVisible();
  const defectUrl = lead.url();

  await lead.goto("/test-runs/new");
  await lead.getByLabel("Name", { exact: true }).fill(`Defect run ${id}`);
  await lead.getByLabel("Filter test cases").fill(`Defect case ${id}`);
  for (const n of [1, 2]) await lead.getByLabel(new RegExp(`Defect case ${id} ${n}`)).check();
  await lead.getByRole("button", { name: "Create run" }).click();
  await expect(lead.getByRole("heading", { name: new RegExp(`Defect run ${id}`) })).toBeVisible();
  const runUrl = lead.url();

  for (const n of [1, 2]) {
    await lead.goto(runUrl);
    await lead.getByRole("link", { name: `Defect case ${id} ${n}` }).click();
    const radio = lead.getByRole("radio", { name: "Failed", exact: true });
    await lead.locator("label").filter({ has: radio }).click();
    await lead.locator("#actualResult").fill("Broken");
    await lead.getByLabel(new RegExp(`Shared ${id}`)).check();
    await lead.getByRole("button", { name: "Save result" }).click();
    await expect(lead.getByTestId("exec-defect")).toContainText(`Shared ${id}`);
  }

  await lead.goto(defectUrl);
  await expect(lead.getByTestId("defect-execution")).toHaveCount(2);
  await lead.getByRole("button", { name: "Delete" }).click();
  await lead.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(lead.getByText("This defect is linked to test executions and cannot be deleted. Close it instead.")).toBeVisible();
  await lead.keyboard.press("Escape");
  await lead.goto(defectUrl);
  await expect(lead.getByTestId("defect-execution")).toHaveCount(2);

  // Reports: this run shows 2 failed, 0% pass rate.
  await lead.goto("/reports");
  const row = lead.getByTestId("report-run-row").filter({ hasText: `Defect run ${id}` });
  await expect(row).toContainText("0%");
  await expect(lead.getByTestId("rep-defects")).not.toHaveText("0");
  const runsCsv = await lead.request.get(await lead.getByRole("link", { name: "Runs CSV" }).getAttribute("href"));
  expect(runsCsv.status()).toBe(200);
  expect(await runsCsv.text()).toContain(`Defect run ${id}`);

  // Viewer: sees defect, no write controls, may export.
  const viewer = await (await browser.newContext()).newPage();
  await login(viewer, "viewer@example.com");
  await viewer.goto(defectUrl);
  await expect(viewer.getByRole("heading", { name: new RegExp(`Shared ${id}`) })).toBeVisible();
  await expect(viewer.getByRole("link", { name: "Edit" })).toHaveCount(0);
  await expect(viewer.getByLabel("Change status")).toHaveCount(0);
  await expect(viewer.getByRole("button", { name: "Delete" })).toHaveCount(0);

  // Signed-out request to the export endpoint is never served data.
  const anon = await (await browser.newContext()).newPage();
  const r = await anon.request.get("/reports/export?project=00000000-0000-4000-8000-000000000000", { maxRedirects: 0 });
  expect([401, 302, 307, 404]).toContain(r.status());

  // Print view: chrome and action buttons disappear, content is not offset by the sidebar.
  await lead.goto("/reports");
  await lead.emulateMedia({ media: "print" });
  await expect(lead.locator("aside")).toBeHidden();
  await expect(lead.locator("header")).toBeHidden();
  await expect(lead.getByRole("button", { name: "Print view" })).toBeHidden();
  await expect(lead.getByRole("link", { name: "Runs CSV" })).toBeHidden();
  await expect(lead.getByTestId("rep-passrate")).toBeVisible();
  const box = await lead.locator("main").boundingBox();
  expect(box.x).toBeLessThan(5);
});

test("a non-member cannot read, edit or export another project's defects", async ({ browser }) => {
  test.setTimeout(120_000);
  const lead = await (await browser.newContext()).newPage();
  await login(lead, "lead@example.com");
  await lead.getByRole("button", { name: "Switch project" }).click();
  await lead.getByRole("menuitem", { name: /^WEB/ }).click();
  await expect(lead.getByRole("button", { name: "Switch project" })).toContainText("WEB");
  const id = uniq();
  await lead.goto("/defects/new");
  await lead.getByLabel("Title", { exact: true }).fill(`Web only ${id}`);
  await lead.getByRole("button", { name: "Create defect" }).click();
  await expect(lead.getByRole("heading", { name: new RegExp(`Web only ${id}`) })).toBeVisible();
  const url = lead.url();
  await lead.goto("/defects");
  const exportHref = await lead.getByRole("link", { name: /Export CSV/ }).getAttribute("href");
  const projectId = new URL(exportHref, "http://x").searchParams.get("project");

  const qa2 = await (await browser.newContext()).newPage();
  await login(qa2, "qa2@example.com");
  for (const path of [new URL(url).pathname, `${new URL(url).pathname}/edit`]) {
    await qa2.goto(path);
    await expect(qa2.getByText("This page could not be found")).toBeVisible();
  }
  expect((await qa2.request.get(`/defects/export?project=${projectId}`)).status()).toBe(404);
  expect((await qa2.request.get(`/reports/export?project=${projectId}&type=defects`)).status()).toBe(404);
});
