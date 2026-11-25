# Asset pipeline

Source files (Blender, raw downloads, EXR) live in `assets-src/` (gitignored). Only optimized browser assets and manifests are published.

Stages: discover -> verify license -> import (isolated dir) -> inspect geometry -> normalize dimensions -> normalize origin (floor / back-centre) and orientation (+Z forward) -> UV + PBR processing -> optimize (gltf-transform: dedup, weld, simplify, meshopt) -> LOD -> collision proxy -> material slots -> modular connectors -> thumbnail -> contact-AO decal -> GLB export -> KTX2/WebP textures -> validate (gltf-validator + quality gates) -> publish manifest to catalog.

Scripts (planned): `scripts/studio/ingest/{discover,import,validate,publish}.mjs`, `scripts/blender/studio_{normalize,thumbnail,parametric}.py`.
Manifests: `catalog/manifests/<id>.json` (zod `CatalogManifest`). Binaries: local `.storage/` now, R2 later (`STORAGE_DRIVER=r2`).
Downloaded files are untrusted: each in its own empty directory, scripts kept elsewhere.
