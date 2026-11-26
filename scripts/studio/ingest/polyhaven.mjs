#!/usr/bin/env node
/**
 * Downloads CC0 models from Poly Haven (one-time, into assets-src, never at runtime).
 * Each asset goes into its own new directory with its glTF, binary buffer and textures,
 * plus meta.json (name, authors, license = CC0, source URL, retrieval date).
 *
 *   node scripts/studio/ingest/polyhaven.mjs <outDir> <asset_id> [<asset_id> ...] [--res=1k]
 *
 * Poly Haven asks API users for a unique User-Agent; this one names the tool only.
 */
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const res = (args.find((a) => a.startsWith("--res=")) ?? "--res=1k").split("=")[1];
const [outDir, ...ids] = args.filter((a) => !a.startsWith("--"));
if (!outDir || !ids.length) { console.error("usage: polyhaven.mjs <outDir> <id> [...]"); process.exit(2); }
const UA = { "User-Agent": "HaveniqStudio-asset-ingest/1.0" };
const get = async (url) => { const r = await fetch(url, { headers: UA }); if (!r.ok) throw new Error(`${r.status} ${url}`); return r; };

for (const id of ids) {
  if (!/^[A-Za-z0-9_]+$/.test(id)) { console.error(`skip bad id ${id}`); continue; }
  const dir = path.join(outDir, id);
  if (fs.existsSync(dir)) { console.log(`exists ${id}`); continue; }
  const info = await (await get(`https://api.polyhaven.com/info/${id}`)).json();
  const files = await (await get(`https://api.polyhaven.com/files/${id}`)).json();
  const g = files?.gltf?.[res]?.gltf;
  if (!g) { console.error(`no ${res} glTF for ${id}`); continue; }
  fs.mkdirSync(dir, { recursive: true });
  const write = async (rel, url) => {
    const target = path.resolve(dir, rel);
    if (!target.startsWith(path.resolve(dir) + path.sep)) throw new Error(`unsafe path ${rel}`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, Buffer.from(await (await get(url)).arrayBuffer()));
  };
  await write(path.basename(new URL(g.url).pathname), g.url);
  for (const [rel, f] of Object.entries(g.include ?? {})) await write(rel, f.url);
  fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify({
    id, name: info.name, authors: Object.keys(info.authors ?? {}), license: "CC0-1.0",
    source: `https://polyhaven.com/a/${id}`, retrievedAt: new Date().toISOString().slice(0, 10), resolution: res,
  }, null, 2));
  const kb = fs.readdirSync(dir, { recursive: true }).reduce((s, f) => { const p = path.join(dir, String(f)); return s + (fs.statSync(p).isFile() ? fs.statSync(p).size : 0); }, 0) / 1024;
  console.log(`ok ${id} ${(kb / 1024).toFixed(1)} MB`);
}
