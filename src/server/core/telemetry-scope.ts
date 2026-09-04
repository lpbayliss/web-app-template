/** The worker entrypoint (src/server/worker.main.ts in dev, dist/server/worker.js in prod). */
const WORKER_ENTRYPOINT = /worker(\.main)?\.(ts|js)$/;
const WORKER_SUFFIX = "-worker";

/**
 * Scope telemetry per process so the web tier and the worker are distinguishable everywhere
 * (Loki `service_name`, Tempo service, Prometheus `service_name`): the worker reports as
 * `<OTEL_SERVICE_NAME>-worker`, and both share `service.namespace=<OTEL_SERVICE_NAME>` so they
 * still group together. Runs in the OpenTelemetry preload, before Config exists, hence the
 * explicit env argument. Explicit values already in the environment are left alone.
 */
export function scopeServiceName(
  env: Record<string, string | undefined>,
  entrypoint: string | undefined,
): void {
  const base = env.OTEL_SERVICE_NAME;
  if (!base) return;
  const isWorker = entrypoint !== undefined && WORKER_ENTRYPOINT.test(entrypoint);
  if (isWorker && !base.endsWith(WORKER_SUFFIX)) {
    env.OTEL_SERVICE_NAME = `${base}${WORKER_SUFFIX}`;
  }
  const attributes = env.OTEL_RESOURCE_ATTRIBUTES;
  if (!attributes?.includes("service.namespace=")) {
    const namespace = `service.namespace=${base}`;
    env.OTEL_RESOURCE_ATTRIBUTES = attributes ? `${attributes},${namespace}` : namespace;
  }
}
