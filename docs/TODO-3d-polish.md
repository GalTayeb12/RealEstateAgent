# 3D Building — Visual Polish Backlog

Items to address in a future iteration. **Do not fix now.**

## Geometry & Materials

- **Trees clipping into buildings** — enforce minimum distance from building walls during tree placement in `build_tower.py`
- **Road/path materials** — currently rendered with a purple/lavender tint; replace with neutral asphalt or stone pavement (`(0.22, 0.22, 0.22)` concrete, `(0.35, 0.33, 0.30)` limestone)
- **Facade hue shift** — front glass curtain walls pick up a pink/lavender cast in WebGL vs Blender preview; audit tone-mapping (`ACESFilmicToneMapping`) and color-space conversion pipeline

## Lighting & Environment

- **HDRI swap** — `kloppenheim_02_2k.hdr` (mountains/desert) is wrong for Tel Aviv; replace with an urban or coastal Mediterranean HDRI (e.g. `venice_sunset` or a custom Yarkon River panorama)
- **Lightmap baking** — per-object Cycles COMBINED bake was skipped (13 h estimate at 2048×2048); revisit with smaller textures (512 px), atlas packing, or a real-time AO pass as a compromise

## Architecture Detail

- **Balcony slabs floating** — balcony geometry is not connected to the floor slab or facade; add edge-to-edge connection geometry in `build_tower.py`
- **Penthouse crown** — visual distinction for penthouse floor (setback, taller parapet, roof terrace hint)

## Pipeline

- **Mobile GLB variant** — `compress.mjs` mobile path requires `sharp`; install or replace with `@squoosh/lib` and re-enable the `--mobile` flag
