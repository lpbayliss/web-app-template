import { Link, useNavigate } from "@tanstack/react-router";
import { useIntl } from "react-intl";
import type { SessionState } from "#client/features/auth/use-session.hook";
import { LOCALES, type Locale, useLocale } from "#client/i18n/intl.provider";
import { type Theme, useTheme } from "#client/providers/theme.provider";
import { Button } from "./button.component";

const THEMES: Theme[] = ["light", "dark", "system"];

export function NavBar({ session }: { session: SessionState }) {
  const intl = useIntl();
  const { locale, setLocale } = useLocale();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();

  return (
    <nav className="border-b border-line bg-surface-raised">
      <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
        <Link to="/" className="font-semibold">
          {intl.formatMessage({ id: "app.name" })}
        </Link>
        <div className="flex gap-3 text-sm">
          <Link to="/tasks" activeProps={{ className: "text-accent" }}>
            {intl.formatMessage({ id: "nav.tasks" })}
          </Link>
          {session.isAdmin && (
            <Link to="/admin" activeProps={{ className: "text-accent" }}>
              {intl.formatMessage({ id: "nav.admin" })}
            </Link>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <select
            aria-label={intl.formatMessage({ id: "nav.language" })}
            value={locale}
            onChange={(e) => setLocale(e.target.value as Locale)}
            className="h-8 rounded-md border border-line bg-surface px-2 text-sm"
          >
            {LOCALES.map((l) => (
              <option key={l} value={l}>
                {l.toUpperCase()}
              </option>
            ))}
          </select>
          <select
            aria-label={intl.formatMessage({ id: "nav.theme" })}
            value={theme}
            onChange={(e) => setTheme(e.target.value as Theme)}
            className="h-8 rounded-md border border-line bg-surface px-2 text-sm"
          >
            {THEMES.map((t) => (
              <option key={t} value={t}>
                {intl.formatMessage({ id: `theme.${t}` })}
              </option>
            ))}
          </select>
          {session.user ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                await session.signOut();
                await navigate({ to: "/" });
              }}
            >
              {intl.formatMessage({ id: "nav.signOut" })}
            </Button>
          ) : (
            <Link to="/login" className="text-sm">
              {intl.formatMessage({ id: "nav.signIn" })}
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
