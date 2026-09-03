import type { IncomingMessage } from "node:http";
import { Context } from "#core";
import type { Auth, Session } from "#server/auth/auth";
import type { Database } from "#server/db/client";
import type { EmailService } from "#server/email/email.service";
import type { ActivityBus } from "#server/features/activity/activity.service";
import type { JobQueue } from "#server/jobs/queue";

/** Everything the application layer needs. Built once in main.ts and threaded through, never imported as singletons. */
export type AppDeps = {
  db: Database;
  auth: Auth;
  email: EmailService;
  jobs: JobQueue;
  events: ActivityBus;
};

export type TrpcContext = AppDeps & {
  /** Original request headers (needed to call Better Auth admin endpoints on behalf of the caller). */
  headers: Headers;
  session: Session | null;
  /** `Cache-Control: no-cache` from the client skips cached reads for this call. */
  cacheBypass: boolean;
};

export function createContextFactory(deps: AppDeps) {
  return async function createContext(opts: { headers: Headers }): Promise<TrpcContext> {
    const session = await deps.auth.api.getSession({ headers: opts.headers });
    if (session) {
      Context.set("userId", session.user.id);
      Context.set("sessionId", session.session.id);
    }
    const cacheControl = opts.headers.get("cache-control") ?? "";
    return {
      ...deps,
      headers: opts.headers,
      session,
      cacheBypass: /\bno-cache\b|\bno-store\b/i.test(cacheControl),
    };
  };
}

export type CreateContext = ReturnType<typeof createContextFactory>;

/** WebSocket upgrades arrive as Node requests; normalise them to the Fetch `Headers` the auth API expects. */
export function headersFromIncoming(req: IncomingMessage): Headers {
  const headers = new Headers();
  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    const name = req.rawHeaders[i];
    const value = req.rawHeaders[i + 1];
    if (name !== undefined && value !== undefined) headers.append(name, value);
  }
  return headers;
}
