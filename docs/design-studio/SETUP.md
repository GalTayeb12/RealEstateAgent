# Design Studio: working from another computer or another user

Everything needed to continue the project elsewhere. Read `README.md` (overview) first, then `PROGRESS.md` (exact next steps).

## 1. Get the code

```powershell
git clone https://github.com/GalTayeb12/RealEstateAgent.git
cd RealEstateAgent
git checkout Work-Meytar            # contains the whole Design Studio work (milestones M0-M9)
npm install --legacy-peer-deps      # pannellum-react declares React 16 as a peer
npx prisma generate                 # writes app/generated/prisma (gitignored)
```

The branch was developed in a git worktree called `feature/design-studio`; `Work-Meytar` is that branch pushed under another name. The studio does not need the worktree: it runs from any checkout of this branch. It was branched from `Work-Gal` (8a6c21d); other uncommitted work in the original checkout (theme / Home / lib/theme.ts) is NOT part of this branch.

## 2. Environment variables (never commit them)

Create `.env.local` (copy `.env.example`). For the studio:

| Variable | Needed for | Notes |
|---|---|---|
| `JWT_SECRET` | any login / the e2e scripts | any string locally; the e2e scripts default to `studio-bench-dummy` |
| `STUDIO_ENABLED=1` | the feature flag (`lib/studio/flags.ts`) | the route returns 404 without it |
| `DATABASE_URL` | accounts and Prisma persistence | **use a DEV database or branch, never production**; run `node scripts/studio/assert-dev-db.mjs` before any `prisma migrate` |
| `STORAGE_DRIVER` | asset/design storage | default `local` (writes `.storage/`); `r2` is built but inactive until `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` (+ optional `R2_PUBLIC_BASE_URL`) are set |
| `ANTHROPIC_API_KEY` | M10 AI designer (not built yet) | paid: ask the owner before using |

Access to `/studio/*` needs a session with role developer or admin (httpOnly `hq_session` cookie). Locally you can mint one: `jwt.sign({userId, email, role: "admin"}, JWT_SECRET)` (see any `scripts/studio/e2e-*.mjs`), or log in with a developer/admin account of the database you use. A browser that already holds a `hq_session` cookie must clear it first (JS cannot overwrite an httpOnly cookie).

## 3. Run

```powershell
$env:JWT_SECRET="studio-bench-dummy"; $env:STUDIO_ENABLED="1"; npx next dev -p 3001
```
Open `http://localhost:3001/studio/yarkon-twin-shell` (add `?debug` to expose `window.__studio` for tests). In a git worktree there is no hot reload: restart after edits.

Checks: `npx vitest run`, `npx tsc --noEmit -p .`, `npx eslint components/studio lib/studio`, and the e2e scripts listed in `README.md` section 4 (need Microsoft Edge + a GPU for the screenshots; they start from the running dev server).

## 4. What is NOT in git (and what to do about it)

| Thing | Where it was | Impact |
|---|---|---|
| `assets-src/` (Blender sources, raw GLBs, shell bake inputs; gitignored) | `C:\RealEstateAgent\assets-src\...` on the original machine | Not needed to RUN or TEST the studio: every published output is committed (`public/walk/yarkon-twin-shell/**`, `public/studio/catalog/**`). It IS needed to re-bake the shell, regenerate Blender items (`scripts/blender/studio_*.py` write to `assets-src/studio/items-raw/`) or re-ingest assets. Ask the owner to copy that folder, or recreate from the scripts + `docs/design-studio/ASSET_LICENSES.md` sources |
| Unreal project and Pixel Streaming infra | `C:\HaveniqUE\HaveniqUltra`, `C:\HaveniqUE\PSInfra`, engine `C:\Program Files\Epic Games\UE_5.8` | Only for the optional Ultra evaluation (`UNREAL.md`); the project template + scripts are in `scripts/studio/ue/`, rebuild with them. Paused: the first GPU render was black |
| `.storage/` | local storage driver output (designs, uploads) | regenerated on use |
| `.env.local` | secrets | recreate (section 2) |
| Blender 5.3, Node 24, Edge | tools | needed only for bakes / e2e. Blender path is configured in `scripts/twin/build-walk.mjs` |
| Claude Code memory (`~/.claude/projects/.../memory`) | local to the original user | not portable; everything important is in these docs |

## 5. Rules the project follows (keep them)

- No deploy, no purchases, no paid API calls, no production database access, without the owner's explicit approval.
- Work on a branch; one commit per verified milestone (tests + e2e + screenshots), with a `PROGRESS.md` entry.
- Never scale furniture: sizes come from variants, modular chains or parametric generators.
- Architecture changes are concepts: never written into the baseline, never touching protected walls, always labelled unverified.
- Every asset needs a license row in `ASSET_LICENSES.md` (CC0 / original first; CC-BY with attribution; no NC/ND).
- Next.js here has breaking changes: read `node_modules/next/dist/docs/` before touching routes (see `AGENTS.md`).
- Keep code and docs in English; the owner prefers explanations in Hebrew.

## 6. Where things are documented

| File | Content |
|---|---|
| `README.md` | what the system is, what exists, what is missing, history |
| `PROGRESS.md` | milestone table, per-milestone summaries with measured results, **next steps** |
| `MASTER_PLAN.md` | the approved plan (architecture, roadmap M0-M13, risks, section E Unreal) |
| `ARCHITECTURE.md`, `QUALITY_GATES.md`, `ART_DIRECTION.md` | design, acceptance gates and visual review records, art rules |
| `ASSET_PIPELINE.md`, `ASSET_LICENSES.md` | how assets are ingested and every asset's license |
| `UNREAL.md` | the UE5 / Pixel Streaming evaluation and its status |
| `results/` | review screenshots per milestone |

## 7. First 15 minutes for a new developer (checklist)

1. Clone, `git checkout Work-Meytar`, `npm install --legacy-peer-deps`, `npx prisma generate`.
2. Copy `.env.example` to `.env.local`; set `JWT_SECRET` and `STUDIO_ENABLED=1` (leave `DATABASE_URL` empty to run the studio alone with the file store, or use a DEV database).
3. `npx vitest run` should report 481 passing tests; `npx tsc --noEmit -p .` and `npx eslint components/studio lib/studio` should be clean.
4. `npx next dev -p 3001`, then `JWT_SECRET=<same> node scripts/studio/open-studio.mjs` opens Edge signed in as a local admin on `/studio/yarkon-twin-shell`.
5. Run `node scripts/studio/e2e-design.mjs` (needs the dev server and Edge). Read `PROGRESS.md` "Next steps" and pick the next item.

## 8. Large or private files that cannot be in git

`assets-src/` is about **8 GB** (Blender sources, bakes, raw downloads) and is gitignored on purpose: copy it by hand (external drive or cloud storage) only if you need to re-bake the shell or regenerate Blender items. Published outputs are all in git. The other, unrelated work in the original checkout (theme / Home / `lib/theme.ts` edits on `Work-Gal`) is NOT part of this branch.

## 9. Second project in this branch: light mode / redesign (from another chat)

`Work-Meytar` contains TWO independent pieces of work, committed separately:
1. **Design Studio** (everything under `lib/studio`, `components/studio`, `app/studio`, `app/api/studio`, `docs/design-studio`, `scripts/studio`, catalog + public assets).
2. **Light mode / redesign (Work-Gal line)**, committed on top: `components/theme/{ThemeProvider,ThemeToggle,ThemeScope,cinematic-light.css}`, `lib/theme.ts`, `lib/themeRequest.ts`, `app/layout.tsx`, `components/TopNav.tsx`, `components/home/*`, `components/MortgageCalculator.tsx`, `components/auth/Room.tsx`, the `/lab` pages (`app/lab`), redesign docs (`docs/HAVENIQ-REDESIGN-PROMPT.md`, `docs/HAVENIQ-REDESIGN-STAGE0.md`, `docs/redesign/` with screenshots), demo assets in `public/buildings/`, and the `.agents/` skills folder (Higgsfield skills used by that chat).
3. **Unfinished**: `components/dev/plan/PlanCanvas.tsx` and `PlanWallEditor.tsx` (plan editor with a draggable canvas) import functions (`addWall`, `addOpening`, `moveWall`, `moveWallEnd`, `moveOpening`) from `components/dev/plan/edits.ts` that do not exist yet in any branch. They are excluded from `tsc` in `tsconfig.json` (`exclude`) so the project builds; remove the exclusion once `edits.ts` provides those functions. Nothing imports them yet.

The two pieces do not touch the same files (checked before merging), 481 studio tests pass and `tsc` is clean with both present. `.next-2/` (a 900 MB second Next build directory from that chat) is gitignored, not committed.
