/**
 * Dana's content for a unit type that has a plan twin but no hand-written tour
 * model: room list, facts, quick answers and a short narration per room, all
 * derived from the verified twin (nothing invented). Hebrew first. A DB
 * ApartmentModel, when the developer wrote one, always wins over this.
 */
import { alongWall, bbox, polygonArea, type PlanTwin, type Room as TwinRoom, type RoomType } from "@/lib/twin/schema";
import type { ApartmentModelData, BotScript, Room } from "./types";

const r1 = (n: number) => Math.round(n * 10) / 10;

const FLOOR: Partial<Record<RoomType, Room["floor"]>> = {
  bath: "tile", wc: "tile", laundry: "tile", kitchen: "tile", entry: "tile", storage: "concrete", balcony: "deck",
};

/** Windows (and sliders) whose wall touches the room's polygon edges, by room id. */
function windowCount(twin: PlanTwin, room: TwinRoom): number {
  const [x1, y1, x2, y2] = bbox(room.polygon);
  const pad = 0.3;
  const walls = new Map(twin.walls.map((w) => [w.id, w]));
  let n = 0;
  for (const o of twin.openings) {
    if (o.kind !== "window" && o.kind !== "slider") continue;
    const w = walls.get(o.wallId);
    if (!w) continue;
    const [px, py] = alongWall(w, o.at);
    if (px >= x1 - pad && px <= x2 + pad && py >= y1 - pad && py <= y2 + pad) n++;
  }
  return n;
}

function describe(room: TwinRoom, area: number, windows: number): string {
  const name = room.name.he;
  const size = `${r1(area)} מ״ר`;
  const light = windows >= 2 ? "עם כמה חלונות ואור טבעי טוב" : windows === 1 ? "עם חלון לאור טבעי" : "";
  const by: Partial<Record<RoomType, string>> = {
    living: `${name}: ${size}, החלל המרכזי של הדירה${light ? `, ${light}` : ""}.`,
    kitchen: `${name}: ${size}${light ? `, ${light}` : ""}.`,
    master: `${name}: ${size}${light ? `, ${light}` : ""}. זו יחידת ההורים.`,
    mamad: `${name}: ${size}, חדר מוגן לפי תקן פיקוד העורף.`,
    balcony: `${name}: ${size} של שטח פתוח לדירה.`,
  };
  return by[room.type] ?? `${name}: ${size}${light ? `, ${light}` : ""}.`;
}

export function modelFromTwin(twin: PlanTwin): ApartmentModelData {
  const rooms: Room[] = twin.rooms.map((r) => {
    const [x1, z1, x2, z2] = bbox(r.polygon);
    return {
      id: r.id, x1, x2, z1, z2, floor: FLOOR[r.type] ?? "wood", name: r.name.he,
      w: r1(x2 - x1), d: r1(z2 - z1), area: r1(polygonArea(r.polygon)), cx: r1((x1 + x2) / 2), cz: r1((z1 + z2) / 2),
    };
  });
  const sum = (pred: (r: TwinRoom) => boolean) => twin.rooms.filter(pred).reduce((s, r) => s + polygonArea(r.polygon), 0);
  const balcony = sum((r) => r.type === "balcony");
  const indoor = sum((r) => r.type !== "balcony");
  const bedrooms = twin.rooms.filter((r) => r.type === "bedroom" || r.type === "master").length;
  const hasMamad = twin.rooms.some((r) => r.type === "mamad");
  const area = twin.declared.area ?? r1(indoor);
  const balconyDeclared = twin.declared.balconyArea ?? r1(balcony);

  const bot: BotScript = {
    intro: `שלום, אני דנה. זו דירה של ${area} מ״ר${bedrooms ? ` עם ${bedrooms} חדרי שינה` : ""}${balconyDeclared > 0 ? ` ומרפסת של ${balconyDeclared} מ״ר` : ""}. הסתובבו בחופשיות, ואני אספר על כל חדר.`,
    living: "", kitchen: "", master: "", room2: "", mamad: "", bath: "", balcony: "", hall: "",
  };
  for (const r of twin.rooms) bot[r.id] = describe(r, polygonArea(r.polygon), windowCount(twin, r));

  const questions = [
    { k: "size", q: "מה גודל הדירה?", a: `שטח הדירה ${area} מ״ר${balconyDeclared > 0 ? `, ועוד מרפסת של ${balconyDeclared} מ״ר` : ""}.` },
    { k: "rooms", q: "כמה חדרים יש?", a: `${bedrooms} חדרי שינה${hasMamad ? ", וממ״ד" : ""}, וסך הכול ${twin.rooms.filter((r) => !["bath", "wc", "corridor", "entry", "balcony", "storage", "laundry"].includes(r.type)).length} חללי מגורים.` },
    { k: "price", q: "מחיר ותנאים", a: "המחיר המבוקש: {price}. אם תצטרפו לקבוצת קונים בפרויקט, אפשר לנהל משא ומתן על מחיר טוב יותר." },
  ];
  return {
    version: 1,
    rooms,
    profiles: [{
      id: "neutral", name: "כללי", sub: "הכירו את הדירה", match: 100, why: [], labels: {}, bot,
      storage: "", mamad: hasMamad ? "ממ״ד בתוך הדירה" : "",
    }],
    questions,
    layouts: {},
    facts: { areaSqm: area, balconySqm: balconyDeclared, floor: "—", storageSqm: 0, parking: 0, priceIls: "—" },
  };
}
