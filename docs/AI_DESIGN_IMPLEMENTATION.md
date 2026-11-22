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
