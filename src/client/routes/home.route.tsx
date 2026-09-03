import { useQuery } from "@tanstack/react-query";
import { createRoute, Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { useIntl } from "react-intl";
import { buttonStyles } from "#client/components/button.component";
import { useTRPC } from "#client/lib/trpc.client";
import { rootRoute } from "./root.route";

function HomePage() {
  const intl = useIntl();
  const trpc = useTRPC();
  const info = useQuery(trpc.system.info.queryOptions());
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mx-auto max-w-3xl px-4 py-20 text-center"
    >
      <h1 className="text-4xl font-semibold tracking-tight">
        {intl.formatMessage({ id: "home.title" })}
      </h1>
      <p className="mt-4 text-lg text-muted">{intl.formatMessage({ id: "home.subtitle" })}</p>
      <Link to="/tasks" className={buttonStyles({ size: "lg", className: "mt-8" })}>
        {intl.formatMessage({ id: "home.cta" })}
      </Link>
      {info.data && (
        <p className="mt-10 text-xs text-muted">
          {intl.formatMessage(
            { id: "home.version" },
            { version: info.data.version, environment: info.data.environment },
          )}
        </p>
      )}
    </motion.section>
  );
}

export const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomePage,
});
