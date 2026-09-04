/**
 * The server-wide globals. Import from "#core" anywhere on the server:
 *
 *   import { Analytics, Config, Context, Logger, Metrics } from "#core";
 */

export {
  Analytics,
  type AnalyticsApi,
  type AnalyticsEvent,
  type AnalyticsProps,
  type AnalyticsProvider,
  type AnalyticsValue,
  createAnalytics,
  createUmamiProvider,
  noopProvider,
} from "./analytics";
export {
  Cache,
  type CacheApi,
  type CacheStore,
  createCache,
  hashKey,
  MemoryCacheStore,
  RedisCacheStore,
  type RedisLike,
} from "./cache";
export { type AnalyticsConfig, type AppConfig, Config, ConfigError, loadConfig } from "./config";
export { Context, type ContextValues } from "./context";
export {
  AppError,
  type AppErrorOptions,
  ConflictError,
  ForbiddenError,
  isAppError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "./errors";
export { type AppLogger, createLogger, type LogFormat, Logger, type LogLevel } from "./logger";
export { createMetrics, Metrics, type MetricsRegistry } from "./metrics";
export { createShutdown, type ShutdownHook, type ShutdownManager } from "./shutdown";
