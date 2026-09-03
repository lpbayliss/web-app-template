import { adminClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/** Talks to /api/auth on the same origin; the session cookie does the rest. */
export const authClient = createAuthClient({
  basePath: "/api/auth",
  plugins: [adminClient()],
});

type AuthSession = typeof authClient.$Infer.Session;
export type AuthUser = AuthSession["user"];

export function isAdminUser(user: Pick<AuthUser, "role"> | null | undefined): boolean {
  return user?.role === "admin";
}
