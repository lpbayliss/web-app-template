import type { Server } from "node:http";
import { serve } from "@hono/node-server";
import { createTRPCClient, createWSClient, wsLink } from "@trpc/client";
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import type { AppRouter } from "#server/trpc/app.router";
import { createTestApp, type TestApp } from "#test/server/trpc.harness";
import { createWsServer } from "./ws.server";

/** Real HTTP server + WebSocket upgrade + tRPC wsLink, end to end in-process. */
describe("WebSocket server", () => {
  let app: TestApp;
  let server: Server;
  let ws: ReturnType<typeof createWsServer>;
  let url: string;

  beforeAll(async () => {
    app = await createTestApp();
    server = serve({ fetch: new Hono().fetch, port: 0, hostname: "127.0.0.1" }) as Server;
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    url = `ws://127.0.0.1:${port}/api/ws`;
    ws = createWsServer(server, app.deps);
  });

  afterAll(async () => {
    await ws.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await app.close();
  });

  it("rejects upgrades on other paths", async () => {
    const socket = new WebSocket(url.replace("/api/ws", "/nope"));
    const outcome = await new Promise<string>((resolve) => {
      socket.once("open", () => resolve("open"));
      socket.once("error", () => resolve("error"));
    });
    expect(outcome).toBe("error");
  });

  it("streams a user's activity to an authenticated subscriber", async () => {
    const { cookie, userId } = await app.signUp({ email: "ws@example.com" });
    const wsClient = createWSClient({
      url,
      WebSocket: class extends WebSocket {
        constructor(address: string) {
          super(address, { headers: { cookie } });
        }
      } as unknown as typeof globalThis.WebSocket,
    });
    const client = createTRPCClient<AppRouter>({
      links: [wsLink<AppRouter>({ client: wsClient })],
    });

    const received = await new Promise<string>((resolve, reject) => {
      const sub = client.activity.onEvent.subscribe(undefined, {
        onStarted: () => {
          app.deps.events.publish({ type: "task.created", userId: "someone-else", taskId: "x" });
          app.deps.events.publish({ type: "task.created", userId, taskId: "mine", title: "Mine" });
        },
        onData: (event) => {
          sub.unsubscribe();
          resolve(event.taskId);
        },
        onError: reject,
      });
    });
    expect(received).toBe("mine");
    wsClient.close();
  });

  it("rejects anonymous subscribers", async () => {
    const wsClient = createWSClient({
      url,
      WebSocket: WebSocket as unknown as typeof globalThis.WebSocket,
    });
    const client = createTRPCClient<AppRouter>({
      links: [wsLink<AppRouter>({ client: wsClient })],
    });
    const code = await new Promise<string>((resolve) => {
      client.activity.onEvent.subscribe(undefined, {
        onError: (error) => resolve(error.data?.code ?? "unknown"),
      });
    });
    expect(code).toBe("UNAUTHORIZED");
    wsClient.close();
  });
});
