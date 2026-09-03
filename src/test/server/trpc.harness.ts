import { vi } from "vitest";
import { type Auth, createAuth } from "#server/auth/auth";
import { createEmailService, type EmailProvider } from "#server/email/email.service";
import { createActivityBus } from "#server/features/activity/activity.service";
import type { JobQueue } from "#server/jobs/queue";
import { appRouter } from "#server/trpc/app.router";
import { type AppDeps, createContextFactory } from "#server/trpc/context";
import { createTestDb, type TestDb } from "./db.harness";

export interface TestApp {
  db: TestDb["db"];
  auth: Auth;
  deps: AppDeps;
  sentEmails: Parameters<EmailProvider["send"]>[0][];
  enqueued: { name: string; data: unknown }[];
  /** Sign up a user and return a caller authenticated as them plus their cookie header. */
  signUp(input: { email: string; password?: string; name?: string }): Promise<{
    cookie: string;
    userId: string;
    caller: ReturnType<typeof appRouter.createCaller>;
  }>;
  /** Anonymous caller. */
  anonymous(): Promise<ReturnType<typeof appRouter.createCaller>>;
  createContext: ReturnType<typeof createContextFactory>;
  close(): Promise<void>;
}

/**
 * Full application wiring on PGlite with fake email + queue. Exercises routers exactly as
 * production does (context factory, middlewares, auth), minus HTTP.
 */
export async function createTestApp(): Promise<TestApp> {
  const testDb = await createTestDb();
  const sentEmails: TestApp["sentEmails"] = [];
  const enqueued: TestApp["enqueued"] = [];

  const email = createEmailService({
    name: "fake",
    async send(message) {
      sentEmails.push(message);
      return { id: `m${sentEmails.length}` };
    },
  });
  const jobs = {
    queue: { getJobCounts: vi.fn(async () => ({ waiting: 0, active: 0 })) },
    enqueue: vi.fn(async (job: { name: string }, data: unknown) => {
      enqueued.push({ name: job.name, data });
      return { id: String(enqueued.length) };
    }),
    schedule: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  } as unknown as JobQueue;
  const events = createActivityBus();
  const auth = createAuth({ db: testDb.db });
  const deps: AppDeps = { db: testDb.db, auth, email, jobs, events };
  const createContext = createContextFactory(deps);

  return {
    db: testDb.db,
    auth,
    deps,
    sentEmails,
    enqueued,
    createContext,
    async signUp({ email: address, password = "correct-horse-battery", name = "Test User" }) {
      const { headers, response } = await auth.api.signUpEmail({
        body: { email: address, password, name },
        returnHeaders: true,
      });
      const cookie = headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; ");
      const ctx = await createContext({ headers: new Headers({ cookie }) });
      return { cookie, userId: response.user.id, caller: appRouter.createCaller(ctx) };
    },
    async anonymous() {
      return appRouter.createCaller(await createContext({ headers: new Headers() }));
    },
    close: () => testDb.close(),
  };
}
