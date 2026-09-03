import { Redis } from "ioredis";
import { Config, Logger } from "#core";

export type RedisClient = Redis;

export interface RedisOptions {
  /** BullMQ workers use blocking commands and need `maxRetriesPerRequest: null`. */
  blocking?: boolean;
  name?: string;
}

/** Create a connection. Callers own its lifecycle (register a shutdown hook). */
export function createRedis(
  url: string = Config.redisUrl,
  options: RedisOptions = {},
): RedisClient {
  const log = Logger.child({ module: "redis", connection: options.name ?? "default" });
  const client = new Redis(url, {
    lazyConnect: true,
    enableReadyCheck: true,
    maxRetriesPerRequest: options.blocking ? null : 3,
    connectionName: `${Config.appName}:${options.name ?? "default"}`,
    retryStrategy: (times) => Math.min(times * 200, 5_000),
  });
  client.on("error", (error) => log.error("redis error", { error }));
  client.on("reconnecting", () => log.warn("redis reconnecting"));
  client.on("ready", () => log.debug("redis ready"));
  return client;
}

let shared: RedisClient | undefined;

/** Lazily created shared connection for caching, rate limiting and queue producers. */
export function getRedis(): RedisClient {
  shared ??= createRedis(Config.redisUrl, { name: "shared" });
  return shared;
}

export async function closeRedis(): Promise<void> {
  if (!shared) return;
  const client = shared;
  shared = undefined;
  await client.quit().catch(() => client.disconnect());
}
