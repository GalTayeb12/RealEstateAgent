# Haveniq

Real-estate matching platform for the Israeli market (Hebrew first, English available).
Buyers do a short AI interview, get matched to projects, explore the building and the
apartment in 3D, and make or reserve offers. Developers and private sellers list projects.

## Run locally

```bash
npm install --legacy-peer-deps   # pannellum-react still declares React 16 as a peer
cp .env.example .env.local       # then fill in DATABASE_URL and the API keys
npx prisma generate
npm run dev                      # http://localhost:3000
```

```bash
npm run worker    # builds the 3D tour of approved plans (needs Blender; see docs/developer-pipeline)
npm test          # unit tests (vitest)
npm run lint
npm run build
```

## Where things are

| Area | Code |
| --- | --- |
| Matching (rooms, budget, location filters, score) | `lib/matching.ts`, `lib/attributes.ts`, `lib/location.ts`, `app/api/match` |
| Results, one card per project | `app/results`, `lib/projectGroups.ts` |
| Project page with apartment-type tabs | `app/aom/[id]` |
| Building explorer, floor picker, room tour | `components/building` (`BuildingPhotoStage.tsx` for photo-based buildings) |
| First-person 3D walk and top-down view | `app/walk/yarkon`, `components/walk` |
| Tour side panel and Dana | `components/tour`, `lib/tour` |
| Developer and seller dashboards | `app/dev`, `app/seller`, `components/listing` |
| Developer pipeline: plan (DXF/DWG) → twin → Blender build → tour; building image, calibration, apartment placement | `lib/twin`, `lib/stage.ts`, `lib/placement.ts`, `components/dev`, `scripts/twin` — see `docs/developer-pipeline/README.md` |
| Design tokens (incl. `.qp-glass`) | `components/quiet/quiet.css` |
| Strings (he / en) | `lib/i18n/messages.ts` |
| Database schema | `prisma/schema.prisma` |
| Data and asset scripts | `scripts/` (Blender pipeline in `scripts/blender`) |

Older status reports and specs are kept in `docs/archive`.
