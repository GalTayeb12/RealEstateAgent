/**
 * The free "dry-run" designer: a deterministic stand-in for the model, used until real calls are
 * approved, and by tests and e2e. It reads the request with simple keyword rules (Hebrew and
 * English), and answers with an `AiPlan` exactly like the model must, so the whole pipeline
 * (compile, validation, ghost preview, accept / reject / undo) runs for real. It understands the
 * five SAMPLE_PROMPTS and close variants; anything else gets an empty plan that says what it knows.
 */
import type { AiAction, AiPlan } from "./plan";

const HEB = /[֐-׿]/;

const ROOMS: [RegExp, string][] = [
  [/bed(room)?\s*2|bed2|חדר\s*שינה\s*2/i, "room:bed2"],
  [/bed(room)?\s*3|bed3|חדר\s*שינה\s*3/i, "room:bed3"],
  [/master|parents|הורים|ראשי/i, "room:master"],
  [/kitchen|מטבח/i, "room:kitchen"],
  [/bath|אמבט|רחצה/i, "room:bath"],
  [/living|lounge|סלון/i, "room:living"],
];

export function roomFromText(text: string): string | null {
  for (const [re, id] of ROOMS) if (re.test(text)) return id;
  return null;
}

type Intent = { actions: AiAction[]; en: string; he: string };

function livingRoom(room: string): Intent {
  return {
    actions: [
      { op: "place", ref: "sofa", catalogId: "sofa-modular-01", room, placement: "against-wall" },
      { op: "place", ref: "rug", catalogId: "rug-woven-01", room, placement: "near", near: { target: "sofa", side: "front", gap: 0.05 } },
      { op: "place", ref: "table", catalogId: "coffee-drum-01", room, placement: "near", near: { target: "sofa", side: "front", gap: 0.45 } },
      { op: "place", catalogId: "side-drum-01", room, placement: "near", near: { target: "sofa", side: "left", gap: 0.1 } },
      { op: "place", catalogId: "floor-lamp-01", room, placement: "near", near: { target: "sofa", side: "right", gap: 0.15 } },
      { op: "place", catalogId: "plant-pachira-01", room, placement: "against-wall" },
    ],
    en: "A seating group in an organic-modern mood: a modular sofa on the longest free wall, a woven rug and a travertine drum table in front, a side table, a floor lamp and a large plant.",
    he: "פינת ישיבה באווירה אורגנית מודרנית: ספה מודולרית על הקיר הפנוי הארוך, שטיח ארוג ושולחן טרוורטין לפניה, שולחן צד, מנורת עמידה וצמח גדול.",
  };
}

function bedroom(room: string): Intent {
  return {
    actions: [
      { op: "place", ref: "bed", catalogId: "bed-upholstered-01", room, placement: "against-wall" },
      { op: "place", catalogId: "wardrobe-hinged-01", room, placement: "against-wall", size: { params: { width: 1.6, height: 2.4 } } },
      { op: "place", catalogId: "side-drum-01", room, placement: "near", near: { target: "bed", side: "left", gap: 0.05 } },
    ],
    en: "A bed against the main wall, a 1.6 m wardrobe on a free wall and a bedside table.",
    he: "מיטה צמודה לקיר המרכזי, ארון ברוחב 1.6 מ' על קיר פנוי ושולחן לילה.",
  };
}

function kitchen(room: string, text: string): Intent {
  const layout = /\bu\b|u-shape|בצורת\s*פ/i.test(text) ? "u-shape"
    : /\bl\b|l-shape|l-shaped|בצורת\s*(ר|l)/i.test(text) ? "l-shape"
      : /galley|parallel|מקביל/i.test(text) ? "galley"
        : /single|one wall|קו\s*אחד/i.test(text) ? "single" : "best";
  return {
    actions: [{ op: "kitchenLayout", room, layout }],
    en: `A ${layout === "best" ? "best-fitting" : layout} kitchen built from real cabinet runs (doors, drawers, countertop), keeping doorways clear.`,
    he: `מטבח ${layout === "l-shape" ? "בצורת ר" : layout === "u-shape" ? "בצורת פ" : layout === "galley" ? "מקבילי" : layout === "single" ? "בקו אחד" : "שמתאים לחדר"} מארונות אמיתיים (דלתות, מגירות, משטח), בלי לחסום מעברים.`,
  };
}

function warmer(room: string, text: string): Intent {
  const wall = /sage|מרווה|ירוק/i.test(text) ? "paint-sage" : "paint-clay";
  const floor = /microcement|מיקרו/i.test(text) ? "microcement-light" : "parquet-oak-light";
  return {
    actions: [
      { op: "setSurface", room, surface: "walls", materialId: wall },
      { op: "setSurface", room, surface: "floor", materialId: floor },
    ],
    en: `Warmer finishes: ${wall === "paint-clay" ? "clay" : "sage"} paint on the walls and a ${floor === "parquet-oak-light" ? "light oak parquet" : "light microcement"} floor.`,
    he: `גימור חמים יותר: צבע ${wall === "paint-clay" ? "חימר" : "מרווה"} על הקירות ו${floor === "parquet-oak-light" ? "פרקט אלון בהיר" : "מיקרוטופינג בהיר"} על הרצפה.`,
  };
}

function office(room: string): Intent {
  return {
    actions: [
      { op: "place", catalogId: "shelving-open-01", room, placement: "against-wall", size: { params: { width: 1.8, height: 2.0 } } },
      { op: "place", ref: "chair", catalogId: "armchair-modern-01", room, placement: "center" },
      { op: "place", catalogId: "floor-lamp-01", room, placement: "near", near: { target: "chair", side: "right", gap: 0.15 } },
      { op: "place", catalogId: "side-drum-01", room, placement: "near", near: { target: "chair", side: "left", gap: 0.1 } },
    ],
    en: "A home office corner: a 1.8 m open shelving unit on a wall, and a reading corner with an armchair, a floor lamp and a side table.",
    he: "פינת עבודה: יחידת מדפים פתוחה ברוחב 1.8 מ' על הקיר, ופינת קריאה עם כורסה, מנורת עמידה ושולחן צד.",
  };
}

/** A deterministic plan for a request. Never throws; unknown requests get an empty plan. */
export function dryRunPlan(prompt: string): AiPlan {
  const he = HEB.test(prompt);
  const text = prompt.trim();
  const room = roomFromText(text);
  const intents: Intent[] = [];
  const isKitchen = /kitchen|מטבח/i.test(text);
  const isWarmer = /warm|cos[yi]|clay|oak|sage|finish|paint|חמים|חימר|אלון|מרווה|צבע|גימור/i.test(text);
  const isOffice = /office|study|desk|work|משרד|עבודה|מדפים|קריאה/i.test(text);
  const isBedroom = /\bbed\b|wardrobe|sleep|מיטה|ארון/i.test(text);
  const isLiving = /living|lounge|sofa|furnish|סלון|ספה|רהט/i.test(text);

  if (isKitchen) intents.push(kitchen("room:kitchen", text));
  if (isWarmer) intents.push(warmer(room ?? "room:living", text));
  if (isOffice) intents.push(office(room ?? "room:bed3"));
  else if (isBedroom) intents.push(bedroom(room && room !== "room:living" && room !== "room:kitchen" ? room : "room:bed2"));
  if (isLiving && !isWarmer && !isOffice && !isBedroom && !isKitchen) intents.push(livingRoom(room ?? "room:living"));

  if (!intents.length) {
    return {
      summary: he
        ? "מצב הדגמה (ללא AI אמיתי): אני מבין בקשות כמו ריהוט הסלון, חדר שינה עם מיטה וארון, מטבח בצורת ר, גימור חמים יותר, או פינת עבודה."
        : "Demo mode (no real AI): I understand requests like furnishing the living room, a bedroom with a bed and wardrobe, an L-shaped kitchen, warmer finishes, or a home office corner.",
      actions: [],
    };
  }
  return {
    summary: intents.map((i) => (he ? i.he : i.en)).join(" "),
    actions: intents.flatMap((i) => i.actions),
  };
}
