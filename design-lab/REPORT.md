# Haveniq — Design Discovery (branch `design-exploration`, from `clever-volhard` 5908469)

Prototypes: `/design-lab` (index), `/design-lab/{a,b,c}`, `/results`, `/developer`, each with `?lang=he|en`. Everything lives in `app/design-lab/` plus `design-lab/` (screenshots + script). Delete both to remove. No product file was edited. Sample data is labelled "prototype" on every page.

## 1. Assessment of the current design

**What exists.** Next 16 + React 19, Tailwind 4 tokens mapped onto a custom "Quiet Perspective" system (`components/quiet/quiet.css`, ivory `#F5F2EC` / deep teal `#123F40` / brass `#B38B4D`, Heebo everywhere, 16/24 radii, pill primary button). Documented in `docs/DESIGN_SYSTEM.md`. Strong asset base: a coherent set of AI-rendered Yarkon stills (day facade, dusk twin towers off/on, 5 room renders, axonometric + top plan) and a working Three.js building explorer and apartment tour.

**Preserve.** The palette (calm, warm, architectural), Heebo for Hebrew quality, the token discipline, the building explorer and walkthrough (the real differentiator), the Yarkon imagery, the logo wordmark.

**Improve.**
- Hierarchy is flat outside the home hero: every screen uses the same weight-500 Heebo, same card radius, same pill button. Nothing sets a "voice" apart from a tidy SaaS template.
- Typography has no display face. Heebo at 300 weight is elegant in the hero, but there is no secondary face for numerals, scores or captions, so match scores and prices (the most important numbers in the product) look like body text.
- The building explorer (`/aom/...`) puts a glass panel over the render; the panel competes with the image, the legend sits bottom-right on a gradient, and the page title is plain white on the sky. Strong asset, under-composed UI.
- Auth is a generic split screen: form centred in a large empty column, a second Haveniq logo over the photo. Functional but anonymous.
- Navigation switches between three systems (home overlay, app TopNav, explorer bar), so the product feels like three sites.
- Imagery is used as wallpaper (full-bleed heroes) but rarely as content: room stills, plans and axonometrics are not composed into the match or developer screens.
- Dev and buyer-gated screens (`/interview`, `/results`, `/dev/*`) redirect to login without a session, so I could not screenshot them logged-out; the audit of those is from code and `docs`, and needs the user to sign in for a visual pass.

**Redesign.** Match results (the heart of the product: score, why, building, plan, tour in one flow), developer inventory/dashboard (currently list-like), and a unified nav + page-header system.

## 2. Toolchain recommendation (nothing installed; no third-party script was run)

Findings from the public repos (stars/maintenance checked 22 Nov 2026 via the GitHub API; READMEs read, no install scripts executed):

| Tool | What it is | Maintained | Verdict |
|---|---|---|---|
| **emilkowalski/skills** (`emil-design-eng`) | Interaction-polish philosophy skill | Active, MIT | **Already installed** (in `skills-lock.json`, listed in this session). Keep. |
| **pbakaus/impeccable** | Design vocabulary skill: `critique`, `audit`, `polish`, `bolder`, plus a deterministic 62-rule "AI-slop" detector (no LLM) | Very active, Apache-2.0 | **Adopt**. Best fit for review loops on an existing product. Install via `npx impeccable install` only after the user approves and after reading what it writes. |
| **anthropics/skills** (`frontend-design`, `webapp-testing`, `theme-factory`) | Official skills | Active | **Adopt `frontend-design`** (short, no deps) and `webapp-testing`; the rest are unrelated (docx/pdf/etc.). |
| **Leonxlnx/taste-skill** | Art-direction + reference-image + browser-check skill | Active, MIT, very popular, sponsor-driven README | **Optional**. Overlaps impeccable and frontend-design. Evaluate on one screen, do not run both on the same pass. |
| **vercel-labs/agent-skills** (`web-design-guidelines`, `react-best-practices`, `react-view-transitions`) | Review checklists | Active | **Adopt `web-design-guidelines`** as an a11y/UI lint pass and `react-view-transitions` for page and shared-element transitions. Skip deploy skills (we do not deploy via Vercel). |
| **greensock/gsap-skills** | Teaches agents correct GSAP/ScrollTrigger | Active (last push Jul 2026), MIT | **Only for Concept C**. GSAP itself is now free to use; I prototyped the scroll scene with a CSS-variable scroll driver instead, so GSAP is a Phase-2 call. |
| **JaimeJunr/claude-code-frontend-skills** | Bundle of the above in one plugin (10 stars) | Active but tiny | **Skip.** A repackaging of tools we can take directly. |
| **ibelick/motion-primitives** | Framer-Motion based shadcn-style animated components | Slow (last push Sep 2026) | **Skip.** Needs `motion` + Tailwind patterns; the Hebrew/RTL cases are not covered and primitives like text-effects are the generic "AI website" look. |
| **DavidHDev/react-bits** | Large library of animated components (mixed licence: not plain MIT) | Active | **Skip for product UI.** Useful as inspiration for one-off hero effects only; the licence needs checking before copy-paste. |
| **shadcn-ui/ui** | Accessible headless-based component source | Very active, MIT | **Defer.** The repo already has its own token system and component kit; adopting shadcn means two systems. Only worth it for complex primitives (Dialog, Combobox, Sheet) if hand-built ones become a burden. |
| **Playwright** (plugin + `@playwright/test` already a dependency) | Browser automation | Installed | **Use.** All screenshots here come from `design-lab/shots.mjs`. |
| **Figma MCP** (connected) | Read designs, push code to Figma | Installed | **Use later**: `send_code_to_figma` once a direction is chosen, so design review happens in Figma, `get_design_context` to implement from frames. |

**Minimal toolchain:** emil-design-eng (have) + impeccable (review/polish) + anthropics `frontend-design` + vercel `web-design-guidelines` + Playwright + Figma MCP. Add GSAP only if Concept C is chosen. Zero new runtime dependencies for A or B.

## 3. The three concepts

| | A · Architectural Editorial | B · Spatial Intelligence | C · Cinematic Living |
|---|---|---|---|
| Mood | Printed monograph, calm, authoritative | Precise instrument, modern product | Film, evening, emotional |
| Surface | Warm paper, hairline rules, no cards | Cool grey app shell, white panels | Near-black, full-bleed imagery |
| Type | Frank Ruhl Libre (HE + EN serif) display, Heebo body, mono captions | Rubik UI, IBM Plex Mono numerals | Heebo 100-200 display, tracked small caps |
| Colour | Paper `#F3F0E9`, ink, brand teal, brass numerals | Teal, signal green `#1FB5A0`, status colours | `#0A1110`, ivory, gold `#C9A46A` |
| Motion | Clip-path image reveals, underline draws, slow image settle | Pulsing hotspots, live bars, hover lift | Scroll-driven day to dusk to night to interior, drift zoom, glass |
| Home | Giant serif headline + captioned figure, numbered method rows | AI chat beside an interactive building with hotspots + score card, bento | 480vh sticky scene, four chapters |
| Buyer (results) | Ranked editorial list: thumbnail, specs, why, big serif % | 3-pane app: weights, ranked cards with rings, detail panel with plan + breakdown | Immersive: selected home fills screen, snap rail of cards |
| Developer | Project "ledger": figures, hairline table with plan thumbs | Sidebar dashboard: KPIs, floor-by-unit heatmap, funnel, approvals | Presentation-first: hero, launch timeline, unit-type tiles |
| Mobile | Single column, table to rows | Panes stack, cards compact | Snap rail, full-bleed stills, scroll scene retained |
| Strength | Most "premium", the least generic; RTL-native typography; zero dependencies | Strongest for the AI + data story; best for dev tools; clearest | Most memorable and emotional; best showcase of the 3D assets |
| Trade-off | Less "interactive"; heavy dev tables must stay readable | Looks most like a (good) SaaS; risks sameness unless photography stays prominent | Dark mode is poor for data-dense dev screens, heavy images, accessibility of thin type needs care |

## 4. Recommendation

**Lead with A's typography and restraint, B's product structure, and C's single cinematic moment.** Do not ship any one concept whole:
1. **System**: A. Paper/ivory surface, a serif display voice (Frank Ruhl Libre is the only serif here with real Hebrew design), mono captions and tabular numerals for scores/prices, hairlines instead of card stacks. It extends today's ivory/teal/brass tokens instead of replacing them.
2. **Buyer product (results, offers, building/unit)**: B's structure (weights, breakdown bars, plan + axonometric + tour in one detail panel, honest score rings) restyled in A's palette.
3. **Developer**: B's dashboard patterns (inventory heatmap, funnel, approvals), light theme, denser type; C's presentation hero only for the buyer-facing project page.
4. **Home and explorer entry**: one C-style scroll scene (day to night to interior), because it is the brand's signature and uses assets that already exist.

## 5. Implementation plan (proposed; needs approval)

1. **Foundations (1 wk)**: merge tokens (type scale, serif display, mono numerals, hairline/spacing), logical-property audit for RTL, a `Score`, `Figure`, `DataTable`, `Heatmap`, `PageHeader` component set in `components/quiet`. Visual regression baselines with Playwright (he/en × desktop/mobile).
2. **Shell**: one nav/footer system replacing the three variants; mobile menu.
3. **Home**: new hero + scroll scene (CSS-variable driver, reduced-motion fallback), method section.
4. **Buyer**: `/results` (3-pane desktop, stacked mobile), `/buyer/offers`, groups; explorer UI re-composed around the 3D scene (smaller panel, better legend, floor navigator).
5. **Developer**: dashboard, inventory, stage/calibration screens.
6. **Auth, interview, profile**, empty/error states.
7. **Polish pass**: impeccable `audit`, web-design-guidelines, a11y contrast (thin Hebrew weights), performance budget on hero imagery (webp/AVIF, `next/image`).

Open decisions for the user: ship order (buyer-first vs developer-first), whether the serif is acceptable for a Hebrew-first product, whether to commission real photography to replace the AI renders, and approval to install impeccable.

---

# Concept C · Version 2 (chosen direction)

Previews (dev server, port 3001): `/design-lab/c2`, `/design-lab/c2/results`, `/design-lab/c2/developer`, each `?lang=he|en`. Code: `app/design-lab/_c2/` (parts.tsx, c2.tsx, c2.css). Screenshots: `design-lab/shots/v2-*` (d = desktop 1440, m = mobile 390; s0-s4 are scroll states; `-facade`, `-tour`, `-plates`, `-end`, `*-full` full pages). Script: `design-lab/flows.mjs`.

**What changed from V1**
- Type: Frank Ruhl Libre light/regular for display (A's editorial voice), Heebo for UI, Plex Mono tabular for scores, prices and the clock. Hairlines and numbered eyebrows from A; nothing nested in cards except real data panels.
- Home scroll story (520vh): golden hour, dusk, evening, interior, with a live time-of-day clock (17:40 to 21:30), progress track, parallax layers, line-by-line entrance, film grain and vignette. Then advisor conversation (staged chat, score counts up, factor bars), the interactive building, a five-room plate strip, developer teaser, closing CTA.
- Interactive architectural moment: the real twin-tower render becomes the navigator. Hover a floor and the lights turn on at that floor only (clip-revealed lit render over the dark one, with a warm glow); click for its units and status; click a unit for a full-screen apartment tour (five rooms, slow dolly, plan inset, arrow keys and Esc). On mobile the stage pans to the selected tower.
- Buyer results: full-bleed home as the page, oversized thin score, "why it matches" factor bars, plan, and a "Tune weights" control that recomputes every score live (B's information architecture), card rail with arrow-key selection, tour entry.
- Developer dashboard: same building as the inventory map (status dots per floor), animated KPIs, approvals queue (Approve works), buyer funnel, launch path, unit types; slim side rail. Same visual identity as the buyer side, denser data.
- Accessibility and RTL: `.c2[dir]` scoped logical properties, reduced-motion fallback from the lab root, focus-visible rings, dialog semantics, bidi-isolated numerals. Mobile: hamburger menu, stacked panels, 390px verified (no horizontal scroll).

**Not used**: GSAP and Impeccable were not installed (no package or skill install without approval). Scroll story is CSS variables driven by one rAF listener, which is enough here; GSAP ScrollTrigger becomes worthwhile for pinned timelines and scrubbed text if the real page needs more choreography.

**Known limits**: floor bands are calibrated to this one render (8 floors per tower); real projects need per-building calibration (the existing stage tool is the right place). Unit data is fictional. The lit-floor effect depends on a matching dark/lit image pair per building.

---

# Concept C · Version 3 (homepage refinement, final pass: miniature section removed, apartment section reduced to one editorial image)

Preview: `/design-lab/c3?lang=he|en` (V2 untouched: `/design-lab/c2`, its `/results` and `/developer` are reused as-is by V3's links). Code: `app/design-lab/_c3/`. Screenshots: `design-lab/shots/v3-*` (d = desktop, m = mobile; `hero`, `match`, `mini`, `mini2`, `apt1`, `apt2`, `dev`, `end`). Asset decisions: `design-lab/ASSET-BRIEF-V3.md`.

| | V2 | V3 |
|---|---|---|
| Hero | 520vh pinned day-to-night scene, clock, progress track | One realistic full-bleed facade (`hero-desktop.jpg`), native scroll, slow drift plus ~16% parallax, text eases up and fades; no clock, no timeline, native scrollbar untouched |
| Building | Twin-tower render with floor bands | Original single-building 3D architectural model (travertine slabs, tinted glass, staggered balconies, brass plinth edge, abstract trees), built in react-three-fiber with no new assets or packages. Hover or pick a floor to light it; pick an example apartment (highlighted in the model); small info panel. Labelled demonstration building and sample data. Floor buttons make it keyboard- and touch-friendly; rendering pauses off-screen; rotation is disabled on touch so page scroll is never trapped |
| Rooms | "Five rooms. One tour." plate strip | "Feel at home before you visit": one large interior render with a drag wipe (or toggle) to the matched floor plan; room chips swap the interior; keyboard slider |
| Developer | Twin render teaser | Coded dashboard peek (KPIs, status dots, an approval), no building imagery |
| Flow | Scene, advisor, building, rooms, developer, CTA | Hero, matching, building miniature, apartment, developer platform, CTA |

Verified in Playwright: HE/RTL and EN/LTR, desktop 1440 and mobile 390, no console errors. Known limits: the model is intentionally minimal (massing, not a rendered building); under software WebGL in headless Chrome it renders slowly, real GPUs are fine; the plan is the Yarkon top-down render because it is the only one that matches the interior set (a matching vector plan is listed in the asset brief).
