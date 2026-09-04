import { z } from "zod";

const bool = z.enum(["true", "false", "1", "0"]).transform((v) => v === "true" || v === "1");

const csv = z.string().transform((v) =>
  v
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
);

/**
 * Every environment variable the server reads, validated once at boot.
 * Add new settings here first; nothing else in the codebase should touch `process.env`.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_NAME: z.string().min(1).default("web-app-template"),
  APP_VERSION: z.string().min(1).default("0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().min(1).default("0.0.0.0"),
  LOG_LEVEL: z.enum(["error", "warn", "info", "http", "debug"]).default("info"),
  LOG_FORMAT: z.enum(["json", "pretty"]).optional(),

  /** Public origin of the app; used for auth callbacks, CORS and CSRF. */
  APP_URL: z.url({ protocol: /^https?$/ }),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  REDIS_URL: z.url({ protocol: /^rediss?$/ }),

  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  /** Comma-separated emails that are promoted to the admin role when they sign up. */
  ADMIN_EMAILS: csv.default([]),

  METRICS_TOKEN: z.string().min(16).optional(),
  RATE_LIMIT_AUTH_MAX: z.coerce.number().int().positive().default(20),
  RATE_LIMIT_AUTH_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),

  CACHE_ENABLED: bool.default(true),
  CACHE_DEFAULT_TTL_S: z.coerce.number().int().positive().default(60),

  /** Run queue workers inside the web process (dev) instead of a dedicated worker process. */
  JOBS_INLINE: bool.optional(),

  EMAIL_PROVIDER: z.enum(["smtp", "resend", "noop"]).optional(),
  EMAIL_FROM: z.string().min(3).default("App <no-reply@example.com>"),
  RESEND_API_KEY: z.string().min(1).optional(),
  /** e.g. smtp://localhost:1025 (Mailpit). */
  SMTP_URL: z.url({ protocol: /^smtps?$/ }).optional(),

  /** Trust X-Forwarded-For / X-Forwarded-Proto from the reverse proxy in front of the app. */
  TRUST_PROXY: bool.default(false),

  /** OpenTelemetry SDK conventions: tracing is active when an endpoint is set and the SDK is not disabled. */
  OTEL_EXPORTER_OTLP_ENDPOINT: z.url().optional(),
  OTEL_SDK_DISABLED: bool.default(false),

  /** Product analytics (Umami). Enabled when ANALYTICS_URL and ANALYTICS_WEBSITE_ID are both set. */
  ANALYTICS_URL: z.url({ protocol: /^https?$/ }).optional(),
  /** Where the server posts events when the public URL is not reachable from it (docker networks). */
  ANALYTICS_SERVER_URL: z.url({ protocol: /^https?$/ }).optional(),
  ANALYTICS_WEBSITE_ID: z.uuid().optional(),
});

type Env = z.infer<typeof envSchema>;

export type AnalyticsConfig =
  | { readonly enabled: false }
  | {
      readonly enabled: true;
      readonly url: string;
      readonly serverUrl: string;
      readonly websiteId: string;
    };

export interface AppConfig {
  readonly nodeEnv: Env["NODE_ENV"];
  readonly isProduction: boolean;
  readonly isDevelopment: boolean;
  readonly isTest: boolean;
  readonly appName: string;
  readonly appVersion: string;
  readonly port: number;
  readonly host: string;
  readonly logLevel: Env["LOG_LEVEL"];
  readonly logFormat: "json" | "pretty";
  readonly appUrl: string;
  readonly databaseUrl: string;
  readonly redisUrl: string;
  readonly authSecret: string;
  readonly adminEmails: readonly string[];
  readonly metricsToken: string | undefined;
  readonly rateLimit: { readonly authMax: number; readonly authWindowMs: number };
  readonly shutdownTimeoutMs: number;
  readonly cache: { readonly enabled: boolean; readonly defaultTtlSeconds: number };
  readonly jobsInline: boolean;
  readonly email: {
    readonly provider: "smtp" | "resend" | "noop";
    readonly from: string;
    readonly resendApiKey: string | undefined;
    readonly smtpUrl: string | undefined;
  };
  readonly trustProxy: boolean;
  readonly telemetry: { readonly enabled: boolean; readonly otlpEndpoint: string | undefined };
  readonly analytics: AnalyticsConfig;
}

export class ConfigError extends Error {
  override readonly name = "ConfigError";
  readonly issues: string;
  constructor(issues: string) {
    super(`Invalid configuration:\n${issues}`);
    this.issues = issues;
  }
}

/** Treat empty strings as "unset" so `FOO=` in an env file behaves like a missing key. */
function stripEmpty(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined && value !== "") out[key] = value;
  }
  return out;
}

function resolveEmailProvider(e: Env): AppConfig["email"]["provider"] {
  if (e.EMAIL_PROVIDER) return e.EMAIL_PROVIDER;
  if (e.RESEND_API_KEY) return "resend";
  if (e.SMTP_URL) return "smtp";
  return "noop";
}

const stripSlash = (url: string) => url.replace(/\/$/, "");

function resolveAnalytics(e: Env): AnalyticsConfig {
  if (!e.ANALYTICS_URL || !e.ANALYTICS_WEBSITE_ID) return { enabled: false };
  const url = stripSlash(e.ANALYTICS_URL);
  return Object.freeze({
    enabled: true,
    url,
    serverUrl: e.ANALYTICS_SERVER_URL ? stripSlash(e.ANALYTICS_SERVER_URL) : url,
    websiteId: e.ANALYTICS_WEBSITE_ID,
  });
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = envSchema.safeParse(stripEmpty(env));
  if (!result.success) {
    throw new ConfigError(z.prettifyError(result.error));
  }
  const e = result.data;
  const nodeEnv = e.NODE_ENV;
  const isProduction = nodeEnv === "production";
  const emailProvider = resolveEmailProvider(e);

  const problems: string[] = [];
  if (emailProvider === "resend" && !e.RESEND_API_KEY)
    problems.push("✖ RESEND_API_KEY is required when EMAIL_PROVIDER=resend");
  if (emailProvider === "smtp" && !e.SMTP_URL)
    problems.push("✖ SMTP_URL is required when EMAIL_PROVIDER=smtp");
  if (isProduction && emailProvider === "noop")
    problems.push("✖ Configure RESEND_API_KEY or SMTP_URL in production");
  if ((e.ANALYTICS_URL === undefined) !== (e.ANALYTICS_WEBSITE_ID === undefined))
    problems.push("✖ ANALYTICS_URL and ANALYTICS_WEBSITE_ID must be set together");
  if (problems.length) throw new ConfigError(problems.join("\n"));

  return Object.freeze({
    nodeEnv,
    isProduction,
    isDevelopment: nodeEnv === "development",
    isTest: nodeEnv === "test",
    appName: e.APP_NAME,
    appVersion: e.APP_VERSION,
    port: e.PORT,
    host: e.HOST,
    logLevel: e.LOG_LEVEL,
    logFormat: e.LOG_FORMAT ?? (isProduction ? "json" : "pretty"),
    appUrl: e.APP_URL.replace(/\/$/, ""),
    databaseUrl: e.DATABASE_URL,
    redisUrl: e.REDIS_URL,
    authSecret: e.AUTH_SECRET,
    adminEmails: Object.freeze(e.ADMIN_EMAILS),
    metricsToken: e.METRICS_TOKEN,
    rateLimit: Object.freeze({
      authMax: e.RATE_LIMIT_AUTH_MAX,
      authWindowMs: e.RATE_LIMIT_AUTH_WINDOW_MS,
    }),
    shutdownTimeoutMs: e.SHUTDOWN_TIMEOUT_MS,
    cache: Object.freeze({ enabled: e.CACHE_ENABLED, defaultTtlSeconds: e.CACHE_DEFAULT_TTL_S }),
    jobsInline: e.JOBS_INLINE ?? !isProduction,
    email: Object.freeze({
      provider: emailProvider,
      from: e.EMAIL_FROM,
      resendApiKey: e.RESEND_API_KEY,
      smtpUrl: e.SMTP_URL,
    }),
    trustProxy: e.TRUST_PROXY,
    telemetry: Object.freeze({
      enabled: !e.OTEL_SDK_DISABLED && e.OTEL_EXPORTER_OTLP_ENDPOINT !== undefined,
      otlpEndpoint: e.OTEL_EXPORTER_OTLP_ENDPOINT,
    }),
    analytics: resolveAnalytics(e),
  });
}

/**
 * The process-wide configuration. Importing this module validates the environment,
 * so a misconfigured deployment fails immediately with a readable list of problems.
 */
export const Config: AppConfig = loadConfig();
