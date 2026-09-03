import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  data: null as { user: { id: string; role?: string } } | null,
  isPending: false,
  signOut: vi.fn(async () => {}),
  clear: vi.fn(),
}));

vi.mock("#client/lib/auth.client", () => ({
  authClient: {
    useSession: () => ({ data: state.data, isPending: state.isPending, refetch: vi.fn() }),
    signOut: state.signOut,
  },
  isAdminUser: (u: { role?: string } | null) => u?.role === "admin",
}));
vi.mock("#client/lib/query.client", () => ({ queryClient: { clear: state.clear } }));

const { useSession } = await import("./use-session.hook");

describe("useSession", () => {
  it("reports anonymous state", () => {
    const { result } = renderHook(() => useSession());
    expect(result.current).toMatchObject({ user: null, isAdmin: false, isPending: false });
  });

  it("derives isAdmin from the role", () => {
    state.data = { user: { id: "a", role: "admin" } };
    const { result } = renderHook(() => useSession());
    expect(result.current.isAdmin).toBe(true);
    expect(result.current.user?.id).toBe("a");
  });

  it("clears cached queries on sign-out", async () => {
    const { result } = renderHook(() => useSession());
    await act(() => result.current.signOut());
    expect(state.signOut).toHaveBeenCalled();
    expect(state.clear).toHaveBeenCalled();
  });
});
