import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { IntlProvider as ReactIntlProvider } from "react-intl";
import { analytics } from "#client/lib/analytics.client";
import en from "./en.messages.json";

export const LOCALES = ["en", "de"] as const;
export type Locale = (typeof LOCALES)[number];
const DEFAULT_LOCALE: Locale = "en";

type Messages = Record<string, string>;

/** English ships in the main bundle; other locales load on demand. */
const loaders: Record<Locale, () => Promise<Messages>> = {
  en: async () => en,
  de: () => import("./de.messages.json").then((m) => m.default),
};

const STORAGE_KEY = "locale";

export function detectLocale(candidates: readonly string[] = navigator.languages): Locale {
  for (const candidate of candidates) {
    const base = candidate.toLowerCase().split("-")[0];
    if (LOCALES.includes(base as Locale)) return base as Locale;
  }
  return DEFAULT_LOCALE;
}

function initialLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && LOCALES.includes(stored as Locale)) return stored as Locale;
  } catch {
    // ignore
  }
  return detectLocale();
}

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function IntlProvider({
  children,
  locale: forced,
}: {
  children: ReactNode;
  locale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(forced ?? initialLocale);
  const [messages, setMessages] = useState<Messages>(en);

  useEffect(() => {
    let cancelled = false;
    loaders[locale]().then((loaded) => {
      if (!cancelled) setMessages(loaded);
    });
    document.documentElement.lang = locale;
    return () => {
      cancelled = true;
    };
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    analytics.track("locale.changed", { locale: next });
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);

  return (
    <LocaleContext.Provider value={value}>
      <ReactIntlProvider locale={locale} defaultLocale={DEFAULT_LOCALE} messages={messages}>
        {children}
      </ReactIntlProvider>
    </LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used inside <IntlProvider>");
  return ctx;
}
