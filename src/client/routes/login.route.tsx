import { createRoute, Link, redirect } from "@tanstack/react-router";
import { useIntl } from "react-intl";
import { z } from "zod";
import { Page } from "#client/components/page.component";
import { LoginForm } from "#client/features/auth/login-form.component";
import { rootRoute } from "./root.route";

const searchSchema = z.object({ redirect: z.string().optional() });

function LoginPage() {
  const intl = useIntl();
  const { session } = loginRoute.useRouteContext();
  return (
    <Page title={intl.formatMessage({ id: "auth.signIn" })}>
      <div className="mx-auto max-w-sm space-y-4">
        <LoginForm onSuccess={() => session.refetch()} />
        <p className="text-sm text-muted">
          {intl.formatMessage({ id: "auth.noAccount" })}{" "}
          <Link to="/register" className="text-accent">
            {intl.formatMessage({ id: "auth.signUp" })}
          </Link>
        </p>
      </div>
    </Page>
  );
}

export const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  validateSearch: searchSchema,
  // Once a session exists (including right after signing in) leave the page.
  beforeLoad: ({ context, search }) => {
    if (context.session.user) throw redirect({ href: search.redirect ?? "/tasks" });
  },
  component: LoginPage,
});
