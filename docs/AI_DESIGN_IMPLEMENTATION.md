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

## Phase 2 — remaining (blocked on test account)
`/interview`, `/processing` (with a transcript), `/results`, `/aom/[id]`, `/buyer/offers`, `/buyer/leverage-groups`, `/profile`, `/deal/[offerId]`, TopNav for signed-in buyers. These redirect to `/login` without a session, so they cannot be rendered or verified. `/results` and `/buyer/offers` use ~220 / ~100 hard-coded colours and need real restyling, not just tokens.
