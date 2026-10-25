"use client";

import { useI18n } from "@/components/LocaleProvider";

/** Formats a stored ILS amount in the active locale (₪ or estimated USD). */
export function Money({ amount }: { amount: number }) {
  const { formatPrice } = useI18n();
  return <>{formatPrice(amount)}</>;
}

/** Shown next to prices in English. Hidden in Hebrew, where the amount is already in ₪. */
export function EstimatedPriceNote() {
  const { locale, m } = useI18n();
  if (locale !== "en") return null;
  return (
    <p style={{ margin: "0.35rem 0 0", fontSize: "0.75rem", color: "#9A958F", lineHeight: 1.4 }}>
      {m.currency.estimated}
    </p>
  );
}
