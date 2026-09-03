import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { server } from "#test/client/msw.server";
import { Providers } from "#test/client/render";
import { trpcMock } from "#test/client/trpc.mock";
import { routeTree } from "./app.router";
import type { SessionState } from "./features/auth/use-session.hook";

vi.mock("#client/lib/auth.client", () => ({
  authClient: { signIn: { email: vi.fn() }, signUp: { email: vi.fn() } },
  isAdminUser: (u: { role?: string } | null) => u?.role === "admin",
}));
vi.mock("#client/features/activity/use-activity-feed.hook", () => ({
  useActivityFeed: () => ({ events: [], status: "connecting", isLoading: false }),
}));

const anonymous: SessionState = {
  user: null,
  isPending: false,
  isAdmin: false,
  refetch: vi.fn(),
  signOut: vi.fn(),
};
const member: SessionState = {
  ...anonymous,
  user: { id: "u1", role: "user" } as SessionState["user"],
};
const admin: SessionState = {
  ...anonymous,
  isAdmin: true,
  user: { id: "a1", role: "admin" } as SessionState["user"],
};

function renderAt(path: string, session: SessionState) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
    context: { session },
  });
  render(
    <Providers>
      <RouterProvider router={router} context={{ session }} />
    </Providers>,
  );
  return router;
}

describe("route guards", () => {
  it("renders the home page for everyone", async () => {
    server.use(
      trpcMock.query("system.info", { name: "t", version: "1", environment: "test", features: {} }),
    );
    renderAt("/", anonymous);
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(/Everything wired/);
    expect(await screen.findByText(/Version 1/)).toBeInTheDocument();
  });

  it("sends anonymous visitors from /tasks to /login with a redirect", async () => {
    const router = renderAt("/tasks", anonymous);
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(router.state.location.search).toEqual({ redirect: "/tasks" });
    expect(await screen.findByRole("form", { name: "Sign in" })).toBeInTheDocument();
  });

  it("shows tasks to signed-in users", async () => {
    server.use(trpcMock.query("task.list", []), trpcMock.query("activity.recent", []));
    renderAt("/tasks", member);
    expect(await screen.findByRole("heading", { name: "Tasks" })).toBeInTheDocument();
  });

  it("bounces signed-in users away from /login and /register", async () => {
    server.use(trpcMock.query("task.list", []), trpcMock.query("activity.recent", []));
    const router = renderAt("/login?redirect=%2Ftasks", member);
    await waitFor(() => expect(router.state.location.pathname).toBe("/tasks"));
    const router2 = renderAt("/register", member);
    await waitFor(() => expect(router2.state.location.pathname).toBe("/tasks"));
  });

  it("keeps members out of /admin and lets admins in", async () => {
    const router = renderAt("/admin", member);
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));

    server.use(
      trpcMock.query("admin.queueStats", { waiting: 1, active: 0 }),
      trpcMock.query("admin.listUsers", { items: [], total: 0, limit: 50, offset: 0 }),
    );
    renderAt("/admin", admin);
    expect(await screen.findByRole("heading", { name: "Administration" })).toBeInTheDocument();
    expect(await screen.findByText("waiting")).toBeInTheDocument();
  });

  it("renders the register page and not-found page", async () => {
    renderAt("/register", anonymous);
    expect(await screen.findByRole("form", { name: "Create account" })).toBeInTheDocument();
    renderAt("/nope", anonymous);
    expect(await screen.findByText("Page not found")).toBeInTheDocument();
  });
});
