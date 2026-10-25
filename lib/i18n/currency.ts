import type { Locale } from "./locale";

/**
 * Display-only conversion. Prices are stored in ILS.
 * This is a fixed config rate, not a live FX feed — update it when the
 * estimate should move. English UI must label converted prices as estimated.
 */
export const ILS_PER_USD = 3.7;

export function ilsToUsd(amountIls: number): number {
  return amountIls / ILS_PER_USD;
}

export function formatIls(amountIls: number): string {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(amountIls);
}

export function formatUsdFromIls(amountIls: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(ilsToUsd(amountIls));
}

export function formatMoney(amountIls: number, locale: Locale): string {
  return locale === "en" ? formatUsdFromIls(amountIls) : formatIls(amountIls);
}

/** ASCII-safe amount for PDFs that use standard fonts (no shekel glyph). */
export function formatMoneyPlain(amountIls: number, locale: Locale): string {
  if (locale === "en") {
    const usd = Math.round(ilsToUsd(amountIls)).toLocaleString("en-US");
    return `USD ${usd} (estimated from ILS at a fixed rate)`;
  }
  return `ILS ${Math.round(amountIls).toLocaleString("en-US")}`;
}
