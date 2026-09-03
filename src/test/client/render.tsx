import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { type RenderOptions, render } from "@testing-library/react";
import { createTRPCClient, httpLink } from "@trpc/client";
import type { ReactElement, ReactNode } from "react";
import { IntlProvider } from "#client/i18n/intl.provider";
import { TRPCProvider } from "#client/lib/trpc.client";
import { ThemeProvider } from "#client/providers/theme.provider";
import type { AppRouter } from "#server/trpc/app.router";

export const TEST_API_URL = "http://localhost/api/trpc";

/** Fresh clients per test so cached data never leaks between cases. */
function createTestClients() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  // Unbatched httpLink keeps MSW handlers simple: one request per procedure.
  const trpcClient = createTRPCClient<AppRouter>({ links: [httpLink({ url: TEST_API_URL })] });
  return { queryClient, trpcClient };
}

export function Providers({ children }: { children: ReactNode }) {
  const { queryClient, trpcClient } = createTestClients();
  return (
    <ThemeProvider>
      <IntlProvider locale="en">
        <QueryClientProvider client={queryClient}>
          <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
            {children}
          </TRPCProvider>
        </QueryClientProvider>
      </IntlProvider>
    </ThemeProvider>
  );
}

/** Intl + Query + tRPC providers; enough for most components and hooks. */
export function renderWithProviders(ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) {
  return render(ui, { wrapper: Providers, ...options });
}

/** Adds a memory router for components that use <Link> or navigation. */
export function renderWithRouter(ui: ReactElement, { path = "/" } = {}) {
  const rootRoute = createRootRoute({ component: () => ui });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  return render(
    <Providers>
      <RouterProvider router={router} />
    </Providers>,
  );
}
