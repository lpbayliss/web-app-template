import client, { Counter, Gauge, Histogram, Registry } from "@prometheus-io/client";

/**
 * Prometheus metrics. Built-ins cover HTTP and WebSocket traffic; features add their own
 * series through `Metrics.counter/gauge/histogram`, which are idempotent so hot-reloads and
 * tests do not trip "metric already registered".
 */
function createMetrics(registry: Registry = new Registry()) {
  client.collectDefaultMetrics({ register: registry });

  const find = <T>(name: string): T | undefined => registry.getSingleMetric(name) as T | undefined;

  const counter = <L extends string = string>(
    name: string,
    help: string,
    labelNames: readonly L[] = [],
  ) =>
    find<Counter<L>>(name) ??
    new Counter<L>({ name, help, labelNames: [...labelNames], registers: [registry] });

  const gauge = <L extends string = string>(
    name: string,
    help: string,
    labelNames: readonly L[] = [],
  ) =>
    find<Gauge<L>>(name) ??
    new Gauge<L>({ name, help, labelNames: [...labelNames], registers: [registry] });

  const histogram = <L extends string = string>(
    name: string,
    help: string,
    labelNames: readonly L[] = [],
    buckets?: number[],
  ) =>
    find<Histogram<L>>(name) ??
    new Histogram<L>({
      name,
      help,
      labelNames: [...labelNames],
      ...(buckets ? { buckets } : {}),
      registers: [registry],
    });

  return {
    registry,
    counter,
    gauge,
    histogram,
    httpRequestDuration: histogram(
      "http_request_duration_seconds",
      "HTTP request duration in seconds",
      ["method", "route", "status"],
      [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    ),
    httpRequestsTotal: counter("http_requests_total", "Total HTTP requests", [
      "method",
      "route",
      "status",
    ]),
    wsConnections: gauge("ws_connections", "Open WebSocket connections"),
    contentType: registry.contentType,
    /** Text exposition for GET /metrics */
    render: () => registry.metrics(),
    /** Clears all series (tests). */
    reset: () => registry.resetMetrics(),
  };
}

export type MetricsRegistry = ReturnType<typeof createMetrics>;

export { createMetrics };

/** Process-wide metrics registry. */
export const Metrics: MetricsRegistry = createMetrics();
