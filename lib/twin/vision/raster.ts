/**
 * Plan file → page bitmaps → the views sent to the model.
 *
 * PDF pages are rasterised with PDFium compiled to WebAssembly (no native
 * build step, works on Windows); raster files go through sharp. Each page is
 * trimmed of its blank margin, then sent as one overview that fits the
 * model's image limit, plus zoomed tiles when the overview had to shrink the
 * page enough to make dimension text hard to read.
 */
import sharp from "sharp";

/** High-resolution vision limit on current Claude models: long edge and ~4.8k visual tokens. */
export const MAX_EDGE = 2576;
export const MAX_PIXELS = 3_500_000;

export interface PageBitmap {
  /** 1-based page number (1 for raster files). */
  page: number;
  png: Buffer;
  width: number;
  height: number;
  /** Text layer of a vector PDF page (dimension strings, labels), if any. */
  text?: string;
}

export interface View {
  role: "overview" | "tile";
  png: Buffer;
  width: number;
  height: number;
  /** Region of the overview this view covers, in overview pixels. */
  region: { x: number; y: number; w: number; h: number };
  /** View pixels per overview pixel. */
  zoom: number;
}

export interface PageViews {
  page: number;
  overview: View;
  tiles: View[];
  /** Overview pixels per source pixel (after trimming). */
  downscale: number;
  text?: string;
}

export type InputKind = "pdf" | "image";

export function detectKind(data: Buffer, filename = ""): InputKind {
  if (data.subarray(0, 5).toString("latin1") === "%PDF-" || /\.pdf$/i.test(filename)) return "pdf";
  return "image";
}

export interface RasterOptions {
  /** PDF only: pages to render (1-based). Default: all, up to 4. */
  pages?: number[];
  /** PDF only: target long edge of the rendered page in pixels (capped at 300 dpi). */
  pdfEdge?: number;
}

/** Decode a PDF or raster plan into one PNG bitmap per page. */
export async function rasterize(data: Buffer, filename = "", opts: RasterOptions = {}): Promise<PageBitmap[]> {
  if (detectKind(data, filename) === "image") {
    // flatten alpha onto white (renders often have transparent backgrounds) and honour EXIF rotation
    const img = sharp(data).rotate().flatten({ background: "#ffffff" });
    const { data: png, info } = await img.png().toBuffer({ resolveWithObject: true });
    return [{ page: 1, png, width: info.width, height: info.height }];
  }
  const { PDFiumLibrary } = await import("@hyzyla/pdfium");
  const lib = await PDFiumLibrary.init();
  try {
    const doc = await lib.loadDocument(new Uint8Array(data));
    try {
      const count = doc.getPageCount();
      const wanted = (opts.pages ?? Array.from({ length: Math.min(count, 4) }, (_, i) => i + 1)).filter((p) => p >= 1 && p <= count);
      const out: PageBitmap[] = [];
      for (const n of wanted) {
        const page = doc.getPage(n - 1);
        const { originalWidth, originalHeight } = page.getOriginalSize();
        const edge = opts.pdfEdge ?? 6000;
        const scale = Math.min(edge / Math.max(originalWidth, originalHeight), 300 / 72);
        const r = await page.render({ scale, colorSpace: "RGBA", render: async (o) => o.data });
        const png = await sharp(Buffer.from(r.data), { raw: { width: r.width, height: r.height, channels: 4 } })
          .flatten({ background: "#ffffff" }).png().toBuffer();
        let text: string | undefined;
        try { text = page.getText().replace(/\s+/g, " ").trim() || undefined; } catch { text = undefined; }
        page.close();
        out.push({ page: n, png, width: r.width, height: r.height, text });
      }
      return out;
    } finally {
      doc.destroy();
    }
  } finally {
    lib.destroy();
  }
}

/** Largest size with the same aspect that fits the model's image limits. */
export function fitLimits(w: number, h: number): { w: number; h: number; k: number } {
  const k = Math.min(1, MAX_EDGE / Math.max(w, h), Math.sqrt(MAX_PIXELS / (w * h)));
  return { w: Math.max(1, Math.floor(w * k)), h: Math.max(1, Math.floor(h * k)), k };
}

export interface ViewOptions {
  /** Add zoom tiles when the overview shrinks the page by more than this (default 1.5×). */
  tileAbove?: number;
  /** Turn tiles off entirely. */
  tiles?: boolean;
  /** Most tiles per page (default 4). */
  maxTiles?: number;
}

/**
 * Trim the blank margin, make the overview, and (for big sheets) zoom tiles.
 *
 * Tiles are cut from the trimmed source at up to 2× the overview's resolution
 * with 8% overlap, so small dimension text becomes legible; the model still
 * reports every coordinate in overview pixels.
 */
export async function makeViews(bm: PageBitmap, opts: ViewOptions = {}): Promise<PageViews> {
  const trimmed = await sharp(bm.png).trim({ background: "#ffffff", threshold: 12 }).png().toBuffer({ resolveWithObject: true })
    .catch(() => ({ data: bm.png, info: { width: bm.width, height: bm.height } }));
  const src = trimmed.data, W = trimmed.info.width, H = trimmed.info.height;
  const fit = fitLimits(W, H);
  const overviewPng = fit.k < 1 ? await sharp(src).resize(fit.w, fit.h, { kernel: "lanczos3" }).png().toBuffer() : src;
  const overview: View = { role: "overview", png: overviewPng, width: fit.w, height: fit.h, region: { x: 0, y: 0, w: fit.w, h: fit.h }, zoom: 1 };

  const tiles: View[] = [];
  const shrink = 1 / fit.k;
  if ((opts.tiles ?? true) && shrink > (opts.tileAbove ?? 1.5)) {
    const zoom = Math.min(2, shrink);
    // grid so each tile (at `zoom`) fits the limits
    const maxTiles = opts.maxTiles ?? 4;
    // smallest grid (more than one tile) whose tiles fit the limits at `zoom`; else the largest allowed
    const grids: [number, number][] = [];
    for (let nx = 1; nx <= 3; nx++) for (let ny = 1; ny <= 3; ny++) if (nx * ny > 1 && nx * ny <= maxTiles) grids.push([nx, ny]);
    grids.sort((a, b) => a[0] * a[1] - b[0] * b[1] || Math.abs(fit.w / a[0] - fit.h / a[1]) - Math.abs(fit.w / b[0] - fit.h / b[1]));
    const fits = ([nx, ny]: [number, number]) => {
      const tw = (fit.w / nx) * 1.08 * zoom, th = (fit.h / ny) * 1.08 * zoom;
      return Math.max(tw, th) <= MAX_EDGE && tw * th <= MAX_PIXELS;
    };
    const [nx, ny] = grids.find(fits) ?? grids[grids.length - 1] ?? [1, 1];
    if (nx * ny > 1) {
      for (let j = 0; j < ny; j++)
        for (let i = 0; i < nx; i++) {
          const ow = fit.w / nx, oh = fit.h / ny;
          const x0 = Math.max(0, Math.floor(i * ow - ow * 0.04)), y0 = Math.max(0, Math.floor(j * oh - oh * 0.04));
          const x1 = Math.min(fit.w, Math.ceil((i + 1) * ow + ow * 0.04)), y1 = Math.min(fit.h, Math.ceil((j + 1) * oh + oh * 0.04));
          // same region in source pixels
          const sx = Math.floor(x0 * shrink), sy = Math.floor(y0 * shrink);
          const sw = Math.min(W - sx, Math.ceil((x1 - x0) * shrink)), sh = Math.min(H - sy, Math.ceil((y1 - y0) * shrink));
          const tf = fitLimits(Math.round((x1 - x0) * zoom), Math.round((y1 - y0) * zoom));
          const png = await sharp(src).extract({ left: sx, top: sy, width: sw, height: sh }).resize(tf.w, tf.h, { kernel: "lanczos3" }).png().toBuffer();
          tiles.push({ role: "tile", png, width: tf.w, height: tf.h, region: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, zoom: tf.w / (x1 - x0) });
        }
    }
  }
  return { page: bm.page, overview, tiles, downscale: fit.k, text: bm.text };
}
