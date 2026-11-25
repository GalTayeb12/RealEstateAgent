# Quality gates

## Asset gates (block publishing)
Dimensions within +-1 cm of spec; origin floor/back-centre; +Z forward; named material slots; UV density in range; triangle budget (hero <=1.5 MB GLB, decor <=400 KB); glTF validator 0 errors; thumbnail approved; license + style tags present; no primitive-box furniture; no visible faceting on curves; bevels present; upholstery has weave/normal detail.

## Visual review checklist (M4, M5, M8, M12; judged by eye on fixed-camera shots)
grounding and contact shadows; shell vs dynamic tone match; texture scale (1 m checker); silhouette smoothness; upholstery detail; exposure and white balance; composition. Pixel-diff is only a regression guard for unchanged pages.

## Performance budgets (label each number "measured (device)" or "estimated (emulation)")
Desktop High >=60 fps; mid mobile Low >=30 fps; furnished scene <=1.2M tris desktop / <=500k mobile; <=350 / <=200 draw calls; first load <=8 MB mobile.

## Results log

### M2 - irradiance proof (2026-11-25) - gate NOT met as pre-registered; accepted with a documented limitation
Shell `yarkon-twin-shell`, preview bake (2048 px, 256 spp, OIDN), 1.63M lit texels, three bakes: base, noise (other seed), alt (recoloured surfaces). Script: `scripts/studio/irradiance-proof.mjs`; raw results in `results/irradiance-*.json`.

| Variant | Albedo luminance (mean) | Lightmap mean change | Median per-texel change | p95 | Rule (fixed beforehand) | Result |
|---|---|---|---|---|---|---|
| noise floor (same materials, other seed) | 0.84 | -0.1% | 1.5% | 10.4% | n/a | |
| moderate (mid oak, warm grey) | 0.84 -> 0.47 (~1.8x darker) | -0.35% | 15.1% | 34.0% | median <= 15%, p95 <= 50% | **fail by 0.1 pt (median); p95 passes** |
| extreme (dark walnut, deep green) | 0.84 -> 0.09 (~9x darker) | -15.6% | 37.4% | 83.7% | median <= 20%, p95 <= 60% | **fail** |

What this establishes:
- **The lightmap stores irradiance, not surface colour.** A 9x albedo drop changed the lightmap mean by only 16%; baked-in colour would have darkened it ~9x.
- **It is not independent of the surrounding colours.** Interior light is mostly bounce light, so very different materials legitimately change the correct lighting. A runtime material swap keeps the original bounce light, so the error grows with the size of the swap: roughly 15% median per texel (about 0.2 stop) for a ~2x swap, 37% for a ~9x swap.
- No choice of bake pass removes this (it is physics, not a bug). Decision: keep the runtime-swap architecture; judge visually in M3/M4 whether typical swaps look right; keep the asynchronous "re-bake lighting for this design" path (M12) as the exact fix for large swaps; consider an approximate bounce correction only if M4 shows visible error.
- The thresholds were NOT loosened after seeing the numbers.

### M2 - shell asset checks (2026-11-25)
- `yarkon-twin-shell`: GLB 1.16 MB, 5,592 triangles, 186 meshes (furnished yarkon-v2: ~25 MB, 1.52M triangles).
- `scripts/studio/check-shell.mts`: 34 `S|<surfaceId>` materials, 0 unknown ids, 0 paintable baseline surfaces without a material (glazing/railing sides are glass and flagged `paintable: false`).
- Visual: loads in the existing viewer unchanged (`/walk/yarkon-twin-shell`, screenshots in `results/m2/`); empty rooms, sun patches, no furniture shadows. Seen on the PREVIEW bake only: soft wavy shading on some wall faces; re-check on the final 4096 px bake in M4.

### M3 - rendering evaluation matrix, first pass (2026-11-25)
Scene: `yarkon-twin-shell` (PREVIEW bake) + 4 Poly Haven test items (not curated; `sofa-03` is an ornate Victorian sofa and fails the art direction by itself). Shots: `results/m3/*.png` (`scripts/studio/shots.mjs`). Judged by eye, one lighting condition (the single baked sun).

| Technique | What was seen | Decision |
|---|---|---|
| No ghost shadows when moving/removing furniture | `living` vs `living-removed` vs `living-moved`: floor clean, no baked furniture shadow (by construction: empty-shell bake + live layer) | **pass** |
| Wall paint swap / floor material swap | `living-wall`, `living-floor`: only the chosen surfaces change, baked light gradient carries through. Flat-colour test materials lose wood grain (expected) | pass for mechanism; real textured materials in M4 |
| Sun direction matches the bake | `strip` vs `strip-empty`: furniture shadows run parallel to the baked mullion shadows | pass |
| Sun shadows of furniture on the lightmapped floor | Works, masked by lightmap luminance so baked shadows are not applied twice. In this apartment direct sun reaches only a ~1 m strip by the glazing (balcony slab shades the rest), so the effect is visible only there | keep (High/Medium); needs a sunnier pilot room to judge strength |
| Contact-shadow decal under furniture | Present but subtle | keep; strengthen/replace with baked per-item AO decals in M4 |
| N8AO (ambient occlusion) | Slightly deeper creases under seats and at leg joints (`ao-compare.png`); cost: uncapped frame time ~1.75x (159 vs 279 fps) and p95 frame 53 ms vs 18 ms | keep on the High tier only; revisit the hitch in M13 |
| Room-specific probe IBL on items | Leather and wood read plausibly in the room light | keep |
| Realtime reflections / glass and polished stone on items | **Not evaluated** (no such asset yet) | M4 |
| Material swaps under different daylight | **Not evaluated**: only one baked sun condition exists. Morning/noon/evening need extra shell bakes or a lighting model | M4 / M12 decision |
| Shell and dynamic tone match | Visually coherent; no luminance measurement yet; sun intensity `2.2` is a first guess, not calibrated | M4 (measure and tune) |

Bugs found and fixed during the pass: overlay `uv1` not declared (use `uv` on a derived geometry); N8AO + multisampled composer + toggling AO left a broken composer (two keyed composers now).

### M3 - performance (desktop MEASURED; headless Edge, ANGLE/D3D11, RTX 4070 laptop, 1920x1080, `next dev`; mobile NOT measured)
`node scripts/studio/bench.mjs http://localhost:3001 --studio --uncapped=1 --tier=<t> --ao=<0|1>`; living room with 4 items.

| Config | FPS (vsync off) | Frame p50 / p95 | Draw calls | Triangles |
|---|---|---|---|---|
| High + AO | 159 | 2.0 / 52.8 ms | 488 | 61k |
| High, no AO | 279 | 1.8 / 18.5 ms | 458 | 58k |
| Medium (no composer) | 493 | 1.6 / 4.5 ms | 441 | 58k |
| Low (no shadows) | 534 | 1.4 / 3.8 ms | 203 | 29k |
| Reference: /walk/yarkon (furnished, baked, vsync off) | 160 | 6.2 / 11.8 ms | 196 | 1.33M |

With vsync on every tier sits at the 144 Hz display cap, so the RTX 4070 cannot discriminate tiers; meaningful tier decisions need a mid-range GPU or a physical phone. Budget status: draw calls above the 350 target on High/Medium (shadow pass doubles the shell's 186 meshes) - merge static shell meshes per material (M13); triangle budget met by a wide margin; GLB 2.1 MB for shell + 4 items (budget 8 MB mobile first load: transferred 4.5 MB).

### M4 (partial) - living-room vertical slice: visual review checklist (2026-11-25)
Shots: `results/m3/{hero,hero-close,sofa-24-close,sofa-34-chaise,sofa-40,finish*}.png`. Scene: PREVIEW shell bake, one baked sun, no reference images were supplied to the session. **The slice proves the pipeline end to end; the art is NOT yet at the premium bar and the M4 "done" condition is not met.**

| Checklist item | Verdict | Notes |
|---|---|---|
| Modular sofa: legal configurations incl. 4.0 m, no stretching | **pass** | `arm-l + 3x seat-120 + arm-r` = 4.0 m rendered from real modules; every module's measured size is within 1.5 cm of its manifest (publish gate); `setModules` reconfigures live; chaise configuration renders |
| Silhouette smoothness | pass | bevelled + subdivided cushions, travertine drums have soft pillowed edges; no visible faceting |
| Texture scale | partial | parquet/plaster/microcement/travertine tile at catalogued real-world sizes and read plausibly; **not** verified against a 1 m checker |
| Upholstery detail | partial | fine linen-like weave and welt piping are visible close up; no stitching, tufting, throw cushions or fabric folds, so it still reads CG-clean |
| Grounding / contact shadows | **fail (weak)** | the AO decal and N8AO give only faint grounding; furniture looks lightly "placed" rather than seated in the room |
| Shell vs dynamic tone match | partial | coherent by eye; no luminance measurement; the realtime sun intensity (2.2) is uncalibrated; direct sun barely reaches the floor in this room |
| Exposure / white balance | partial | calm and neutral but flat and overcast-looking; no direct-sun drama |
| Composition | **fail** | sparse: no rug, lamps, plants, decor, no curated styling; only 4 hero pieces |
| Ghost shadows when moving/removing | pass | by construction (empty-shell bake + live layer), confirmed in screenshots |
| Wall and floor material change | pass | textured floor/wall/microcement swaps apply to exactly the chosen surfaces; lighting carries through (accuracy limited as documented in the M2 proof) |

Library status: 7 models (3 original, 4 Poly Haven test assets - `sofa-03` is ornate and must not ship), 10 materials (5 CC0 textured from ambientCG, 5 flat-colour test materials). Packed textures total about 3 MB.

What is missing for M4 to pass (see PROGRESS.md next steps): final-quality shell bake, rug, floor/pendant lamps, plants and decor, curated armchair, stitching/seam detail, calibrated sun and baked contact decals, a daylight strategy beyond one baked sun, reference images from the owner.

### M4 update (2026-11-25, after the Unreal detour)
Added originals `rug-woven-01` and `floor-lamp-01` (`scripts/blender/studio_decor.py`); removed the Poly Haven test items `sofa-03`, `coffee-table-modern-01`, `side-table-01` from the catalog (art-direction fails). Hero scene (`results/m3/hero.png`): composition improved (rug grounds the seating group, lamp adds a vertical accent) but still sparse (no plants/decor), rug is a flat cool grey with an invisible weave, lighting still flat, grounding still weak. Composition gate: partial (was fail). Premium bar: still not met.
