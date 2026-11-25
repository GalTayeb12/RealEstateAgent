---
name: haveniq-studio
description: Working notes for the HAVENIQ Design Studio (feature/design-studio) - repo map, pipeline commands, isolation rules and gotchas. Use before touching lib/studio, components/studio, app/studio or the studio Blender/asset scripts.
---

# HAVENIQ Design Studio

Start every session by reading `docs/design-studio/PROGRESS.md` (status + exact next steps). The approved plan is `docs/design-studio/MASTER_PLAN.md`; do not re-audit the repo.

## Rules
- This is Next 16: read `node_modules/next/dist/docs/` before writing routes. Middleware is `proxy.ts`.
- `lib/studio/**` has no three.js/React imports. Every mutation is a Command with an inverse.
- Never modify existing `public/walk/*` assets or `/walk` behaviour; new output goes to new slugs.
- Work only in the worktree `.claude/worktrees/design-studio`; own `node_modules` (`npm ci --legacy-peer-deps`), no junction to the main checkout.
- Never run `prisma migrate` or seed against a production DATABASE_URL. Use the dev DB guard (`scripts/studio/assert-dev-db.mjs`).
- Paid services, credentials, production, destructive operations: ask first.

## Commands
- Tests: `npx vitest run --reporter=dot` (one file: `npx vitest run lib/__tests__/studio-*.test.ts`).
- Dev server: needs `JWT_SECRET`; restart after each edit (no hot reload from worktrees). Port 3001 for e2e.
- Screenshots: headless Edge via Playwright (`channel: "msedge"`, `--enable-gpu --use-angle=d3d11`); the in-app browser pane throttles WebGL.
- Twin -> walk build: `node scripts/twin/build-walk.mjs <fixture|dxf|twin.json> <slug> [--preview]` (headless Blender 5.3; final bake ~20 min, preview ~2.5 min). Pass Windows paths to blender.exe.
- Commit identity: `git -c user.name="Gal Tayeb" -c user.email="134174230+GalTayeb12@users.noreply.github.com"`.

## Gotchas
- gltf-transform `prune()` drops TEXCOORD_1 unless `keepAttributes: true`.
- Cycles bakes each selected object as its own session; join per lightmap group.
- Diffuse bakes need OIDN and >=2048 spp in dim rooms.
- Playwright `route()`: the last registered route wins.
- In CSS write only `backdrop-filter` (not the -webkit- twin).
