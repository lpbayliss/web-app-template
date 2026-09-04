import { inspect } from "node:util";
import pino, { type DestinationStream, type Logger as PinoLogger } from "pino";
import { Config } from "./config";
import { Context } from "./context";

export type LogLevel = "error" | "warn" | "info" | "http" | "debug";
export type LogFormat = "json" | "pretty";
export type AppLogger = PinoLogger<"http">;

/** pino's own levels plus `http` (request completion) between info and debug. */
const CUSTOM_LEVELS = { http: 25 };
/** Keys the pretty printer renders itself rather than as `key=value` pairs. */
const RESERVED = new Set(["level", "msg", "time", "pid", "hostname", "error"]);

const ANSI: Record<string, string> = {
  error: "\x1b[31m",
  warn: "\x1b[33m",
  info: "\x1b[32m",
  http: "\x1b[36m",
  debug: "\x1b[35m",
  dim: "\x1b[2m",
  reset: "\x1b[0m",
};

function formatValue(value: unknown): string {
  if (typeof value === "string")
    return /[\s"=]/.test(value) || value === "" ? JSON.stringify(value) : value;
  if (typeof value === "number" || typeof value === "boolean" || value === null)
    return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return inspect(value, { depth: 2, breakLength: Number.POSITIVE_INFINITY });
  }
}

function indent(text: string): string {
  return text
    .split("\n")
    .map((l) => `    ${l}`)
    .join("\n");
}

interface SerializedError {
  message?: string;
  stack?: string;
}

/**
 * In-process pretty destination: parses each JSON record pino writes and re-emits it as one
 * line of `key=value` pairs, no boxes or tables:
 *   12:34:56.789 INFO  request completed requestId=abc method=GET path=/ status=200 durationMs=3
 * Errors append their stack on indented lines. Colour only on an interactive TTY.
 * Runs on the main thread, so no worker-thread transport is involved.
 */
function prettyDestination(target: DestinationStream, useColor: boolean): DestinationStream {
  const paint = (code: string, text: string) => (useColor ? `${code}${text}${ANSI.reset}` : text);
  return {
    write(record: string) {
      let info: Record<string, unknown>;
      try {
        info = JSON.parse(record) as Record<string, unknown>;
      } catch {
        target.write(record);
        return;
      }
      const level = typeof info.level === "string" ? info.level : "info";
      const time = typeof info.time === "string" ? info.time.slice(11, 23) : "";
      const error = info.error as SerializedError | undefined;
      const pairs = Object.entries(info)
        .filter(([key, value]) => !RESERVED.has(key) && value !== undefined)
        .sort(([a], [b]) => (a === "requestId" ? -1 : b === "requestId" ? 1 : 0))
        .map(([key, value]) => `${paint(ANSI.dim ?? "", key)}=${formatValue(value)}`);
      const head = `${paint(ANSI.dim ?? "", time)} ${paint(ANSI[level] ?? "", level.toUpperCase().padEnd(5))} ${String(info.msg ?? "")}`;
      const line = pairs.length ? `${head} ${pairs.join(" ")}` : head;
      const stack = error?.stack ?? error?.message;
      target.write(`${typeof stack === "string" ? `${line}\n${indent(stack)}` : line}\n`);
    },
  };
}

export interface LoggerOptions {
  level?: LogLevel;
  format?: LogFormat;
  color?: boolean;
  /** Where lines go; defaults to stdout. Tests pass a capturing stream. */
  destination?: DestinationStream;
  silent?: boolean;
}

export function createLogger(options: LoggerOptions = {}): AppLogger {
  const format = options.format ?? Config.logFormat;
  const useColor = options.color ?? (Boolean(process.stdout.isTTY) && !process.env.NO_COLOR);
  // Synchronous stdout keeps lines ordered and never drops them on crash or exit.
  const target = options.destination ?? pino.destination({ fd: 1, sync: true });
  return pino(
    {
      level: options.silent ? "silent" : (options.level ?? Config.logLevel),
      customLevels: CUSTOM_LEVELS,
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: { level: (label) => ({ level: label }) },
      // Attach the current request context without clobbering explicit metadata
      // (pino's default merge strategy lets the log call's own fields win).
      mixin: () => Context.snapshot(),
      errorKey: "error",
      serializers: { error: pino.stdSerializers.err },
    },
    format === "json" ? target : prettyDestination(target, useColor),
  );
}

/**
 * Process-wide logger. Prefer `Logger.child({ module: "task" })` inside a feature so
 * every line is attributable. Request-scoped fields come from `Context` automatically.
 * Call style is pino's: `log.info({ userId }, "user created")` — metadata first, message last.
 */
export const Logger: AppLogger = createLogger();
