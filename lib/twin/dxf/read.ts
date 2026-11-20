/**
 * Minimal ASCII DXF reader: header units, block names, and the model-space
 * entities a floor plan needs (LINE, LWPOLYLINE, POLYLINE/VERTEX, ARC, TEXT,
 * MTEXT, INSERT). Hatches, dimensions and block bodies are skipped. Binary DXF and DWG are not
 * supported (DWG has to be converted to DXF first, e.g. with the ODA converter).
 */

export type DxfEntity =
  | { type: "LINE"; layer: string; a: [number, number]; b: [number, number] }
  | { type: "POLY"; layer: string; pts: [number, number][]; closed: boolean }
  /** Arc: centre, radius, start/end angle in degrees, counter-clockwise (door swings). */
  | { type: "ARC"; layer: string; c: [number, number]; r: number; a1: number; a2: number }
  | { type: "TEXT"; layer: string; at: [number, number]; text: string; height: number }
  | { type: "INSERT"; layer: string; block: string; at: [number, number]; rotation: number; sx: number; sy: number };

export interface DxfDoc {
  /** $INSUNITS: 4 = mm, 5 = cm, 6 = m (0 / missing = unitless). */
  insunits: number;
  entities: DxfEntity[];
  blocks: string[];
}

/** Decode \U+05D0 escapes (pre-2007 DXF) and strip MTEXT formatting codes. */
export function decodeText(s: string): string {
  return s
    .replace(/\\U\+([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\P/g, " ")
    .replace(/\\[A-Za-z][^;\\{}]*;/g, "")
    .replace(/[{}]/g, "")
    .replace(/%%[cC]/g, "Ø").replace(/%%[dD]/g, "°").replace(/%%[pP]/g, "±")
    .replace(/\s+/g, " ")
    .trim();
}

export function readDxf(src: string): DxfDoc {
  const lines = src.split(/\r?\n/);
  const pairs: [number, string][] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = parseInt(lines[i].trim(), 10);
    if (Number.isNaN(code)) throw new Error(`DXF: bad group code at line ${i + 1} (binary DXF is not supported)`);
    pairs.push([code, lines[i + 1].replace(/\s+$/, "")]);
  }

  const doc: DxfDoc = { insunits: 0, entities: [], blocks: [] };
  let section = "";
  let i = 0;
  const num = (v: string) => parseFloat(v);

  while (i < pairs.length) {
    const [code, val] = pairs[i];
    if (code === 0 && val === "SECTION") { section = pairs[i + 1]?.[1] ?? ""; i += 2; continue; }
    if (code === 0 && val === "ENDSEC") { section = ""; i++; continue; }

    if (section === "HEADER" && code === 9 && val === "$INSUNITS") {
      doc.insunits = parseInt(pairs[i + 1]?.[1] ?? "0", 10) || 0;
      i += 2; continue;
    }
    if (section === "BLOCKS" && code === 0 && val === "BLOCK") {
      let j = i + 1;
      while (j < pairs.length && pairs[j][0] !== 0) { if (pairs[j][0] === 2) doc.blocks.push(pairs[j][1]); j++; }
      // skip the block body: entities inside blocks are not model space
      while (j < pairs.length && !(pairs[j][0] === 0 && pairs[j][1] === "ENDBLK")) j++;
      i = j + 1; continue;
    }
    if (section !== "ENTITIES" || code !== 0) { i++; continue; }

    // collect this entity's group codes
    const type = val;
    const g: [number, string][] = [];
    let j = i + 1;
    while (j < pairs.length && pairs[j][0] !== 0) g.push(pairs[j++]);
    const first = (c: number, d = "") => g.find((p) => p[0] === c)?.[1] ?? d;
    const layer = first(8, "0");

    if (type === "LINE") {
      doc.entities.push({ type: "LINE", layer, a: [num(first(10, "0")), num(first(20, "0"))], b: [num(first(11, "0")), num(first(21, "0"))] });
    } else if (type === "LWPOLYLINE") {
      const xs = g.filter((p) => p[0] === 10).map((p) => num(p[1]));
      const ys = g.filter((p) => p[0] === 20).map((p) => num(p[1]));
      doc.entities.push({ type: "POLY", layer, pts: xs.map((x, k) => [x, ys[k]] as [number, number]), closed: (parseInt(first(70, "0"), 10) & 1) === 1 });
    } else if (type === "POLYLINE") {
      const closed = (parseInt(first(70, "0"), 10) & 1) === 1;
      const pts: [number, number][] = [];
      while (j < pairs.length && !(pairs[j][0] === 0 && pairs[j][1] === "SEQEND")) {
        if (pairs[j][0] === 0 && pairs[j][1] === "VERTEX") {
          let k = j + 1, x = 0, y = 0;
          while (k < pairs.length && pairs[k][0] !== 0) {
            if (pairs[k][0] === 10) x = num(pairs[k][1]);
            if (pairs[k][0] === 20) y = num(pairs[k][1]);
            k++;
          }
          pts.push([x, y]);
          j = k;
        } else j++;
      }
      j++; // past SEQEND
      doc.entities.push({ type: "POLY", layer, pts, closed });
    } else if (type === "ARC") {
      doc.entities.push({ type: "ARC", layer, c: [num(first(10, "0")), num(first(20, "0"))], r: num(first(40, "0")), a1: num(first(50, "0")), a2: num(first(51, "0")) });
    } else if (type === "TEXT" || type === "MTEXT") {
      // MTEXT splits long strings over group 3 chunks followed by a final group 1
      const raw = g.filter((p) => p[0] === 3).map((p) => p[1]).join("") + first(1);
      doc.entities.push({ type: "TEXT", layer, at: [num(first(10, "0")), num(first(20, "0"))], text: decodeText(raw), height: num(first(40, "0")) });
    } else if (type === "INSERT") {
      doc.entities.push({
        type: "INSERT", layer, block: first(2), at: [num(first(10, "0")), num(first(20, "0"))],
        rotation: num(first(50, "0")), sx: num(first(41, "1")), sy: num(first(42, "1")),
      });
    }
    i = j;
  }
  return doc;
}
