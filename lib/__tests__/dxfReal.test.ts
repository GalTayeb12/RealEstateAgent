/**
 * What real architects' DXF files do that the first synthetic ones did not
 * (found by parsing plans downloaded from the web): wrong $INSUNITS, layer
 * names in other languages, walls drawn unbroken with the door swing and the
 * window line on top, no room outlines at all, CJK labels, scans, and several
 * units on one sheet. Each case is built here from a few lines of DXF.
 */
import { describe, expect, it } from "vitest";
import { parseDxf, roomType, roomTypeOfLabels } from "../twin/dxf/parse";
import { polygonArea } from "../twin/schema";

const dxf = (ents: string[][], insunits = 4) =>
  [["0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", String(insunits), "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES"], ...ents, ["0", "ENDSEC", "0", "EOF"]]
    .flat().join("\n");
const line = (layer: string, x1: number, y1: number, x2: number, y2: number) =>
  ["0", "LINE", "8", layer, "10", String(x1), "20", String(y1), "30", "0", "11", String(x2), "21", String(y2), "31", "0"];
const arc = (layer: string, cx: number, cy: number, r: number, a1: number, a2: number) =>
  ["0", "ARC", "8", layer, "10", String(cx), "20", String(cy), "30", "0", "40", String(r), "50", String(a1), "51", String(a2)];
const text = (layer: string, x: number, y: number, s: string) =>
  ["0", "TEXT", "8", layer, "10", String(x), "20", String(y), "30", "0", "40", "0.25", "1", s, "50", "0"];

/** A 6 × 4 m apartment at (ox, oy): 20 cm walls as face-line pairs, one partition at x = 3 (unbroken or with a door gap). */
function apartment(wallLayer: string, ox = 0, oy = 0, partition: "solid" | "gap" = "solid"): string[][] {
  const W = wallLayer, t = 0.1; // half thickness
  const L = (x1: number, y1: number, x2: number, y2: number) => line(W, ox + x1, oy + y1, ox + x2, oy + y2);
  const ents = [
    // outer and inner faces of the exterior walls
    L(-t, -t, 6 + t, -t), L(6 + t, -t, 6 + t, 4 + t), L(6 + t, 4 + t, -t, 4 + t), L(-t, 4 + t, -t, -t),
    L(t, t, 6 - t, t), L(6 - t, t, 6 - t, 4 - t), L(6 - t, 4 - t, t, 4 - t), L(t, 4 - t, t, t),
  ];
  const faces = (x: number) => partition === "solid"
    ? [L(x, t, x, 4 - t)]
    : [L(x, t, x, 1.5), L(x, 2.4, x, 4 - t)]; // 90 cm doorway
  ents.push(...faces(3 - t), ...faces(3 + t));
  return ents;
}

describe("units", () => {
  it("reads metres when the file says mm but the drawing is 6 × 4 units", () => {
    const { twin, notes } = parseDxf(dxf(apartment("A-WALL")));
    expect(twin.source.sourceUnits).toBe("m");
    expect(twin.walls.length).toBeGreaterThanOrEqual(5);
    expect(notes.join(" ")).toMatch(/declares mm/);
  });
  it("keeps mm when the drawing really is 6000 × 4000", () => {
    const big = apartment("A-WALL").map((e) => e.map((v, i) => (i > 0 && /^-?\d/.test(v) && e[i - 1].match(/^[12][01]$/) ? String(+v * 1000) : v)));
    const { twin, notes } = parseDxf(dxf(big));
    expect(twin.source.sourceUnits).toBe("mm");
    expect(notes.join(" ")).not.toMatch(/declares/);
  });
});

describe("layer names", () => {
  it("accepts Spanish wall and door layers (Muro1, Puertas)", () => {
    const { twin } = parseDxf(dxf([...apartment("Muro1"), arc("Puertas", 3, 1.5, 0.9, 0, 90)]));
    expect(twin.walls.length).toBeGreaterThanOrEqual(5);
    expect(twin.openings.some((o) => o.kind === "door")).toBe(true);
  });
  it("guesses the wall layer when no name says wall", () => {
    const { twin, notes } = parseDxf(dxf(apartment("LAYER7").concat(apartment("LAYER7", 20, 0))));
    expect(twin.walls.length).toBeGreaterThanOrEqual(5);
    expect(notes.join(" ")).toMatch(/LAYER7.*looks like the walls/);
  });
});

describe("openings drawn on top of unbroken walls", () => {
  const withDoor = () => parseDxf(dxf([...apartment("A-WALL"), arc("A-DOOR", 3, 1.5, 0.9, 0, 90)]));
  it("a door swing cuts a door into the wall it sits on", () => {
    const door = withDoor().twin.openings.filter((o) => o.kind === "door");
    expect(door).toHaveLength(1);
    expect(door[0].width).toBeGreaterThan(0.8);
    expect(door[0].width).toBeLessThan(1.0);
  });
  it("a glazing line along the exterior wall is a window", () => {
    const { twin } = parseDxf(dxf([...apartment("A-WALL"), line("A-GLAZ", 1, 4, 2.5, 4)]));
    const win = twin.openings.filter((o) => o.kind === "window");
    expect(win).toHaveLength(1);
    expect(win[0].width).toBeCloseTo(1.5, 1);
  });
});

describe("rooms from walls", () => {
  it("finds two rooms when a doorway separates them, with net areas", () => {
    const { twin, notes } = parseDxf(dxf(apartment("A-WALL", 0, 0, "gap")));
    expect(twin.rooms).toHaveLength(2);
    for (const r of twin.rooms) expect(polygonArea(r.polygon)).toBeCloseTo(10.64, 0);
    expect(notes.join(" ")).toMatch(/2 rooms were found from the walls/);
  });
  it("a door swing closes the room even though the wall is unbroken", () => {
    const { twin } = parseDxf(dxf([...apartment("A-WALL"), arc("A-DOOR", 3, 1.5, 0.9, 0, 90)]));
    expect(twin.rooms).toHaveLength(2);
  });
  it("an unbroken partition makes two rooms; no partition makes one", () => {
    expect(parseDxf(dxf(apartment("A-WALL"))).twin.rooms).toHaveLength(2);
    // outer walls only
    const shell = apartment("A-WALL").slice(0, 8);
    expect(parseDxf(dxf(shell)).twin.rooms).toHaveLength(1);
  });
  it("names rooms from the text label inside, in English, Hebrew and Chinese", () => {
    const { twin } = parseDxf(dxf([...apartment("A-WALL"), text("TXT", 1.5, 2, "KITCHEN"), text("TXT", 4.5, 2, "客厅")]));
    expect(twin.rooms.map((r) => r.type).sort()).toEqual(["kitchen", "living"]);
  });
});

describe("room labels with several texts in one outline", () => {
  it("an open living area with a balcony label is a living room, not a balcony", () => {
    expect(roomTypeOfLabels(["חדר מגורים", "מטבח", "פינת אוכל", "מרפסת"])).toBe("living");
    expect(roomTypeOfLabels(["מטבח", "מרפסת"])).toBe("kitchen");
  });
  it("a lone balcony stays a balcony; unknown texts are ignored", () => {
    expect(roomTypeOfLabels(["מרפסת"])).toBe("balcony");
    expect(roomTypeOfLabels(["356 × 331"])).toBe("other");
    expect(roomTypeOfLabels(["חדר שינה א", "356 × 331"])).toBe("bedroom");
  });
  it("the lobby of a suite is a corridor, not the master bedroom", () => {
    expect(roomType("מבואת הורים")).toBe("corridor");
    expect(roomType("חדר הורים")).toBe("master");
    expect(roomType("מבואת כניסה מסדרון חדר מגורים מטבח")).toBe("living");
  });
});

describe("room labels", () => {
  it.each([
    ["厨房", "kitchen"], ["客厅", "living"], ["主卧室", "master"], ["卧室", "bedroom"], ["卫生间", "bath"], ["阳台", "balcony"],
    ["COCINA", "kitchen"], ["Dormitorio", "bedroom"], ["BEDROOM 2", "bedroom"], ["סלון", "living"], ["ממ\"ד", "mamad"],
  ])("%s → %s", (label, type) => expect(roomType(label)).toBe(type));
});

describe("files that are not CAD plans", () => {
  it("a single layer of diagonal polylines with no text is recognised as a scan", () => {
    const poly = (i: number) => ["0", "LWPOLYLINE", "8", "TRACE", "90", "2", "70", "0", "10", String(i), "20", String(i * 0.7), "10", String(i + 0.5), "20", String(i * 0.7 + 0.9)];
    const { twin, notes } = parseDxf(dxf(Array.from({ length: 60 }, (_, i) => poly(i))));
    expect(twin.walls).toHaveLength(0);
    expect(notes.join(" ")).toMatch(/scan/);
  });
});

describe("several units on one sheet", () => {
  const sheet = () => [...apartment("A-WALL", 0, 0, "gap"), ...apartment("A-WALL", 30, 0, "gap"), text("T", 1.5, 2, "KITCHEN"), text("T", 31.5, 2, "KITCHEN")];
  it("warns that the drawing is larger than one apartment", () => {
    expect(parseDxf(dxf(sheet())).notes.join(" ")).toMatch(/larger than one apartment/);
  });
  it("a window picks one unit out of the sheet", () => {
    const all = parseDxf(dxf(sheet()));
    const one = parseDxf(dxf(sheet()), { window: [-1, -1, 7, 5] });
    expect(all.twin.rooms).toHaveLength(4);
    expect(one.twin.rooms).toHaveLength(2);
    expect(one.notes.join(" ")).not.toMatch(/larger than one apartment/);
  });
});

describe("walls drawn as filled outlines", () => {
  const poly = (layer: string, pts: [number, number][]) =>
    ["0", "LWPOLYLINE", "8", layer, "90", String(pts.length), "70", "1", ...pts.flatMap(([x, y]) => ["10", String(x), "20", String(y)])];

  it("reads closed rectangles and L-shapes on the wall layer as walls", () => {
    // a 6 × 4 m box of four 20 cm wall rectangles, one corner drawn as an L-shaped outline
    const src = dxf([
      poly("WALL", [[0, 0], [6, 0], [6, 0.2], [0.2, 0.2], [0.2, 4], [0, 4]]),
      poly("WALL", [[0, 4], [6.2, 4], [6.2, 3.8], [0, 3.8]].reverse() as [number, number][]),
      poly("WALL", [[6, 0], [6.2, 0], [6.2, 4], [6, 4]]),
    ]);
    const { twin } = parseDxf(src, { file: "solids.dxf" });
    expect(twin.walls.length).toBeGreaterThanOrEqual(4);
    for (const w of twin.walls) expect(w.thickness).toBeCloseTo(0.2, 1);
  });
});

describe("Hebrew room labels", () => {
  it("reads the parents' bathroom as a bathroom, not a bedroom", () => {
    expect(roomType("רחצת הורים 246 × 265")).toBe("bath");
    expect(roomType("חדר רחצה")).toBe("bath");
    expect(roomType("חדר הורים")).toBe("master");
    expect(roomType("שירותי אורחים")).toBe("wc");
    expect(roomType("סלון מטבח")).toBe("living");
  });
});

describe("room labels for display", () => {
  it("drops dimensions and areas, keeps the name and short numbers", async () => {
    const { cleanRoomLabel } = await import("../twin/labels");
    expect(cleanRoomLabel("חדר הורים 427 × 381 427")).toBe("חדר הורים");
    expect(cleanRoomLabel("חדר שינה ג 346 × 336")).toBe("חדר שינה ג");
    expect(cleanRoomLabel("סלון 32 מ״ר")).toBe("סלון");
    expect(cleanRoomLabel("Bedroom 3.4x3.3")).toBe("Bedroom");
    expect(cleanRoomLabel("חדר שינה 2")).toBe("חדר שינה 2");
    expect(cleanRoomLabel("427 × 381")).toBe("427 × 381"); // never leave a room without a name
    // open-plan spaces: keep what the space is
    expect(cleanRoomLabel("מבואת כניסה מסדרון חדר מגורים מטבח פינת אוכל")).toBe("סלון ומטבח");
    expect(cleanRoomLabel("סלון מטבח מסדרון")).toBe("סלון ומטבח");
    expect(cleanRoomLabel("סלון ופינת אוכל")).toBe("סלון ופינת אוכל"); // two functions: a fine name as is
    expect(cleanRoomLabel("Living, kitchen and dining area")).toBe("Living, kitchen and dining area");
    expect(cleanRoomLabel("סלון")).toBe("סלון");
    expect(cleanRoomLabel("חדר שינה")).toBe("חדר שינה");
    expect(cleanRoomLabel("מסדרון כניסה")).toBe("מסדרון כניסה");
  });
});
