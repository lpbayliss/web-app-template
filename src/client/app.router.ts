import { createRouter } from "@tanstack/react-router";
import { adminRoute } from "./routes/admin.route";
import { homeRoute } from "./routes/home.route";
import { loginRoute } from "./routes/login.route";
import { registerRoute } from "./routes/register.route";
import { rootRoute } from "./routes/root.route";
import { tasksRoute } from "./routes/tasks.route";

/** Code-based route tree (keeps the `[name].route.tsx` convention instead of file-based routing). */
export const routeTree = rootRoute.addChildren([
  homeRoute,
  tasksRoute,
  loginRoute,
  registerRoute,
  adminRoute,
]);

export const router = createRouter({
  routeTree,
  // Real context is injected by <RouterProvider context={...}> once the session is known.
  context: { session: undefined as never },
  defaultPreload: "intent",
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
