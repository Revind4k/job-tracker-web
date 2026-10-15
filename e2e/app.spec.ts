import { expect, test } from "@playwright/test";

const uniqueEmail = () => `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

test("a new user can register and manage an application end to end", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create an account" }).click();
  const email = uniqueEmail();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("No applications yet.")).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();

  await page.getByRole("button", { name: "+ Add application" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Company").fill("Northwind Labs");
  await dialog.getByLabel("Role").fill("Software Engineer");
  await dialog.getByLabel(/Posting link/).fill("https://example.com/jobs/1");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("link", { name: "Northwind Labs" })).toHaveAttribute("href", "https://example.com/jobs/1");

  await page.getByLabel("Status for Northwind Labs").selectOption("INTERVIEW");
  await expect(page.getByRole("button", { name: "Interview (1)" })).toBeVisible();
  await expect(page.getByText("100%")).toBeVisible(); // response rate: 1 of 1 past "applied"

  // Survives a reload: the token is in sessionStorage and the data is in Postgres.
  await page.reload();
  await expect(page.getByLabel("Status for Northwind Labs")).toHaveValue("INTERVIEW");

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("No applications yet.")).toBeVisible();

  await page.getByRole("button", { name: "Log out" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("alert")).toHaveText("invalid email or password");
});

test("the demo button seeds an account with sample data", async ({ page }, info) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try it with sample data" }).click();
  await expect(page.getByText("Demo account")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("row")).toHaveCount(15); // header + 14 sample applications
  await expect(page.getByRole("button", { name: "All (14)" })).toBeVisible();
  // Nothing may overflow sideways (a phone would show a horizontal scrollbar).
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `e2e/screenshots/dashboard-${info.project.name}.png`, fullPage: true });
});

test("server-side validation errors reach the form", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Email").fill("not-an-email");
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("alert")).toContainText("well-formed email");
});
