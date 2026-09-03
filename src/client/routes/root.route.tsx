import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { useIntl } from "react-intl";
import { NavBar } from "#client/components/nav-bar.component";
import type { SessionState } from "#client/features/auth/use-session.hook";

/** Values every route can read in `beforeLoad`/`loader` via `context`. */
export interface RouterContext {
  session: SessionState;
}

function RootLayout() {
  const { session } = rootRoute.useRouteContext();
  return (
    <div className="flex min-h-full flex-col">
      <NavBar session={session} />
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}

function ErrorFallback({ error }: { error: Error }) {
  const intl = useIntl();
  return (
    <div role="alert" className="p-8 text-center">
      <p className="font-medium">{intl.formatMessage({ id: "error.generic" })}</p>
      <p className="mt-2 text-sm text-muted">{error.message}</p>
    </div>
  );
}

function NotFound() {
  const intl = useIntl();
  return (
    <p className="p-8 text-center text-muted">{intl.formatMessage({ id: "error.notFound" })}</p>
  );
}

export const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: NotFound,
  errorComponent: ErrorFallback,
});
