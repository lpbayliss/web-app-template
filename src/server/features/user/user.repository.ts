import { eq } from "drizzle-orm";
import { type Database, schema } from "#server/db/client";

/** Public projection of a user row: never leaks auth internals (password hashes live in `accounts`). */
export interface UserSummary {
  id: string;
  email: string;
  name: string;
  role: string;
  banned: boolean;
}

const summary = {
  id: schema.users.id,
  email: schema.users.email,
  name: schema.users.name,
  role: schema.users.role,
  banned: schema.users.banned,
};

/**
 * Read side for users. Writes go through Better Auth (sign-up, admin endpoints) so the
 * password/verification invariants stay in one place.
 */
export function createUserRepository(db: Database) {
  const { users } = schema;
  return {
    async findById(id: string): Promise<UserSummary | undefined> {
      const [row] = await db.select(summary).from(users).where(eq(users.id, id)).limit(1);
      return row;
    },

    async findByEmail(email: string): Promise<UserSummary | undefined> {
      const [row] = await db
        .select(summary)
        .from(users)
        .where(eq(users.email, email.toLowerCase()))
        .limit(1);
      return row;
    },

    async count(): Promise<number> {
      return db.$count(users);
    },
  };
}

export type UserRepository = ReturnType<typeof createUserRepository>;
