import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { server } from "#test/client/msw.server";
import { Providers } from "#test/client/render";
import { trpcMock } from "#test/client/trpc.mock";

type Handlers = { onData?: (event: unknown) => void };
const subscription = vi.hoisted(() => ({ handlers: {} as Handlers, status: "pending" }));

vi.mock("@trpc/tanstack-react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@trpc/tanstack-react-query")>();
  return {
    ...actual,
    useSubscription: (opts: Handlers) => {
      subscription.handlers = opts;
      return { status: subscription.status };
    },
  };
});

const { useActivityFeed } = await import("./use-activity-feed.hook");

const event = (id: string, at = new Date().toISOString()) => ({
  id,
  type: "task.created",
  userId: "u",
  taskId: id,
  title: id,
  at,
});

describe("useActivityFeed", () => {
  it("hydrates from recent events, prepends live ones and de-duplicates", async () => {
    server.use(trpcMock.query("activity.recent", [event("r1"), event("r2")]));
    const { result } = renderHook(() => useActivityFeed(), { wrapper: Providers });
    await waitFor(() => expect(result.current.events.map((e) => e.id)).toEqual(["r1", "r2"]));

    act(() => subscription.handlers.onData?.(event("live-1")));
    act(() => subscription.handlers.onData?.(event("r1")));
    expect(result.current.events.map((e) => e.id)).toEqual(["r1", "live-1", "r2"]);
    expect(result.current.status).toBe("pending");
  });

  it("caps the feed length", async () => {
    server.use(trpcMock.query("activity.recent", []));
    const { result } = renderHook(() => useActivityFeed(), { wrapper: Providers });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => {
      for (let i = 0; i < 30; i++) subscription.handlers.onData?.(event(`e${i}`));
    });
    expect(result.current.events).toHaveLength(20);
    expect(result.current.events[0]?.id).toBe("e29");
  });
});
