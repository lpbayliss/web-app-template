import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Analytics } from "#core";
import { createTestDb, type TestDb } from "#test/server/db.harness";
import { type Auth, createAuth, isAdmin } from "./auth";

/** Sign up and return the cookie header a browser would send on the next request. */
async function signUpAndGetCookie(
  auth: Auth,
  input: { email: string; password: string; name: string },
) {
  const { headers, response } = await auth.api.signUpEmail({ body: input, returnHeaders: true });
  const cookie = headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return { cookie, user: response.user };
}

describe("createAuth", () => {
  let testDb: TestDb;
  const onUserCreated = vi.fn(async () => {});

  beforeAll(async () => {
    testDb = await createTestDb();
  });
  afterAll(() => testDb.close());

  it("signs up, assigns the default role and fires onUserCreated", async () => {
    const track = vi.spyOn(Analytics, "track");
    const auth = createAuth({ db: testDb.db, onUserCreated });
    const { cookie, user } = await signUpAndGetCookie(auth, {
      email: "person@example.com",
      password: "correct-horse-battery",
      name: "Person",
    });
    expect(user.email).toBe("person@example.com");
    expect(onUserCreated).toHaveBeenCalledWith(
      expect.objectContaining({ email: "person@example.com" }),
    );
    expect(track).toHaveBeenCalledWith("user.signed_up", { userId: user.id });

    const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
    expect(session?.user.role).toBe("user");
    expect(isAdmin(session?.user)).toBe(false);
  });

  it("promotes configured admin emails", async () => {
    const auth = createAuth({ db: testDb.db });
    const { cookie } = await signUpAndGetCookie(auth, {
      email: "admin@example.com",
      password: "correct-horse-battery",
      name: "Admin",
    });
    const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
    expect(session?.user.role).toBe("admin");
    expect(isAdmin(session?.user)).toBe(true);
  });

  it("rejects short passwords", async () => {
    const auth = createAuth({ db: testDb.db });
    await expect(
      auth.api.signUpEmail({ body: { email: "short@example.com", password: "short", name: "S" } }),
    ).rejects.toThrow();
  });

  it("returns no session for unauthenticated requests", async () => {
    const auth = createAuth({ db: testDb.db });
    expect(await auth.api.getSession({ headers: new Headers() })).toBeNull();
  });
});
