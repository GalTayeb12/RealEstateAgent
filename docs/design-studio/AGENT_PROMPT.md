# Prompt for the next developer's AI agent (paste this as the first message)

```
You are continuing an existing project: HAVENIQ Design Studio, inside the HAVENIQ real-estate repo (https://github.com/GalTayeb12/RealEstateAgent.git, branch Work-Meytar). Do not start from scratch and do not re-audit the whole repo: the previous work is documented and tested. Talk to me in Hebrew; write code, comments and docs in English.

STEP 0 - SETUP (once)
- git clone, then: git checkout Work-Meytar ; npm install --legacy-peer-deps ; npx prisma generate
- Copy .env.example to .env.local. Set JWT_SECRET (any string) and STUDIO_ENABLED=1. Leave DATABASE_URL empty to run the studio alone (file store), or use a DEV database. NEVER use the production database for studio work.
- Read AGENTS.md / CLAUDE.md first. This repo uses a Next.js version with breaking changes: read node_modules/next/dist/docs/ before touching routes, params, proxy.ts.
- Verify: npx vitest run (expect 481 passing) ; npx tsc --noEmit -p . (clean) ; npx eslint components/studio lib/studio (clean).
- Run: npx next dev -p 3001 (restart after edits if you work in a git worktree: no hot reload there). Then JWT_SECRET=<same> node scripts/studio/open-studio.mjs opens Edge signed in as a local admin at /studio/yarkon-twin-shell. The studio needs a developer/admin session (httpOnly cookie hq_session) and STUDIO_ENABLED=1, otherwise it returns 404.

STEP 1 - READ, IN THIS ORDER
1. docs/design-studio/README.md   (what the system is, what exists, what is missing, history)
2. docs/design-studio/SETUP.md    (env, what is NOT in git, second project in this branch)
3. docs/design-studio/PROGRESS.md (per-milestone results; the final section "Next steps" is your task list)
4. As needed: MASTER_PLAN.md (approved plan, roadmap M0-M13, section E = Unreal), ARCHITECTURE.md, QUALITY_GATES.md, ART_DIRECTION.md, ASSET_PIPELINE.md, ASSET_LICENSES.md, UNREAL.md   (all in docs/design-studio/)

WHAT THE SYSTEM IS
/studio/[slug] = one scene, three modes on one design document: Walk (first person), Design (select / drag / rotate / add / replace / materials / resize), Plan (top + isometric with dimensions in cm, areas, door swings, clearances). Pilot apartment: yarkon-twin-shell (an EMPTY baked shell; furniture is rendered live on top). Existing /walk/* pages are the old viewer and must stay unchanged.

STATE (2026-11-26): milestones M0-M9 are DONE and committed: core model + commands, shell bake, studio route, living-room slice, Design UX, persistence (file store; Prisma repo written but untested on a live DB), floor planner, parametric generators (kitchen runs, wardrobe, shelving, bed), architecture proposals (partitions/openings, protected walls, "unverified" labelling) and kitchen layouts. TODO: M10 AI designer, M11 admin catalog + catalog growth, M12 path-traced stills, M13 hardening. Unreal (optional "Ultra" tier) is PAUSED at E2 (first render black); do not resume it unless I ask.

WHERE THINGS ARE
- Pure core (no React/three): lib/studio/  -> schema/ (zod: document, nodes, catalog, ids), baseline/fromTwin.ts, commands/ (types, apply, history), validation/ (geom2d, placement, architecture), catalog/ (sizing, modular, generators/), design/ (snap, preview, spot, options, kitchen), plan/ (view, measure), persist/ (repos, ops, kv), flags.ts, i18n.ts (he+en), migrations.ts
- UI: components/studio/ -> store.ts (zustand, single source of truth), StudioApp.tsx, scene/ (StudioCanvas, ShellLayer, ItemLayer, DesignInteraction, ProposalLayer, ArchTool, generated.ts), panels/ (PropertiesPanel, CatalogDrawer, DesignMenu, ArchitecturePanels), plan/ (PlanOverlay, PlanToolbar, usePlanGestures), persist/
- Routes: app/studio/[slug]/, app/studio/shared/[token]/, app/api/studio/**
- Catalog: catalog/manifests/*.json (source of truth) -> published to public/studio/catalog/ (index.json + GLBs + textures + previews). Shell: public/walk/yarkon-twin-shell/.
- Tests: lib/__tests__/studio-*.test.ts. E2E + tools: scripts/studio/ (e2e-design, e2e-plan, e2e-generated, e2e-arch, e2e-api, e2e-persist, ingest/publish.mts, thumbs.mjs, bench.mjs, open-studio.mjs, ue/). Blender: scripts/blender/studio_*.py. Shell bake: scripts/twin/build-walk.mjs --shell-only.
- Prisma: prisma/schema.prisma + migration 20261126000000_add_studio_designs (NOT applied anywhere yet).
- npm scripts: studio:test, studio:publish, studio:open, studio:e2e.

NOT IN GIT: assets-src/ (~8 GB Blender sources/raw assets, gitignored; ask the owner for a copy only if you must re-bake the shell or regenerate Blender items), the Unreal project (C:\HaveniqUE), .env files, local .storage/.
SECOND PROJECT IN THIS BRANCH: light mode / redesign (components/theme/*, lib/theme.ts, lib/themeRequest.ts, Home, TopNav, app/lab, docs/redesign). Independent of the studio; do not mix commits. components/dev/plan/PlanCanvas.tsx and PlanWallEditor.tsx are unfinished (they import missing functions from edits.ts) and are excluded from tsc in tsconfig.json.

NON-NEGOTIABLE RULES
1. Every change to a design document goes through a Command (lib/studio/commands). Never mutate the document directly. Every command has an exact inverse (undo).
2. Never scale furniture. Sizes come only from catalog variants, modular chains or parametric generators.
3. Validation has two tiers: errors refuse the change with a reason; advisories are hints. Keep lib/studio free of three.js/React imports.
4. Architecture proposals are concepts: never written into the baseline, never touching protected (exterior/glazing) walls, always labelled unverified.
5. Catalog is data: new assets = a manifest + files + a license row in ASSET_LICENSES.md; run npx tsx scripts/studio/ingest/publish.mts (its gates must pass). CC0/original first; CC-BY with attribution; never NC/ND.
6. NO paid API calls (including Anthropic for the AI designer), purchases, deploys, production-DB access or destructive operations without my explicit approval. Secrets never go in git or in chat.
7. Work in small verified steps: write tests, run tsc + eslint + vitest + the relevant e2e script, LOOK at screenshots for visual changes (docs/design-studio/results/), then ONE commit per milestone with a PROGRESS.md entry and updated "Next steps". Push only to Work-Meytar (or a branch I name), never to main.
8. Keep UI strings in lib/studio/i18n.ts in both he and en (a test enforces identical keys). Hebrew is RTL.
9. Be honest in reports: if a gate fails or something is unverified, say so; do not loosen a gate to make it pass.

YOUR TASK NOW
Follow PROGRESS.md "Next steps". Recommended order: (a) ask me for the inputs listed there (DEV database URL, approval before any paid API); (b) fix dynamic-item lighting in bedrooms/corridor (items look dark vs the baked walls; see M8 known gaps; start in components/studio/scene/ItemLayer.tsx, the room probe intensity); (c) M10 AI designer starting with a free dry-run mode (canned model responses) built on CommandSchema/isPublicCommand and validateDocument/validateProposals, ghost preview + accept/reject/one-step undo, rate limit; (d) M11 admin catalog and catalog growth; (e) M12, M13. Before coding, state your plan in Hebrew in 5-10 lines and wait for my OK if it involves anything in rule 6.
```
