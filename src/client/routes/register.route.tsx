import { createRoute, Link, redirect } from "@tanstack/react-router";
import { useIntl } from "react-intl";
import { Page } from "#client/components/page.component";
import { RegisterForm } from "#client/features/auth/register-form.component";
import { rootRoute } from "./root.route";

function RegisterPage() {
  const intl = useIntl();
  const { session } = registerRoute.useRouteContext();
  return (
    <Page title={intl.formatMessage({ id: "auth.signUp" })}>
      <div className="mx-auto max-w-sm space-y-4">
        <RegisterForm onSuccess={() => session.refetch()} />
        <p className="text-sm text-muted">
          {intl.formatMessage({ id: "auth.haveAccount" })}{" "}
          <Link to="/login" className="text-accent">
            {intl.formatMessage({ id: "auth.signIn" })}
          </Link>
        </p>
      </div>
    </Page>
  );
}

export const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/register",
  beforeLoad: ({ context }) => {
    if (context.session.user) throw redirect({ to: "/tasks" });
  },
  component: RegisterPage,
});
