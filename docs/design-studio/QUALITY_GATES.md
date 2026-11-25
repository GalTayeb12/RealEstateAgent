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
