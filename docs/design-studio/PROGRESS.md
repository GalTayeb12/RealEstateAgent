# Progress

Branch: `feature/design-studio` (worktree `.claude/worktrees/design-studio`, from Work-Gal 8a6c21d).
Read this file first in every session; do not re-audit the repo.

## Milestones
| # | Status | Notes |
|---|---|---|
| M0 | done | worktree, docs, flag (lib/studio/flags.ts), bench (scripts/studio/bench.mjs) |
| M1-M13 | pending | see MASTER_PLAN section 10 |

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

## Next steps
1. M1: `lib/studio/schema` (zod document/nodes/commands/catalog), IDs, `baseline/fromTwin.ts`, apply/inverse/batch, 2D validation, migrations, modular sofa configuration solver; >=40 Vitest cases; twin golden test must stay green.
2. Then M2 (empty-shell bake + irradiance proof) - needs headless Blender 5.3 (`blender -b`).
