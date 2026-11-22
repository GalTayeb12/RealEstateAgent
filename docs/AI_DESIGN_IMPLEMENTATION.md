# Haveniq — Concept C production implementation

Branch: `implement/concept-c` (from `design-exploration`, which holds the approved lab at `/design-lab/c3`, `/design-lab/c2/results`, `/design-lab/c2/developer`).
Nothing pushed or merged.

## Current phase
Phase One — done and approved. **Phase Two (buyer) milestone 2a done**: shared cinematic theme + auth screens. Remaining Phase 2 screens are login-gated and blocked on a test account (see Known issues). Phase Three not started.

## Completed
- Production homepage `/` now implements the approved Concept C V3: cinematic hero (native scroll, gentle parallax), intelligent matching, simplified apartment editorial (one render, caption only), developer platform preview, closing CTA, footer.
- Not restored: pinned scroll story, clock/timeline, building miniature, five-room strip, apartment toggles.

## Files changed
- `app/page.tsx` — now a server component; loads Frank Ruhl Libre + IBM Plex Mono (homepage only) and renders `<Home/>`.
- `components/home/Home.tsx`, `hooks.ts`, `home.css` — new; all CSS scoped under `.hv`, no new dependencies.
- `components/SiteFooter.tsx` — `/` added to HIDE_FOOTER (homepage has its own footer). TopNav already hides on `/`.
- `docs/design-impl/` — `shots.mjs` (Playwright, 4 viewports/locales), `home-check.mjs`, screenshots.
- Old homepage remains in git history (`5908469`).

## Design decisions
- Colors/type/motion copied from C V3; the app's global `html[lang] * { letter-spacing: 0 !important }` is handled by a `--ls` opt-in inside `.hv` (tracking only for English eyebrows/headings; Hebrew stays untracked).
- Reveal-on-scroll and count-ups degrade to final/visible content (no JS, reduced motion, SSR). Reduced motion disables drift, parallax, entrance and reveals.
- Nav anchors: Matching `#advisor`, The apartment `#apartment`, Developers `#developers` — all exist. Sign in → `/login`.
- CTAs: Get started → `/register`; For developers / Developer sign-up → `/dev/register`; Start interview → `/interview` (audio unlock preserved); footer: `/seller/register`, `/terms`, `/privacy`.
- Matching card (94%) and developer preview (62%, ₪148M, 7 offers) are fictional and explicitly labelled "Sample match / Demonstration only / Demo data". Removed the old stats bar ("12,000+" etc.) and the "92%" badge — unverifiable claims not in the approved design.
- Imagery is existing assets only (hero, Yarkon bedroom/living renders, CTA).

## Tests (Phase One)
- `npx vitest run`: 271/271 pass. eslint on changed files clean. `tsc`: no errors outside the lab.
- Playwright (desktop 1440 / mobile 390 × he/en): no console errors, no horizontal overflow (scrollWidth = viewport). Mobile menu, anchors, language toggle (he↔en, rtl↔ltr), reduced-motion static values, all linked routes return 200.

## Known issues / not verified
- Baseline screenshots of the old homepage were not retained (first capture was blank; old page recoverable from git).
- Lighthouse/perf not measured; hero image is the existing 1 large JPG via next/image.
- Authenticated pages not touched or tested.
- Homepage fonts add two Google font families (loaded on `/` only).

## Next steps
1. Approve Phase One.
2. Phase Two: buyer shell (TopNav restyle), `/interview`, `/results`, property/building pages, dashboard, offers.
3. Phase Three: developer screens. Requires a safe test account for authenticated pages.

## Phase 2a — shared cinematic theme + auth screens
- `components/theme/cinematic.css`: opt-in `.cin` class that re-points the existing `--qp-*` tokens to the Concept C palette (dark, gold primary), so existing buttons/fields/badges/notices follow without per-component rewrites. This is the single mechanism for the remaining screens (no second design system).
- `lib/theme.ts` (`isCinematicPath`) lists cinematic routes; `SiteFooter` follows it. Auth routes (`/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email`, `/dev/register|pending|rejected`, `/seller/register`) are live via `AuthRoom` (`qp-auth cin`) — serves buyers, developers and sellers.
- Fonts (Frank Ruhl Libre, IBM Plex Mono) moved from `app/page.tsx` to root layout so all screens share them.
- `LanguageToggle` active state now uses tokens (works on light and dark).
- Verified: login (en), dev register (he), login mobile — no console errors, no overflow; vitest 271/271; eslint clean on changed files.
- Pre-existing, untouched: eslint `set-state-in-effect` errors in `components/TopNav.tsx`.

## Phase 2b — buyer screens (authenticated, verified with a user-supplied test buyer)
- `components/theme/ThemeScope.tsx` (root layout) puts `.cin` on the routed content for opted-in routes; `lib/theme.ts` now includes `/profile`, `/processing`, `/terms`, `/privacy`, and the prefixes `/buyer`, `/results`, `/deal`, `/aom`. TopNav (and its logo) and footer follow the same list.
- Screens that hard-code light colours were converted with `docs/design-impl/tokenize.py`: inline hex → `var(--c-role, <original hex>)`. The `--c-*` roles exist only under `.cin`, so light screens keep their literal colours. Applied to: `/results`, `/buyer/offers`, `/buyer/leverage-groups`, `/deal/[offerId]`, `/aom/[id]`, `/profile`, `MortgageCalculator`, `AlertCard`. SVG strokes and the deal signature canvas stroke follow the theme.
- Not changed: logic, API calls, matching, signing/ledger behaviour (style values only).
- Verified rendered (desktop 1440 + mobile 390, no console errors, no overflow): `/buyer/offers`, `/profile`, `/buyer/leverage-groups`, `/deal/<id>`, `/results` (empty state only).
- Authenticated screenshots are kept local (they show the test account email); only home screenshots are committed.

## Phase 2c — results with real match data
- The live interview is a LiveAvatar voice/video session (mic + paid avatar), so it cannot be driven headlessly. With approval, `docs/design-impl/interview-sim.mjs` posted a short scripted Hebrew transcript through the real `/api/transcript` on the test buyer, then `/processing` ran the real characterize + match pipeline (16 s) and landed on `/results` with 4 matches + 3 near-matches. (This created transcript/profile rows for that test account in the shared DB.)
- `/results` verified with real data, desktop 1440 + mobile 390, no console errors/overflow. Fixed: score badge and gradient fills that stayed light, "details" link contrast.
- `docs/design-impl/results-shot.mjs` re-renders `/results` from a saved `matchResults` (sessionStorage), so no new interviews are needed.

## Phase 2d — /results V2 hero
- New `components/results/ResultsHero.tsx` + `results-hero.css` (scoped `.rh`): giant real Zij score (0–100, tooltip uses the existing hint), project name, unit label, price (`Money`, locale-aware) and up to 4 real attributes, a "how this score is built" panel (overlap + your/seller ranges from `ej/aj/eil/ail`), and a project rail that switches the hero.
- Page logic untouched: offers, group discount, details, retake, mortgage filter, near matches stay in the existing per-project cards below (each now has anchor `#match-<key>`, linked from the hero's "Offer & details"). The old intro only renders when there are no matches.
- Verified with real match data (he, desktop + mobile): no console errors, no overflow. English hero not re-screenshotted (locale persisted as Hebrew for the test account); copy for both languages is in the component.

## Phase 2 — still open
- (done in 2d) V2 results hero. Still open: hover-synced listing imagery (real listings carry no photo field, so the hero is type-led with a gold glow, not a picture).
- `/interview` (full-screen avatar) and `/processing` with a transcript, `/aom/[id]` building/apartment pages with real data, 3D explorer, `/walk`: not visually verified.
- TopNav still has 3 pre-existing eslint `set-state-in-effect` errors (unchanged).
- Recolour ≠ redesign: layouts of offers/deal/groups are the original ones.

## Phase 3 — developer experience (done for the screens a developer account can reach)
- With a user-supplied developer test account (credentials not stored): `/dev` added to the cinematic prefixes; `tokenize.py` applied to `app/dev/dashboard`, `app/dev/admin/approvals`, `components/DevInventory.tsx`, the unit-type page, stage components, pending/rejected. Logic untouched.
- Verified rendered (he; desktop 1440 + mobile 390; no console errors, no overflow): `/dev/dashboard` (projects, expanded inventory table with inline-edit fields, status pills), `/dev/properties/[unitTypeId]` (form, floor-plan SVG preview, rooms/openings tables), `/dev/projects/[id]/stage`. Dense tables stay readable (cream-on-near-black, gold primary actions, red for release/danger).
- NOT verified: `/dev/admin/approvals` (needs an admin account; recoloured mechanically only), the 3D building/stage viewers with real data, `/dev/pending`, English locale on developer screens, new-project flow.
- The floor-plan preview keeps its own light drawing surface (it is an SVG drawing), which reads as a deliberate paper plan on the dark page.
- Recolour, not restructure: the V2 developer prototype's KPI strip / inventory map / approvals queue layouts are NOT built; developer screens keep their current functional layouts.

## Phase 3b — V2 developer layouts (real data)

- `components/dev/DevOverview.tsx` + `dev-overview.css`, shown at the top of `/dev/dashboard`.
- KPI strip: apartments, sold/reserved %, available value (compact ILS), open offers, group requests. Computed from per-apartment statuses when buildings exist, otherwise from unit-type quantities.
- Inventory map: floor rows with one status dot per apartment, project tabs and legend. Read-only; editing stays in the inventory tables.
- Verified: tsc clean, vitest 271/271, Playwright mobile 390 (no console errors, no horizontal overflow), desktop screenshot checked. No new lint errors (the two on the dashboard page predate this change).
- Not built: approvals queue layout, funnel, timeline. Admin approvals needs an admin account.
- Still unverified: English on developer screens and `/results`, 3D explorer, `/aom/[id]`, `/interview`, `/walk`.

### Phase 3c — Approvals queue (admin)

- `/dev/admin/approvals` → Developer approvals tab: status strip with live counts (pending / approved / rejected / all) that doubles as a filter, defaulting to Pending, oldest pending first. No API or approve/reject logic changed.
- Verified: tsc clean, eslint error count unchanged (4, pre-existing). NOT visually verified: needs an admin account, which has not been provided.

### Phase 3d — Deal funnel + activity timeline (developer)

- `components/dev/DevPipeline.tsx` + `dev-pipeline.css`, below the inventory map on `/dev/dashboard`. Real data only: funnel = offers made → signed by developer → signed by buyer → deposit paid; timeline = latest 8 offers and group requests.
- The prototype's "viewed / walked / advisor" buyer funnel needs analytics that are not tracked, so it is intentionally not built.
- Stages are counted independently, so a stage can exceed the previous one when test data has a deposit without signatures (seen on the test account).
- Verified: tsc clean, eslint clean on the new file, vitest passes, Playwright desktop 1440 and mobile 390 (he), no console errors, no horizontal overflow. English layout only checked via desktop run at `en` URL (account locale overrides to Hebrew).

### Phase 3e — English verification of developer screens

- `docs/design-impl/dev-en.mjs` forces English by blocking only the GET of `/api/profile` (so the account's saved Hebrew locale cannot override the cookie); it writes nothing. `overflow.mjs` lists elements wider than the viewport.
- Checked in English (en/ltr) at 1440 and 390: `/dev/dashboard` projects, Reservations and Leverage groups tabs. No horizontal overflow, no real console errors (only the 404s from the blocked profile request).
- Fixed: the available-value KPI showed ₪ in English while all other prices show USD (now converted with the shared rate); "1 members" in the timeline; the dashboard tab bar overflowed to 436px at 390px in English (now scrolls, no wrap).
- Not covered: `/dev/properties/[unitTypeId]` (no unit-type link was reachable on the collapsed project cards), `/dev/admin/approvals` (needs admin), and the existing "1 buyers" string on the groups tab, which is not from this work. Project names stay Hebrew because they are user data.

### Homepage fixes (user feedback)

- "Start interview" now sends guests (no `token`) to `/login` instead of `/interview`; signed-in users still go to `/interview` and unlock audio. Login already routes buyers on to the interview. Checked as a guest with `docs/design-impl/cta-guest.mjs`.
- Apartment section uses `docs/design/section-03-apartment.png` (isometric plan with transparent background), optimised to `public/images/section-03-apartment.webp` (2000px, ~340 KB, from 4.7 MB). Shown contained (no cropping) with a soft glow; caption changed to "Top view · sample apartment". The old room-living render is no longer used on the homepage.

### Phase 2e — /results hero rebuilt to match Concept C V3

- Feedback: the earlier hero did not look like the approved `/design-lab/c2/results`. `components/results/ResultsHero.tsx` + `results-hero.css` now follow it: full-bleed photographic backdrop that crossfades per selected match, serif headline, 01/04 counter, big score, glass "why it matches" panel, and a rail of cards with thumbnails, score and price. Keyboard arrows switch matches.
- Listings have no photos, so the backdrop is an illustrative render from `/buildings/yarkon-v2/room-*.webp` picked deterministically per listing, and the hero says so ("Images are illustrative renderings"). Scores stay on the real 0-100 agreement scale (shown as "/100", not "%").
- Not in the real hero (prototype-only, no real data): "tune weights" sliders, per-criterion light/location/quiet bars, the axonometric plan thumbnail.
- Still the older recoloured layout BELOW the hero: profile block, alerts, mortgage link, per-project match cards, "close to a match", services.

### Phase 2f — /results below the hero restyled to Concept C V3

- `components/results/results-sections.css` (imported by `app/results/page.tsx`). Layout: match cards in the main column, with the profile, alerts and mortgage row in a sticky side column (below the cards on mobile); services and group-buying CTA full width.
- Match cards: glass panels with a hairline gold top edge, serif title, outlined unit pill, large mono score, chip row, thinner alignment bar; near-match cards use the same shell. Logic (offers, leverage, mortgage badge, hidden types) is unchanged; offer panel internals (`SendOfferPanel`) keep their earlier recolour.
- Checked he/en at 1440 and he at 390: no console errors (en shows only the blocked-profile 404s), no horizontal overflow.

### Phase 4 — Concept C V3 across the whole site

- `lib/theme.ts` inverted: the cinematic (dark) theme is now the default for every route; only `/design-system` stays light. This also fixes the 404 page (light nav/footer on unknown paths) and covers `/interview`, `/seller/*`, `/walk/*` and any future route.
- `components/theme/cinematic.css`: one rule set gives every inline-styled card (card colour + 14-20px radius) the V3 glass treatment, turns the old 4px gold top bars into the hairline, and sets page/card h1/h2 to the serif light heading style. Presentation only.
- `/aom/[id]`: photographic hero (illustrative render via `lib/illustrative.ts`, shared with the results hero) when the listing has no 3D building; listings with a building keep the 3D explorer.
- `app/not-found.tsx`: dark, serif, gold button.
- Audit tooling: `docs/design-impl/audit.mjs` (contact sheet of ~18 routes, theme + overflow flags), `multi-shot.mjs`.
- Checked in he and en at 1440 (no overflow, all routes on the dark theme) and `/aom` + `/results` at 390.
- Not visually verified: `/seller/dashboard` (needs a seller account), `/walk/*` (no known slug), `/interview` live session, `/deal/[id]`, admin approvals.

### Phase 2g — /results restructured around the hero (user feedback)

- Hero actions for the selected match: "Reserve at listed price" (the real `SendOfferPanel`, compact, its form/confirmation expand across the hero row), "Property details", "Group discount" (opens the existing leverage modal). A collapsible "Negotiation range" shows the old alignment bar with the suggested-price marker.
- The rail under the hero is the scroller of every project that is a feasible match AND passes the hard filters (rooms, budget, location). The per-project cards below the hero were removed.
- Below the hero: profile (+ interview quota/retake), alerts and mortgage row, near matches, services, group-buying CTA.
- `/aom/[id]`: fixed "Back" pill on every variant. It returns past any history entries the 3D explorer pushed (floor/unit selection), falling back to `/results`.
- Matching maths untouched. Finding recorded: Zij = 2·pfij − eil − ej, which (when the seller's ail ≥ ej, as in all current listings) equals ej − eil. It can never exceed ej (74 here) and ranks listings only by the seller's minimum; location/rooms/budget are pass/fail filters, not part of the score. See chat for details.
