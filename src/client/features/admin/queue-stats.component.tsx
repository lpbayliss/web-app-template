import { useIntl } from "react-intl";
import { useQueueStats } from "./use-admin-users.hook";

/** Live counts from BullMQ. The full dashboard is the Bull Board container (http://localhost:3003 in dev). */
export function QueueStats() {
  const intl = useIntl();
  const stats = useQueueStats();
  return (
    <section className="rounded-card border border-line bg-surface-raised p-4">
      <h2 className="mb-3 font-semibold">{intl.formatMessage({ id: "admin.queueStats" })}</h2>
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
