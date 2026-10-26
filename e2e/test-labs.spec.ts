import { expect, test } from "@playwright/test";

const cases = ["test-case-123", "test-case-456", "test-case-789"];

for (const caseId of cases) {
  test(`${caseId} loads stable test controls`, async ({ page }) => {
    await page.goto(`/test-labs/${caseId}`);
    await expect(page.getByTestId("case-status")).toHaveText("Ready for testing");
    await expect(page.getByTestId("primary-action")).toBeVisible();
    await expect(page.getByTestId("name-input")).toBeVisible();
    await expect(page.getByTestId("submit-form")).toBeVisible();
  });
}

test("test lab index links to all three cases", async ({ page }) => {
  await page.goto("/test-labs");
  for (const caseId of cases) {
    await expect(page.getByTestId(`open-${caseId}`)).toBeVisible();
  }
});

test("sample form reports validation errors and then succeeds", async ({ page }) => {
  await page.goto("/test-labs/test-case-456");
  await page.getByTestId("submit-form").click();
  await expect(page.getByTestId("form-error")).toBeVisible();
  await page.getByTestId("name-input").fill("Test User");
  await page.getByTestId("email-input").fill("test@example.com");
  await page.getByTestId("submit-form").click();
  await expect(page.getByTestId("success-message")).toBeVisible();
});

test("tabs and modal have observable state changes", async ({ page }) => {
  await page.goto("/test-labs/test-case-789");
  await page.getByTestId("tab-activity").click();
  await expect(page.getByTestId("activity-panel")).toBeVisible();
  await page.getByTestId("open-modal").click();
  await expect(page.getByTestId("confirmation-modal")).toBeVisible();
  await page.getByTestId("close-modal").click();
  await expect(page.getByTestId("confirmation-modal")).toHaveCount(0);
});

test("deliberate defects can be toggled and reset", async ({ page }) => {
  await page.goto("/test-labs/test-case-123");
  await page.getByTestId("toggle-missing-action").check();
  await expect(page.getByTestId("primary-action")).toBeHidden();
  await page.getByTestId("toggle-missing-icon").check();
  await expect(page.getByTestId("status-icon")).toBeHidden();
  await page.getByTestId("reset-playground").click();
  await expect(page.getByTestId("primary-action")).toBeVisible();
  await expect(page.getByTestId("status-icon")).toBeVisible();
});
