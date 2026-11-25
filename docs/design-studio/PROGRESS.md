# Progress

Branch: `feature/design-studio` (worktree `.claude/worktrees/design-studio`, from Work-Gal 8a6c21d).
Read this file first in every session; do not re-audit the repo.

## Milestones
| # | Status | Notes |
|---|---|---|
| M0 | done | worktree, docs, flag (lib/studio/flags.ts), bench (scripts/studio/bench.mjs) |
| M1 | done | lib/studio core: 85 studio tests (362 total green), tsc + eslint clean |
| M2 | done (gate caveat) | empty shell + surface materials + proof; irradiance-only confirmed, swap-without-rebake accuracy limited (see QUALITY_GATES) |
| M3 | done (first pass) | /studio/[slug] behind flag; live item layer, sun + floor overlay, tiers, pipeline v0; evaluation in QUALITY_GATES |
| M4 | PARTIAL | pipeline, textured materials, modular sofa (4.0 m verified), travertine drums done; premium art bar NOT met (see QUALITY_GATES M4) |
| M5-M13 | pending | see MASTER_PLAN section 10 |

## Repo map (compact)
- Viewer: `components/walk/ApartmentWalk.tsx` (r3f, lightmaps lm-A/lm-B on uv1, `bakedOnly()` patch, custom Walker, collision vs walk.json boxes). Route `app/walk/[slug]`.
- Config: `lib/experience/types.ts` (ProjectExperience, roomAt). Twin: `lib/twin/schema.ts`, `lib/twin/walk.ts`.
- Build: `scripts/twin/build-walk.mjs` -> headless Blender (`scripts/blender/*.py`) -> `scripts/blender/build-walk-assets.mjs` -> `public/walk/<slug>/`.
- Storage: `lib/storage.ts` (driver interface, local only). Auth: `lib/auth.ts`, `lib/adminAuth.ts`, `proxy.ts`.
- Tests: `npm test` (vitest). e2e: Playwright, port 3001, `channel: "msedge"`.

## Dev-environment notes
- Worktree has its own `node_modules` (`npm ci --legacy-peer-deps`: pannellum-react pins React 16) and its own `app/generated/prisma`. No junction to the main checkout.
- `next dev` needs `JWT_SECRET`; restart after edits (no hot reload from .claude/worktrees).
- Commit identity: `git -c user.name="Gal Tayeb" -c user.email="134174230+GalTayeb12@users.noreply.github.com"`.

## Baseline performance numbers (M0)
Run: `node scripts/studio/bench.mjs http://localhost:3001 /walk/yarkon --seconds=10`
**Desktop measured** (headless Edge, ANGLE/D3D11, RTX 4070 laptop, 1920x1080, DPR 1, `next dev` server, 2026-11-25). Not a phone measurement.

| Page | FPS (may be display-capped) | Frame p50/p95 | Draw calls | Triangles | Transfer | Heap |
|---|---|---|---|---|---|---|
| /walk/yarkon | 144 | 6.9 / 7.1 ms | 196 | 1.33M | 25.1 MB (GLB 20.5 MB) | 122 MB |

Notes: `/walk/yarkon-twin` has no route (no `public/projects/yarkon-twin/experience.json`), so it can only be benchmarked once a studio route or experience file exists. Mobile numbers: **not measured** (needs a physical device).
Budgets in QUALITY_GATES.md: furnished scene <=1.2M tris desktop; the current furnished Yarkon scene already sits at 1.33M, mostly duplicated plants/pebbles (group N). The empty shell bake (M2) must drop this.

## M1 summary (what exists in lib/studio)
- `schema/{ids,catalog,nodes,document}.ts`: zod schemas (strict; transforms have NO scale), ULID node ids, baseline id helpers, CatalogManifest (model + material; sizing = fixed | variants | modular | parametric), pinned `{id, version}` refs.
- `baseline/fromTwin.ts`: twin -> Baseline entity map (rooms, walls, openings, surfaces; exterior/glazing = protected, rest unverified), deterministic `twinHash` (ignores source.file and <0.1 mm noise).
- `commands/{types,apply,history}.ts`: pure `apply(doc, cmd, ctx) -> {doc, inverse}`; catalog-aware validation (unknown asset, slot, material category per surface type, size); batch is atomic and one undo step; `History` with cap.
- `catalog/{modular,sizing}.ts`: module-chain validation + `solveForWidth` (2.4 / 3.2 / 4.0 m verified from real modules) + `resolveSize` per sizing mode.
- `validation/{geom2d,placement}.ts`: errors (out-of-room, overlap with height test, wall collision, blocks doorway, unknown asset, bad size) vs advisories (door swing, front clearance, narrow passage, not against wall).
- `migrations.ts`: chain mechanism (MIGRATIONS is empty while schema v1 is current).
- Test fixtures: `lib/__tests__/studio-fixtures.ts` (modular sofa, table, rug, chair variants, parametric wardrobe, shelf, materials).
- Known gaps (deliberate, later milestones): cabinetRun/countertop nodes (M8), partition/opening proposal validation against structure (M9), seed-design generation from twin_furnish (M2).

## M2 summary
- `node scripts/twin/build-walk.mjs yarkon yarkon-twin-shell --shell-only [--preview]`: empty shell (twin_build.py --no-furnish) -> `scripts/blender/studio_shell.py` (one `S|<surfaceId>` material per paintable surface, walls split by face side) -> bake group A only -> pack (dedup keeps unique material names). The slug must end in `-shell`; existing walk assets are never touched. Preview total about 1.5 min.
- `scripts/studio/check-shell.mts` validates GLB material ids against the baseline; `scripts/studio/irradiance-proof.mjs` is the irradiance experiment.
- `apartment_bake.py` got an optional `seed` (default unchanged). Baseline surfaces have `paintable`.
- Committed: `public/walk/yarkon-twin-shell/` (PREVIEW bake, 1.6 MB) and `public/projects/yarkon-twin-shell/experience.json` (viewer-only config). The final 4096 px bake is still to do (same command without --preview, about 20 min GPU).
- Source blends/EXR are in `C:\RealEstateAgent\assets-src\yarkon-twin-shell\` (shared with the main checkout, not in git).
- Not done from the M2 plan: `seed-design.json` from twin_furnish. M4 supplies the real living-room content, so the old rule-based furniture is not needed for the slice.
- Tooling note: `npx tsx` fetches tsx from npm (it is not a project dependency; the repo's existing scripts do the same).

## M3 summary
- Route `/studio/[slug]`: `app/studio/[slug]/page.tsx` (server: `STUDIO_ENABLED` + role allowlist via `lib/studio/flags.ts`, 404 otherwise; verified for anonymous/buyer/seller/forged/wrong-secret tokens) -> `StudioClient` -> `components/studio/StudioApp.tsx`.
- Store: `components/studio/store.ts` (zustand; one `DesignDocument`, all edits through `lib/studio/commands`, undo/redo/restore original, quality tier, lighting params). Debug handles `window.__studio` / `__studioInput` only with `?debug`.
- Scene: `components/studio/scene/{StudioCanvas,ShellLayer,ItemLayer,materials}.tsx`. Shell = existing `Apartment` (from ApartmentWalk) + patches: realtime direct light stripped from baked materials, shell casts sun shadows, `S|<surfaceId>` material overrides, floor shadow overlay masked by lightmap luminance. Items = catalog GLBs lit by sun + room probe + AO decal.
- `components/walk/ApartmentWalk.tsx`: ONLY six `export` keywords added (EYE, EXPOSURE, collide, Input, bakedOnly, Walker); no behaviour change. (Plan said "move shared code"; exporting is lower risk. Move later if wanted.)
- Pipeline v0: `scripts/blender/studio_normalize.py` (collection -> normalized GLB: floor at 0, back at y=0, front +Y), `scripts/studio/ingest/optimize.mjs`, `scripts/studio/ingest/publish.mts` (gates: strict manifest, license, bbox within 1 cm, slot targets, budgets) -> `public/studio/catalog/index.json`. Manifests: `catalog/manifests/<id>@<v>.json`.
- Test assets (Poly Haven CC0, NOT curated): sofa-03 (ornate, unusable for the art direction), armchair-modern-01, coffee-table-modern-01, side-table-01; flat-colour test materials. Raw GLBs in `assets-src/studio/items-raw/` (not in git). Optimized GLBs are committed under `public/studio/catalog/` (move to the storage driver / R2 in M6/M11).
- Tooling: `scripts/studio/shots.mjs` (scene screenshots through the real command engine; needs `STUDIO_ENABLED=1` dev server and the same `JWT_SECRET`), `bench.mjs --studio`.
- Dev server for the studio: `STUDIO_ENABLED=1 JWT_SECRET=studio-bench-dummy DATABASE_URL=postgresql://dummy:dummy@localhost:5432/studio_dev npx next dev -p 3001` (stop with PowerShell `Stop-Process` on the listener; restart after edits).
- Open from M3: sun intensity is uncalibrated; only one daylight condition exists; no UI beyond a mode switch + undo/redo/restore (M5); draw calls above target (M13); i18n strings are inline in StudioApp (centralise in M5).

## M4 summary (partial)
- Materials pipeline: `scripts/studio/ingest/material.mjs` (downloaded PBR set -> albedo/normal/ORM WebP + manifest; aspect kept; optional colour grade `--saturation --brightness --hue`). Five ambientCG CC0 materials packed: parquet-oak-light (graded), plaster-limewash-soft (graded), travertine-cream, fabric-textured-stone, microcement-light. Raw downloads: `assets-src/studio/materials-raw/<id>/` (zip + extracted images only, not in git).
- Schema: `ModelManifest.uvUnits` ("metres" | "atlas"). Items authored in metres take real textures through slots; atlas assets take colour/roughness/metalness only. Slot `default` materials are applied.
- Modular rendering: `ItemLayer` assembles modules by configuration (`assembleModules`); `publish.mts` verifies each module node's size within 1.5 cm.
- Original assets (Blender, headless): `scripts/blender/studio_sofa.py` (modular sofa: arm-l/arm-r, seat-80/100/120, chaise; plump bevel+subdiv cushions, welt piping, tapered metal legs) and `studio_tables.py` (travertine drum coffee/side tables). Outputs go to `assets-src/studio/items-raw/`, then `optimize.mjs` -> `public/studio/catalog/<id>/1/model.glb`.
- Harness: `scripts/studio/shots.mjs` scenes (hero, hero-close, sofa-24/34-chaise/40, finish, ...) with view tilt (`look`).

## Next steps
1. **Ask the owner for the reference images** (none reached the session) and put them in `docs/design-studio/references/`; judge the art against them.
2. Finish M4 art: rug (woven, UVs in metres), floor lamp + pendant, plants (calathea/pachira exist in the base blend but are ~75k verts: decimate first), decor (books, vase, throw), a curated contemporary armchair (replace the Poly Haven one or rework), stitching/seams, throw cushions; stronger contact grounding (per-item baked AO decals); calibrate sun intensity against the bake; decide the daylight strategy (single baked sun vs extra bakes); final-quality shell bake (`node scripts/twin/build-walk.mjs yarkon yarkon-twin-shell --shell-only`, about 20 min); then re-review against the QUALITY_GATES checklist.
3. Remove `sofa-03` and the other Poly Haven test items from the published catalog once curated replacements exist.
4. Then M5 (Design mode UX: click-to-select with three-mesh-bvh, contextual panel, catalog drawer, modular configurator UI, surface picker, validation hints, he/en strings in `lib/i18n/messages.ts`).
