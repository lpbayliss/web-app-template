import {
  createTRPCClient,
  createWSClient,
  httpBatchLink,
  loggerLink,
  splitLink,
  wsLink,
} from "@trpc/client";
import { createTRPCContext } from "@trpc/tanstack-react-query";
import type { AppRouter } from "#server/trpc/app.router";

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

function wsUrl(): string {
  const { protocol, host } = window.location;
  return `${protocol === "https:" ? "wss" : "ws"}://${host}/api/ws`;
}

/**
 * Queries/mutations go over batched HTTP (cookies carry the session); subscriptions use a
 * lazily opened WebSocket that closes when the last subscription ends.
 */
function createClient() {
  return createTRPCClient<AppRouter>({
    links: [
      loggerLink({ enabled: () => import.meta.env.DEV }),
      splitLink({
        condition: (op) => op.type === "subscription",
        true: wsLink<AppRouter>({
          client: createWSClient({ url: wsUrl, lazy: { enabled: true, closeMs: 5_000 } }),
        }),
        false: httpBatchLink({ url: "/api/trpc", maxURLLength: 2_000 }),
      }),
    ],
  });
}

export const trpcClient = createClient();
