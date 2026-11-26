# Handover: moving from `Work-Meytar` to `Work-Gal` without losing work

Written 2026-11-27. Audience: whoever continues the Design Studio on `Work-Meytar`.

## Why this document exists

`Work-Meytar` (8 commits after base `8a213ac`) and `Work-Gal` (this line, 21 commits after the same base) are two independent implementations of the same milestones (M10 AI designer, M11 catalog and admin). They touch 44 of the same files; a trial merge gives 41 conflicts, so they are NOT to be merged. The decision (2026-11-27): **`Work-Gal` is the line to continue from**, because it has the integration work that `Work-Meytar` lacks:

- a Design Studio button in every tour, an empty-apartment shell per plan, and the developer's starting design;
- Save and Back buttons, buyer designs private until attached to an offer (opt-in copy on the offer);
- the build worker that builds tour + studio shell + starter design + item lighting from an approved plan (verified end to end), and the developer upload test;
- room labelling and wall placement fixes for open-plan apartments, a live Claude designer test, 553 unit tests plus e2e suites.

`Work-Meytar` has things `Work-Gal` does not (below). Those must be carried over by hand.

## What is only on `Work-Meytar` (worth keeping)

Original catalog pieces and materials, built in Blender (no licence risk):
`accent-chair-01`, `bar-stool-01`, `counter-stool-01`, `dining-chair-02`, `lounge-chair-01`, `ottoman-01`, `pendant-01`, `planter-clay-01`, `round-table-01`, `table-lamp-01`, `table-lamp-02`, `vase-brass-01`, `vase-ceramic-02`, `cabinet-*` finishes (graphite, white, olive, sand), `metal-black-steel`, `paint-mist-blue`, `paint-soft-black`.
Scripts: `scripts/blender/studio_chairs.py`, `scripts/blender/studio_lamps.py`, `scripts/studio/shot-furnished.mjs`, `scripts/studio/e2e-catalog-admin.mjs`.
Also: `docs/design-studio/AGENT_PROMPT.md` (its first lines say `git checkout Work-Meytar`; change that to the new branch), its catalog admin page (`app/dev/admin/catalog`; `Work-Gal` has its own at `/admin/catalog`, so compare before porting).

## IDs that exist on BOTH branches with different content

`bench-01`, `desk-01`, `dining-table-01`, `dresser-01`, `nightstand-01`, `sideboard-01`, `tv-unit-01`, `wall-shelf-01`, `vase-ceramic-03`, `metal-brushed-brass`, `metal-brushed-steel`, `paint-greige`, `paint-terracotta`, `paint-warm-white`.

Also `dining-chair-01`: on `Work-Gal` it is a CC0 Poly Haven chair; on `Work-Meytar` it is an original Blender chair. Same id, different asset.

A manifest id + version pins designs, so never reuse an id for a different asset: **give every carried-over piece a new id** (for example `dining-chair-04`), update its manifest `id` and `licenses`, and keep its licence row in `ASSET_LICENSES.md`.

## Steps (run in the repository, PowerShell)

1. Save the existing work under a backup name (nothing is lost, nothing is overwritten):

```powershell
git fetch origin
git branch backup/work-meytar-before-sync origin/Work-Meytar
```

2. Start the continuing branch from `Work-Gal`:

```powershell
git checkout -b meytar-continue origin/Work-Gal
npm install --legacy-peer-deps
npx prisma generate
```

3. Bring back files that exist only on the old branch (Blender scripts shown; repeat for the other files in the list above):

```powershell
git checkout backup/work-meytar-before-sync -- scripts/blender/studio_chairs.py scripts/blender/studio_lamps.py
```

4. Carry over a piece: copy its `catalog/manifests/<id>@1.json` and `public/studio/catalog/<id>/1/` from the backup branch under the NEW id, edit the manifest, then run the publish gates and tests:

```powershell
git checkout backup/work-meytar-before-sync -- catalog/manifests/lounge-chair-01@1.json public/studio/catalog/lounge-chair-01
npx tsx scripts/studio/ingest/publish.mts
npx vitest run
```

5. Check: `npx tsc --noEmit -p .` and `npx eslint components/studio lib/studio` are clean, then work as usual.

## Two traps

- **File name case.** `Work-Meytar` has `lib/studio/ai/dryRun.ts`; `Work-Gal` has `lib/studio/ai/dryrun.ts`. On Windows (case-insensitive) these are the same file. Do not copy the old AI files over the new ones. Take the `Work-Gal` versions.
- **Pushing back.** The two histories differ, so replacing `Work-Meytar` with the new line needs a force-push, which would delete its 8 old commits on the server. Do not force-push without the team agreeing and keeping the backup branch. The safe default: push `meytar-continue` under a NEW branch name (for example `Work-Meytar-v2`), and keep `Work-Meytar` as it is.

## Rules that still apply (see `SETUP.md` and `.claude/skills/haveniq-studio`)

No scaling of furniture, every design change is a Command with an exact inverse, `lib/studio` imports no three.js or React, catalog items are data (manifest + files + licence row, publish gates pass, CC0 or original first, never NC/ND), no paid API calls, purchases, deploys or production-database access without the owner's approval, secrets never in git.
