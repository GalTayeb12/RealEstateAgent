/**
 * Room names for display. Plan labels often carry the room's dimensions or area
 * next to its name ("חדר הורים 427 × 381 427", "Bedroom 3.4x3.3"); those belong on
 * the plan, not on a button or a map label. Short numbers stay ("חדר שינה 2").
 */
const DIMENSIONS = /\d+(?:[.,]\d+)?\s*[×xX*]\s*\d+(?:[.,]\d+)?/g;
const AREA = /\d+(?:[.,]\d+)?\s*(?:מ["״']?ר|מטר|m²|m2|sq\.?\s*m|sqm)/gi;
const BIG_NUMBER = /(?<![\p{L}\d])\d{3,}(?:[.,]\d+)?(?![\p{L}\d])|(?<![\p{L}\d])\d+[.,]\d+(?![\p{L}\d])/gu;

/**
 * An open-plan space is often labelled with every function it has ("מבואת כניסה מסדרון
 * חדר מגורים מטבח פינת אוכל"). On a button or a map that is unreadable: keep what it is,
 * "סלון ומטבח". A label naming a single function is left alone.
 */
const LIVING = /סלון|חדר מגורים|מגורים|living|lounge/i;
const KITCHEN = /מטבח|kitchen/i;
const DINING = /פינת אוכל|אוכל|dining/i;
const ENTRY = /מבואה|מבואת|מסדרון|פרוזדור|כניסה|hall|corridor|entry|foyer/i;

export function shortenCompound(label: string): string {
  const has = [LIVING, KITCHEN, DINING, ENTRY].filter((re) => re.test(label)).length;
  // three or more functions in one label; two ("סלון ופינת אוכל") is a perfectly good name; Hebrew labels only
  if (has < 3 || !/[א-ת]/.test(label) || !(LIVING.test(label) || KITCHEN.test(label))) return label;
  const parts: string[] = [];
  if (LIVING.test(label)) parts.push("סלון");
  if (KITCHEN.test(label)) parts.push("מטבח");
  return parts.join(" ו");
}

export function cleanRoomLabel(label: string): string {
  const cleaned = label.replace(DIMENSIONS, " ").replace(AREA, " ").replace(BIG_NUMBER, " ").replace(/[\s,;:·|/-]+$/g, "").replace(/\s{2,}/g, " ").trim();
  return shortenCompound(cleaned || label.trim());
}

export function cleanName(n: { he: string; en: string }): { he: string; en: string } {
  return { he: cleanRoomLabel(n.he), en: cleanRoomLabel(n.en) };
}
