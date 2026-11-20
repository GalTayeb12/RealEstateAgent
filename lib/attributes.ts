/**
 * Unit-type attributes are stored as a JSON string. Some existing rows were
 * encoded twice, so one JSON.parse returns the object text rather than the
 * object. Walking that string with Object.entries prints one character per row.
 */
export function parseAttributes(value: unknown): Record<string, unknown> {
  let current = value;
  for (let depth = 0; depth < 3; depth += 1) {
    if (current == null) return {};
    if (typeof current === "object" && !Array.isArray(current)) {
      return current as Record<string, unknown>;
    }
    if (typeof current !== "string") return {};
    const trimmed = current.trim();
    if (!trimmed) return {};
    try {
      current = JSON.parse(trimmed);
    } catch {
      return {};
    }
  }
  if (current && typeof current === "object" && !Array.isArray(current)) {
    return current as Record<string, unknown>;
  }
  return {};
}

export function formatAttributeValue(value: unknown): string {
  if (value == null || value === "") return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

/**
 * Returns a translated label for an attribute key, falling back to the raw key
 * when the key is not present in the translation map.
 */
export function translateAttrKey(
  key: string,
  attrs: Record<string, string | undefined>
): string {
  return attrs[key] ?? key;
}

/**
 * Formats an area value with the given unit label (e.g. "sqm" or "מ״ר").
 * Returns an empty string for non-positive or non-numeric values.
 */
export function formatArea(value: unknown, sqmLabel: string): string {
  const n = Number(value);
  if (Number.isNaN(n) || n <= 0) return "";
  return `${Math.round(n)} ${sqmLabel}`;
}

/**
 * Room count of a unit type in the Israeli convention (living room counts:
 * "4 חדרים" = 3 bedrooms + living room). This is the one number the rooms
 * filter, alerts and the developer forms agree on.
 *
 * Order: explicit `rooms` attribute → a number in the unit label
 * ("3 חדרים", "4-room", "5.5 rooms") → legacy `bedrooms` + 1 → null.
 */
export function roomsOf(attrs: Record<string, unknown> | null | undefined, unitLabel?: string | null): number | null {
  const num = (v: unknown) => {
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(",", ".")) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const explicit = num(attrs?.rooms);
  if (explicit !== null) return explicit;
  const m = unitLabel?.match(/(\d+(?:[.,]5)?)\s*-?\s*(?:חדרים|חד['׳]|rooms?\b)/i);
  if (m) return Number(m[1].replace(",", "."));
  const bedrooms = num(attrs?.bedrooms);
  return bedrooms !== null ? bedrooms + 1 : null;
}

/**
 * Minimum rooms the buyer asked for. The interview stores it as
 * `bedrooms`, but the value is the Israeli room count ("4 חדרים" → 4).
 */
export function buyerMinRooms(prefs: Record<string, unknown> | null | undefined): number | null {
  const v = prefs?.rooms ?? prefs?.bedrooms;
  return typeof v === "number" && v > 0 ? v : null;
}
