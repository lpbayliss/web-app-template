import { expect, register, test, uniqueUser } from "./fixtures/app.fixture";

test.describe("authentication", () => {
  test("redirects anonymous visitors from protected pages to login and back", async ({
    page,
    user,
  }) => {
    await page.goto("/tasks");
    await expect(page).toHaveURL(/\/login\?redirect=/);
    await register(page, user);
    await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();
  });

  test("sends a welcome email through the queue", async ({ page, user, mailpit }) => {
    await register(page, user);
    const message = await mailpit.waitFor(user.email, "Welcome");
    expect(message.To[0]?.Address).toBe(user.email);
    expect(await mailpit.html(message.ID)).toContain(user.name);
  });

  test("signs out and rejects wrong passwords", async ({ page, user }) => {
    await register(page, user);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();

    await page.goto("/login");
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password").fill("definitely-wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert")).toContainText("That didn't work");
  });

  test("keeps non-admins out of the admin area", async ({ page }) => {
    await register(page, uniqueUser("member"));
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/$/);
  });
});
