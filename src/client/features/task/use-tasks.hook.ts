import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "#client/lib/trpc.client";
import type { Task } from "#shared/schemas/task.schema";

export function useTasks() {
  const trpc = useTRPC();
  return useQuery(trpc.task.list.queryOptions());
}

/**
 * Optimistic create. The id is generated here and sent to the server, so the optimistic row and
 * the persisted row share one React key: no exit/enter flicker when the response lands.
 */
export function useCreateTask() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const listKey = trpc.task.list.queryKey();
  const mutation = useMutation(
    trpc.task.create.mutationOptions({
      onMutate: async (input) => {
        await queryClient.cancelQueries({ queryKey: listKey });
        const previous = queryClient.getQueryData(listKey);
        const optimistic: Task = {
          id: input.id ?? crypto.randomUUID(),
          title: input.title,
          completed: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        queryClient.setQueryData(listKey, (old) => [optimistic, ...(old ?? [])]);
        return { previous };
      },
      onError: (_error, _input, context) => {
        if (context?.previous) queryClient.setQueryData(listKey, context.previous);
      },
      onSettled: () => queryClient.invalidateQueries({ queryKey: listKey }),
    }),
  );
  return {
    ...mutation,
    mutateAsync: (input: { title: string }) =>
      mutation.mutateAsync({ id: crypto.randomUUID(), ...input }),
  };
}

export function useToggleTask() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const listKey = trpc.task.list.queryKey();
  return useMutation(
    trpc.task.update.mutationOptions({
      onMutate: async (input) => {
        await queryClient.cancelQueries({ queryKey: listKey });
        const previous = queryClient.getQueryData(listKey);
        queryClient.setQueryData(listKey, (old) =>
          old?.map((task) =>
            task.id === input.id
              ? {
                  ...task,
                  ...(input.title !== undefined ? { title: input.title } : {}),
                  ...(input.completed !== undefined ? { completed: input.completed } : {}),
                }
              : task,
          ),
        );
        return { previous };
      },
      onError: (_error, _input, context) => {
        if (context?.previous) queryClient.setQueryData(listKey, context.previous);
      },
      onSettled: () => queryClient.invalidateQueries({ queryKey: listKey }),
    }),
  );
}

export function useRemoveTask() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const listKey = trpc.task.list.queryKey();
  return useMutation(
    trpc.task.remove.mutationOptions({
      onMutate: async (input) => {
        await queryClient.cancelQueries({ queryKey: listKey });
        const previous = queryClient.getQueryData(listKey);
        queryClient.setQueryData(listKey, (old) => old?.filter((task) => task.id !== input.id));
        return { previous };
      },
      onError: (_error, _input, context) => {
        if (context?.previous) queryClient.setQueryData(listKey, context.previous);
      },
      onSettled: () => queryClient.invalidateQueries({ queryKey: listKey }),
    }),
  );
}
