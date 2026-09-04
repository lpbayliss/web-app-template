import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import { Config, Logger } from "#core";
import { type Database, schema } from "#server/db/client";

export const ADMIN_ROLE = "admin";
export const USER_ROLE = "user";

export interface AuthDeps {
  db: Database;
  /** Fired after a user row is persisted (welcome email, analytics, ...). */
  onUserCreated?: (user: { id: string; email: string; name: string }) => Promise<void>;
  /** Deliver the password-reset link. */
  sendResetPassword?: (input: { email: string; name: string; url: string }) => Promise<void>;
}

/**
 * Better Auth instance. Mounted in Hono at /api/auth/*; the tRPC context resolves sessions
 * through `auth.api.getSession`. Adding a plugin here usually means regenerating the auth
 * tables (`pnpm dlx @better-auth/cli generate`) and a new migration.
 */
export function createAuth(deps: AuthDeps) {
  const log = Logger.child({ module: "auth" });
  return betterAuth({
    appName: Config.appName,
    baseURL: Config.appUrl,
    basePath: "/api/auth",
    secret: Config.authSecret,
    trustedOrigins: [Config.appUrl],
    database: drizzleAdapter(deps.db, {
      provider: "pg",
      schema: {
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verifications,
      },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      autoSignIn: true,
      sendResetPassword: async ({ user, url }) => {
        await deps.sendResetPassword?.({ email: user.email, name: user.name, url });
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      // Signed cookie snapshot avoids a DB round-trip on every request for 5 minutes.
      cookieCache: { enabled: true, maxAge: 60 * 5 },
    },
    // Rate limiting is enforced by the HTTP layer (hono-rate-limiter) so it can share Redis.
    rateLimit: { enabled: false },
    advanced: {
      useSecureCookies: Config.isProduction,
      cookiePrefix: Config.appName,
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (Config.adminEmails.includes(user.email.toLowerCase())) {
              return { data: { ...user, role: ADMIN_ROLE } };
            }
          },
          after: async (user) => {
            log.info({ userId: user.id }, "user created");
            await deps.onUserCreated?.({ id: user.id, email: user.email, name: user.name });
          },
        },
      },
    },
    plugins: [admin({ defaultRole: USER_ROLE, adminRoles: [ADMIN_ROLE] })],
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type Session = Auth["$Infer"]["Session"];
export type SessionUser = Session["user"];

export function isAdmin(user: Pick<SessionUser, "role"> | null | undefined): boolean {
  return user?.role === ADMIN_ROLE;
}
