import { expect, test } from "./fixtures/app.fixture";

test.describe("tasks", () => {
  test("creates, completes and deletes tasks with a live activity feed", async ({
    signedInPage: page,
  }) => {
    await expect(page.getByTestId("activity-status")).toHaveText("Live");

    await page.getByPlaceholder("What needs doing?").fill("Write the e2e test");
    await page.getByRole("button", { name: "Add" }).click();
    await expect(page.getByText("Write the e2e test", { exact: true })).toBeVisible();
    await expect(page.getByText("1 open task")).toBeVisible();
    await expect(page.getByText("Created “Write the e2e test”")).toBeVisible();

    // click() rather than check(): the optimistic update flips the controlled input a tick later.
    const checkbox = page.getByRole("checkbox", { name: "Mark done" });
    await checkbox.click();
    await expect(page.getByRole("checkbox", { name: "Mark open" })).toBeChecked();
    await expect(page.getByText("No open tasks")).toBeVisible();
    await expect(page.getByText("Updated “Write the e2e test”")).toBeVisible();

    await page.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("Write the e2e test", { exact: true })).toBeHidden();
    await expect(page.getByText("Deleted a task")).toBeVisible();
  });

  test("survives a reload (server state, not just optimistic UI)", async ({
    signedInPage: page,
  }) => {
    await page.getByPlaceholder("What needs doing?").fill("Persisted task");
    await page.getByRole("button", { name: "Add" }).click();
    await expect(page.getByText("Persisted task", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText("Persisted task", { exact: true })).toBeVisible();
  });

  test("validates empty titles client-side", async ({ signedInPage: page }) => {
    await page.getByRole("button", { name: "Add" }).click();
    await expect(page.getByRole("alert")).toHaveText("Title is required");
  });

  test("switches language", async ({ signedInPage: page }) => {
    await page.getByRole("combobox", { name: "Language" }).selectOption("de");
    await expect(page.getByRole("heading", { name: "Aufgaben" })).toBeVisible();
  });
});
