#!/usr/bin/env node
// Web GLB (meshopt + WebP) -> UE-importable GLB (plain geometry, PNG textures). node ue-variant.mjs <in.glb> <out.glb>
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { textureCompress } from "@gltf-transform/functions";
import { MeshoptDecoder } from "meshoptimizer";
const [src, out] = process.argv.slice(2);
const require = createRequire(import.meta.url);
const sharp = (() => { try { return require(require.resolve("sharp", { paths: [path.dirname(require.resolve("ndarray-pixels"))] })); } catch { return require("sharp"); } })();
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
const doc = await io.read(src);
await doc.transform(textureCompress({ encoder: sharp, targetFormat: "png" }));
for (const ext of doc.getRoot().listExtensionsUsed()) if (/meshopt|webp/i.test(ext.extensionName)) ext.dispose();
fs.mkdirSync(path.dirname(out), { recursive: true });
await io.write(out, doc);
console.log(out, (fs.statSync(out).size / 1048576).toFixed(2) + " MB", "extensions:", doc.getRoot().listExtensionsUsed().map((e) => e.extensionName).join(",") || "none");
