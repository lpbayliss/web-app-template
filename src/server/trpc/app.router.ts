import { activityRouter } from "#server/features/activity/activity.router";
import { adminRouter } from "#server/features/admin/admin.router";
import { systemRouter } from "#server/features/system/system.router";
import { taskRouter } from "#server/features/task/task.router";
import { router } from "./trpc";

export const appRouter = router({
  system: systemRouter,
  task: taskRouter,
  activity: activityRouter,
  admin: adminRouter,
});

/** The only thing the client imports from the server: a type. */
export type AppRouter = typeof appRouter;
