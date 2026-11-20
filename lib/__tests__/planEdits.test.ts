/** The review screen's MVP corrections (components/dev/plan/edits.ts) + live re-validation. */
import { describe, expect, it } from "vitest";
import { YARKON_TWIN } from "../twin/fixtures/yarkon";
import { validateTwin } from "../twin/validate";
import { alongWall, ROOM_NAMES } from "../twin/schema";
import { entryOpening, renameRoom, setOpeningKind, setOpeningWidth, setRoomType } from "../../components/dev/plan/edits";

const t0 = YARKON_TWIN;

describe("plan edits", () => {
  it("renames a room in one language without touching the original", () => {
    const r = t0.rooms[0];
    const t = renameRoom(t0, r.id, "he", "סלון מרווח");
    expect(t.rooms[0].name).toEqual({ he: "סלון מרווח", en: r.name.en });
    expect(t0.rooms[0].name.he).toBe(r.name.he);
    expect(validateTwin(t).ok).toBe(true);
  });

  it("changing a room type renames default names but keeps custom ones", () => {
    const id = t0.rooms[0].id;
    const withDefault = { ...t0, rooms: t0.rooms.map((r) => (r.id === id ? { ...r, type: "bedroom" as const, name: { ...ROOM_NAMES.bedroom } } : r)) };
    expect(setRoomType(withDefault, id, "mamad").rooms[0].name).toEqual(ROOM_NAMES.mamad);
    const custom = renameRoom(withDefault, id, "he", "חדר של נועה");
    expect(setRoomType(custom, id, "mamad").rooms[0].name).toEqual({ he: "חדר של נועה", en: ROOM_NAMES.mamad.en });
  });

  it("keeps a single entry door", () => {
    const before = entryOpening(t0)!;
    const door = t0.openings.find((o) => o.kind === "door")!;
    const t = setOpeningKind(t0, door.id, "entry");
    expect(t.openings.filter((o) => o.kind === "entry").map((o) => o.id)).toEqual([door.id]);
    expect(t.openings.find((o) => o.id === before.id)!.kind).toBe("door");
  });

  it("removing the entry door is reported as a warning by live validation", () => {
    const t = setOpeningKind(t0, entryOpening(t0)!.id, "door");
    expect(validateTwin(t).issues.some((i) => i.code === "no-entry")).toBe(true);
  });

  it("a door turned into a window gets a sill", () => {
    const door = t0.openings.find((o) => o.kind === "door")!;
    expect(setOpeningKind(t0, door.id, "window").openings.find((o) => o.id === door.id)!.sill).toBe(0.9);
  });

  it("width changes keep the centre, ignore invalid values, and too-narrow doors are flagged", () => {
    const door = t0.openings.find((o) => o.kind === "door")!;
    const wall = t0.walls.find((w) => w.id === door.wallId)!;
    const t = setOpeningWidth(t0, door.id, 0.5);
    const o = t.openings.find((x) => x.id === door.id)!;
    expect(o.width).toBe(0.5);
    expect(alongWall(wall, o.at)).toEqual(alongWall(wall, door.at));
    expect(validateTwin(t).issues.some((i) => i.code === "door-narrow" && i.ref === door.id)).toBe(true);
    expect(setOpeningWidth(t0, door.id, 0)).toBe(t0);
    expect(setOpeningWidth(t0, door.id, NaN)).toBe(t0);
  });
});
