/**
 * PNG stills (scripts/blender/twin_stills.py) → WebP for the site.
 *   npx tsx scripts/twin/stills-to-web.ts <in dir> <out dir>
 */
import { mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

async function main() {
  const [inDir, outDir] = process.argv.slice(2);
  if (!inDir || !outDir) { console.error("usage: stills-to-web.ts <in dir> <out dir>"); process.exit(2); }
  mkdirSync(outDir, { recursive: true });
  for (const f of readdirSync(inDir).filter((n) => n.endsWith(".png"))) {
    const out = path.join(outDir, f.replace(/\.png$/, ".webp"));
    await sharp(path.join(inDir, f)).webp({ quality: 82, alphaQuality: 90 }).toFile(out);
    console.log("→", out);
  }
}
main();
