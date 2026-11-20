/**
 * The MVP corrections the review screen offers, as pure twin → twin functions.
 * Geometry (walls, room polygons) is not editable here yet.
 */
import { ROOM_NAMES, type Opening, type PlanTwin, type RoomType } from "@/lib/twin/schema";

export function renameRoom(t: PlanTwin, roomId: string, lang: "he" | "en", name: string): PlanTwin {
  return { ...t, rooms: t.rooms.map((r) => (r.id === roomId ? { ...r, name: { ...r.name, [lang]: name } } : r)) };
}

/** Change a room's type; names that were still the old type's defaults follow the new type. */
export function setRoomType(t: PlanTwin, roomId: string, type: RoomType): PlanTwin {
  return {
    ...t,
    rooms: t.rooms.map((r) => {
      if (r.id !== roomId) return r;
      const old = ROOM_NAMES[r.type], next = ROOM_NAMES[type];
      return {
        ...r, type,
        name: { he: r.name.he === old.he ? next.he : r.name.he, en: r.name.en === old.en ? next.en : r.name.en },
      };
    }),
  };
}

/**
 * Change an opening's kind. There is one entry door: marking a new one turns the
 * previous entry into a regular door. Windows get a sill when they had none.
 */
export function setOpeningKind(t: PlanTwin, openingId: string, kind: Opening["kind"]): PlanTwin {
  return {
    ...t,
    openings: t.openings.map((o) => {
      if (o.id === openingId) {
        const sill = kind === "window" ? (o.sill > 0 ? o.sill : 0.9) : 0;
        return { ...o, kind, sill };
      }
      if (kind === "entry" && o.kind === "entry") return { ...o, kind: "door" as const };
      return o;
    }),
  };
}

/** Change an opening's width (metres), keeping its centre in place. */
export function setOpeningWidth(t: PlanTwin, openingId: string, width: number): PlanTwin {
  if (!(width > 0)) return t;
  return { ...t, openings: t.openings.map((o) => (o.id === openingId ? { ...o, width } : o)) };
}

export function entryOpening(t: PlanTwin): Opening | undefined {
  return t.openings.find((o) => o.kind === "entry");
}
