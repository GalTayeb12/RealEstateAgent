/**
 * Room names for display. Plan labels often carry the room's dimensions or area
 * next to its name ("חדר הורים 427 × 381 427", "Bedroom 3.4x3.3"); those belong on
 * the plan, not on a button or a map label. Short numbers stay ("חדר שינה 2").
 */
const DIMENSIONS = /\d+(?:[.,]\d+)?\s*[×xX*]\s*\d+(?:[.,]\d+)?/g;
const AREA = /\d+(?:[.,]\d+)?\s*(?:מ["״']?ר|מטר|m²|m2|sq\.?\s*m|sqm)/gi;
const BIG_NUMBER = /(?<![\p{L}\d])\d{3,}(?:[.,]\d+)?(?![\p{L}\d])|(?<![\p{L}\d])\d+[.,]\d+(?![\p{L}\d])/gu;

export function cleanRoomLabel(label: string): string {
  const cleaned = label.replace(DIMENSIONS, " ").replace(AREA, " ").replace(BIG_NUMBER, " ").replace(/[\s,;:·|/-]+$/g, "").replace(/\s{2,}/g, " ").trim();
  return cleaned || label.trim();
}

export function cleanName(n: { he: string; en: string }): { he: string; en: string } {
  return { he: cleanRoomLabel(n.he), en: cleanRoomLabel(n.en) };
}
