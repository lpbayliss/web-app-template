import { useQuery } from "@tanstack/react-query";
import type { AnyRouter } from "@tanstack/react-router";
import { type ReactNode, useEffect } from "react";
import { analytics } from "#client/lib/analytics.client";
import { useTRPC } from "#client/lib/trpc.client";

interface AnalyticsProviderProps {
  router: Pick<AnyRouter, "subscribe">;
  userId: string | null;
  children: ReactNode;
}

/**
 * Turns analytics on when the server says it is configured: loads the tracker, sends a page view
 * per router navigation and identifies the signed-in user. Renders nothing of its own.
 */
export function AnalyticsProvider({ router, userId, children }: AnalyticsProviderProps) {
  const trpc = useTRPC();
  const { data } = useQuery({
    ...trpc.system.config.queryOptions(),
    staleTime: Number.POSITIVE_INFINITY,
  });
  const url = data?.analytics?.url;
  const websiteId = data?.analytics?.websiteId;

  useEffect(() => {
    if (!url || !websiteId) return;
    analytics.init({ url, websiteId });
    return router.subscribe("onResolved", () => analytics.page());
  }, [url, websiteId, router]);

  useEffect(() => {
    if (url && websiteId) analytics.identify(userId);
  }, [url, websiteId, userId]);

  return children;
}
