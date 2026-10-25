"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { formatMoney } from "@/lib/i18n/currency";
import { dirFor, LOCALE_COOKIE, parseLocale, type Locale } from "@/lib/i18n/locale";
import { getMessages, type Messages } from "@/lib/i18n/messages";

type LocaleContextValue = {
  locale: Locale;
  dir: "rtl" | "ltr";
  m: Messages;
  setLocale: (next: Locale, opts?: { persistRemote?: boolean }) => Promise<void>;
  formatPrice: (amountIls: number) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

function writeLocaleCookie(next: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
  try {
    localStorage.setItem(LOCALE_COOKIE, next);
  } catch {
    /* private mode */
  }
}

export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: React.ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const applyDom = useCallback((next: Locale) => {
    document.documentElement.lang = next;
    document.documentElement.dir = dirFor(next);
    writeLocaleCookie(next);
  }, []);

  const setLocale = useCallback(
    async (next: Locale, opts?: { persistRemote?: boolean }) => {
      setLocaleState(next);
      applyDom(next);
      if (opts?.persistRemote === false) return;
      const token = localStorage.getItem("token");
      if (!token) return;
      await fetch("/api/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ locale: next }),
      }).catch(() => {});
      try {
        const raw = localStorage.getItem("user");
        if (!raw) return;
        const user = JSON.parse(raw) as { locale?: string };
        user.locale = next;
        localStorage.setItem("user", JSON.stringify(user));
      } catch {
        /* ignore */
      }
    },
    [applyDom]
  );

  useEffect(() => {
    applyDom(locale);
  }, [locale, applyDom]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;
    let cancelled = false;
    fetch("/api/profile", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((user: { locale?: string } | null) => {
        if (cancelled || !user?.locale) return;
        const saved = parseLocale(user.locale);
        setLocaleState((current) => (current === saved ? current : saved));
        applyDom(saved);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [applyDom]);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      dir: dirFor(locale),
      m: getMessages(locale),
      setLocale,
      formatPrice: (amountIls) => formatMoney(amountIls, locale),
    }),
    [locale, setLocale]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useI18n must be used within LocaleProvider");
  return ctx;
}
