# Progress

Branch: `feature/design-studio` (worktree `.claude/worktrees/design-studio`, from Work-Gal 8a6c21d).
Read this file first in every session; do not re-audit the repo.

## Milestones
| # | Status | Notes |
|---|---|---|
| M0 | done | worktree, docs, flag (lib/studio/flags.ts), bench (scripts/studio/bench.mjs) |
| M1 | done | lib/studio core: 85 studio tests (362 total green), tsc + eslint clean |
| M2 | done (gate caveat) | empty shell + surface materials + proof; irradiance-only confirmed, swap-without-rebake accuracy limited (see QUALITY_GATES) |
| M3-M13 | pending | see MASTER_PLAN section 10 |

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

## Next steps
1. M3: `/studio/[slug]` route behind `STUDIO_ENABLED`; extract the shared Walker + lightmap material code from ApartmentWalk without changing /walk; dynamic item layer (probe IBL, matched sun shadow, contact AO), quality tiers; bench the shell with `node scripts/studio/bench.mjs http://localhost:3001 /walk/yarkon-twin-shell`.
2. Before M4 final visuals: run the final-quality shell bake.
