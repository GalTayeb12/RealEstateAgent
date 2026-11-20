/**
 * Project experience config: the Yarkon file must be valid and carry exactly
 * the data the viewers used to hardcode; the lookup resolves slugs and aliases;
 * defaults derived from walk.json / the plan twin are sane.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ProjectExperience, readPhotoMeta, roomAt, type Rect } from "../experience/types";
import { getExperience } from "../experience/getExperience";
import { deriveWalkDefaults, facingSide, freeSpot, guessRoomName, planFor, twinHints } from "../experience/derive";
import { YARKON_TWIN } from "../twin/fixtures/yarkon";
import { walkRooms } from "../twin/walk";

const root = path.join(__dirname, "../..");
const readJson = (p: string) => JSON.parse(readFileSync(path.join(root, p), "utf8"));
const walk = readJson("public/walk/yarkon-v2/walk.json") as { rooms: Record<string, Rect>; boxes: Rect[]; spawn: [number, number, number] };
const onJson = readJson("public/buildings/yarkon-v2/on.json");
const yarkon = ProjectExperience.parse(readJson("public/projects/yarkon/experience.json"));

describe("Yarkon experience.json", () => {
  it("photo stage is the on.json it replaced", () => {
    expect(yarkon.photoStage).toEqual(onJson);
    expect(readPhotoMeta(yarkon.photoStage, 16 / 9)).toEqual(readPhotoMeta(onJson, 16 / 9));
    expect(yarkon.photoStage?.enter?.walk).toBe("/walk/yarkon");
  });

  it("names and stands every walk.json room", () => {
    expect(Object.keys(yarkon.walk.rooms).sort()).toEqual(Object.keys(walk.rooms).sort());
    for (const r of Object.values(yarkon.walk.rooms)) expect(r.stand).toHaveLength(3);
  });

  it("keeps the old hardcoded minimap, dollhouse and room lookup", () => {
    const p = yarkon.walk.plan!;
    expect(p.x0).toBeCloseTo(-0.8);
    expect(p.w / p.h).toBeCloseTo(1600 / 1120);
    expect(p.yTop - p.h / 2).toBeCloseTo(3.15);
    expect(yarkon.dollhouse.center).toEqual([7.5, 3.15]);
    // hallway strip beats the living-room rectangle; outside everything → living
    expect(roomAt(yarkon.walk, walk.rooms, 7.6, 3.5)).toBe("corridor");
    expect(roomAt(yarkon.walk, walk.rooms, 7.6, 9)).toBe("corridor");
    expect(roomAt(yarkon.walk, walk.rooms, 3, 2)).toBe("living");
    expect(roomAt(yarkon.walk, walk.rooms, 20, 20)).toBe("living");
    expect(roomAt(yarkon.walk, walk.rooms, walk.spawn[0], walk.spawn[1])).toBe("corridor");
  });
});

describe("getExperience", () => {
  it("resolves the slug, the project id and the photo URL", async () => {
    for (const key of ["yarkon", "seed-yarkon-towers", "/buildings/yarkon-v2/on.webp"]) {
      expect((await getExperience(key))?.slug, key).toBe("yarkon");
    }
  });
  it("returns null for unknown or unsafe keys", async () => {
    for (const key of ["", "nope", "../walk", "yarkon/../yarkon", "/etc/passwd"]) {
      expect(await getExperience(key), key).toBeNull();
    }
  });
});

describe("derived defaults", () => {
  const blocked = (x: number, y: number) => walk.boxes.some(([x1, y1, x2, y2]) => x > x1 - 0.3 && x < x2 + 0.3 && y > y1 - 0.3 && y < y2 + 0.3);

  it("puts a free stand point in every room of walk.json", () => {
    const d = deriveWalkDefaults(walk);
    for (const [id, [x1, y1, x2, y2]] of Object.entries(walk.rooms)) {
      const [x, y, yaw] = d.rooms[id].stand;
      expect(x >= x1 && x <= x2 && y >= y1 && y <= y2, id).toBe(true);
      expect(blocked(x, y), id).toBe(false);
      expect([0, Math.PI, Math.PI / 2, -Math.PI / 2].some((a) => Math.abs(a - yaw) < 1e-3), id).toBe(true);
    }
    expect(d.dollhouse).toEqual({ center: [7.5, 3.15], bounds: [0, -2.2, 15, 8.5] });
  });

  it("guesses names from room ids", () => {
    expect(guessRoomName("bed2")).toEqual({ he: "חדר שינה 2", en: "Bedroom 2" });
    expect(guessRoomName("master").he).toBe("יחידת הורים");
    expect(guessRoomName("kitchen").en).toBe("Kitchen");
    expect(guessRoomName("xyz").en).toBe("Room");
  });

  it("faces a window first, else the longest open side", () => {
    const room: Rect = [0, 0, 4, 3];
    // walls on north, east and most of the west side; south fully open but a window on the east
    const walls: Rect[] = [[0, 2.95, 4, 3.05], [3.95, 0, 4.05, 3], [-0.05, 0, 0.05, 2.5]];
    expect(facingSide(room, walls)).toBe("s");
    expect(facingSide(room, walls, [[[4, 1], [4, 2]]])).toBe("e");
  });

  it("steps off furniture at the room centre", () => {
    const [x, y] = freeSpot([0, 0, 4, 4], [[1.5, 1.5, 2.5, 2.5]]);
    const e = 1e-6;
    expect(x <= 1.2 + e || x >= 2.8 - e || y <= 1.2 + e || y >= 2.8 - e).toBe(true);
  });

  it("uses the twin's names and windows", () => {
    const hints = twinHints(YARKON_TWIN);
    const d = deriveWalkDefaults({ rooms: walkRooms(YARKON_TWIN), boxes: [] }, hints);
    for (const r of YARKON_TWIN.rooms) expect(d.rooms[r.id].name).toEqual(r.name);
    expect(hints.windows.length).toBeGreaterThan(0);
  });

  it("frames the minimap around the dollhouse, centred, with a margin", () => {
    const p = planFor({ center: [7.5, 3.15], bounds: [0, -2.2, 15, 8.5] }, "/x.webp", 1600 / 1120, 0.8);
    expect(p.w / p.h).toBeCloseTo(1600 / 1120, 2);
    expect(p.x0 + p.w / 2).toBeCloseTo(7.5);
    expect(p.yTop - p.h / 2).toBeCloseTo(3.15);
    expect(p.x0).toBeLessThanOrEqual(-0.8);
    expect(p.yTop - p.h).toBeLessThanOrEqual(-2.2 - 0.8 + 1e-6);
  });
});
