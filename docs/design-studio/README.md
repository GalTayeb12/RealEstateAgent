# HAVENIQ Design Studio: full project README

Status as of 2026-11-26. Branch `feature/design-studio` (worktree `.claude/worktrees/design-studio`), based on `Work-Gal` HEAD `8a6c21d`.
This file is the single entry point: what the system is, everything built so far, what is missing, how to run it, and the history of the work.
To continue from another computer or user: **`SETUP.md`** (clone, env, what is not in git). Details live in the sibling docs: `PROGRESS.md` (per-milestone results and the exact next steps), `MASTER_PLAN.md` (the approved plan), `ARCHITECTURE.md`, `QUALITY_GATES.md`, `ART_DIRECTION.md`, `ASSET_PIPELINE.md`, `ASSET_LICENSES.md`, `UNREAL.md`.

---

> This branch also carries the separate light-mode / redesign work (see `SETUP.md` section 9).

## 1. What the system is

HAVENIQ already shipped a first-person apartment walkthrough (`/walk/[slug]`, Three.js, Blender-baked GLBs, a semantic "plan twin"). **Design Studio** (`/studio/[slug]`) grows that into one shared scene with three modes on one design document:

| Mode | What it does |
|---|---|
| **Walk** | First-person exploration of the baked empty apartment, with the user's furniture rendered live on top |
| **Design** | Click a piece or a surface to edit it: drag on the floor (5 cm grid), rotate in 15 degree steps, add / replace / duplicate / remove from a catalog, change materials, resize through real variants / modular configurations / parametric parameters, undo / redo, "Restore original" |
| **Plan** | Orthographic top and isometric views with room areas, edge dimensions in cm, door swings, wall clearances, and the same editing tools |

Core principles (all enforced in code and tests):
- **One source of truth**: `PlanTwin` -> immutable `Baseline` (ids `wall:`, `room:`, `opening:`, `surface:`) -> per-user `DesignDocument` (nodes + surface overrides). Every change is a **Command** applied by a pure engine (`apply -> {doc, inverse}`), so undo/redo, "reject AI proposal" and migrations are exact.
- **No arbitrary scaling, ever.** Transforms have no scale. Size changes come only from catalog variants, modular chains (e.g. a sofa built from real modules to 2.4 / 3.4 / 4.0 m) or parametric generators.
- **Validation in two tiers**: hard errors (outside the room, inside a wall, overlap, blocking a doorway, unknown asset) refuse the change with a reason; advisories (door swing, clearance, narrow passage) are hints.
- **Empty-shell bake + live item layer**: the apartment is baked empty (irradiance only, so wall and floor materials can be swapped); furniture is lit in realtime (sun shadow overlay, per-room probe IBL, contact decals, N8AO on desktop).
- **Catalog is data**: manifests (zod) with sizing mode, material slots, placement rules, license, pinned `{id, version}`. Adding an asset needs no application code. Designs pin exact versions.
- **Architecture changes are concepts**: proposals never touch the baseline, never touch protected structure, are always labelled "unverified".

Stack: Next 16 (App Router, `proxy.ts`), React 19 (+ React Compiler lint rules), react-three-fiber 9 / drei / postprocessing, three 0.186, zustand, zod, Prisma 7 + Postgres, vitest, Playwright (Edge, GPU), gltf-transform / meshoptimizer / sharp, headless Blender 5.3.

---

## 2. What was built (milestones)

| # | Milestone | Result |
|---|---|---|
| M0 | Isolated worktree, docs, feature flag, benchmark script | Done. Own `node_modules`, flag `STUDIO_ENABLED` + role allowlist, `scripts/studio/bench.mjs` |
| M1 | Core model | Done. Schemas, ids, `fromTwin` baseline, command engine with inverses, 2D validation, migrations, catalog manifests with version pinning, modular chain solver |
| M2 | Empty-shell bake | Done. `yarkon-twin-shell`, surfaces named `S|<surfaceId>`; irradiance proof recorded honestly (gate misses documented, not loosened) |
| M3 | `/studio/[slug]` | Done. Shared Walker, live item layer, lighting stack, adaptive quality tiers (Lite / Standard / High) |
| M4 | Premium living-room slice | Done (art still modest). Original modular sofa, travertine tables, armchair, rug, lamp, plants, textured CC0 materials |
| M5 | Design mode UX | Done. Select, drag, rotate, catalog drawer, properties panel, modular configurator, surface picker, validation hints, he/en + RTL, mobile bottom-sheet layout |
| M6 | Persistence | Done; Prisma path verified on a local dev Postgres (contract tests + API/persist e2e). File + Prisma repos, revision-checked autosave, IndexedDB draft, named versions, duplicate, share links (view/edit, hashed tokens), R2 driver (inactive) |
| M7 | Floor planner | Done. Top + true isometric views, dimensions to the cm, areas, door swings, clearances, wheel / pinch zoom, pan, cutaway |
| M8 | Parametric systems | Done. Generators: kitchen base run (doors, drawers, handles, countertop), wall units, wardrobe, open shelving, upholstered bed; publish gates (size within 1 cm, bevels, 3 mm gaps, handle per front) |
| M9 | Architecture proposals | Done. Partition + opening tools, protected structure, unverified labelling, kitchen layouts (single / galley / L / U) as one undoable batch |
| Item light | Calibration | Live items lit per room and direction from the bake; held-out walls 79-111 % of the wall's luminance (was 23-56 %); warm cast on bedroom side walls remains |
| M11 | Admin catalog + growth | Catalog 14 -> 25 models (11 original parametric pieces: tables, desk, bench, sideboard, TV unit, nightstand, chest, cabinet, wall shelf) and 11 -> 50 materials (original flat finishes). `/admin/catalog`: import drafts with files, shared publish gates, publish / retire, every change a numbered release (history kept), retired items hidden but still rendered in existing designs; the studio loads the latest release |
| M10 | AI designer | Done in dry-run (free). `/api/studio/ai`: plan of small actions compiled server-side into one validated batch; ghost preview, accept / reject / one-step undo, per-user rate limit, he/en. Live Claude path written but never called (needs owner approval) |
| Unreal E0-E2 | Evaluation | Partial. UE 5.8.4 verified, GLB import works via a cooked variant; first GPU render black (unresolved); paused by the owner, work returned to Three.js |

Tests at the last commit: **532 vitest tests**, eslint + tsc clean, e2e suites passing (`e2e-catalog` en/he, `e2e-ai` desktop/he/mobile, `e2e-design` desktop/mobile/he, `e2e-plan`, `e2e-generated`, `e2e-arch` en/he, `e2e-api`, `e2e-persist`).

Commits: M0..M9 on `feature/design-studio` (see `git log`); latest `8d02139` (M9).

---

## 3. What is missing (honest list)

**Planned milestones not started**
- **M10 live model**: the Claude provider exists (`lib/studio/ai/claude.ts`, `STUDIO_AI_PROVIDER=claude`) but has never been called; evaluating it costs money and needs the owner's approval. The dry-run planner is a test double that only understands the sample requests.
- **Catalog beyond 25 models**: chairs, soft seating, lamps, decor and textured materials need modelled or scanned assets; downloading CC0 / CC-BY assets needs the owner's approval.
- **M12 Path-traced still** (`three-gpu-pathtracer`) and optional queued re-bake of a saved design.
- **M13 Hardening**: performance budgets, LODs, KTX2, instancing, a11y (axe), visual regression set, rate limits on new routes, real-device mobile test, richer touch gestures.
- **Unreal E2-E6**: fix the black render, Pixel Streaming locally, bridge, measurements against pre-registered gates, decision record (Ultra tier optional; Three.js stays the default).

**Known gaps in what exists**
- Art quality: premium goal not fully met; the catalog is still modest (25 models, 50 materials; most new finishes are flat colours); headboards are flat panels; no sink / hob cut-outs; no corner kitchen units beyond placing runs at right angles; wardrobes are hinged only.
- **Item lighting vs the baked shell** is now calibrated per room and direction from the bake (`lib/studio/lighting.ts`, measured with `scripts/studio/light-tone.mjs`): held-out walls went from 23-56 % of the wall's luminance to 79-111 %. Still open: a warm cast on bedroom side walls, items read flatter than before, the corridor cannot be measured with the current method (PROGRESS "Item lighting calibration").
- Plan mode: isometric walls are open-topped; labels of neighbouring rooms duplicate on shared walls; pinch gestures untested on a real device.
- Proposals: straight partitions only, not draggable after placement, openings are fixed-height doorways, room areas do not update, concepts are rendered with realtime lighting (not baked).
- Persistence: `PrismaDesignRepo` and the migration `20261126000000_add_studio_designs` are verified on a local dev Postgres (PROGRESS "Live database"). The main app's `schema.prisma` has SellerProfile + 4 columns without a migration (pre-existing, not studio; owner decision). R2 stays inactive until credentials are supplied.
- Poly Haven test assets were removed from the catalog; remaining items are original or CC0 with license rows in `ASSET_LICENSES.md`.
- Epic license terms must be re-checked in a browser (pages returned 403 to automated fetching).
- Performance numbers are desktop measured (RTX 4070 Laptop); mobile numbers are emulated only.

---

## Unreal Engine 5 (optional "Ultra" tier): findings and status

**Question**: can UE5 (Lumen, Virtual Shadow Maps, Pixel Streaming) become an optional premium rendering path next to Three.js? Rule: Three.js stays the default for everyone; UE is never a replacement and holds no business logic.

**Why consider it**: the Three.js studio uses baked lighting for the shell, so furniture does not bounce light onto walls (measured error 37% median for an extreme material swap), contact shadows are weak, there is one daylight condition and no real reflections. Lumen would fix these at the root.

**Done (E0-E2 partial)**
- UE 5.8.4 is installed at `C:\Program Files\Epic Games\UE_5.8`; headless editor works (`UnrealEditor-Cmd -unattended -nullrhi`). Pixel Streaming 2, Interchange, Python scripting present. No Visual Studio needed so far.
- The shell GLB imports into UE only through a **cooked variant** (`scripts/studio/ue/ue-variant.mjs`): Interchange rejects `EXT_meshopt_compression` and WebP textures. Material names are sanitised (`S|surface:floor:living` -> `S_surface_floor_living`).
- Scripts (in git): `scripts/studio/ue/{import_glb.py, build_level.py, probe.py, DefaultEngine.ini.template, HaveniqUltra.uproject.template}`. Use `-ExecutePythonScript` (not `-run=pythonscript`) and, under Git Bash, `MSYS_NO_PATHCONV=1` with absolute paths.
- Pixel Streaming infrastructure: official `EpicGames/PixelStreamingInfrastructure` branch `UE5.8` cloned to `C:\HaveniqUE\PSInfra` (not npm-installed yet; review before installing).

**Blocked**: the first GPU capture of the level is **black** (twice). Hypotheses: premature capture (use Python or Movie Render Queue capture), sun lux vs manual exposure units, imported material / back-face culling after the Y flip, a stuck loading frame.

**Not started (E3-E6)**: Pixel Streaming local stream inside `/studio/[slug]/ultra`; TS bridge (`lib/studio/bridge/*`: scene patches, tested coordinate mapping plan metres -> UE centimetres, UE -> web `proposeCommand` only); measurements; decision record.

**Pre-registered pass gates (never loosened)**: owner judges UE clearly better on 4 fixed cameras (side-by-side); >= 45 fps at 1080p with Lumen HW RT + streaming on the RTX 4070 Laptop and VRAM <= 7.0 GB; command round trip p95 <= 150 ms locally; no validation logic in UE and a small bridge; measured per-session cost acceptable.

**Cost reality (estimates, not verified)**: developing and testing locally is free. Engine license for non-game commercial use is believed free below ~$1M annual revenue and seat-based above (Epic pages returned 403 to automation: **re-check in a browser**). The real cost is serving users: one GPU process per concurrent user, roughly $1-1.6 per user-hour in the cloud, plus TURN and orchestration. Three.js costs about $0 per user. Hence Ultra is opt-in only (sales office, qualified leads), never mandatory paid infrastructure.

**Status**: PAUSED by the owner; resume at `UNREAL.md` E2 only if the Ultra tier is still wanted. Quality without Unreal comes from assets, materials, light calibration, M12 path-traced stills and offline Blender (Cycles) renders. Everything UE-related lives outside git on the original machine except the scripts above (see `SETUP.md` section 4). Full detail: `UNREAL.md`, `MASTER_PLAN.md` section E.

---

## 4. How to run and test

Requirements: Node 24, the worktree's own `node_modules` (`npm ci --legacy-peer-deps`), Chrome/Edge for Playwright. There is **no hot reload from a worktree**: restart the dev server after edits.

```powershell
$env:JWT_SECRET="studio-bench-dummy"; $env:STUDIO_ENABLED="1"; npx next dev -p 3001
```

Open `/studio/yarkon-twin-shell`. The route needs a developer/admin session (httpOnly `hq_session` cookie); the e2e scripts mint one with the same secret. Add `?debug` to expose `window.__studio` for tests.

```powershell
npx vitest run                                   # 532 unit tests
npx tsc --noEmit -p . ; npx eslint components/studio lib/studio
node scripts/studio/e2e-design.mjs               # also --mobile, --lang=he
node scripts/studio/e2e-plan.mjs                 # floor planner
node scripts/studio/e2e-generated.mjs            # parametric items: rendered size == resolved size
node scripts/studio/e2e-arch.mjs                 # proposals + kitchen layouts
node scripts/studio/e2e-api.mjs ; node scripts/studio/e2e-persist.mjs
node scripts/studio/e2e-ai.mjs                   # AI designer, dry-run (also --lang=he, --mobile)
node scripts/studio/e2e-catalog.mjs              # admin catalog: import, gates, publish, retire (also --lang=he)
npx tsx scripts/studio/ingest/publish.mts        # validate manifests + publish catalog index (gates)
node scripts/studio/thumbs.mjs --only=<id>       # catalog thumbnails through the real studio
node scripts/studio/light-tone.mjs [--neutral]   # item vs baked-wall tone match per room (sets A + B)
node scripts/studio/item-light.mjs               # re-derive item lighting from the bake (after a re-bake;
                                                 #   then light-tone.mjs --fit-global and --fit-rooms)
```

Shell re-bake: `node scripts/twin/build-walk.mjs yarkon yarkon-twin-shell --shell-only` (about 20 min, headless Blender). Source assets live in `assets-src/` (gitignored). Unreal project: `C:\HaveniqUE\HaveniqUltra` (outside the repo; scripts in `scripts/studio/ue/`).

Safety rules followed: nothing deployed, nothing purchased, no paid API calls, no production DB access, secrets and source assets outside git.

---

## 5. Repository map (studio only)

```
lib/studio/            pure TS core (no three/React): schema/, baseline/, commands/, catalog/ (sizing, modular, generators/),
                       validation/ (geom2d, placement, architecture), design/ (snap, preview, spot, options, kitchen),
                       plan/ (view, measure), persist/ (repos, ops, kv), flags, i18n, migrations
components/studio/     StudioApp, store (zustand), scene/ (Canvas, ShellLayer, ItemLayer, DesignInteraction, ProposalLayer, ArchTool),
                       panels/ (Properties, CatalogDrawer, DesignMenu, ArchitecturePanels), plan/ (Overlay, Toolbar, gestures), persist/
app/studio/[slug]/, app/studio/shared/[token]/, app/api/studio/**
catalog/manifests/*.json  public/studio/catalog/**   public/walk/yarkon-twin-shell/**
scripts/studio/        bench, shots, thumbs, e2e-*, ingest/, ue/      scripts/blender/studio_*.py
prisma/schema.prisma + migration 20261126000000_add_studio_designs
lib/__tests__/studio-*.test.ts
```

---

## 6. History of the conversation (condensed)

1. **Master plan** (plan mode, Hebrew explanations): evolve the walkthrough into Design Studio; milestones M0-M13; isolated worktree and branch; Cloudflare R2 for assets.
2. **Plan revised** at the owner's request: premium visual quality as an acceptance criterion; early living-room vertical slice; surface materials and a real modular sofa early; art direction and catalog version pinning; progressive-disclosure UX; isolated dev DB; local storage first with R2 prepared; no paid services / purchases / deploys without approval; autonomous execution with a commit per verified milestone. Plan approved.
3. **Unreal feasibility addendum**: evaluate UE5 as an optional "Ultra" tier via Pixel Streaming (not a replacement); universal device support with tiers Lite / Standard / High + Ultra and a 2D fallback; free premium asset ecosystem with per-asset license checks; measure, do not assume. UE 5.8.4 installed by the owner; E0-E2 done, first render black.
4. **Owner returned work to Three.js** and asked to run the server and finish the M4 materials; login/404 confusion was explained (needs a developer/admin httpOnly session cookie).
5. **M4-M9 delivered** in order (M5-M9 in this stretch), each verified by unit tests, e2e and screenshots, then committed.
6. **Latest instruction**: continue the whole project in order without reducing scope, forgetting nothing; then, running low on usage, write this README and push to `Work-Meytar`.

---

## 7. Next steps (exact)

1. Decide how to add the main app's missing migrations (SellerProfile + 4 columns; see PROGRESS "Live database").
2. M10 live model: with the owner's approval, switch `STUDIO_AI_PROVIDER=claude` and measure the sample prompts (cost, dropped actions).
3. Finish the item tone match (warm cast on bedroom side walls, flatter item contrast; PROGRESS "Item lighting calibration"), then M11 catalog growth and admin.
4. M12 / M13, then resume Unreal E2 (black render) only if the owner still wants the Ultra tier.
5. Re-check Epic licensing and test on a real phone.
