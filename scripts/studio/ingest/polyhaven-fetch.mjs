#!/usr/bin/env node
// One-time download of CC0 Poly Haven models (glTF 1k + textures) for the catalog.
//   node scripts/studio/ingest/polyhaven-fetch.mjs <outDir> <phId> [<phId>...]
// Polite: one request per file, descriptive User-Agent. Output: <outDir>/<phId>/<phId>.gltf + bin + textures/.
import fs from "node:fs";
import path from "node:path";
const [out, ...ids] = process.argv.slice(2);
if (!out || !ids.length) { console.error("usage: polyhaven-fetch.mjs <outDir> <phId>..."); process.exit(2); }
const UA = { "User-Agent": "haveniq-studio-catalog-ingest (one-time CC0 download)" };
for (const id of ids) {
  const files = await (await fetch(`https://api.polyhaven.com/files/${id}`, { headers: UA })).json();
  const g = files.gltf?.["1k"]?.gltf;
  if (!g) { console.error(`${id}: no 1k glTF`); continue; }
  const dir = path.join(out, id);
  fs.mkdirSync(path.join(dir, "textures"), { recursive: true });
  const get = async (rel, url) => { const r = await fetch(url, { headers: UA }); if (!r.ok) throw new Error(`${rel}: ${r.status}`); fs.writeFileSync(path.join(dir, rel), Buffer.from(await r.arrayBuffer())); };
  await get(`${id}.gltf`, g.url);
  for (const [rel, f] of Object.entries(g.include ?? {})) await get(rel, f.url);
  console.log(`${id}: ok (${Object.keys(g.include ?? {}).length + 1} files)`);
}
