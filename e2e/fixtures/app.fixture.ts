import { test as base, expect, type Page } from "@playwright/test";
import { Mailpit } from "./mailpit.fixture";

export interface TestUser {
  email: string;
  password: string;
  name: string;
}

function uniqueUser(prefix = "e2e"): TestUser {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  return {
    email: `${prefix}-${id}@example.test`,
    password: "correct-horse-battery",
    name: `E2E ${id}`,
  };
}

async function register(page: Page, user: TestUser) {
  await page.goto("/register");
  await page.getByLabel("Name").fill(user.name);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/tasks$/);
}

/** Shared fixtures: a fresh registered user per test and Mailpit access. */
export const test = base.extend<{ user: TestUser; mailpit: Mailpit; signedInPage: Page }>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright fixtures must destructure their first argument
  user: async ({}, use) => use(uniqueUser()),
  // biome-ignore lint/correctness/noEmptyPattern: Playwright fixtures must destructure their first argument
  mailpit: async ({}, use) => use(new Mailpit()),
  signedInPage: async ({ page, user }, use) => {
    await register(page, user);
    await use(page);
  },
});

export { expect, register, uniqueUser };
