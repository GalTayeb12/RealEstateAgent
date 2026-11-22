# Concept C V3 — asset inspection and brief

## What exists (inspected)
- **Renders (raster):** Yarkon twin towers (`public/buildings/yarkon-v2/off|on.webp`), five interior renders and an axonometric plus top plan of one apartment (`room-*.webp`, `apt-axo.webp`, `apt-top.webp`, all the same Yarkon unit), a day-time facade and skyline (`public/images/hero-desktop.jpg`, `section-01-city.jpg`, `section-05-developers.jpg`), a terrace at golden hour (`cta-living-room.jpg`), a portrait (`section-02-advisor.jpg`).
- **3D:** `public/buildings/seed-yarkon-towers.glb` (the twin towers again) and per-unit `apartment.glb` for the walkthrough engine. No single-building model exists.
- **Plans:** vector `plan.svg` for three unit types (real, Hebrew labels, from the pipeline). They do not match the Yarkon interior renders, so they are not paired with them in V3.
- **Environment maps:** `public/hdri/venice_sunset_1k.hdr` (reused for the miniature's reflections).

## Decisions
| Section | Decision | Why |
|---|---|---|
| Hero | Reuse `hero-desktop.jpg` (facade, planted terraces, skyline, golden hour). Calm drift plus scroll parallax. | Best realistic architectural image available; it is not the twin-tower pair. |
| Single-building miniature | **Procedural 3D (react-three-fiber, already a dependency), built in code.** No raster, no new package. | Needs per-floor hover/selection and a different building from the twin towers. A raster cannot light individual floors for a new building; CSS/SVG isometric looks flatter and cannot rotate; a custom render needs a pipeline and per-floor masks. Procedural gives a premium "architectural model" look (travertine slabs, tinted glass, brass edge on the selected floor) with real reflections from the existing HDRI, ~0 asset weight. |
| Apartment preview | Reuse the Yarkon interior renders and the matched top plan (`apt-top.webp`) from the same unit. Drag wipe between room and plan. | The only interior set that has a matching plan. |
| Developer section | Coded dashboard peek (no imagery). | Avoids a third use of the twin towers. |

Nothing existing was modified. Miniature data is fictional and labelled "Demonstration building · sample data".

## Brief for a future bespoke asset (optional upgrade, not needed to approve V3)
If the miniature is later replaced by an authored render, it must be:
1. **One** residential building (not a pair), 8-12 floors, rectilinear massing with staggered balconies, travertine/limestone slabs and dark-bronze framing, planted roof terrace.
2. Presented as an **architectural model**: matte warm-white material, tinted glass, on a dark plinth with a thin brass edge; soft dusk key light; no people, no cars, abstract trees only.
3. Delivered as a **GLB** (<1.5 MB, Draco/meshopt) with one named node per floor (`floor_01`..`floor_NN`) and a separate glass material per floor, so the same hover/select code works; or as a PNG/WebP set (`dark` + `lit` pair, 2720x1536, transparent background) plus a per-floor mask JSON.
4. Same colour language as Concept C: ivory `#EFE9DC`, gold `#C9A46A`, ink `#070C0B`.
5. For the apartment preview: a **vector plan that matches the interior render set** (same unit, labelled in both languages, ivory sheet, 1:50), plus the five interior renders at 2720x1536.
