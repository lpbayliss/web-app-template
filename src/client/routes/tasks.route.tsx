import { createRoute, redirect } from "@tanstack/react-router";
import { useIntl } from "react-intl";
import { Page } from "#client/components/page.component";
import { ActivityFeed } from "#client/features/activity/activity-feed.component";
import { TaskList } from "#client/features/task/task-list.component";
import { rootRoute } from "./root.route";

function TasksPage() {
  const intl = useIntl();
  return (
    <Page title={intl.formatMessage({ id: "tasks.title" })}>
      <div className="grid gap-6 md:grid-cols-[2fr_1fr]">
        <TaskList />
        <ActivityFeed />
      </div>
    </Page>
  );
}

/** Signed-in users only; anonymous visitors bounce to /login and come back afterwards. */
export const tasksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tasks",
  beforeLoad: ({ context, location }) => {
    if (!context.session.user) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
  },
  component: TasksPage,
});
