import { Config } from "./config";
import { Context } from "./context";
import { Logger } from "./logger";
import { Metrics } from "./metrics";

export type AnalyticsValue = string | number | boolean | null;

/** Properties attached to an event. `userId` becomes the distinct id; everything else is event data. */
export interface AnalyticsProps {
  userId?: string;
  [key: string]: AnalyticsValue | undefined;
}

export interface AnalyticsEvent {
  name: string;
  /** Request path the event happened on (`/server` outside a request). */
  url: string;
  userId?: string;
  data: Record<string, AnalyticsValue>;
}

/** Minimal sink contract so the vendor is a one-file swap. */
export interface AnalyticsProvider {
  readonly name: string;
  send(event: AnalyticsEvent): Promise<void>;
}

export const noopProvider: AnalyticsProvider = { name: "noop", send: async () => {} };

export interface UmamiProviderOptions {
  url: string;
  websiteId: string;
  hostname: string;
  userAgent: string;
  fetch?: typeof fetch;
}

/**
 * Umami's collect endpoint (`POST /api/send`). Umami drops requests whose User-Agent looks like
 * a bot, so self-hosted instances receiving server events need `DISABLE_BOT_CHECK=1`.
 */
export function createUmamiProvider(options: UmamiProviderOptions): AnalyticsProvider {
  const post = options.fetch ?? globalThis.fetch;
  return {
    name: "umami",
    async send(event) {
      const response = await post(`${options.url}/api/send`, {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": options.userAgent },
        body: JSON.stringify({
          type: "event",
          payload: {
            website: options.websiteId,
            hostname: options.hostname,
            url: event.url,
            name: event.name,
            data: event.data,
            ...(event.userId ? { id: event.userId } : {}),
          },
        }),
      });
      if (!response.ok) throw new Error(`umami responded ${response.status}`);
    },
  };
}

export function createAnalytics(provider: AnalyticsProvider) {
  const log = Logger.child({ module: "analytics" });
  const outcomes = Metrics.counter("analytics_events_total", "Analytics events by outcome", [
    "result",
  ]);
  const enabled = provider.name !== noopProvider.name;

  return {
    provider,
    enabled,
    /** Fire-and-forget: never awaited by callers, never throws. */
    track(name: string, props: AnalyticsProps = {}): void {
      if (!enabled) return;
      const { userId, ...rest } = props;
      const data = Object.fromEntries(
        Object.entries(rest).filter(
          (entry): entry is [string, AnalyticsValue] => entry[1] !== undefined,
        ),
      );
      const resolvedUserId = userId ?? Context.get("userId");
      const event: AnalyticsEvent = {
        name,
        url: Context.get("path") ?? "/server",
        data,
        ...(resolvedUserId !== undefined ? { userId: resolvedUserId } : {}),
      };
      provider.send(event).then(
        () => outcomes.inc({ result: "sent" }),
        (error: unknown) => {
          // Analytics must never take a request or job down with it.
          outcomes.inc({ result: "error" });
          log.warn({ event: name, error }, "analytics event failed");
        },
      );
    },
  };
}

export type AnalyticsApi = ReturnType<typeof createAnalytics>;

function providerFromConfig(): AnalyticsProvider {
  if (!Config.analytics.enabled) return noopProvider;
  return createUmamiProvider({
    url: Config.analytics.serverUrl,
    websiteId: Config.analytics.websiteId,
    hostname: new URL(Config.appUrl).hostname,
    userAgent: `${Config.appName}/${Config.appVersion}`,
  });
}

let current: AnalyticsApi | undefined;

function active(): AnalyticsApi {
  current ??= createAnalytics(providerFromConfig());
  return current;
}

/**
 * Process-wide analytics. Services call `Analytics.track("task.created", { userId, taskId })`;
 * the provider comes from `ANALYTICS_*` (Umami) or is a no-op. Tests swap it with `Analytics.use`.
 */
export const Analytics = {
  /** Swap the provider (tests). Returns the previous one so it can be restored. */
  use(provider: AnalyticsProvider): AnalyticsProvider {
    const previous = active().provider;
    current = createAnalytics(provider);
    return previous;
  },
  get enabled() {
    return active().enabled;
  },
  track: (name: string, props?: AnalyticsProps) => active().track(name, props),
};
