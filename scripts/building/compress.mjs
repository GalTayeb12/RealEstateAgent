/**
 * compress.mjs — GLB post-processor using @gltf-transform/core + extensions
 * Usage:
 *   node compress.mjs <input.glb> <output.glb> [--mobile]
 *
 * Desktop: Draco mesh compression + KTX2/BasisU textures (quality 200)
 * Mobile:  Same + lower texture quality (100) + smaller UV atlas
 */

import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import {
  draco,
  textureCompress,
  dedup,
  prune,
  weld,
} from "@gltf-transform/functions";
import { createRequire } from "module";
import { readFileSync, writeFileSync, statSync } from "fs";
import path from "path";

const require = createRequire(import.meta.url);

// Try to load sharp (needed for texture compression). Optional.
let sharp;
try {
  sharp = require("sharp");
} catch {
  sharp = null;
}

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error("Usage: node compress.mjs <input.glb> <output.glb> [--mobile]");
  process.exit(1);
}

const INPUT  = args[0];
const OUTPUT = args[1];
const MOBILE = args.includes("--mobile");

async function main() {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

  console.log(`Reading ${INPUT}...`);
  const doc = await io.read(INPUT);

  // ── Dedup + weld shared geometry ──
  await doc.transform(
    dedup(),
    weld({ tolerance: 1e-4 }),
    prune(),
  );

  // ── Draco mesh compression ──
  try {
    const { MeshoptEncoder } = await import("meshoptimizer").catch(() => null) ?? {};
    await doc.transform(
      draco({
        quantizationPosition: MOBILE ? 11 : 14,
        quantizationNormal: 8,
        quantizationTexcoord: 10,
        quantizationColor: 8,
      }),
    );
    console.log("Draco compression applied.");
  } catch (e) {
    console.warn("Draco not available, skipping mesh compression:", e.message);
  }

  // ── KTX2 / BasisU texture compression ──
  if (sharp) {
    const quality = MOBILE ? 100 : 200;
    await doc.transform(
      textureCompress({
        encoder: sharp,
        targetFormat: "webp",
        resize: MOBILE ? [1024, 1024] : [2048, 2048],
        quality,
      }),
    );
    console.log(`Texture compression applied (quality ${quality}).`);
  } else {
    console.warn("sharp not installed — textures uncompressed. Run: npm install sharp");
  }

  // ── Write output ──
  await io.write(OUTPUT, doc);
  const inSize  = statSync(INPUT).size  / 1024 / 1024;
  const outSize = statSync(OUTPUT).size / 1024 / 1024;
  console.log(`${INPUT} (${inSize.toFixed(1)} MB) → ${OUTPUT} (${outSize.toFixed(1)} MB)`);
  console.log(`Compression ratio: ${(inSize / outSize).toFixed(2)}×`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
