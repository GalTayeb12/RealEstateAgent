export const LOCALE_COOKIE = "haveniq-locale";

export type Locale = "he" | "en";

export function parseLocale(value: string | null | undefined): Locale {
  return value === "en" ? "en" : "he";
}

export function dirFor(locale: Locale): "rtl" | "ltr" {
  return locale === "he" ? "rtl" : "ltr";
}
