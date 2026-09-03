import { useIntl } from "react-intl";
import { useQueueStats } from "./use-admin-users.hook";

/** Live counts from BullMQ; the full dashboard lives at /admin/queues (server-rendered). */
export function QueueStats() {
  const intl = useIntl();
  const stats = useQueueStats();
  return (
    <section className="rounded-card border border-line bg-surface-raised p-4">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">{intl.formatMessage({ id: "admin.queueStats" })}</h2>
        <a href="/admin/queues" className="text-sm text-accent underline-offset-2 hover:underline">
          {intl.formatMessage({ id: "admin.queues" })}
        </a>
      </header>
      <dl className="grid grid-cols-3 gap-3 text-sm sm:grid-cols-6">
        {Object.entries(stats.data ?? {}).map(([state, count]) => (
          <div key={state}>
            <dt className="text-muted capitalize">{state}</dt>
            <dd className="text-lg font-semibold tabular-nums">{count}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
