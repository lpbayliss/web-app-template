import { inspect } from "node:util";
import winston from "winston";
import { Config } from "./config";
import { Context } from "./context";

export type LogLevel = "error" | "warn" | "info" | "http" | "debug";
export type LogFormat = "json" | "pretty";

const LEVELS: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, http: 3, debug: 4 };
const RESERVED = new Set(["level", "message", "timestamp", "stack"]);

/** Attach the current request context to every record without clobbering explicit metadata. */
const contextFormat = winston.format((info) => {
  for (const [key, value] of Object.entries(Context.snapshot())) {
    if (!(key in info)) info[key] = value;
  }
  return info;
});

const ANSI: Record<string, string> = {
  error: "[31m",
  warn: "[33m",
  info: "[32m",
  http: "[36m",
  debug: "[35m",
  dim: "[2m",
  reset: "[0m",
};

function formatValue(value: unknown): string {
  if (typeof value === "string")
    return /[\s"=]/.test(value) || value === "" ? JSON.stringify(value) : value;
  if (typeof value === "number" || typeof value === "boolean" || value === null)
    return String(value);
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) return JSON.stringify(value.message);
  try {
    return JSON.stringify(value);
  } catch {
    return inspect(value, { depth: 2, breakLength: Number.POSITIVE_INFINITY });
  }
}

/**
 * One line per event, `key=value` pairs, no boxes or tables:
 *   12:34:56.789 INFO  request completed requestId=abc method=GET path=/ status=200 durationMs=3
 * Errors append their stack on indented lines. Colour only on an interactive TTY.
 */
function prettyFormat(useColor: boolean) {
  const paint = (code: string, text: string) => (useColor ? `${code}${text}${ANSI.reset}` : text);
  return winston.format.printf((info) => {
    const { level, message, timestamp, stack, ...meta } = info as Record<string, unknown> & {
      level: string;
      message: unknown;
    };
    const time = typeof timestamp === "string" ? timestamp.slice(11, 23) : "";
    const pairs = Object.entries(meta)
      .filter(
        ([key, value]) => !RESERVED.has(key) && value !== undefined && typeof key === "string",
      )
      .sort(([a], [b]) => (a === "requestId" ? -1 : b === "requestId" ? 1 : 0))
      .map(([key, value]) => `${paint(ANSI.dim ?? "", key)}=${formatValue(value)}`);
    const head = `${paint(ANSI.dim ?? "", time)} ${paint(ANSI[level] ?? "", level.toUpperCase().padEnd(5))} ${String(message)}`;
    const line = pairs.length ? `${head} ${pairs.join(" ")}` : head;
    return typeof stack === "string" ? `${line}\n${indent(stack)}` : line;
  });
}

function indent(text: string): string {
  return text
    .split("\n")
    .map((l) => `    ${l}`)
    .join("\n");
}

export interface LoggerOptions {
  level?: LogLevel;
  format?: LogFormat;
  color?: boolean;
  transports?: winston.transport[];
  silent?: boolean;
}

export function createLogger(options: LoggerOptions = {}): winston.Logger {
  const format = options.format ?? Config.logFormat;
  const useColor = options.color ?? (Boolean(process.stdout.isTTY) && !process.env.NO_COLOR);
  return winston.createLogger({
    levels: LEVELS,
    level: options.level ?? Config.logLevel,
    silent: options.silent ?? false,
    format: winston.format.combine(
      winston.format.errors({ stack: true }),
      contextFormat(),
      winston.format.timestamp(),
      format === "json" ? winston.format.json() : prettyFormat(useColor),
    ),
    transports: options.transports ?? [new winston.transports.Console({ stderrLevels: ["error"] })],
  });
}

/**
 * Process-wide logger. Prefer `Logger.child({ module: "task" })` inside a feature so
 * every line is attributable. Request-scoped fields come from `Context` automatically.
 */
export const Logger: winston.Logger = createLogger();
