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

test("@mention notifies the user and the bell links to the test case", async ({ browser }) => {
  test.setTimeout(120_000);
  // Earlier runs against the same test DB leave unread notifications behind; start qa1 from zero.
  const qa = await (await browser.newContext()).newPage();
  await login(qa, "qa1@example.com");
  if (await qa.getByTestId("notification-count").count()) {
    await qa.getByRole("button", { name: /Notifications/ }).click();
    await qa.getByRole("button", { name: /Mark all read/i }).click();
    await expect(qa.getByTestId("notification-count")).toHaveCount(0);
    await qa.keyboard.press("Escape");
  }
  const title = `Mention case ${Math.random().toString(36).slice(2, 8)}`;
  const lead = await (await browser.newContext()).newPage();
  await login(lead, "lead@example.com");
  // Other specs create projects with only the lead in them; pin APP so the other members can be mentioned.
  await lead.getByRole("button", { name: "Switch project" }).click();
  await lead.getByRole("menuitem", { name: /^APP/ }).click();
  await expect(lead.getByRole("button", { name: "Switch project" })).toContainText("APP");
  await lead.goto("/test-cases/new");
  await lead.getByLabel("Title", { exact: true }).fill(title);
  await lead.getByLabel("Test steps", { exact: true }).fill("Do the thing");
  await lead.getByLabel("Expected result").fill("Thing is done");
  await lead.getByRole("button", { name: "Create test case" }).click();
  await expect(lead.getByRole("heading", { name: new RegExp(title) })).toBeVisible();
  const caseUrl = lead.url();

  const box = lead.getByLabel("Add a comment");
  await box.click();
  await box.pressSequentially("please check @Qui");
  await expect(lead.getByRole("option", { name: "Quinn Engineer" })).toBeVisible();
  await box.press("Enter");
  await expect(box).toHaveValue("please check @Quinn Engineer ");
  await box.pressSequentially("thanks");
  await lead.getByRole("button", { name: "Post comment" }).click();
  await expect(lead.getByTestId("mention")).toHaveText("@Quinn Engineer");

  await qa.reload();
  await expect(qa.getByTestId("notification-count")).toHaveText("1");
  await qa.getByRole("button", { name: /Notifications/ }).click();
  await expect(qa.getByTestId("notification").first()).toContainText("Liam Lead mentioned you");
  await qa.getByTestId("notification").first().click();
  await expect(qa).toHaveURL(caseUrl);
  await expect(qa.getByTestId("notification-count")).toHaveCount(0);

  // viewed notifications stay (read) until deleted
  await qa.getByRole("button", { name: /Notifications/ }).click();
  const mine = qa.getByTestId("notification").filter({ hasText: title });
  await expect(mine).toHaveCount(1);
  await qa.getByRole("button", { name: "Delete notification" }).first().click();
  // cancel keeps it; confirm removes it
  await qa.getByRole("button", { name: "Cancel" }).click();
  await qa.getByRole("button", { name: /Notifications/ }).click(); // the menu closes behind the dialog
  await expect(mine).toHaveCount(1);
  await qa.getByRole("button", { name: "Delete notification" }).first().click();
  await qa.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await qa.getByRole("button", { name: /Notifications/ }).click();
  await expect(mine).toHaveCount(0);
  await qa.keyboard.press("Escape");

  // 6 more mentions -> list shows 5 per page, newest first, then pages
  for (let i = 0; i < 6; i++) {
    const b = lead.getByLabel("Add a comment");
    await b.click();
    await b.pressSequentially("ping @Qui");
    await expect(lead.getByRole("option", { name: "Quinn Engineer" })).toBeVisible();
    await b.press("Enter");
    await b.pressSequentially(`n${i}`);
    await lead.getByRole("button", { name: "Post comment" }).click();
    await expect(lead.getByRole("heading", { name: `Comments (${i + 2})` })).toBeVisible();
  }
  await qa.reload();
  await qa.getByRole("button", { name: /Notifications/ }).click();
  await expect(qa.getByTestId("notification")).toHaveCount(5);
  await expect(qa.getByText(/Page 1 of \d+/)).toBeVisible();
  await qa.getByRole("button", { name: "Older notifications" }).click();
  await expect(qa.getByText(/Page 2 of \d+/)).toBeVisible();
  await expect(qa.getByTestId("notification").first()).toBeVisible();
  await qa.keyboard.press("Escape");

  // the author is never notified of their own mention
  await lead.reload();
  await expect(lead.getByTestId("notification-count")).toHaveCount(0);
});

test("adding a user to a project notifies them; a role change does not", async ({ browser }) => {
  test.setTimeout(90_000);
  const lead = await (await browser.newContext()).newPage();
  await login(lead, "lead@example.com");
  const key = "N" + Math.random().toString(36).slice(2, 7).toUpperCase();
  await lead.goto("/projects/new");
  await lead.getByLabel("Name").fill(`Notify ${key}`);
  await lead.getByLabel("Key").fill(key);
  await lead.getByRole("button", { name: "Create project" }).click();
  await expect(lead.getByRole("heading", { name: new RegExp(`${key} · Notify`) })).toBeVisible();

  const qa = await (await browser.newContext()).newPage();
  await login(qa, "qa1@example.com");
  await qa.getByRole("button", { name: /Notifications/ }).click();
  await expect(qa.getByTestId("notification").filter({ hasText: `Notify ${key}` })).toHaveCount(0);
  await qa.keyboard.press("Escape");

  await lead.getByLabel("User to add").selectOption({ label: "Quinn Engineer (qa1@example.com)" });
  await lead.getByLabel("Role for new member").selectOption({ label: "QA Engineer" });
  await lead.getByRole("button", { name: "Add", exact: true }).click();
  await expect(lead.getByLabel("Role for Quinn Engineer")).toBeVisible();

  await qa.reload();
  await qa.getByRole("button", { name: /Notifications/ }).click();
  const added = qa.getByTestId("notification").filter({ hasText: `Notify ${key}` });
  await expect(added).toHaveCount(1);
  await expect(added).toContainText("Liam Lead added you to a project");
  await expect(added).toContainText("Role: QA Engineer");

  // role change is not a new membership
  await lead.getByLabel("Role for Quinn Engineer").selectOption({ label: "Viewer" });
  await lead.waitForTimeout(1000);
  await qa.reload();
  await qa.getByRole("button", { name: /Notifications/ }).click();
  await expect(qa.getByTestId("notification").filter({ hasText: `Notify ${key}` })).toHaveCount(1);

  await added.click();
  await expect(qa).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
});
