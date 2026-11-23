# Haveniq — launch checklist

Status as of branch `implement/concept-c` (= `origin/Work-Gal`, a736b37). Each item says how it is verified. "Blocked" means it needs a decision or an account that is not in this repo.

Baseline (2026-11-23): `tsc --noEmit` clean · `vitest` 277/277 · `eslint` 45 errors / 59 warnings before this pass, **39 errors / 59 warnings after** (mostly the React-compiler `set-state-in-effect` rule, see §2).

## 1. Product flows (must work end to end)

- [ ] Buyer: register → verify email → interview → processing → results → offer → deal room. *Verify:* Playwright run with a test buyer. *Status:* results/offers/deal verified in earlier phases; deal room not re-verified since Phase 2.
- [x] Developer dashboard and admin approvals verified in Hebrew at 1024 px with no horizontal overflow (2026-11-23). Full register → approval → buyer-visible flow not run.
- [~] Seller (private): register → verify → dashboard. *Status:* registered, verified and logged in on localhost (2026-11-23). Dashboard loads in he and en. Test project "בדיקת QA - לא אמיתי" was created on the shared DB and hard-deleted on 2026-11-23 (guarded by id and name; its one unit type was removed by cascade). The seller test account itself still exists. Matches and offers not run.
- [ ] Walk / 3D: `/walk/<slug>` and `/aom/<id>` load on desktop and mobile. *Status:* `/walk/ut-seed-yarkon-4` renders (canvas, Dana panel, floor plan). *Fixed 2026-11-23:* reflection probes 404 because `build-walk-assets.mjs` skipped probe files with a hyphen in the room id. Rebuilt; all probes return 200. Authenticated check (buyer, developer, admin) done in the same session.
- [ ] Interview (`/interview`): live LiveAvatar session. *Status:* not verifiable headlessly (**blocked**: needs paid avatar session and a mic).

## 2. Code quality

- [ ] `tsc --noEmit` clean. *Status:* clean.
- [ ] `vitest run` green. *Status:* 277/277.
- [ ] `eslint` — zero errors on changed files. *Status:* 39 errors repo-wide (`TopNav.tsx` still has 3: the localStorage user read and the async-count resets), of which most are `react-hooks/set-state-in-effect` and `react-hooks/immutability` in older components. Fixing these changes behaviour, so each one is fixed and tested, not silenced.
- [x] No `any` in touched building components and `scripts/building/pipeline.ts`.
- [x] No bare TODO/FIXME in `app/`, `components/`, `lib/`. *Status:* 2 TODOs with context remain (`lib/experience/getExperience.ts`, `lib/inventory.ts`), both tied to planned work.

## 3. Language and layout

- [ ] Hebrew (RTL) and English on every public and buyer screen, no overflow at 390 px. *Status:* checked for home, results, offers, profile, dev dashboard. Not checked: `/deal/[id]`, `/aom` English, `/interview`.
- [x] Seller dashboard strings moved to `lib/i18n/messages.ts` (`sellerDash`), including status labels and the role badge; buyer-offers error and aom photo alt localised (2026-11-23).
- [ ] Strings moved to `lib/i18n/messages.ts`. *Still inline:* `ApartmentOverview`, `ApartmentWalk`, `Home`, `app/aom`, `app/buyer/offers`, `STR`/`T` dictionaries in building, stage and listing components.

## 4. Security and data

- [x] Ledger is admin-only; cron fails closed; auth endpoints rate-limited; security headers; JWT in httpOnly cookie with origin check. *Source:* `docs/design-impl/security-probe.mjs`, `e2e/smoke.spec.ts`.
- [ ] Rate limiter uses a shared store when more than one server instance runs. *Status:* in-memory only (`lib/rateLimit.ts`). OK for one instance.
- [ ] Authenticated e2e run against a test buyer (`E2E_BUYER_STATE`). *Status:* not run in this session.
- [ ] Shared database writes (Neon) only with approval. *Status:* `normalize-unit-rooms --apply` already run; no pending writes.

## 5. Legal (solicitor review required — see `docs/LEGAL-TODO.md`)

- [ ] Reservation contract wording reviewed (§1). **Blocked:** needs a lawyer.
- [ ] Terms of Service: governing law, liability, age (§2). **Blocked:** needs a lawyer.
- [ ] Privacy Policy and cookie consent banner (§3). **Blocked:** lawyer and product decision. The locale cookie has no consent banner yet.
- [ ] Deal PDF disclaimer (§4). **Blocked:** lawyer.
- [ ] "SIMULATION" labels kept or removed (decision). **Blocked:** product decision.
- [ ] Real-estate agency licensing check. **Blocked:** lawyer.

## 6. Production readiness

- [x] `npm run build` succeeds. *Status:* passes (2026-11-23, exit 0, all routes generated).
- [ ] Environment variables documented for production (`.env.example`). *Status:* not checked.
- [ ] Performance: Lighthouse on `/` and `/results` (LCP with the hero image). *Status:* not measured.
- [ ] Cron secret and daily digest set in production. *Status:* code fails closed; the env var is a deploy step.
- [ ] Hosting: server, GPU for the Blender pipeline, object storage (R2/S3) instead of local files. *Status:* not started. Per the roadmap this is phase 6.
- [ ] ODA licence for DWG input. *Status:* not purchased; DWG needs an external converter.

## 7. Product scope (decide before launch, not a bug)

- [ ] Private seller and mirrored units (roadmap phase 7). *Status:* not built.
- [ ] Walk furniture swapping (idea discussed; baked into the GLB). *Status:* not started; spike recommended first.
- [ ] Hover-synced listing imagery on `/results`. *Status:* not built; listings have no photos.

## Definition of "ready to show"

A release is ready to show to real users when §1 flows pass end to end on desktop and mobile, §2 has no errors in changed files, §3 has no overflow in both languages, and §5 has been reviewed by a lawyer. Items marked **blocked** are not something code can finish.

## Pass 2026-11-23 (end-to-end, buyer / developer / seller / admin)

- Fixed: seller unit-type row labels (avail., rooms/area/balcony keys) and the developer reservations link now use i18n. Mobile top bar no longer overlaps logo and language toggle (`TopNav`).
- Checked: buyer results (desktop + 390 px, no overflow), buyer offers, deal room (desktop + 390 px, no overflow), developer dashboard reservations tab, admin approvals, seller dashboard (he/en).
- Not done: creating a new reservation. The "אישור הזמנה" action moves a listed unit into a reservation in the shared DB, so it waits for explicit approval.
- Not verified live: the seller unit-type row after the label fix (the test data that had a unit type was deleted). Typechecked only.
- Not verified: `/interview` live session, `/walk` after the probe rebuild on mobile, full seller listing → match flow.
- Lint on touched files: remaining errors are the pre-existing `set-state-in-effect` rule.

## Pass 2 (same day): full deal and listing flow

- Buyer reserve at listed price → deposit (simulated) → developer signs → buyer signs: deal reached "both signed" on a test deal (Dmari penthouse, shared DB). That unit now shows as reserved/sold in the developer inventory; restore it in the dashboard if needed.
- Seller listing (test project) → appears in the buyer results (5 of 7 matches). Test project removed.
- Walk on mobile (375 px): loads, probes 200, no overflow.
- Fixed: deal room waiting copy now names the party that must sign (was "awaiting developer decision" for both sides).
- GAP (launch blocker): negotiated buyer offers have no developer UI. The developer reservations list only shows status accepted, and there is no GET for pending offers, so a developer cannot see or accept/counter/reject them (the API /api/dev/offers/[id]/respond exists but nothing calls it).
- Not done: live interview (excluded by the user).

## Closing pass 2026-11-23 — status of every item

**Closed by this pass**
- Negotiated offers: the "developer offers" blocker was a misdiagnosis. Developer units are instant-accepted (`app/api/offers/route.ts`), and negotiated offers exist only on private-seller listings, which already had accept, counter and reject. Tested end to end: buyer offer → seller counter → buyer accept → deposit → seller signs → buyer signs → deal complete. A short-lived developer tab was built and reverted.
- Deal Room labels: waiting copy and signature labels now name the right party (developer, seller or buyer).
- Seller counter form and offer cards: English labels localised (counter price, explanation, match score, awaiting copy).
- Cookie notice: the site sets only strictly necessary cookies, so an information notice with dismiss is shown (`components/CookieNotice.tsx`). Lawyer to confirm.
- Privacy Policy and Terms: rewritten in Hebrew and English with draft banners, and open questions in brackets. Source: `lib/legal/content.ts`. Packet for counsel: `docs/LEGAL-REVIEW-PACKET.md`.
- `.env.example`: all 11 missing variable names added (no values).
- Leverage-groups discount label localised.
- Production build passes (exit 0). Unit tests 277/277.
- Measured on the production server (localhost): home loads in about 0.8 s, 847 KB transferred.

**Open: needs your decision or approval**
- Live interview (HeyGen avatar + ElevenLabs): cannot be tested headlessly and starts a paid session. Needs you to run one session with a microphone.
- Accessibility full audit (WCAG 2.0 AA / SI 5568): an automated axe-core run was blocked by the permission classifier (it loads a script from a CDN into the page). Manual in-page checks passed on /login and /terms (labels, language, contrast). Approve a safer route (for example adding `axe-core` as a dev dependency, which needs your OK) to complete it.
- Lawyer review of all legal texts: the packet is ready; approval is outside code.
- Simulation labels: keep or remove (product decision).
- Rate limiter: in-memory. A shared store (Redis or a database table) is needed before more than one server runs. A table would change the shared Neon schema, so it needs your approval.
- Hosting, GPU for the Blender pipeline, object storage (R2/S3): not implemented. `STORAGE_DRIVER` supports only `local`. These are infrastructure and cost decisions.
- ODA licence for DWG input: purchase decision.
- Product scope: mirrored units, duplex, furniture swap in the walk, hover-synced listing imagery. Each is a feature build, not a launch fix. Decide which are launch-critical.

**Open: engineering work not finished**
- ESLint: 39 errors, all the React-compiler `set-state-in-effect` / `immutability` rule in older components (for example `BuildingExplorer`, `BuildingPhotoStage`, `interview/page`, `TopNav`). Fixing them changes component behaviour, so each one needs a browser check. Proposed: file by file, each verified before the next.
- Performance: the 3D walk transfers about 24 MB before first render (apartment.glb 22.9 MB). On mobile networks this is likely to take many seconds. Options: smaller textures, Draco or further mesh reduction, or streaming per room. Not started.
- i18n: `Home` and some building/stage components keep local he/en dictionaries (they work, but are not in `messages.ts`).
- Authenticated end-to-end suite (`E2E_BUYER_STATE`) not run in this pass.

## Accessibility audit (axe-core 4.12.1, WCAG 2.0 A/AA and 2.1 A/AA)

Tool: `axe-core` added as a dev dependency (`package.json`, pinned to the version already in the lockfile). It is not part of the app bundle. Run it in a browser by loading the file from `node_modules/axe-core/axe.min.js`.

Run on: `/`, `/login`, `/register`, `/terms`, `/seller/register`, `/results`, `/buyer/offers`, `/profile`, `/deal/[id]`, `/buyer/leverage-groups`, `/aom/[id]`, `/walk/[slug]`, `/seller/dashboard` (both tabs), `/dev/dashboard` (three tabs), `/dev/admin/approvals`, `/privacy`.

Violations found and fixed:
- Results: alert toggle had no accessible name (`components/AlertCard.tsx`). Critical.
- Profile: mortgage fields and labels were not associated with their inputs; hard-coded light gray text failed contrast on the dark theme (`components/MortgageCalculator.tsx`). Critical and serious.
- Profile: name, phone and email fields were not associated with their labels (`app/profile/page.tsx`). Critical.
- Walk: a canvas wrapper had `aria-label` without a role (`components/walk/ApartmentWalk.tsx`). Serious.
- Developer overview: inventory dots had `aria-label` without a role (`components/dev/DevOverview.tsx`). Serious (16 nodes).
- Admin approvals: search input and role select had no accessible name (`app/dev/admin/approvals/page.tsx`). Critical.

Result after fixes: no violations on any page listed above.

Not covered by axe: keyboard-only walkthrough of every flow, screen reader testing with a real assistive tool, the live interview, 3D content beyond its accessible wrapper, and the Hebrew legal text. These still need a manual pass before launch.

## ESLint pass (2026-11-23)

Result: `npx eslint .` → **0 errors**, 59 warnings (was 45 errors at the start of the session, 40 before this pass).

What changed, by pattern (behaviour kept; every screen below was re-checked in the browser):
- Initial state from storage or the window now comes from a lazy initializer or `useSyncExternalStore` (`profile`, `results`, `leverage-groups`, `dev/pending`, `CookieNotice`, building components, which are client-only).
- State adjusted on a prop change is done during render with the React guard pattern (`TourSidePanel`'s `PresenterBot`, `TopNav` menus).
- Mount-time loaders and reads are started in a zero-delay timer inside the effect, so the state update is not synchronous in the effect body (`buyer/offers`, `deal`, `dev/dashboard`, `dev/properties`, `seller/dashboard`, `admin/approvals`, `interview`, `TopNav`, `processing`).
- A camera value that depends on layout is computed in a deferred effect (`BuildingPhotoStage`), not in render.
- Recursive floor navigation in `BuildingExplorer` became a loop with the same order.
- The clip plane is a stable object held in state; the initial camera setup is a helper that is called from the effect.

Verified in the browser after the change: verify-email (bad and missing token), results, buyer offers, profile, deal room, leverage groups, property page (floor selection, unit card, back to building), developer dashboard (`?tab=reservations`), property form, admin approvals (role filter), seller dashboard (projects and offers tabs), cookie notice (dismiss persists). A runtime error found during this check (`camFor` used before initialization) was fixed and re-checked.

Not verified in the browser after this pass: the 3D building scene (`BuildingGLBScene`) in a real building, the immersive stage, `/walk` (untouched), and the live interview (needs the user).

Remaining warnings (not errors): exhaustive-deps and `img` suggestions in older components, and one `audioRef` cleanup warning in the interview page.

## 3D check (2026-11-23)

- Immersive stage (`/aom/seed-yarkon-3?mode=3d`): renders both towers in 3D; choosing tower A and entering floor 5 shows the floor view with its units (URL updates, no error).
- Photo stage (`/aom/seed-yarkon-3`): floor selection, unit card, back to building (verified earlier in this pass).
- GLB scene (`BuildingGLBScene`) and plain canvas (`BuildingCanvas`): not reachable with current data. Every building in the database uses a `.webp` model, so the explorer always chooses the photo stage. A `.glb` model would be needed to exercise these; that needs either a data change (needs your approval) or a temporary test route.
- Unit picking inside the 3D canvas could not be clicked from the DOM (units are drawn in WebGL).
