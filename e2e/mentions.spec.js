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

  // the author is never notified of their own mention
  await lead.reload();
  await expect(lead.getByTestId("notification-count")).toHaveCount(0);
});
