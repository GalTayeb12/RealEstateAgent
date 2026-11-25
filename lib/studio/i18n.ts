/**
 * Studio UI strings (Hebrew + English). Kept beside the studio instead of in
 * lib/i18n/messages.ts so the feature stays isolated behind its flag; a test
 * guarantees both languages define exactly the same keys.
 */
import type { Locale } from "./design/options";

const en = {
  walk: "Walk", design: "Design", plan: "Plan", soon: "Soon",
  undo: "Undo", redo: "Redo", restore: "Restore original", restoreConfirm: "Remove all your changes and go back to the original apartment?",
  add: "Add", close: "Close", search: "Search furniture…", allStyles: "All styles", allCategories: "All categories", noResults: "Nothing matches.",
  replace: "Replace", duplicate: "Duplicate", remove: "Remove", rotateLeft: "Rotate left", rotateRight: "Rotate right",
  size: "Size", variant: "Size option", configuration: "Configuration", addModule: "Add module", removeModule: "Remove", width: "Width", presets: "Common sizes",
  material: "Material", surface: "Surface", resetSurface: "Back to original", measurements: "Dimensions",
  wall: "Wall", floor: "Floor", ceiling: "Ceiling", glass: "Glass",
  "mod.arm-l": "Left arm", "mod.arm-r": "Right arm", "mod.chaise": "Chaise", "mod.seat": "Seat",
  hints: "Placement", noIssues: "Everything fits.", loading: "Loading the studio…", quality: "Quality", auto: "Auto", lite: "Lite", standard: "Standard", high: "High",
  hintWalk: "Arrows / WASD to walk · click & drag to look", hintDesign: "Click a piece or a surface to edit it · right-drag to look · WASD to move",
  hintTouch: "Left thumb to walk · drag on the right to look · tap a piece to edit",
  addToRoom: "Add to the room", selected: "Selected", saved: "Saved", proposal: "Concept only, not verified",
  noSpace: "There is no free space for it here. Move closer to an empty area.",
  "err.unknown-asset": "This item is not in the catalog.", "err.bad-size": "That size is not available.", "err.out-of-room": "It has to stay inside the room.",
  "err.overlap": "It overlaps another piece.", "err.wall-collision": "It cannot go through a wall.", "err.blocks-opening": "It would block a doorway.",
  "adv.door-swing": "It may block a door from opening.", "adv.clearance": "Little free space in front of it.", "adv.narrow-passage": "A narrow passage next to it.",
  "adv.not-against-wall": "Made to stand against a wall.",
  "style.modern-minimalist": "Modern minimalist", "style.japandi": "Japandi", "style.organic-modern": "Organic modern", "style.contemporary": "Contemporary",
  "style.quiet-luxury": "Quiet luxury", "style.scandinavian": "Scandinavian", "style.modern-industrial": "Modern industrial",
  "cat.sofa": "Sofas", "cat.armchair": "Armchairs", "cat.chair": "Chairs", "cat.stool": "Stools", "cat.bed": "Beds", "cat.table": "Tables", "cat.coffee-table": "Coffee tables",
  "cat.side-table": "Side tables", "cat.desk": "Desks", "cat.wardrobe": "Wardrobes", "cat.cabinet": "Cabinets", "cat.shelving": "Shelving", "cat.kitchen-cabinet": "Kitchen cabinets",
  "cat.countertop": "Countertops", "cat.tv-unit": "TV units", "cat.rug": "Rugs", "cat.lamp-floor": "Floor lamps", "cat.lamp-table": "Table lamps", "cat.lamp-pendant": "Pendants",
  "cat.lamp-wall": "Wall lights", "cat.plant": "Plants", "cat.decor": "Decor", "cat.mirror": "Mirrors", "cat.bathroom-fixture": "Bathroom", "cat.outdoor": "Outdoor",
} as const;

export type StringKey = keyof typeof en;

const he: Record<StringKey, string> = {
  walk: "הליכה", design: "עיצוב", plan: "תוכנית", soon: "בקרוב",
  undo: "ביטול", redo: "שחזור", restore: "שחזור המצב המקורי", restoreConfirm: "למחוק את כל השינויים ולחזור לדירה המקורית?",
  add: "הוספה", close: "סגירה", search: "חיפוש ריהוט…", allStyles: "כל הסגנונות", allCategories: "כל הקטגוריות", noResults: "אין תוצאות.",
  replace: "החלפה", duplicate: "שכפול", remove: "הסרה", rotateLeft: "סיבוב שמאלה", rotateRight: "סיבוב ימינה",
  size: "מידה", variant: "אפשרות מידה", configuration: "הרכבה", addModule: "הוספת מודול", removeModule: "הסרה", width: "רוחב", presets: "מידות נפוצות",
  material: "חומר", surface: "משטח", resetSurface: "חזרה למקור", measurements: "מידות",
  wall: "קיר", floor: "רצפה", ceiling: "תקרה", glass: "זכוכית",
  "mod.arm-l": "ידית שמאל", "mod.arm-r": "ידית ימין", "mod.chaise": "שייז לונג", "mod.seat": "מושב",
  hints: "מיקום", noIssues: "הכול מתאים.", loading: "טוענים את הסטודיו…", quality: "איכות", auto: "אוטומטי", lite: "Lite", standard: "Standard", high: "High",
  hintWalk: "חיצים / WASD ללכת · לחצו וגררו כדי להסתכל", hintDesign: "לחצו על פריט או משטח כדי לערוך · גרירה בימני להסתכלות · WASD לתנועה",
  hintTouch: "אגודל שמאל ללכת · גררו בצד ימין להסתכלות · הקישו על פריט לעריכה",
  addToRoom: "הוספה לחדר", selected: "נבחר", saved: "נשמר", proposal: "הצעה בלבד, לא מאומתת",
  noSpace: "אין כאן מקום פנוי. התקרבו לאזור ריק.",
  "err.unknown-asset": "הפריט לא קיים בקטלוג.", "err.bad-size": "המידה הזו לא זמינה.", "err.out-of-room": "הפריט חייב להישאר בתוך החדר.",
  "err.overlap": "הפריט חופף לפריט אחר.", "err.wall-collision": "הפריט לא יכול לעבור דרך קיר.", "err.blocks-opening": "הפריט חוסם דלת.",
  "adv.door-swing": "הפריט עלול לחסום פתיחת דלת.", "adv.clearance": "מעט מקום פנוי לפניו.", "adv.narrow-passage": "מעבר צר לידו.",
  "adv.not-against-wall": "מיועד לעמוד צמוד לקיר.",
  "style.modern-minimalist": "מינימליסטי מודרני", "style.japandi": "ג׳פנדי", "style.organic-modern": "אורגני מודרני", "style.contemporary": "עכשווי",
  "style.quiet-luxury": "יוקרה שקטה", "style.scandinavian": "סקנדינבי", "style.modern-industrial": "תעשייתי מודרני",
  "cat.sofa": "ספות", "cat.armchair": "כורסאות", "cat.chair": "כיסאות", "cat.stool": "שרפרפים", "cat.bed": "מיטות", "cat.table": "שולחנות", "cat.coffee-table": "שולחנות קפה",
  "cat.side-table": "שולחנות צד", "cat.desk": "שולחנות עבודה", "cat.wardrobe": "ארונות בגדים", "cat.cabinet": "ארונות", "cat.shelving": "מדפים", "cat.kitchen-cabinet": "ארונות מטבח",
  "cat.countertop": "משטחי עבודה", "cat.tv-unit": "מזנונים", "cat.rug": "שטיחים", "cat.lamp-floor": "מנורות רצפה", "cat.lamp-table": "מנורות שולחן", "cat.lamp-pendant": "מנורות תלויות",
  "cat.lamp-wall": "מנורות קיר", "cat.plant": "צמחים", "cat.decor": "קישוט", "cat.mirror": "מראות", "cat.bathroom-fixture": "אמבטיה", "cat.outdoor": "חוץ",
};

export const STRINGS: Record<Locale, Record<StringKey, string>> = { en, he };

/** Friendly module name: seat-120 -> "Seat 120", known ids from the dictionary, otherwise the raw id. */
export function moduleLabel(t: (k: string) => string, id: string): string {
  const seat = /^seat-(\d+)$/.exec(id);
  if (seat) return `${t("mod.seat")} ${seat[1]}`;
  const key = `mod.${id}`;
  const v = t(key);
  return v === key ? id : v;
}

export function makeT(locale: Locale) {
  const d = STRINGS[locale];
  return (key: string): string => (d as Record<string, string>)[key] ?? key;
}
