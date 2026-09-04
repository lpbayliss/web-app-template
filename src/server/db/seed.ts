/**
 * Development seed: an admin and a regular user with a few tasks. Idempotent (skips existing emails).
 * Never runs in production. Credentials are printed so you can sign in immediately.
 */
import { eq } from "drizzle-orm";
import { Config, Logger } from "#core";
import { createAuth } from "#server/auth/auth";
import { createDb, schema } from "./client";

if (Config.isProduction) {
  Logger.error("refusing to seed a production database");
  process.exit(1);
}

const SEED_USERS = [
  {
    email: Config.adminEmails[0] ?? "admin@example.com",
    name: "Admin",
    password: "admin-password-123",
  },
  { email: "user@example.com", name: "Sample User", password: "user-password-123" },
];

const handle = createDb();
const auth = createAuth({ db: handle.db });

try {
  for (const seed of SEED_USERS) {
    const [existing] = await handle.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, seed.email))
      .limit(1);
    if (existing) {
      Logger.info({ email: seed.email }, "seed user exists");
      continue;
    }
    const { user } = await auth.api.signUpEmail({ body: seed });
    await handle.db.insert(schema.tasks).values([
      { ownerId: user.id, title: `Welcome, ${seed.name}` },
      { ownerId: user.id, title: "Explore the admin area", completed: seed.name === "Admin" },
    ]);
    Logger.info(
      {
        email: seed.email,
        password: seed.password,
        role: user.role,
      },
      "seed user created",
    );
  }
} finally {
  await handle.close();
}
