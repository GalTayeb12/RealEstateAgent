/** Bilingual labels for the plan review section (Hebrew first). */
import { OPENING_KINDS, ROOM_NAMES, ROOM_TYPES, type Opening, type RoomType } from "@/lib/twin/schema";
import type { PlanStatus } from "@/lib/planReview";

export type Lang = "he" | "en";
type T = { he: string; en: string };

export const TEXT = {
  title: { he: "תוכנית הדירה", en: "Apartment plan" },
  intro: {
    he: "העלו את תוכנית האדריכל (DXF או DWG). המערכת תבנה ממנה מודל של הדירה, תבדוק אותו ותציג מה צריך לתקן לפני האישור.",
    en: "Upload the architect's plan (DXF or DWG). The system builds a model of the apartment from it, checks it, and shows what needs fixing before approval.",
  },
  upload: { he: "העלאת תוכנית (DXF / DWG)", en: "Upload plan (DXF / DWG)" },
  replace: { he: "החלפת קובץ", en: "Replace file" },
  uploading: { he: "מעלה ומנתח…", en: "Uploading and parsing…" },
  source: { he: "קובץ מקור", en: "Source file" },
  issues: { he: "בדיקות", en: "Checks" },
  noIssues: { he: "לא נמצאו בעיות", en: "No issues found" },
  notes: { he: "הערות הניתוח", en: "Parser notes" },
  rooms: { he: "חדרים", en: "Rooms" },
  openings: { he: "דלתות ופתחים", en: "Doors and openings" },
  nameHe: { he: "שם (עברית)", en: "Name (Hebrew)" },
  nameEn: { he: "שם (אנגלית)", en: "Name (English)" },
  type: { he: "סוג", en: "Type" },
  area: { he: "שטח", en: "Area" },
  kind: { he: "סוג פתח", en: "Kind" },
  width: { he: "רוחב (ס״מ)", en: "Width (cm)" },
  entry: { he: "כניסה", en: "Entry" },
  markEntry: { he: "סמן כדלת הכניסה", en: "Mark as entry door" },
  save: { he: "שמירת שינויים", en: "Save changes" },
  saving: { he: "שומר…", en: "Saving…" },
  discard: { he: "ביטול שינויים", en: "Discard changes" },
  approve: { he: "אישור התוכנית", en: "Approve plan" },
  approving: { he: "מאשר…", en: "Approving…" },
  unsaved: { he: "יש שינויים שלא נשמרו", en: "Unsaved changes" },
  saveFirst: { he: "שמרו את השינויים לפני האישור", en: "Save your changes before approving" },
  fixErrorsFirst: { he: "יש לתקן את השגיאות לפני האישור", en: "Fix the errors before approving" },
  approvedOn: { he: "אושרה ב-", en: "Approved on " },
  netArea: { he: "שטח נטו", en: "Net area" },
  errors: { he: "שגיאות", en: "errors" },
  warnings: { he: "אזהרות", en: "warnings" },
  sqm: { he: "מ״ר", en: "m²" },
  saved: { he: "התוכנית נשמרה", en: "Plan saved" },
  approvedToast: { he: "התוכנית אושרה", en: "Plan approved" },
  uploadedToast: { he: "התוכנית נותחה", en: "Plan parsed" },
  loadFailed: { he: "טעינת התוכנית נכשלה", en: "Could not load the plan" },
  followUp: {
    he: "עריכת קירות ומצולעי חדרים תתווסף בהמשך. עד אז, תיקון גיאומטריה נעשה בקובץ ה-DXF והעלאה מחדש.",
    en: "Wall and room-shape editing comes later. Until then, fix geometry in the DXF and upload again.",
  },
  buildTitle: { he: "סיור תלת-ממד מהתוכנית", en: "3D walkthrough from the plan" },
  buildQueued: { he: "בתור לבנייה", en: "Queued for building" },
  buildRunning: { he: "בבנייה… (תצוגה מקדימה: כמה דקות, איכות מלאה: כ-20 דקות)", en: "Building… (preview: a few minutes, full quality: about 20 minutes)" },
  buildDone: { he: "הסיור מוכן", en: "Walkthrough ready" },
  buildFailed: { he: "הבנייה נכשלה", en: "Build failed" },
  buildStale: { he: "נבנה מגרסה קודמת של התוכנית", en: "Built from an earlier version of the plan" },
  buildNone: { he: "עוד לא נבנה סיור מהתוכנית הזו", en: "No walkthrough built from this plan yet" },
  buildOpen: { he: "לצפייה בסיור", en: "Open the walkthrough" },
  buildPreviewTag: { he: "תצוגה מקדימה", en: "preview" },
  buildAgain: { he: "בנייה מחדש", en: "Build again" },
  buildPreview: { he: "תצוגה מקדימה מהירה", en: "Quick preview" },
  buildQueuedToast: { he: "הבנייה נכנסה לתור", en: "Build queued" },
} satisfies Record<string, T>;

export const STATUS_TEXT: Record<PlanStatus, T> = {
  parsed: { he: "מוכנה לאישור", en: "Ready for approval" },
  needs_review: { he: "דורשת תיקון", en: "Needs fixes" },
  approved: { he: "מאושרת", en: "Approved" },
};

export const OPENING_TEXT: Record<Opening["kind"], T> = {
  door: { he: "דלת", en: "Door" },
  entry: { he: "דלת כניסה", en: "Entry door" },
  window: { he: "חלון", en: "Window" },
  slider: { he: "דלת הזזה / ויטרינה", en: "Sliding door" },
  opening: { he: "פתח ללא דלת", en: "Open passage" },
};

export const ROOM_TYPE_OPTIONS: { value: RoomType; label: T }[] = ROOM_TYPES.map((t) => ({ value: t, label: ROOM_NAMES[t] }));
export const OPENING_KIND_OPTIONS = OPENING_KINDS.map((k) => ({ value: k, label: OPENING_TEXT[k] }));
