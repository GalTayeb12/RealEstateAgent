/** Asking price shown on match cards. Overrides use the cheapest available apartment. */
export function listingAsk(
  basePrice: number,
  units: { status: string; price: number | null }[]
): { price: number; from: boolean } {
  const hasOverride = units.some((unit) => unit.price != null);
  const available = units.filter((unit) => unit.status === "available");
  if (!hasOverride || available.length === 0) {
    return { price: basePrice, from: false };
  }
  const lowest = Math.min(...available.map((unit) => unit.price ?? basePrice));
  return { price: lowest, from: true };
}
