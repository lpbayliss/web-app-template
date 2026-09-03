import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "#test/server/trpc.harness";

describe("admin router", () => {
  let app: TestApp;
  let admin: Awaited<ReturnType<TestApp["signUp"]>>;
  let member: Awaited<ReturnType<TestApp["signUp"]>>;

  beforeAll(async () => {
    app = await createTestApp();
    // admin@example.com is in ADMIN_EMAILS (.env.test)
    admin = await app.signUp({ email: "admin@example.com", name: "Admin" });
    member = await app.signUp({ email: "member@example.com", name: "Member" });
  });
  afterAll(() => app.close());

  it("forbids non-admins", async () => {
    await expect(member.caller.admin.listUsers({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    const anon = await app.anonymous();
    await expect(anon.admin.queueStats()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("lists users with pagination and search", async () => {
    const page = await admin.caller.admin.listUsers({ limit: 10 });
    expect(page.total).toBe(2);
    expect(page.items.map((u) => u.email).sort()).toEqual([
      "admin@example.com",
      "member@example.com",
    ]);
    const filtered = await admin.caller.admin.listUsers({ search: "member" });
    expect(filtered.items.map((u) => u.email)).toEqual(["member@example.com"]);
  });

  it("changes roles and bans users", async () => {
    await admin.caller.admin.setRole({ userId: member.userId, role: "admin" });
    const promoted = await admin.caller.admin.listUsers({ search: "member" });
    expect(promoted.items[0]?.role).toBe("admin");

    await admin.caller.admin.banUser({ userId: member.userId, reason: "testing" });
    const banned = await admin.caller.admin.listUsers({ search: "member" });
    expect(banned.items[0]?.banned).toBe(true);
  });

  it("reports queue statistics", async () => {
    expect(await admin.caller.admin.queueStats()).toEqual({ waiting: 0, active: 0 });
  });
});
