import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "#client/lib/trpc.client";

export function useAdminUsers(search: string) {
  const trpc = useTRPC();
  return useQuery(trpc.admin.listUsers.queryOptions({ search: search || undefined, limit: 50 }));
}

export function useSetRole() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.admin.setRole.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.admin.listUsers.queryKey() }),
    }),
  );
}

export function useQueueStats() {
  const trpc = useTRPC();
  return useQuery({ ...trpc.admin.queueStats.queryOptions(), refetchInterval: 5_000 });
}
