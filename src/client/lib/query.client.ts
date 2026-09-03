import { QueryClient } from "@tanstack/react-query";

/** One QueryClient per app. Defaults tuned for an authenticated SPA. */
function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failureCount, error) => {
          // Never retry auth/validation failures; they will not fix themselves.
          const code = (error as { data?: { code?: string } }).data?.code;
          if (code === "UNAUTHORIZED" || code === "FORBIDDEN" || code === "BAD_REQUEST")
            return false;
          return failureCount < 2;
        },
        refetchOnWindowFocus: false,
      },
      mutations: { retry: 0 },
    },
  });
}

export const queryClient = createQueryClient();
