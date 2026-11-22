# Haveniq — Concept C production implementation

Branch: `implement/concept-c` (from `design-exploration`, which holds the approved lab at `/design-lab/c3`, `/design-lab/c2/results`, `/design-lab/c2/developer`).
Nothing pushed or merged.

## Current phase
Phase One (homepage + design foundation) — **done, awaiting approval**. Phases Two (buyer) and Three (developer) not started.

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
