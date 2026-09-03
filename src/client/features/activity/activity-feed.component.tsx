import { AnimatePresence, motion } from "motion/react";
import { FormattedRelativeTime, useIntl } from "react-intl";
import type { ActivityEvent } from "#server/features/activity/activity.service";
import { useActivityFeed } from "./use-activity-feed.hook";

function secondsAgo(iso: string): number {
  return Math.round((new Date(iso).getTime() - Date.now()) / 1000);
}

export function ActivityFeed() {
  const intl = useIntl();
  const { events, status } = useActivityFeed();
  return (
    <aside className="rounded-card border border-line bg-surface-raised p-4">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">{intl.formatMessage({ id: "activity.title" })}</h2>
        <span
          className={`text-xs ${status === "pending" ? "text-success" : "text-muted"}`}
          data-testid="activity-status"
        >
          {intl.formatMessage({
            id: status === "pending" ? "activity.live" : "activity.connecting",
          })}
        </span>
      </header>
      {events.length === 0 && (
        <p className="text-sm text-muted">{intl.formatMessage({ id: "activity.empty" })}</p>
      )}
      <ol className="space-y-1 text-sm">
        <AnimatePresence initial={false}>
          {events.map((event) => (
            <ActivityRow key={event.id} event={event} />
          ))}
        </AnimatePresence>
      </ol>
    </aside>
  );
}

function ActivityRow({ event }: { event: ActivityEvent }) {
  const intl = useIntl();
  return (
    <motion.li
      layout
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="flex justify-between gap-3 overflow-hidden"
    >
      <span>
        {intl.formatMessage({ id: `activity.${event.type}` }, { title: event.title ?? "" })}
      </span>
      <span className="shrink-0 text-muted">
        <FormattedRelativeTime
          value={secondsAgo(event.at)}
          numeric="auto"
          updateIntervalInSeconds={30}
        />
      </span>
    </motion.li>
  );
}
