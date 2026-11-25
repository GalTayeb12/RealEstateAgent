"use client";
import { useMemo } from "react";
import { useI18n } from "@/components/LocaleProvider";
import type { Locale } from "@/lib/studio/design/options";
import { makeT } from "@/lib/studio/i18n";

/** Studio strings for the current site language (Hebrew is RTL; the layout follows `dir` on the root). */
export function useT() {
  const { locale } = useI18n();
  const l: Locale = locale === "he" ? "he" : "en";
  return useMemo(() => ({ t: makeT(l), locale: l }), [l]);
}
