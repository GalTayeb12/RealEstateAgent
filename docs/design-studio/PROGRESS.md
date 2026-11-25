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
| M4 | DONE (clean/composed; premium polish items listed in QUALITY_GATES) | pipeline, textured materials, modular sofa (4.0 m verified), travertine drums done; premium art bar NOT met (see QUALITY_GATES M4) |
| E (Unreal) | E0, E1 done; E2 level builds, first render black | resume at UNREAL.md section E2 status (4 hypotheses) |
| M5 | DONE (touch gestures beyond tap/drag and real-device test pending) | Design mode, panels, catalog, mobile layout, he/en; see M5 summary |
| M6 | DONE except live-DB integration (needs a dev database) | file store + Prisma repo/migration, API, autosave, versions, share links, R2 driver; see M6 summary |
| M7 | DONE | floor planner: top + isometric orthographic views, dimensions, areas, door swings, wall clearances; see M7 summary |
| M8 | DONE (visual calibration gap noted) | parametric generators: kitchen base/wall runs, wardrobe, shelving, bed; see M8 summary |
| M9 | DONE | architecture proposals: partition + opening tools, protected structure, concept labelling, kitchen layouts; see M9 summary |
| M10-M13 | pending | see MASTER_PLAN section 10 |

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

## M6 summary (2026-11-26) - persistence, versions, sharing
- **Repository layer** (`lib/studio/persist/`): `DesignRepo` contract; `KvDesignRepo` (in-memory for tests, `StorageKv` over the Storage driver for local use; mutations are serialised so two saves with the same revision cannot both win - found by a test); `PrismaDesignRepo` (conditional `UPDATE ... WHERE revision`); `repo.ts` selects by `STUDIO_STORE` (`file` default in dev, `prisma` required in production).
- **Prisma**: models `StudioDesign`, `StudioDesignVersion`, `StudioDesignShare` + migration `20261126000000_add_studio_designs` (purely additive; generated offline). **Not applied anywhere and the Prisma repo is NOT integration-tested**: there is no local Postgres; it needs a DEV database (ask the owner for a Neon dev branch), then run `node scripts/studio/assert-dev-db.mjs && npx prisma migrate deploy`. The guard refuses the main checkout's DATABASE_URL (verified against the real one), accepts localhost and hosts/databases labelled dev/test/studio.
- **API** (`app/api/studio/**`, thin wrappers over `lib/studio/persist/ops.ts`): designs CRUD, rename, duplicate, versions + restore (restore = new revision), share links (view/edit, expiry, revoke; only the SHA-256 of the token is stored), public token routes (no owner id exposed). Owner routes answer 404 to anonymous / wrong-role / other users. `scripts/studio/e2e-api.mjs` (20 checks over real HTTP) passes.
- **Client** (`components/studio/persist/*`, `panels/DesignMenu.tsx`): loads or creates your design for the apartment, silent autosave (1.5 s debounce, revision-checked), save state chip, conflict banner with Reload, IndexedDB draft re-applied after offline/closed tab, flush on tab hide, "More" menu (name, named versions, duplicate, share links). Shared page `/studio/shared/[token]` (view-only disables Design mode and refuses edits). `scripts/studio/e2e-persist.mjs` (15 checks) passes; design e2e still passes in en/he/mobile.
- **R2 driver** `lib/storageR2.ts` (aws4fetch, SigV4) - built, unit-tested with a fake fetch, INACTIVE until `STORAGE_DRIVER=r2` + `R2_*` variables. Env variables documented in `.env.example`.
- Known gaps: Prisma repo untested against a database; autosave over a shared edit link works but conflicts between two editors are only resolved by Reload; no per-user rate limiting on the new routes yet (add in M13 hardening); catalog assets still served from `public/studio/catalog` (move to Storage/R2 in M11).

## M5 summary (2026-11-26) - Design mode, full scope except where noted
- **Interaction** (`components/studio/scene/DesignInteraction.tsx`): click a piece or a wall/floor/ceiling to select; drag a piece on the floor plane (5 cm grid, live validation, an illegal drop is refused with a translated reason); outline green / amber (advisories) / red (error). Left button selects and drags, right button looks (no pointer lock in Design mode); the camera freezes while a piece is grabbed (`components/studio/gesture.ts`). The click that ends a drag no longer changes the selection.
- **Edits always go through** `useStudio.commit` (validates the resulting piece first): add from catalog (found a free spot 2.6 m ahead, front facing you), replace, rotate +-15 degrees (button or `R` / `Shift+R`), duplicate (`Ctrl+D`), remove (`Delete`), undo/redo (`Ctrl+Z` / `Ctrl+Y`), restore original (with confirm), `Esc` deselects.
- **Panels** (`components/studio/panels/*`): property panel (dimensions in cm, actions, size variants, modular editor with legal insert/remove and common-size presets, parametric sliders, material swatches per slot with real texture swatches, placement hints); surface panel (material swatches filtered by surface type, reset); catalog drawer (search, style chips, category chips, thumbnails, replace mode locked to the category).
- **Pure logic with tests** (`lib/studio/design/{snap,preview,spot,options}.ts`, `lib/__tests__/studio-design.test.ts`): snapping, free-spot search, preview validation, filters, modular presets, legal insert/remove.
- **i18n**: `lib/studio/i18n.ts` (he/en, test guarantees identical keys; styles, categories, validation codes, module names). RTL verified in Hebrew.
- **Mobile**: the same flow on a phone viewport; panels and the drawer become bottom sheets, the 3D view shrinks above the open sheet so the piece stays visible, 44 px touch targets. Real touch gestures (two-finger rotate, pinch) are NOT done: rotation is by buttons; real-device testing is still pending.
- **Quality selector** Lite / Standard / High / Auto; **thumbnails** rendered through the studio itself (`scripts/studio/thumbs.mjs`, neutral backdrop mode via `store.thumb`).
- **Checks**: `scripts/studio/e2e-design.mjs` drives the real UI (add, rotate, drag, undo, refused move, surface material, modular 4.0 m, delete, restore) in English, Hebrew and mobile (all pass). Screenshots in `docs/design-studio/results/m5/`.
- Deviations from the plan: no `three-mesh-bvh` (r3f raycasting is enough at this scale; add it if scenes grow); `window.confirm` for restore; engine-level command errors other than placement refusals are still English.
- Known gaps: no wall snapping for pieces that stand against a wall; plan mode still disabled (M7); no save (M6).

## M4 summary (partial)
- Materials pipeline: `scripts/studio/ingest/material.mjs` (downloaded PBR set -> albedo/normal/ORM WebP + manifest; aspect kept; optional colour grade `--saturation --brightness --hue`). Five ambientCG CC0 materials packed: parquet-oak-light (graded), plaster-limewash-soft (graded), travertine-cream, fabric-textured-stone, microcement-light. Raw downloads: `assets-src/studio/materials-raw/<id>/` (zip + extracted images only, not in git).
- Schema: `ModelManifest.uvUnits` ("metres" | "atlas"). Items authored in metres take real textures through slots; atlas assets take colour/roughness/metalness only. Slot `default` materials are applied.
- Modular rendering: `ItemLayer` assembles modules by configuration (`assembleModules`); `publish.mts` verifies each module node's size within 1.5 cm.
- Original assets (Blender, headless): `scripts/blender/studio_sofa.py` (modular sofa: arm-l/arm-r, seat-80/100/120, chaise; plump bevel+subdiv cushions, welt piping, tapered metal legs) and `studio_tables.py` (travertine drum coffee/side tables). Outputs go to `assets-src/studio/items-raw/`, then `optimize.mjs` -> `public/studio/catalog/<id>/1/model.glb`.
- Harness: `scripts/studio/shots.mjs` scenes (hero, hero-close, sofa-24/34-chaise/40, finish, ...) with view tilt (`look`).

## M7 summary (2026-11-26) - floor planner
- **Pure math** (`lib/studio/plan/view.ts`): `PlanView {kind, cx, cy, ppm}`; `project/unproject` on the ground plane, `zoomAt` (cursor point stays fixed), `panBy`, `fitView`, `threeCamera`. Top view is a pure scale (north up); isometric uses the true 35.264 degree elevation, camera looking north-east.
- **Measurements** (`lib/studio/plan/measure.ts`): room edge lengths, areas, label anchors that stay inside concave rooms, door swings (hinge/closed/open/arc, swinging into the room side), `rayDistance`, free distance from a footprint to the room walls. All from the baseline geometry, rounded to the centimetre (never from pixels).
- **Scene**: Plan mode swaps the Walker for an orthographic `PlanRig` driven by the same store numbers as the SVG overlay, hides ceilings, clips walls at 1.25 m (cutaway, floor not clipped), turns the post-processing composer off and keeps `gl.toneMapping` in sync. Design interactions (select, drag, rotate, panels, catalog) work unchanged in Plan (`isEditing(mode)`), because the ray/plane maths is camera-agnostic.
- **UI**: `PlanOverlay` (SVG: room names + areas, edge lengths, door swings, selected piece W x D and wall distances, interior/balcony totals), `PlanToolbar` (Top/Isometric, zoom, Fit, Dimensions), wheel zoom, drag pan, two-finger pinch/pan (`usePlanGestures`), he/en strings, mobile toolbar above the bottom sheet. Leaving Plan teleports the walker back to where they stood.
- **Verification**: 18 new unit tests (project/unproject round trips in both views, zoom/pan invariants, fit containment, living room 36.28 m2 and its edge lengths, inward normals for either winding, door swing geometry, clearances in cm); full suite 437 passing; eslint + tsc clean; `scripts/studio/e2e-plan.mjs` passes on desktop/en, desktop/he and mobile-emulated (fit, labels, 820/340 cm edges, wheel/buttons zoom, pan, isometric, document unchanged across modes, selected piece size + clearances, rotate + undo in Plan, walker returns); `e2e-design.mjs` still passes. Shots: `results/m7/`.
- Known gaps: pinch gestures are untested on a real device (emulated mobile only); edge labels of neighbouring rooms duplicate on shared walls; in isometric the clipped walls are open-topped (no cap).

## M8 summary (2026-11-26) - parametric systems
- **Generators** (`lib/studio/catalog/generators/`, pure TS, no three.js): `base-run` (plinth, carcass, doors, every third unit a 3-drawer stack, bar handles, 4 cm countertop with front overhang), `wall-run`, `wardrobe` (40-75 cm doors, vertical bar handles on the meeting edges), `shelving` (upright every <= 90 cm, openings 28-50 cm, back panel), `bed` (platform base, 24 cm mattress, upholstered headboard, 1-2 pillows). Output is a list of bevelled boxes in the item frame (x centred, y up, z in [-depth, 0]); no scale anywhere.
- **Schema**: parametric sizing gains an optional `generator`; `assets.glb` is optional and a model must have exactly one of GLB or generator (`superRefine`). Five manifests (`catalog/manifests/*-01@1.json`), all `HAVENIQ-ORIGINAL`, `uvUnits: metres`.
- **Rendering** (`components/studio/scene/generated.ts`, `ItemLayer`): `RoundedBoxGeometry` per part with UVs in metres in the item frame (a 60 cm tile covers 60 cm and the grain continues across neighbouring parts), merged per slot (one draw call per material slot). `Item` is split into `GlbItem` / `GeneratedItem` over a shared `ItemBody`. Slots take catalog materials exactly like GLB items; hardware has a brass fallback look.
- **Gates** (`generators/verify.ts`, run by `publish.mts` at min/default/max of every parameter): real size within 1 cm, every part bevelled, front gaps >= 2.4 mm and no overlaps, a handle on every front, every declared slot backed by geometry. Publish fails otherwise. A test run found and fixed a real defect (0.8 m wardrobe got one 80 cm door).
- **Verification**: 21 generator tests (door counts, 3 mm gaps, countertop dimensions, sweep of every parameter step, negative tests for each gate, UV span in metres, bevel normals, schema rules); 458 tests total; `scripts/studio/e2e-generated.mjs` places all five in their rooms and confirms the RENDERED geometry (world bounds, decal excluded) equals the resolved size within 1.5 cm, a `setParams` regenerates at the new size, an out-of-range value is refused, undo restores. Design/Plan e2e still pass. Review shots in `results/m8/` (kitchen run with drawers and handles reads like a real kitchen; shelving correct).
- **Known gaps**: (1) dynamic items in the bedrooms are under-exposed against the bright baked walls (probe exposure per room is ~0.6 vs 1.27 in the living room; the wardrobe and bed read dark brown/grey) - needs per-room calibration of item lighting (M13). (2) Headboard is a flat panel (no tufting/seams); countertop has no sink or hob cut-outs; no corner/L-shaped kitchen runs yet (two runs can be placed at right angles). (3) Wardrobes are hinged only (no sliding doors, no interior shelving). (4) Previews are rendered by the thumbnail harness with the default materials.

## M9 summary (2026-11-26) - architecture proposals
- **Rules** (`lib/studio/validation/architecture.ts`, pure): partitions must be >= 40 cm, stay inside a room, end on wall FACES (a run into any wall is `hits-wall`, into an exterior wall or glazing `protected-wall`), not cut through furniture, block a doorway or overlap another partition; narrow gaps beside walls are advisories. Openings are only allowed in non-protected walls, 60-300 cm wide, 10 cm from the wall ends and 20 cm from other openings, with no furniture in the way. EVERY proposal carries the `unverified` advisory, and openings in interior walls also `structural-check` (the twin has no structural survey, so even interior walls are never assumed non-load-bearing). `snapToWallFace` / `nearestWall` give the UI exact face snapping.
- **Obstacles**: placement validation now treats proposed partitions as walls and proposed openings as doorways for furniture, so the design stays consistent (a table cannot be dropped through a concept wall).
- **Commands**: `setProposal {id, patch}` (public, strict zod schema, exact inverse), plus the existing `add`/`remove`. `commit` validates proposals before applying them (refusal comes back as a reason). Proposals live only in the design document: the baseline is never touched (tested by deep-equal) and "Restore original" removes them.
- **Kitchen planner** (`lib/studio/design/kitchen.ts`, pure): reads the kitchen's real walls (a side without a wall, such as an open-plan edge, gets no runs), keeps door spans free (windows only block wall units), and offers single-wall, galley, L and U layouts built from the parametric runs (M8). Each layout is ONE batch (a single undo), only offered if every base run passes placement validation, replaces an earlier kitchen instead of stacking, and is sorted by counter length. Yarkon: L-shaped 6.9 m, galley 6.4 m, single 3.9 m.
- **UI**: Architecture menu (add partition / add opening / kitchen layouts), a two-click partition tool and one-click opening tool that work in walk, design and plan cameras (ghost turns red when it would be refused; ends snap to wall faces, the 5 cm grid and the axes), proposal panel (thickness / width / position sliders, remove, live issues), kitchen layout chooser with mini plans, amber concept rendering in 3D (warm translucent wall with outline, ghost doorway), dashed concept shapes with "Concept" tags in the plan, a persistent "contains unverified changes" banner, he/en strings.
- **Verification**: 23 new tests (partition rules incl. protected/interior walls, doorway, furniture, overlap, narrow passage; opening rules; proposals as furniture obstacles; wall snapping; command exactness and baseline immutability; kitchen layouts apply cleanly with zero placement errors and undo in one step); 481 tests total; eslint + tsc clean; `scripts/studio/e2e-arch.mjs` passes in en and he (tool snaps to the face at y 4.54, partition/opening placement, protected wall refused with its reason, Escape, panel edit, bad extension refused, undo, 3 kitchen layouts, one-step apply/undo, restore original); design (desktop + mobile-emulated), plan, generated, api and persist suites still pass. Shots in `results/m9/`.
- **Known gaps**: partitions are straight and axis-friendly (no curved or polyline walls), they cannot be dragged after placement (edit by panel or delete and redraw), openings are doorways of a fixed 2.10 m height (no windows or arches), the shell is not cut or re-lit (concepts render with realtime lighting, as planned), U-shaped kitchen is not available in Yarkon (open-plan edge), proposals do not yet update room areas.

## Next steps (updated 2026-11-25; owner chose to return to Three.js, Unreal paused at UNREAL.md E2 status)
M4 now has rug + floor lamp; remaining M4 art: plants/decor, warmer rug material, stronger grounding, calibrated sun, final shell bake, then M5 (incl. dedicated mobile touch UI, tiers renamed Lite/Standard/High).
Owner decisions since M4: reference images are NOT required (use ART_DIRECTION + an original HAVENIQ identity); rendering tiers Lite/Standard/High (Three.js) + optional Ultra (UE Pixel Streaming); universal devices incl. a dedicated mobile touch UI; asset sources extended (Fab, Megascans free, iMeshh, BlenderKit, Sketchfab, CGBookcase, ShareTextures, TextureCan) with per-asset license checks. All recorded in MASTER_PLAN section E.8.
0. Unreal: E1 shell import works (needs ue-variant.mjs). Continue at E2 per UNREAL.md: import sofa/drum/armchair GLBs, master material, level with Lumen/VSM/sun SUN_DIR, screenshots from UnrealEditor (needs a GPU launch, not -nullrhi) (GLB import script, Lumen scene, local Pixel Streaming, bridge, measurements, decision). Keep it time-boxed; Three.js work must not wait on it.
1. **Ask the owner for the reference images** (none reached the session) and put them in `docs/design-studio/references/`; judge the art against them.
2. Finish M4 art: rug (woven, UVs in metres), floor lamp + pendant, plants (calathea/pachira exist in the base blend but are ~75k verts: decimate first), decor (books, vase, throw), a curated contemporary armchair (replace the Poly Haven one or rework), stitching/seams, throw cushions; stronger contact grounding (per-item baked AO decals); calibrate sun intensity against the bake; decide the daylight strategy (single baked sun vs extra bakes); final-quality shell bake (`node scripts/twin/build-walk.mjs yarkon yarkon-twin-shell --shell-only`, about 20 min); then re-review against the QUALITY_GATES checklist.
3. Remove `sofa-03` and the other Poly Haven test items from the published catalog once curated replacements exist.
4. (done in M5-M7; next is M8 parametric systems) M5 (Design mode UX: click-to-select with three-mesh-bvh, contextual panel, catalog drawer, modular configurator UI, surface picker, validation hints, he/en strings in `lib/i18n/messages.ts`).
