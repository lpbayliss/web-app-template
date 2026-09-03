import { createRoute, redirect } from "@tanstack/react-router";
import { useIntl } from "react-intl";
import { Page } from "#client/components/page.component";
import { QueueStats } from "#client/features/admin/queue-stats.component";
import { UserTable } from "#client/features/admin/user-table.component";
import { rootRoute } from "./root.route";

function AdminPage() {
  const intl = useIntl();
  const { session } = adminRoute.useRouteContext();
  return (
    <Page title={intl.formatMessage({ id: "admin.title" })}>
      <div className="space-y-8">
        <QueueStats />
        <section className="space-y-3">
          <h2 className="font-semibold">{intl.formatMessage({ id: "admin.users" })}</h2>
          <UserTable currentUserId={session.user?.id ?? ""} />
        </section>
      </div>
    </Page>
  );
}

/** Admin role only. The server enforces the same rule; this just avoids showing a broken page. */
export const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin",
  beforeLoad: ({ context, location }) => {
    if (!context.session.user)
      throw redirect({ to: "/login", search: { redirect: location.href } });
    if (!context.session.isAdmin) throw redirect({ to: "/" });
  },
  component: AdminPage,
});
