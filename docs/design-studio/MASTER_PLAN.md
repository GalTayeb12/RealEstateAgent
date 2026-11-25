# HAVENIQ Design Studio — Architecture & Implementation Plan

## Context
HAVENIQ already ships a first-person apartment walkthrough (`/walk/[slug]`), built from Blender-baked GLBs and a semantic "plan twin" (`lib/twin/schema.ts`). The goal is to grow that into **HAVENIQ Design Studio**: one shared scene with three modes (Walkthrough, Design Studio, Floor Planner), a licensed catalog of real furniture and PBR materials, spatial validation, saved user designs and an AI designer. Existing pages, `/walk/*` assets and business logic stay as they are.

Decisions already confirmed by you:
- Work happens in a **git worktree on `feature/design-studio`, branched from Work-Gal HEAD (8a6c21d)**. The uncommitted theme work in this checkout is not touched.
- Catalog assets are hosted on **Cloudflare R2**, through a new driver in `lib/storage.ts`. **Local storage comes first**: the R2 driver is built but stays inactive until you supply credentials, so no Cloudflare account is needed to start.

**Revision 2 (your feedback):**
- Premium visual quality is a primary acceptance requirement.
- An early **living-room vertical slice** (M4) proves the lighting and quality.
- Surface materials and one **real modular sofa family** move into the initial product.
- Explicit art direction, and catalog version pinning.
- A UX built on progressive disclosure.
- An isolated dev DB and isolated worktree dependencies.
- Autonomous milestone execution with a commit after each verified milestone.

*Note:* no reference images reached this session. Put them in `docs/design-studio/references/` and they become the visual benchmark for M4. Until then the benchmark is the written art direction in §7b.

---

## 1. Current architecture (audit summary)
| Area | Today |
|---|---|
| Framework | Next 16.2 (App Router, `proxy.ts` instead of middleware), React 19.2, TS, Tailwind 4. Read `node_modules/next/dist/docs/` before writing routes. |
| 3D | three 0.186, @react-three/fiber 9, drei 10, postprocessing 3 + @react-three/postprocessing. No zustand. |
| DB | Postgres (Neon) through Prisma 7 + `PrismaPg`. Client is generated to `app/generated/prisma`. 13 migrations. Relevant models: `UnitType`, `ApartmentModel`, `PlanTwinRecord`, `TourEvent`. |
| Auth | JWT in the httpOnly `hq_session` cookie. `proxy.ts` copies it into a Bearer header and checks Origin (CSRF). Roles: buyer, developer, seller, admin. Helpers: `extractToken` in `lib/auth.ts`, `requireAdmin` in `lib/adminAuth.ts`. |
| Storage | `lib/storage.ts` defines a driver interface with only a `local` driver (`.storage/`). |
| i18n | Hebrew is the default; `dirFor()` sets RTL. Strings live in `lib/i18n/messages.ts`. |
| Design system | `components/quiet/quiet.css` (`--qp-*`), `components/theme/cinematic*.css`, `lib/theme.ts`. |
| Feature flags | None. |
| Tests | Vitest (21 tests in `lib/__tests__`, including the twin golden test). Playwright e2e on port 3001 with the `msedge` channel. |
| AI | `@anthropic-ai/sdk` is already a dependency. |

## 2. Walkthrough & asset audit
- **Viewer:** `components/walk/ApartmentWalk.tsx` (693 lines).
  - Loads `apartment.glb` with meshopt and applies lightmaps (`lm-A`, `lm-B` on TEXCOORD_1) through the `bakedOnly()` shader patch.
  - Per-room probe environment maps; no realtime lights or shadows.
  - Desktop: EffectComposer with Bloom, AgX and Vignette. `PerformanceMonitor` adjusts pixel ratio.
  - Custom `Walker` controls; circle-vs-box collision against `walk.json.boxes`.
  - Config comes from `ProjectExperience` (`lib/experience/types.ts`). A few Yarkon fallbacks remain.
- **Dollhouse:** `ApartmentOverview.tsx`. **2D wall editor:** `components/dev/plan/*` plus pure twin edits in `edits.ts` (`moveWall`, `splitWall`, `moveOpening`…).
- **Twin → walk pipeline:** `scripts/twin/build-walk.mjs` runs headless Blender 5.3: `twin_furnish.py` (rule-based Poly Haven furniture) → `apartment_bake.py` → `build-walk-assets.mjs` (gltf-transform with `prune({keepAttributes:true})`, WebP, meshopt). Final bake ≈ 20 min on the RTX 4070; preview bake ≈ 2.5 min.
- **Representative scene, `public/walk/yarkon-v2`:**
  - 24.9 MB GLB, 313 nodes/meshes, 41 materials, ~1.52M triangles, ~80% of the file is geometry.
  - 7 non-instanced potted plants at ~75k vertices each.
  - Furniture comes out as separate nodes named `B|room|part`, but the transforms are realized into world space: pivots sit at the origin and the asset identity is lost.
  - Built-ins (beds, wardrobes, kitchen, sofa) are procedural boxes inside lightmap group A.
  - **Furniture shadows and bounce light are baked into the floor and walls.**

**Shortest reliable migration path:** the twin already describes walls, openings and rooms semantically. Rather than splitting an existing GLB into editable parts, generate an **empty-shell bake from the twin** (architecture and fixed fixtures only). Turn the `twin_furnish.py` placements into a **seed design document** that references catalog items. The pilot is `yarkon-twin`. Output goes to a new slug, `public/walk/yarkon-twin-shell/`, so no existing asset is overwritten.

## 3. Risks & limitations
1. **Baked lighting vs. movable furniture** (the main risk). Ghost shadows remain on the floor, and moved pieces carry their own lighting with them. Fix: empty-shell bake plus a realtime dynamic layer (section 8).
2. **Seam between baked and realtime lighting.** Furniture can look pasted on. Mitigations: per-room probe IBL captured from the empty shell, a matched sun, contact AO decals and AO on desktop. Needs visual tuning in M3.
3. **Bake content needs checking.** Changing a wall or floor material only stays correct if the lightmap stores irradiance without albedo. Verify in M2; if albedo is baked in, switch the bake pass.
4. **Twin ID stability across re-parses.** Baseline IDs must not drift. Hash-based IDs plus a re-parse test.
5. **Not much CC0 *modern* furniture exists.** Poly Haven's furniture set is small. Expect original HAVENIQ assets (Blender procedural/parametric) to make up a large share, plus CC-BY items with attribution. Meshy is used only with your approval.
6. **GLB weight and mobile memory.** Today's GLB is 25 MB. Budgets and KTX2 texture compression are required.
7. **Dev-environment friction.** Next 16 API changes; the worktree has no hot reload (restart the server after every edit) and no `node_modules` or Prisma client until a junction and a copy are added.
8. **Premium asset supply is the real quality bottleneck.** The upholstery stitching and sculptural forms you are aiming for come from asset craft, not from renderer settings. The plan relies on carefully modeled original Blender assets (subdivision, cloth-simulated cushions, piping curves, high-res tileable textures) plus selected CC0 and CC-BY hero pieces. If the bar cannot be met for a category without paid assets, I will stop and ask; I will never buy anything without approval.
9. **Isolation.** The `node_modules` junction described in memory would let `npm install` in the worktree change the original checkout. Avoided by giving the worktree its own `npm ci` (§17).
10. **Architecture-edit honesty.** A partition proposal invalidates the shell lightmap locally, so proposals render with realtime lighting and an "unverified proposal" badge.

## 4. Recommended architecture
```
PlanTwin (immutable, approved) ──► Baseline (shell GLB + walk.json + baseline entity map, versioned)
                                         │
DesignDocument (per user, versioned) = baseline ref + nodes{} + overrides{} + proposals{}
                                         │   ▲
               Command engine (pure TS: apply → {doc, inverse}; validate → errors | advisories)
                                         │   ▲  (UI gestures, AI proposals, migrations all emit Commands)
                        zustand store (one source of truth, transient drag state outside React)
                 ┌───────────────┬─────────────────┬────────────────────┐
           Walkthrough       Design Studio      Floor Planner       (Path-traced still, later)
         (Walker, lightmapped shell + realtime item layer; same Canvas, camera rigs switch)
```
- **Engine-independent core:** `lib/studio/**` imports nothing from three or React, so it is testable in Vitest and usable server-side by the AI validation step.
- **A flat node map with `parentId`** (an idea taken from Pascal Editor, MIT): `nodes: Record<NodeId, Node>`.
- **Baseline is read-only.** User changes to baseline entities are stored as `overrides[baselineId]`, for example a surface material or "hidden". Restoring the original drops the overrides and nodes.
- **Units and axes:** metres. Plan coordinates follow the twin (x east, y north, z elevation), with rotation in radians about the vertical. The viewer maps `(x, y, z) → (x, z, −y)`, as today.
- **Persistent IDs:**
  - Baseline: `wall:<twinWallId>`, `room:<id>`, `opening:<id>`, `surface:<wall>:<side>` / `surface:floor:<room>`.
  - User nodes: ULIDs.
- **Node kinds:** `item` (catalog ref, variant, slot materials), `assembly` (modular children), `cabinetRun`, `countertop`, `light`, `decor`, `partitionProposal`, `openingProposal`.
  - Baseline-only kinds: `structural` (columns, beams, envelope; protected) and `fixture`.
- **Commands:** `add`, `remove`, `duplicate`, `move`, `rotate`, `setVariant`, `setSlotMaterial`, `setSurfaceMaterial`, `configureAssembly`, `setParams`, `proposePartition`, `proposeOpening`, `restoreBaseline`, and `batch` (one undo step).
- **Undo/redo:** an in-memory command stack of `{cmd, inverse}` entries. AI proposals apply as a single `batch`.
- **Serialization:** zod schemas with `schemaVersion` and a `migrations[]` chain, run on load.

## 5. Dependencies
**Install (all MIT unless noted):** `zustand`, `immer` (patches give inverses for undo and for AI diffs), `three-mesh-bvh` (selection, surface snapping, spatial queries), `aws4fetch` (a tiny S3-compatible signer for R2), dev `gltf-validator` (Apache-2.0, Khronos).
**Later (M12):** `three-gpu-pathtracer` (MIT) for still renders.
**External CLI (not npm):** KTX-Software `toktx`, from the official KhronosGroup GitHub release binaries, for KTX2/Basis textures. WebP remains the fallback.
**Reuse:** three, r3f, drei (`useGLTF`, `Detailed`, `Html`, `ContactShadows`), @react-three/postprocessing (N8AO, Bloom), @gltf-transform/*, meshoptimizer, sharp, zod, @anthropic-ai/sdk, Prisma, Vitest, Playwright, headless Blender 5.3.
**Avoid:**
- **rapier.js:** geometric constraints are enough, so physics would be overkill.
- **Embedding Pascal Editor:** it uses the WebGPU renderer (which conflicts with our WebGL lightmap and postprocessing stack), a Bun/Turborepo monorepo and its own store. Borrow ideas only, and keep the MIT notice if code is ported (e.g. wall mitering).
- **zundo:** our own command stack is needed anyway for AI batches.
- **Draco** (meshopt is already used), cannon, valtio, jotai, and **WebGPURenderer** for now.

## 6. Skills & tools
- **Reuse what is installed:**
  - `threejs-*` (fundamentals, loaders, materials, lighting, postprocessing, performance, interaction, r3f, asset-pipeline, textures, geometry, shaders)
  - `prisma-*`, `impeccable`, `frontend-design`, `web-design-guidelines`
  - Blender MCP for live inspection; `/simplify` and `/code-review` at milestone ends
  - Playwright with `msedge` (see memory notes)
- **Install no new third-party skills.** The gaps (Blender automation, PBR, asset ingestion) are covered by the threejs skills, the existing Blender scripts and the docs below.
- **Add one project skill:** `.claude/skills/haveniq-studio/SKILL.md`, holding the repo map, pipeline commands and gotchas, so future sessions skip rediscovery.
- **Paid tools** (Meshy credits, Blender MCP `generate_3d`) are opt-in only and need your per-batch approval.

## 7. Asset sources & licensing
| Source | Use | Rule |
|---|---|---|
| Poly Haven (CC0) | Models, HDRIs, textures | Allowed. The live API needs a unique User-Agent and "Powered by Poly Haven" credit in the UI. Prefer downloading once into our pipeline over runtime API calls. |
| ambientCG (CC0) | Most PBR materials | Allowed; credit optional. |
| Original HAVENIQ (Blender procedural/parametric) | Sofas, cabinets, wardrobes, shelving, beds, tables | Preferred for the core catalog. |
| Sketchfab | Selected hero pieces | Only CC0 or CC-BY, through the official Download API, with attribution stored in the manifest. Never NC/ND or store licenses. Manual review per model. |
| BlendKit | Excluded by default | Its Royalty-Free license forbids easily extractable redistribution, and a browser GLB is extractable. CC0 BlendKit items only after review. |
| Meshy | Optional | Paid credits require your approval. Output ownership depends on the plan tier and is verified before any use. |
Every asset gets a `license` block (`spdx`, `sourceUrl`, `author`, `attributionText`, `retrievedAt`, `termsSnapshotHash`) and a row in `ASSET_LICENSES.md`. Publishing is blocked without one. No scraping.

## 7b. Catalog art direction & data-driven catalog
**`docs/design-studio/ART_DIRECTION.md`** (a 7th doc) defines each style with a palette, materials, form language, reference pieces and forbidden traits:
- **Modern Minimalist:** low and linear forms, matte lacquer, hidden hardware.
- **Japandi:** light oak and ash, linen, paper lamps, low profiles.
- **Organic Modern:** curved and sculptural sofas, bouclé, travertine, plaster.
- **Contemporary:** mixed metal and stone, tailored upholstery.
- **Quiet Luxury:** walnut, marble, wool, brushed brass, deep upholstery.
- **Scandinavian:** birch and white oak, wool, soft pastels.
- **Modern Industrial:** blackened steel, concrete, microcement, leather.

**Hero catalog priorities:** sculptural and modular sofas, travertine and marble tables, upholstered dining and lounge chairs, modern upholstered beds, designer pendants and floor lamps, fluted wood panels, microcement, natural stone, premium cabinet fronts, curated accessories (ceramics, books, throws, plants).

**Forbidden in the catalog:** box or primitive furniture, dated or cartoon styling, visible faceting on curved forms, stretched textures, missing bevels, flat single-color upholstery without weave or normal detail.

**The catalog is data-driven.** Each asset or material is a manifest (zod `CatalogManifest`) holding:
- dimensions and `sizing` mode (fixed, variants, modular, parametric);
- material slots with their allowed material categories;
- placement rules (floor, wall, surface, ceiling; clearances; stackable);
- editing capabilities;
- styles, rooms and tags;
- preview, decal and LOD keys;
- version, source and license.

New assets need **no code change**: the ingest scripts plus the admin publish step add them.

**Version pinning:**
- Published asset versions are immutable and stored under content-hashed keys.
- Designs reference `{catalogId, version}` (and `{materialId, version}`).
- A catalog update never mutates existing designs. The studio offers an optional "update to latest" per item.
- Retired versions stay downloadable for pinned designs.

## 8. Rendering quality strategy
- **Static shell:** a Cycles bake of the *empty* apartment (sun, sky and fixed fixtures), storing irradiance in the lightmap. The current `bakedOnly()` patch is kept.
- **Dynamic layer (furniture, decor, user lights):**
  - Realtime PBR with IBL from per-room probes captured from the empty shell.
  - One shadow-casting sun `DirectionalLight` matched to the bake's sun. Its shadow term is multiplied into the shell's lightmapped floor and walls with a small shader patch.
  - Per-item **contact AO decal**, rendered at ingest, which moves with the item.
  - N8AO on desktop only.
  - User lamps use emissive materials plus at most 4 shadowless realtime point/spot lights.
- **Color:** sRGB output, AgX tone mapping (as today), exposure per baseline, and correct `colorSpace` on every texture (albedo sRGB; ORM and normal linear).
- **Quality tiers** (automatic through `PerformanceMonitor`, plus a manual toggle):
  - Low (mobile): DPR 1, no post-processing, decals only, 1K textures.
  - Medium: DPR ≤1.5, sun shadows at 1024.
  - High: shadows at 2048, N8AO, SMAA/MSAA, bloom.
- **Final quality (later):** (a) a progressive **path-traced still** in the browser with `three-gpu-pathtracer` on desktop; (b) an optional **server re-bake of a saved design** through the existing `buildJobs` and Blender pipeline, for a photoreal walkthrough. That one is asynchronous and labelled as such.
- **Never** bake movable furniture into static surfaces, and never ship box primitives as final furniture.
- **Adaptive quality, not blanket downgrades.** The tier starts from a GPU/fps probe and only steps down on measured frame drops. Capable machines stay on High (or an Ultra tier with higher shadow resolution and SSR or reflection probes).
- **Rendering evaluation matrix** (fixed cameras in M3–M4, judged by actually looking at the screenshots and recorded in `QUALITY_GATES.md`):
  - dynamic sun shadows;
  - contact shadows and AO decals;
  - N8AO;
  - realtime reflections: probe env maps vs. box-projected room probes;
  - room-specific IBL;
  - glass and reflective surfaces (windows, mirrors, polished stone, brushed metal);
  - material swaps under morning, noon and evening daylight plus artificial light.

  Each technique is kept only if it visibly improves the image within budget.
- **Shell and dynamic consistency check:** the same physical material (e.g. oak) placed as a shell floor and as a dynamic table top must match in tone and exposure within a tolerance, checked by sampling luminance in screenshots.

## 9. Semantic scene migration
1. `lib/studio/baseline/fromTwin.ts` maps a twin to baseline entities: walls get two surfaces each, rooms get a floor and ceiling surface, openings come through, and exterior walls and columns are marked `protected`.
2. `build-walk.mjs --shell-only` skips furnishing, keeps the existing fixtures (sanitary ware, built-in kitchen only if marked fixed), names meshes `S|<surfaceId>` so a surface can take a new material, and writes to `<slug>-shell`.
3. `twin_furnish.py` writes `seed-design.json` (catalog id, position, rotation, variant) instead of baking furniture.
4. A baseline record is stored with a `twinHash`; designs refer to `{baselineId, version}`. When a baseline is re-published, a migration remaps IDs or flags orphaned nodes.
5. `/walk/yarkon` and every existing slug are left untouched.

## 10. Roadmap (small milestones; each ends green on tests, with a PROGRESS.md entry and a focused commit)
| # | Milestone | Model/effort | Done when |
|---|---|---|---|
| M0 | Isolated worktree setup (§17), `docs/design-studio/*` (7 docs), `lib/studio/flags.ts` (env `STUDIO_ENABLED` plus a role allowlist), perf benchmark script (Playwright msedge: fps, draw calls, triangles, GPU memory) run on `/walk/yarkon` and `yarkon-twin` | Sonnet med | Baseline numbers in PROGRESS.md, labelled "desktop measured" or "mobile emulated" |
| M1 | Core: zod schema, IDs, `fromTwin` baseline, commands with inverses, 2D validation (containment, overlap, wall and door-swing keep-out), migrations, `CatalogManifest` schema with **version pinning** and the **modular `sizing` model** (modules, connectors, valid configurations) | **Opus** design, Sonnet implementation | ≥40 Vitest cases, including a sofa configuration solver test (2.4 / 3.2 / 4.0 m built from real module widths); twin golden test still passes |
| M2 | Empty-shell bake plus seed design. **Irradiance proof:** bake the shell twice with different floor and wall albedo; the lightmaps must match within a tolerance (it stores irradiance, not surface color). Shell meshes named `S|<surfaceId>` so surfaces can be swapped | Sonnet med (Opus if the bake pass must change) | Irradiance test recorded with numbers; `yarkon-twin-shell` loads with no ghost shadows |
| M3 | `/studio/[slug]` (flag-gated): shared Walker and lightmap code extracted from ApartmentWalk with `/walk` behavior unchanged; dynamic item layer; lighting stack and adaptive tiers; first pass of the rendering evaluation matrix | **Opus** for lighting | `/walk/yarkon` non-regression shot ≤0.5% diff (regression only, not a quality score); evaluation matrix filled in |
| **M4** | **Premium living-room vertical slice** in the pilot apartment, real and working, not a mockup.<br>Pipeline v1: Blender normalize, thumbnails, AO decals, KTX2, validator.<br>Content: a hero **modular sofa family** (corner, 2-seat, 3-seat, chaise and arm modules with a seam/stitch/cushion detail pass), a travertine or stone coffee table, two contemporary armchairs, a woven rug, a designer floor lamp and pendant, two real plants, premium oak parquet, and limewash plaster and fluted oak wall finishes. Realistic daylight.<br>Interactions at a minimal UI level: move, remove, replace, plus one wall material change and one floor material change. | **Opus** for art and lighting tuning, Sonnet for pipeline | Fixed-camera Playwright shots (4 cameras × morning/noon/evening × before/after move, remove, replace and material swap), **inspected visually** against ART_DIRECTION and any reference images:<br>• no ghost shadows; no floating or unshadowed items<br>• shell and dynamic tone within tolerance<br>• texture scale verified against a 1 m checker<br>• the modular sofa shows 3 legal configurations including 4.0 m, with no stretching<br>Results recorded in QUALITY_GATES.md |
| M5 | Design mode UX (§10b): direct click-to-select (BVH), contextual panel, floor-plane move and rotate (15° snaps), add/replace/remove/duplicate, catalog drawer (search, style filters, previews), **surface customization** (wall paint, wall coverings, flooring and parquet, countertop materials, cabinet finishes, upholstery), modular sofa configurator, measurements, validation hints, undo/redo, always-visible **Restore original**, he/en + RTL | Sonnet med | e2e: click sofa → change upholstery → reconfigure to 4.0 m → move into an invalid spot (hint shown) → undo ×3 → doc equals start; restore original returns the baseline |
| M6 | Persistence on the **isolated dev DB**: Prisma migration, API routes, silent autosave (2 s debounce plus a revision check), IndexedDB draft, restore original. Named versions, duplicate and share links exist but sit behind a secondary menu. R2 driver built but inactive | Sonnet med | Reload restores the design; a concurrent edit gets 409; a view-only share cannot write; no migration ever touches the production DB (guard test) |
| M7 | Floor Planner: orthographic and isometric camera rigs on the same Canvas, SVG overlay reusing `canvasGeom.ts` patterns, dimensions, areas, door swings, clearance hints | Sonnet med | Same doc state across all 3 modes (e2e); dimensions within ±1 cm |
| M8 | Advanced modular and parametric systems: kitchen cabinet runs and countertops, wardrobes, shelving, bed sizes, more sofa families. Parametric output must pass the **same visual gates as modeled assets** (bevels, door gaps, hardware, world-scale UVs) | **Opus** for generators | A cabinet run regenerates with world-scale UVs; side-by-side shots with modeled assets pass visual review |
| M9 | Architecture: partition and opening proposals, structural protection, "unverified" labelling, kitchen layout proposals | Sonnet med | Protected elements reject edits; proposals are never written into the baseline |
| M10 | AI designer: `/api/studio/ai` using Claude tool-use whose tool input is the Command schema; retrieval over the catalog by style and size; server-side validation; ghost preview, accept/reject, one-step undo; rate-limited | **Opus** design | The 5 sample prompts give valid command batches; 0 invalid asset references reach the client |
| M11 | Admin catalog (`/admin/catalog`): import, review, publish, retire; growth to 30–50 models and 50–100 materials | Sonnet med | Gates enforced; the published catalog JSON is versioned |
| M12 | Path-traced still render plus an optional queued re-bake of a saved design | Sonnet med | Still render finishes in under 60 s on the RTX 4070 laptop |
| M13 | Hardening: performance budgets, axe a11y, visual regression set, mobile pass | Sonnet med | All acceptance budgets met |

## 10b. User experience principles
- **Click the thing to edit the thing.** Clicking an object in the apartment selects it. A compact contextual card opens next to it with only the options that object supports (material slots as swatches, size or configuration, replace, duplicate, remove), and more appears on demand.
- **One quiet mode switch** (Walk · Design · Plan), always in the same place. Every mode shows the same document.
- **The catalog is a drawer, not a dashboard.** It opens from "Add". Large previews, style chips, and room-aware suggestions first. No tree views, outliners or property grids in the consumer UI.
- **Saving is invisible:** autosave plus a subtle "Saved" state. **Restore original** is always reachable and confirmed with a preview. Versions and sharing live in a secondary menu.
- **Validation as hints.** Hard conflicts show a red outline and the move snaps back. Advisories (passage width, clearances) show as a dismissible hint, never a modal.
- Built on HAVENIQ tokens (`--qp-*` / `.cin`), with RTL mirroring, keyboard support (Del, Ctrl+Z, R to rotate), touch support, and checks with the `impeccable` and `web-design-guidelines` skills.

## 11. File & module structure
```
lib/studio/
  flags.ts
  schema/{document,nodes,catalog,commands}.ts
  migrations.ts
  baseline/fromTwin.ts
  commands/{apply,inverse,batch}.ts
  validation/{geom2d,placement,clearance,rules}.ts
  catalog/{types,query}.ts
  ai/{tools,context,validate}.ts
lib/storage.ts                  (+ r2 driver)
components/walk/shared/{Walker,lightmapMaterial,probes}.ts(x)   (extracted, /walk keeps working)
components/studio/
  StudioApp.tsx
  store.ts
  studio.css                    (uses --qp-* / .cin tokens)
  scene/{StudioCanvas,ShellLayer,ItemLayer,ItemRenderer,Lighting,QualityTier,Selection,Gizmo,CameraRigs}.tsx
  panels/{Catalog,Properties,MaterialPicker,Validation,Versions,AiAssistant,ModeSwitch}.tsx
  plan/{PlanOverlay,Dimensions}.tsx
app/studio/[slug]/{page,StudioClient}.tsx
app/api/studio/{designs/route.ts, designs/[id]/{route,versions,share}/…, ai/route.ts, catalog/route.ts}
app/admin/catalog/…
app/api/studio/assets/[...key]/route.ts   (local-driver asset serving)
scripts/studio/ingest/{discover,import,validate,publish}.mjs
scripts/studio/{assert-dev-db,bench,shots}.mjs
docs/design-studio/{ARCHITECTURE,MASTER_PLAN,PROGRESS,ASSET_PIPELINE,ASSET_LICENSES,QUALITY_GATES,ART_DIRECTION}.md + references/
scripts/blender/{studio_normalize,studio_thumbnail,studio_parametric}.py
catalog/manifests/<id>.json     (in git; binaries in assets-src/ and R2)
prisma/migrations/<ts>_design_studio
lib/__tests__/studio-*.test.ts
e2e/studio.spec.ts
.claude/skills/haveniq-studio/SKILL.md
```

## 12. Database & storage
New Prisma models; existing models are unchanged.
- `StudioBaseline { id, slug, unitTypeId?, version, twinHash, shellKey, walkJsonKey, entityMap Json, publishedAt }` (immutable per version)
- `DesignDocument { id, ownerId→User, baselineId, name, schemaVersion, data Json, revision Int, thumbnailKey?, updatedAt }`
- `DesignVersion { id, designId, label, data Json, createdAt }`
- `DesignShare { id, designId, token (random, hashed), permission view|edit, expiresAt? }`
- `CatalogEntry { id, type model|material, slug, version, status draft|review|published|retired, manifest Json, license Json, createdAt }`

**Version pinning in the schema:**
- `CatalogEntry` is unique on `(slug, version)`, and published rows are immutable.
- Item nodes in `DesignDocument.data` store `{catalogId, version}`.

**Storage:**
- Phase 1 uses the **local driver** (`.storage/`, served through `/api/studio/assets/[...key]` with immutable cache headers).
- The R2 driver is added behind `STORAGE_DRIVER=r2` and activated later, once you provide credentials.
- R2 public bucket: content-hashed GLB, KTX2 and thumbnail files with immutable cache headers.
- R2 private bucket (or local `assets-src/`): source files.
- The published catalog is a versioned JSON snapshot cached at the edge, so the DB is not hit per request.

## 13. Testing & acceptance criteria
- **Unit (Vitest):** command apply/inverse round-trips, validation rules, migrations, `fromTwin` ID stability, AI output validation, R2 signer.
- **e2e (Playwright msedge):** mode switching keeps state; add → move → undo; autosave → reload; share permissions; RTL layout.
- **Visual regression:** fixed-camera shots with a ≤0.5% pixel-diff, used **only to protect unchanged pages** (`/walk/yarkon`, home and others). A low diff is never treated as proof of quality.
- **Visual quality review:** at M4, M5, M8 and M12 the fixed-camera set is inspected visually against ART_DIRECTION and the references, using a checklist:
  - grounding and contact shadows;
  - shell and dynamic tone match;
  - texture scale;
  - silhouette smoothness;
  - upholstery detail;
  - exposure and white balance;
  - composition.

  Pass or fail is recorded per item in QUALITY_GATES.md.
- **Performance budgets** (refined after M0). Each number is labelled *measured (device)* or *estimated (browser emulation)*. Mobile targets count as met only once measured on a physical phone, which needs you to run it or attach a device.
  - Desktop (RTX-class laptop, 1080p, High): ≥60 fps.
  - Mid mobile (e.g. Pixel 7 / iPhone 13, Low): ≥30 fps.
  - Furnished scene: ≤1.2M triangles desktop / ≤500k mobile; ≤350 / ≤200 draw calls.
  - First interactive load: ≤8 MB on mobile.
  - Item GLB: ≤1.5 MB hero, ≤400 KB decor.
- **Asset quality gates:** real-world dimensions within ±1 cm of the spec; origin at floor/back-center; +Z forward; named material slots; UV density within range; triangle budget; glTF validator shows 0 errors; thumbnail approved; license present; style tags present.

## 14. Token-efficient, autonomous execution
- **After approval, I work through the milestones in order without stopping for per-step approval.** At the end of each verified milestone: tests green, a PROGRESS.md entry, and a focused commit on `feature/design-studio`. Commits use the repo's existing author identity through `-c user.name/-c user.email`. No push and no PR unless you ask.
- **I stop and ask only for:**
  - paid services or credits (Meshy, Blender `generate_3d`, purchased assets);
  - external credentials (R2, a Neon dev branch);
  - anything touching production;
  - destructive operations;
  - a decision that is truly essential.
- Each session starts from `PROGRESS.md` and the `haveniq-studio` skill, with no re-audit. If usage limits interrupt, PROGRESS.md always ends with **"Next steps"** (exact file, command and acceptance check), and the tree is left clean, either committed or with WIP clearly listed.
- Sonnet at medium effort by default. Opus at high effort only for the M1 schema, M3 and M4 lighting and art, the M8 generators and M10 AI validation.
- No parallel agents unless you ask. Tests before screenshots; Playwright headless Edge screenshots at milestone gates. Short output: `--reporter=dot` and filtered logs.

## 17. Safety & isolation
- **Worktree:** `git worktree add .claude/worktrees/design-studio -b feature/design-studio Work-Gal`. Nothing in the original checkout is modified, staged or stashed.
- **Own dependencies:** run `npm ci` inside the worktree to get its own `node_modules`; there is **no junction** to the main `node_modules`. `prisma generate` writes to the worktree's own `app/generated/prisma`. New packages are installed only in the worktree's `package.json` and lockfile.
- **Isolated database:**
  - The worktree's `.env.local` (gitignored, never copied into git) points `DATABASE_URL` at a **dev database**: a local Postgres if one is installed, otherwise I ask you for a Neon dev branch URL before M6. M0–M5 need no database writes.
  - A guard script (`scripts/studio/assert-dev-db.mjs`) refuses `prisma migrate` or seeding when the URL matches the production host from the main checkout's env.
  - Integration tests run against a separate `studio_test` schema.
- **Secrets and source assets:** `.env*`, `assets-src/` (Blender sources, raw downloads) and the R2 keys stay out of git and out of public storage. Raw downloads go into their own directory and are processed by scripts kept in `scripts/`, per the untrusted-file rules.
- **No deploy, no purchases, no paid API calls, and no production DB access** without your explicit approval.

## 15. Complexity & costs
- **Engineering:** M0–M7 is the core product, roughly 12–18 focused sessions. M8–M13 is roughly another 15–20. The hard parts are M3 (lighting seam), M8 (parametric) and M10 (AI).
- **Infrastructure:**
  - R2: ~$0–5/month at the start ($0.015/GB-month, no egress fees).
  - Neon and hosting: existing.
  - AI: about $0.03–0.10 per design request (Sonnet-class, about 15k input / 2k output tokens), rate-limited.
  - Blender bakes run locally on the GPU for free; a cloud GPU is needed only if re-bakes are offered to users at scale.
  - Meshy and paid assets: $0 unless you approve them.

## 16. Initial functionality vs. production target
| | Initial (M0–M7) | Production target |
|---|---|---|
| Apartments | 1 pilot (`yarkon-twin-shell`) | Every approved twin, generated automatically |
| Catalog | Premium living-room set (M4), growing to 30–50 models and 50–100 materials, all passing the visual gates | 750+ models, 500+ materials, admin-curated, data-driven, version-pinned |
| Resizing | Fixed sizes, size variants and **one real modular sofa family** (incl. 4.0 m) | Plus kitchen, wardrobe, shelving and bed parametric systems and more modular families |
| Surfaces | Wall paint and coverings, flooring and parquet, countertops, cabinet fronts, upholstery | Full material library (500+), tiles with grout patterns |
| Architecture | Protected baseline | Partition and opening proposals (unverified), kitchen layouts |
| Rendering | Realtime tiers | Plus path-traced stills and server re-bake of saved designs |
| AI | — | Validated command-batch designer |
| Sharing | Owner only, plus view links | View and edit permissions, versions, duplication |

## Verification for each milestone
`npm test`; `npx playwright test e2e/studio.spec.ts` (restart the dev server in the worktree first, with `JWT_SECRET` set and `node_modules` junctioned); benchmark script output compared with M0; `/walk/yarkon` non-regression screenshot; append to PROGRESS.md.

---
### החלטות מרכזיות ופשרות (בעברית)
- **גיבוי ראשון: shell ריק אפוי + שכבת רהיטים בזמן אמת.** האפייה הנוכחית צורבת את צללי הרהיטים לרצפה ולקירות, ולכן הזזת רהיט משאירה "צל רפאים". לכן אופים את הדירה ריקה ומאירים את הרהיטים בזמן אמת: probe לכל חדר, שמש עם צל ודקאל AO שזז יחד עם הפריט. הפשרה: צריך כיול כדי שהרהיט לא ייראה "מודבק". זה הסיכון הגדול ביותר, ולכן M3 רץ על Opus.
- **המיגרציה מבוססת על ה-plan twin ולא על פירוק ה-GLB הקיים.** ה-twin כבר סמנטי (קירות, פתחים, חדרים). פירוק GLB שבו הטרנספורמים "נצרבו" לעולם (pivot בראשית) היה איטי ושביר.
- **לא מטמיעים את Pascal Editor.** הוא בנוי על WebGPU ועל monorepo נפרד, ומתנגש עם צנרת ה-lightmap וה-postprocessing שלנו. לוקחים ממנו רעיונות: מפת nodes שטוחה עם parentId ו-systems לפי dirty nodes.
- **בלי מנוע פיזיקה.** אילוצים גיאומטריים (OBB ב-2D, טווחי גובה ופוליגוני חדרים) מספיקים וזולים יותר.
- **ספה של 4 מטר היא קונפיגורציה מודולרית אמיתית** (מודולים עם נקודות חיבור) או וריאנט מידה, ולא מתיחה של ספה קיימת. אותו עיקרון חל על מטבחים, ארונות ומדפים, דרך מחוללים פרמטריים עם UV בקנה מידה עולמי.
- **ה-AI מחזיר רק Commands מאומתים**, אותם Commands שהממשק עצמו שולח. כך יש תצוגה מקדימה, אישור או דחייה, וביטול בצעד אחד. עריכה רגילה לא קוראת ל-AI בכלל.
- **רישוי:** CC0 (Poly Haven, ambientCG) ונכסים מקוריים קודמים לכל השאר. BlendKit Royalty-Free מוחרג, כי GLB בדפדפן ניתן לחילוץ. Meshy ו-generate_3d רק באישורך.
- **R2** נבחר בגלל שאין עלויות egress על נכסי תלת-ממד כבדים. העלות בהתחלה כמעט אפסית.
- **איכות ויזואלית היא קריטריון קבלה, לא ליטוש.** אבן הדרך M4 היא סלון פרימיום עובד בתוך הדירה עצמה, כבר בשלב מוקדם. ציון pixel-diff נמוך משמש רק כהגנה מפני רגרסיה; האיכות נבדקת בעין, מול צ'קליסט וכיוון אמנותי כתוב.
- **הוכחת irradiance:** אופים את ה-shell פעמיים עם צבעי רצפה וקיר שונים. אם ה-lightmaps זהים, אפשר להחליף חומרים בלי לאפות מחדש. אם לא, משנים את מעבר האפייה כבר ב-M2, לפני שבונים עליו.
- **ספה מודולרית כבר מ-M1/M4:** הסכמה ופותר התצורות נבדקים מוקדם, כך ש-M8 רק מרחיב מנגנון מוכח ולא מתכנן אותו מחדש.
- **נעילת גרסאות:** עיצוב שמור מצביע על גרסה מדויקת של כל נכס וחומר. עדכון בקטלוג לא שובר עיצובים קיימים.
- **בידוד:** ל-worktree יש `node_modules` ו-Prisma client משלו, ולא junction, כדי ש-npm install לא ישנה את התיקייה המקורית. ה-DB הוא DB פיתוח עם סקריפט שמונע migrate מול production.
- **הצוואר האמיתי הוא איכות הנכסים, לא המנוע.** אם קטגוריה מסוימת לא תעמוד ברף בלי נכסים בתשלום, אעצור ואשאל.
- **`/walk/*` הקיים לא משתנה.** קוד משותף מחולץ רק בכיסוי בדיקת צילום-מסך, והפלט החדש נכתב תמיד ל-slug חדש.
