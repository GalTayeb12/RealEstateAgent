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
