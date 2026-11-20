/**
 * Eval for PDF/image plan parsing, scored against YARKON_TWIN.
 *
 *   npx tsx scripts/twin/eval-vision.ts [--out <dir>] [--cases a,b] [--prepare-only]
 *
 * Cases (inputs are generated into <out>/inputs; nothing is committed):
 *   plan     the Yarkon twin drawn by planSvg with dimension chains and a title
 *            block, rasterised to PNG (a clean architect-style sheet)
 *   render   public/buildings/yarkon-v2/apt-top.webp, a rendered top view with
 *            no text; the developer states the 127 m² area
 *   scan     synthetic: English labels, rotated 2°, grey, blurred, noisy JPEG,
 *            no title block (a phone photo / scan of a printout)
 *   pdf      synthetic: the plan at 200 px/m on an A3 PDF sheet, read through
 *            PDFium and sent with zoom tiles
 *   pdf-notiles  the same PDF without tiles (to measure what tiles buy)
 *
 * Every case is one real API call (costs money; the summary prints the total).
 * Default cases: plan, render, scan, pdf.
 *
 * Results 2026-11-20, claude-opus-5-5, effort high, one run each ($0.68 total):
 *   case         valid  rooms  types  area±5%  doors  win  slid  walls R/P    tokens in/out  $
 *   plan         ok     8/8    8      8        5/5    4/4  1/1   1.00/1.00    6.5k/4.6k      0.12
 *   render       ok*    6/8    5      5        4/5    5/4  2/1   0.98/0.98    8.2k/4.4k      0.12
 *   scan         ok*    8/8    8      7        4/5    4/4  1/1   0.99/0.99    5.9k/5.1k      0.13
 *   pdf (tiles)  ok     8/8    8      8        5/5    4/4  1/1   1.00/1.00    26.4k/4.9k     0.20
 *   pdf-notiles  ok*    8/8    8      7        5/5    4/4  1/1   1.00/1.00    8.1k/4.2k      0.12
 *   (* one validator warning: render had no entry door; scan / pdf-notiles had
 *   the corridor area off from the written 6.1 m².) The misses are the undrawn
 *   open-plan boundaries (corridor −36% on scan, −24% without tiles) and, on
 *   the render, living + kitchen + corridor read as one room.
 */
import { config } from "dotenv";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument, rgb } from "pdf-lib";
import sharp from "sharp";
import { YARKON_TWIN } from "../../lib/twin/fixtures/yarkon";
import { type PlanTwin, bbox } from "../../lib/twin/schema";
import { planSvg } from "../../lib/twin/svg";
import { parsePlanImage, type ParseImageOptions } from "../../lib/twin/vision";
import { scoreTwin } from "../../lib/twin/vision/score";

config({ path: process.env.ENV_FILE ?? ".env.local", quiet: true });

const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(n); return i < 0 ? undefined : args[i + 1]; };
const OUT = flag("--out") ?? join(tmpdir(), "twin-vision-eval");
const CASES = (flag("--cases") ?? "plan,render,scan,pdf").split(",");
const PREPARE_ONLY = args.includes("--prepare-only");

/** Dimension chains and a title block on top of planSvg's drawing (same transform as planSvg). */
function annotatedSvg(t: PlanTwin, ppm: number, lang: "he" | "en", title: boolean): string {
  const base = planSvg(t, { ppm, lang });
  const pts = [...t.walls.flatMap((w) => [w.a, w.b]), ...t.rooms.flatMap((r) => r.polygon)];
  const [x1, , x2, y2] = bbox(pts);
  const pad = 1.0, k = ppm;
  const X = (x: number) => (x - x1 + pad) * k, Y = (y: number) => (y2 - y + pad) * k;
  const W = (x2 - x1 + pad * 2) * k;
  const g: string[] = [`<g stroke="#2b2a28" stroke-width="1.2" fill="#2b2a28" font-size="${(0.2 * k).toFixed(0)}">`];
  const tick = (x: number, y: number) => `<line x1="${x - 0.08 * k}" y1="${y + 0.08 * k}" x2="${x + 0.08 * k}" y2="${y - 0.08 * k}" stroke-width="2"/>`;
  // horizontal chain above the back wall, through the partitions
  const hy = Y(9.3);
  const hx = [0, 3.2, 7.0, 8.2, 11.2, 15.0];
  g.push(`<line x1="${X(hx[0])}" y1="${hy}" x2="${X(hx[hx.length - 1])}" y2="${hy}"/>`);
  hx.forEach((x) => g.push(tick(X(x), hy), `<line x1="${X(x)}" y1="${hy - 0.1 * k}" x2="${X(x)}" y2="${Y(8.85)}" stroke-width="0.6"/>`));
  for (let i = 1; i < hx.length; i++)
    g.push(`<text x="${(X(hx[i - 1]) + X(hx[i])) / 2}" y="${hy - 0.08 * k}" text-anchor="middle" stroke="none">${Math.round((hx[i] - hx[i - 1]) * 100)}</text>`);
  // overall width below the balcony
  const by = Y(-2.75);
  g.push(`<line x1="${X(0)}" y1="${by}" x2="${X(15)}" y2="${by}"/>`, tick(X(0), by), tick(X(15), by),
    `<text x="${(X(0) + X(15)) / 2}" y="${by - 0.08 * k}" text-anchor="middle" stroke="none">1500</text>`);
  // vertical chain on the west side
  const vx = X(-0.75);
  const vy = [-2.2, 0, 4.6, 8.5];
  g.push(`<line x1="${vx}" y1="${Y(vy[0])}" x2="${vx}" y2="${Y(vy[vy.length - 1])}"/>`);
  vy.forEach((y) => g.push(tick(vx, Y(y))));
  for (let i = 1; i < vy.length; i++) {
    const cy = (Y(vy[i - 1]) + Y(vy[i])) / 2;
    g.push(`<text x="${vx - 0.08 * k}" y="${cy}" text-anchor="middle" stroke="none" transform="rotate(-90 ${vx - 0.08 * k} ${cy})">${Math.round((vy[i] - vy[i - 1]) * 100)}</text>`);
  }
  if (title) {
    const text = lang === "he" ? "דירה 4 חדרים · שטח דירה 127 מ״ר · מרפסת שמש 33 מ״ר · קנ״מ 1:50" : "4-room apartment · 127 m² · balcony 33 m² · scale 1:50";
    g.push(`<text x="${W - 0.6 * k}" y="${Y(-2.75) + 0.75 * k}" text-anchor="end" stroke="none" font-size="${(0.24 * k).toFixed(0)}" direction="${lang === "he" ? "rtl" : "ltr"}">${text}</text>`);
  }
  g.push("</g>");
  return base.replace("</svg>", g.join("\n") + "\n</svg>");
}

interface Case { name: string; file: string; opts: ParseImageOptions }

async function prepare(name: string, dir: string): Promise<Case> {
  switch (name) {
    case "plan": {
      const file = join(dir, "yarkon-plan.png");
      await sharp(Buffer.from(annotatedSvg(YARKON_TWIN, 100, "he", true))).png().toFile(file);
      return { name, file, opts: {} };
    }
    case "render": {
      const file = join(dir, "apt-top.webp");
      writeFileSync(file, readFileSync("public/buildings/yarkon-v2/apt-top.webp"));
      return { name, file, opts: { areaM2: 127 } };
    }
    case "scan": {
      const file = join(dir, "yarkon-scan.jpg");
      const png = await sharp(Buffer.from(annotatedSvg(YARKON_TWIN, 70, "en", false))).png().toBuffer();
      const meta = await sharp(png).metadata();
      const noise = await sharp({ create: { width: meta.width! + 200, height: meta.height! + 200, channels: 3, background: "#808080", noise: { type: "gaussian", mean: 128, sigma: 18 } } }).png().toBuffer();
      const rotated = await sharp(png).rotate(2, { background: "#f4f2ec" }).extend({ top: 100, bottom: 100, left: 100, right: 100, background: "#f4f2ec" }).png().toBuffer();
      const rm = await sharp(rotated).metadata();
      await sharp(rotated)
        .composite([{ input: await sharp(noise).resize(rm.width!, rm.height!).png().toBuffer(), blend: "soft-light" }])
        .greyscale().blur(0.8).jpeg({ quality: 55 }).toFile(file);
      return { name, file, opts: {} };
    }
    case "pdf":
    case "pdf-notiles": {
      const file = join(dir, "yarkon-a3.pdf");
      const png = await sharp(Buffer.from(annotatedSvg(YARKON_TWIN, 200, "he", true))).png().toBuffer();
      const pdf = await PDFDocument.create();
      const img = await pdf.embedPng(png);
      const page = pdf.addPage([1191, 842]); // A3 landscape
      const k = Math.min((1191 - 120) / img.width, (842 - 140) / img.height);
      const w = img.width * k, h = img.height * k;
      page.drawImage(img, { x: (1191 - w) / 2, y: 100 + (842 - 120 - h) / 2, width: w, height: h });
      // a frame and an empty title block, like a real sheet
      page.drawRectangle({ x: 20, y: 20, width: 1151, height: 802, borderWidth: 1.5, borderColor: rgb(0, 0, 0) });
      page.drawRectangle({ x: 1171 - 260, y: 20, width: 260, height: 70, borderWidth: 1, borderColor: rgb(0, 0, 0) });
      writeFileSync(file, await pdf.save());
      return { name, file, opts: { tiles: name === "pdf" } };
    }
    default:
      throw new Error(`unknown case ${name}`);
  }
}

async function main() {
  const inputs = join(OUT, "inputs");
  mkdirSync(inputs, { recursive: true });
  const rows: Record<string, unknown>[] = [];
  let total = 0;
  for (const name of CASES) {
    const c = await prepare(name, inputs);
    console.log(`\n── ${name}: ${c.file}`);
    if (PREPARE_ONLY) continue;
    const t0 = Date.now();
    const res = await parsePlanImage(readFileSync(c.file), { file: c.file.split(/[\\/]/).pop(), ...c.opts });
    const secs = (Date.now() - t0) / 1000;
    const dir = join(OUT, name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "twin.json"), JSON.stringify(res.twin, null, 2));
    writeFileSync(join(dir, "extraction.json"), JSON.stringify(res.extraction, null, 2));
    writeFileSync(join(dir, "plan.svg"), planSvg(res.twin, { highlight: res.report.issues.map((i) => i.ref).filter((r): r is string => !!r) }));
    const s = scoreTwin(res.twin, YARKON_TWIN);
    total += res.usage.costUsd;
    const row = {
      case: name,
      ok: res.report.ok,
      errors: res.report.issues.filter((i) => i.level === "error").length,
      warnings: res.report.issues.filter((i) => i.level === "warning").length,
      scale: `${res.scale.source} ${(res.scale.mPerPx * 100).toFixed(3)} cm/px (${res.scale.confidence.toFixed(2)})`,
      rooms: `${s.rooms.got}/${s.rooms.want}`,
      matched: s.rooms.matched, typeOk: s.rooms.typeOk, areaWithin5: s.rooms.areaWithin5,
      doors: `${s.openings.door.got}/${s.openings.door.want}`,
      windows: `${s.openings.window.got}/${s.openings.window.want}`,
      sliders: `${s.openings.slider.got}/${s.openings.slider.want}`,
      wallRecall: s.walls.recall, wallPrecision: s.walls.precision,
      netArea: `${s.netArea.got}/${s.netArea.want}`,
      views: `${res.views.overview.join("×")}+${res.views.tiles}`,
      tokens: `${res.usage.inputTokens}/${res.usage.outputTokens}`,
      usd: Math.round(res.usage.costUsd * 1000) / 1000,
      secs: Math.round(secs),
      model: res.usage.model,
    };
    rows.push(row);
    writeFileSync(join(dir, "score.json"), JSON.stringify({ row, score: s, issues: res.report.issues, notes: res.notes, confidence: res.confidence }, null, 2));
    console.log(row);
    for (const d of s.rooms.detail) console.log(`  ${d.want.padEnd(9)} → ${String(d.got).padEnd(12)} iou ${d.iou.toFixed(2)}  area ${d.areaErr === null ? "—" : (d.areaErr * 100).toFixed(1) + "%"}  ${d.typeOk ? "" : "TYPE"}`);
    for (const i of res.report.issues) console.log(`  ${i.level}: ${i.en}`);
    for (const n of res.notes) console.log(`  note: ${n}`);
  }
  if (rows.length) {
    console.table(rows.map(({ model: _m, tokens: _t, ...r }) => r));
    console.log(`total cost $${total.toFixed(3)} → ${OUT}`);
    writeFileSync(join(OUT, "summary.json"), JSON.stringify({ rows, totalUsd: total }, null, 2));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
