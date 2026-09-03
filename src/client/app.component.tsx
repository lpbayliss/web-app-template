import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { MotionConfig } from "motion/react";
import { useEffect } from "react";
import { router } from "./app.router";
import { useSession } from "./features/auth/use-session.hook";
import { IntlProvider } from "./i18n/intl.provider";
import { queryClient } from "./lib/query.client";
import { TRPCProvider, trpcClient } from "./lib/trpc.client";
import { ThemeProvider } from "./providers/theme.provider";

/** Bridges the auth session into router context so routes can guard in `beforeLoad`. */
function RouterWithAuth() {
  const session = useSession();
  const userId = session.user?.id;
  // Re-run route guards (`beforeLoad`) whenever the signed-in user changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: userId is the trigger, not an input
  useEffect(() => {
    // The router only has a real context once <RouterProvider> has rendered with a settled session.
    if (session.isPending) return;
    void router.invalidate();
  }, [userId, session.isPending]);
  if (session.isPending) return null;
  return <RouterProvider router={router} context={{ session }} />;
}

export function App() {
  return (
    <ThemeProvider>
      <IntlProvider>
        <QueryClientProvider client={queryClient}>
          <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
            {/* Honour prefers-reduced-motion for every motion component. */}
            <MotionConfig reducedMotion="user">
              <RouterWithAuth />
            </MotionConfig>
          </TRPCProvider>
        </QueryClientProvider>
      </IntlProvider>
    </ThemeProvider>
  );
}
