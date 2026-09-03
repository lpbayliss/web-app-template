/**
 * Web process: HTTP + WebSocket (+ inline queue workers outside production).
 * Start with `pnpm dev:server` or `node --import @opentelemetry/auto-instrumentations-node/register dist/server/main.js`.
 */

import type { Server } from "node:http";
import { serve } from "@hono/node-server";
import { RedisStore } from "hono-rate-limiter";
import { Config, Logger } from "#core";
import { bootstrap } from "./bootstrap";
import { createApp } from "./http/app";
import { mountQueueBoard } from "./http/queue-board";
import { createWsServer } from "./ws/ws.server";

const { deps, redis, shutdown, ready, startWorker } = await bootstrap();

const app = createApp(deps, {
  ready,
  serveClient: Config.isProduction,
  mount: (hono) => mountQueueBoard(hono, deps.jobs),
  rateLimitStore: new RedisStore({
    prefix: `${Config.appName}:rl:`,
    client: {
      scriptLoad: (script) => redis.script("LOAD", script) as Promise<string>,
      evalsha: (sha, keys, args) =>
        redis.evalsha(sha, keys.length, ...keys, ...(args as string[])) as never,
      decr: (key) => redis.decr(key),
      del: (key) => redis.del(key),
    },
  }),
});

const server = serve({ fetch: app.fetch, port: Config.port, hostname: Config.host }, (info) => {
  Logger.info("http listening", { host: info.address, port: info.port, url: Config.appUrl });
}) as Server;
shutdown.register(
  "http",
  () => new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
);

const ws = createWsServer(server, deps);
shutdown.register("ws", ws.close);

if (Config.jobsInline) await startWorker();

shutdown.install();
