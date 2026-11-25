# Haveniq Redesign — Stage 0: Inventory & Audit

> Read-only. Nothing in the site was changed. Brief: `docs/HAVENIQ-REDESIGN-PROMPT.md`.
> Method: code scan + rendered check of `/`, `/results` (empty state) and `/login` at 800px, Hebrew/RTL.
> Not checked visually: screens behind login (buyer, seller, deal, dev, profile) and English/LTR. They were audited from code only.

## Audit Health Score

| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Accessibility | 3 | Gold section numbers ("05") at 13px measure 2.80:1 against the background |
| 2 | Performance | 3 | The whole home page is a client component (`"use client"`, 452 lines), so the hero waits for JS |
| 3 | Theming | 1 | ~840 hard-coded hex values and ~1,300 inline `style={{}}` across 7 large screens |
| 4 | Responsive | 2 | 77 physical left/right properties vs 33 logical ones in a bilingual RTL/LTR app |
| 5 | Implementation integrity | 1 | Two parallel styling systems, a generic landing template, and stats that look invented |
| **Total** | | **10/20** | **Acceptable: significant work needed** |

## Implementation integrity verdict: FAIL

The product has two separate visual systems:

1. **`components/quiet` (`qp-` classes):** used by home, auth, profile, seller dashboard, dev register, properties.
2. **Inline styles with raw hex:** used by `results` (182 hex), `deal/[offerId]` (108), `dev/dashboard` (127), `dev/admin/approvals` (148), `buyer/offers` (96), `buyer/leverage-groups` (71).

The most-used values are the same palette typed by hand (`#123F40` ×108, `#526563` ×94, `#756039` ×39), so a new palette cannot reach these screens by changing tokens. **This is the main technical blocker for the redesign.**

The home page follows the common AI landing template: photo hero + headline + two CTAs, alternating image/text rows, a check-mark list, a four-number stat row, and a closing CTA. Nothing on it is specific to Haveniq, even though the product has a real building with lit floors and real 3D tours.

## Findings by severity

### P1 (major)

- **[P1] Hard-coded palette in 7 screens**
  - Location: `app/results/page.tsx`, `app/deal/[offerId]/page.tsx`, `app/dev/dashboard/page.tsx`, `app/dev/admin/approvals/page.tsx`, `app/buyer/offers/page.tsx`, `app/buyer/leverage-groups/page.tsx`.
  - Category: Theming.
  - Impact: These screens will keep the old look after the rebrand.
  - Fix: Move the styles to tokens and shared components before restyling (stage 2).
- ~~[P1] Stats that read as invented~~
  - **Resolved:** the owner confirmed the home stats ("+12,000", "×3", "+40", "100%", "92%") are real. Keep them, and present them as evidence, not decoration.
- **[P1] Two styling systems**
  - Location: `qp-` classes vs inline styles.
  - Category: Integrity.
  - Impact: Every change has to be made twice, and drift is guaranteed.
  - Fix: One component layer only.

### P2 (minor)

- **[P2] Low-contrast gold labels**
  - Location: home section numbers and eyebrow text (13px, 2.80:1).
  - Category: Accessibility. Standard: WCAG 1.4.3.
- **[P2] Physical directions in a bilingual app**
  - Location: 77 uses of `marginLeft`/`right:` and similar.
  - Category: Responsive.
  - Impact: Layout risk when the site switches to English/LTR. Not verified visually.
- **[P2] Home page is fully client-rendered**
  - Location: `app/page.tsx`.
  - Category: Performance.
  - Fix: A server shell, with client islands only where motion needs them.
- **[P2] Clickable `<div>`s**
  - Location: 2 places (`grep "<div[^>]*onClick"`).
  - Category: Accessibility.
  - Impact: Not keyboard-reachable.

### P3 (polish)

- **[P3] One font for everything**
  - Heebo is used for all text. Cormorant is loaded but did not render in any heading. Display typography has no voice.

## Patterns & systemic issues

- The palette is typed by hand in about 840 places. The token sweep (`fce056c`) covered only the `qp-` screens.
- The home page ignores the strongest assets the product has: the GLB building, the lit-floor renders and the walk.

## The deleted "night-to-morning" attempt (`3067392`, deleted in `1d072f4`)

- **What it was:**
  - Fonts: Bellefair, Frank Ruhl Libre and Noto Serif Hebrew.
  - Glass panels everywhere, gold *gradient* buttons, and 3–4-layer shadows.
  - Day and night tokens.
- **Why it most likely failed:**
  1. It lived only on `/design-system` and never reached a real screen.
  2. Glass, gradient buttons and heavy shadows are the "luxury AI" cliché.
  3. Day/night was a token switch, not a story the user moves through.
- **Lessons for this redesign:**
  - The new world must be applied to real screens from the first stage.
  - The time-of-day must be driven by scroll and tied to the building.
  - No glass-as-default and no gradient buttons.

## What works (keep)

- `prefers-reduced-motion` handled in 17 places, and `:focus-visible` styles exist.
- Every `<img>` has `alt`.
- Strong photography assets in `docs/design/` and `public/buildings/`.
- `components/quiet` already gives one place to swap the look for half the screens.

## Recommended actions

1. **[P1] Unify the styling layer:** tokens and shared components for the 7 inline-hex screens (stage 2).
2. **[P1] Replace the invented stats** with real data, or remove them (needs the owner's decision).
3. **[P1] New visual world + `DESIGN.md`:** `$impeccable shape`, then 3 directions (stage 1).
4. **[P2] Home page rebuild:** a server shell with motion islands (stage 3).
5. **[P2] Convert physical directions to logical properties** while restyling each screen.
6. **Final:** `$impeccable polish`.
