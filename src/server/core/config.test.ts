import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "./config";

const valid = {
  APP_URL: "http://localhost:5173/",
  DATABASE_URL: "postgres://app:app@localhost:5432/app",
  REDIS_URL: "redis://localhost:6379",
  AUTH_SECRET: "0123456789abcdef0123456789abcdef",
};

describe("loadConfig", () => {
  it("applies defaults and derives environment flags", () => {
    const config = loadConfig(valid);
    expect(config).toMatchObject({
      nodeEnv: "development",
      isDevelopment: true,
      isProduction: false,
      port: 3000,
      host: "0.0.0.0",
      logLevel: "info",
      logFormat: "pretty",
      rateLimit: { authMax: 20, authWindowMs: 60_000 },
      cache: { enabled: true, defaultTtlSeconds: 60 },
      jobsInline: true,
      email: { provider: "noop" },
      telemetry: { enabled: false },
    });
  });

  it("strips a trailing slash from APP_URL", () => {
    expect(loadConfig(valid).appUrl).toBe("http://localhost:5173");
  });

  it("defaults to JSON logs and a separate worker process in production", () => {
    const config = loadConfig({ ...valid, NODE_ENV: "production", SMTP_URL: "smtp://mail:25" });
    expect(config.logFormat).toBe("json");
    expect(config.jobsInline).toBe(false);
  });

  it("coerces numeric and boolean variables", () => {
    const config = loadConfig({
      ...valid,
      PORT: "8080",
      WORKER_PORT: "3011",
      RATE_LIMIT_AUTH_MAX: "5",
      CACHE_ENABLED: "false",
    });
    expect(config.port).toBe(8080);
    expect(config.workerPort).toBe(3011);
    expect(config.rateLimit.authMax).toBe(5);
    expect(config.cache.enabled).toBe(false);
  });

  it("parses ADMIN_EMAILS as a lower-cased list", () => {
    expect(
      loadConfig({ ...valid, ADMIN_EMAILS: "Admin@Example.com, ops@example.com ,," }).adminEmails,
    ).toEqual(["admin@example.com", "ops@example.com"]);
  });

  it("treats empty strings as unset", () => {
    expect(loadConfig({ ...valid, METRICS_TOKEN: "", PORT: "" }).metricsToken).toBeUndefined();
  });

  it("infers the email provider from the credentials present", () => {
    expect(loadConfig({ ...valid, RESEND_API_KEY: "re_x" }).email.provider).toBe("resend");
    expect(loadConfig({ ...valid, SMTP_URL: "smtp://localhost:1025" }).email.provider).toBe("smtp");
  });

  it("rejects an explicit provider without its credentials", () => {
    expect(() => loadConfig({ ...valid, EMAIL_PROVIDER: "resend" })).toThrowError(/RESEND_API_KEY/);
    expect(() => loadConfig({ ...valid, EMAIL_PROVIDER: "smtp" })).toThrowError(/SMTP_URL/);
  });

  it("refuses the noop email provider in production", () => {
    expect(() => loadConfig({ ...valid, NODE_ENV: "production" })).toThrowError(/production/);
  });

  it("enables telemetry when an OTLP endpoint is set", () => {
    const config = loadConfig({ ...valid, OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4318" });
    expect(config.telemetry).toEqual({ enabled: true, otlpEndpoint: "http://localhost:4318" });
    expect(
      loadConfig({
        ...valid,
        OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4318",
        OTEL_SDK_DISABLED: "true",
      }).telemetry.enabled,
    ).toBe(false);
  });

  it("throws a ConfigError listing every problem", () => {
    expect(() => loadConfig({ AUTH_SECRET: "short", PORT: "99999" })).toThrowError(ConfigError);
    try {
      loadConfig({ AUTH_SECRET: "short", PORT: "99999" });
    } catch (error) {
      const message = (error as ConfigError).message;
      for (const key of ["APP_URL", "DATABASE_URL", "REDIS_URL", "AUTH_SECRET", "PORT"]) {
        expect(message).toContain(key);
      }
    }
  });

  it("rejects non-postgres database URLs", () => {
    expect(() => loadConfig({ ...valid, DATABASE_URL: "mysql://x" })).toThrowError(ConfigError);
  });

  it("returns a frozen object", () => {
    expect(Object.isFrozen(loadConfig(valid))).toBe(true);
  });

  it("disables analytics unless both ANALYTICS_URL and ANALYTICS_WEBSITE_ID are set", () => {
    expect(loadConfig(valid).analytics).toEqual({ enabled: false });
    expect(
      loadConfig({
        ...valid,
        ANALYTICS_URL: "http://localhost:3002/",
        ANALYTICS_WEBSITE_ID: "6ef283e9-def7-423a-9a9a-5682722e1daf",
      }).analytics,
    ).toEqual({
      enabled: true,
      url: "http://localhost:3002",
      serverUrl: "http://localhost:3002",
      websiteId: "6ef283e9-def7-423a-9a9a-5682722e1daf",
    });
  });

  it("lets the server post analytics to a private address", () => {
    const config = loadConfig({
      ...valid,
      ANALYTICS_URL: "http://localhost:3002",
      ANALYTICS_SERVER_URL: "http://umami:3000/",
      ANALYTICS_WEBSITE_ID: "6ef283e9-def7-423a-9a9a-5682722e1daf",
    });
    expect(config.analytics).toMatchObject({ enabled: true, serverUrl: "http://umami:3000" });
  });

  it("rejects a half-configured analytics pair", () => {
    expect(() => loadConfig({ ...valid, ANALYTICS_URL: "http://localhost:3002" })).toThrow(
      ConfigError,
    );
    expect(() =>
      loadConfig({ ...valid, ANALYTICS_WEBSITE_ID: "6ef283e9-def7-423a-9a9a-5682722e1daf" }),
    ).toThrow(/ANALYTICS_URL and ANALYTICS_WEBSITE_ID/);
  });
});
