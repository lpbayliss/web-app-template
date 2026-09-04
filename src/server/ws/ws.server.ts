import type { Server } from "node:http";
import { applyWSSHandler } from "@trpc/server/adapters/ws";
import { WebSocketServer } from "ws";
import { Context, Logger, Metrics } from "#core";
import { appRouter } from "#server/trpc/app.router";
import { type AppDeps, createContextFactory, headersFromIncoming } from "#server/trpc/context";

const WS_PATH = "/api/ws";

/**
 * tRPC subscriptions over WebSocket, sharing the HTTP server's port. Only `WS_PATH` upgrades
 * are accepted; the Better Auth session is read from the upgrade request's cookies.
 */
export function createWsServer(server: Server, deps: AppDeps) {
  const log = Logger.child({ module: "ws" });
  const createContext = createContextFactory(deps);
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    if (path !== WS_PATH) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  });

  const handler = applyWSSHandler({
    wss,
    router: appRouter,
    createContext: ({ req }) =>
      Context.run({ transport: "ws", requestId: crypto.randomUUID() }, () =>
        createContext({ headers: headersFromIncoming(req) }),
      ),
    keepAlive: { enabled: true, pingMs: 30_000, pongWaitMs: 5_000 },
    onError: ({ error, path }) => {
      if (error.code === "INTERNAL_SERVER_ERROR") log.error({ path, error }, "ws procedure error");
    },
  });

  wss.on("connection", (ws) => {
    Metrics.wsConnections.inc();
    log.debug({ clients: wss.clients.size }, "ws connected");
    ws.once("close", () => {
      Metrics.wsConnections.dec();
      log.debug({ clients: wss.clients.size }, "ws disconnected");
    });
  });

  return {
    wss,
    /** Ask clients to reconnect (they will hit a healthy instance), then close. */
    close: () =>
      new Promise<void>((resolve) => {
        handler.broadcastReconnectNotification();
        for (const client of wss.clients) client.close(1001, "server shutting down");
        wss.close(() => resolve());
      }),
  };
}
