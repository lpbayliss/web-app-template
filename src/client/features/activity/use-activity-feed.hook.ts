import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSubscription } from "@trpc/tanstack-react-query";
import { useState } from "react";
import { useTRPC } from "#client/lib/trpc.client";
import type { ActivityEvent } from "#server/features/activity/activity.service";

const MAX_EVENTS = 20;

/**
 * Hydrates from `activity.recent`, then appends live events from the WebSocket subscription.
 * Any event also invalidates the task list, so other tabs stay in sync.
 */
export function useActivityFeed(enabled = true) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [live, setLive] = useState<ActivityEvent[]>([]);

  const recent = useQuery({ ...trpc.activity.recent.queryOptions({ limit: MAX_EVENTS }), enabled });

  const subscription = useSubscription(
    trpc.activity.onEvent.subscriptionOptions(undefined, {
      enabled,
      onData: (event) => {
        setLive((prev) => [event, ...prev].slice(0, MAX_EVENTS));
        // Keep other tabs in sync. A mutation in this tab already reconciles the list itself;
        // refetching mid-flight would swap React keys under the optimistic row.
        if (queryClient.isMutating() === 0) {
          void queryClient.invalidateQueries({ queryKey: trpc.task.list.queryKey() });
        }
      },
    }),
  );

  const seen = new Set<string>();
  const events = [...live, ...(recent.data ?? [])]
    .filter((event) => (seen.has(event.id) ? false : seen.add(event.id)))
    .slice(0, MAX_EVENTS);

  return { events, status: subscription.status, isLoading: recent.isPending };
}
