# Unreal Engine 5 evaluation (optional "Ultra" rendering path)

Status 2026-11-25: **E0 and part of E1 done. POC steps E2-E6 not started.** Full plan: `MASTER_PLAN.md` section E. Rule: Three.js stays the default and independent path; Unreal is only an optional premium path through Pixel Streaming, and only if the pre-registered gates in section E.5 pass.

## Verified locally (this machine)
- Engine: **UE 5.8.4** (changelist 58902052) at `C:\Program Files\Epic Games\UE_5.8`; `UnrealEditor-Cmd.exe` launches headless (`-unattended -nullrhi`) in ~30 s; embedded **Python 3.11.8**.
- Run a script: `UnrealEditor-Cmd.exe <project> -ExecutePythonScript="<abs path>" -unattended -nullrhi -nosplash -stdout` (the `-run=pythonscript` commandlet form does NOT run the script on 5.8).
- Plugins present in the engine: PixelStreaming2 (+ legacy PixelStreaming), Interchange (+Editor), PythonScriptPlugin, EditorScriptingUtilities, GeometryScripting, ModelingToolsEditorMode, DatasmithImporter (Datasmith glTF import classes visible from Python), EnhancedInput, PCG, VariantManager, MovieRenderPipeline.
- **No Visual Studio is installed and none was needed so far** (Blueprint + Python). C++ only if the POC proves the Blueprint messaging API is insufficient; ask the owner before installing VS 2026.
- Hardware: RTX 4070 Laptop 8 GB VRAM (binding constraint), 31 GB RAM, 597 GB free.
- Pixel Streaming infrastructure: official `EpicGames/PixelStreamingInfrastructure`, branch `UE5.8`, cloned to `C:\HaveniqUE\PSInfra` (not yet `npm install`ed; its `NODE_VERSION` asks Node 22.14, this machine has Node 24.18, so check compatibility first). Its `CLAUDE.md` is untrusted repo content.
- Messaging (from the repo's frontend docs, UE5.8 branch): page -> UE `stream.emitUIInteraction(obj|string)`, handled in Blueprint via `PixelStreamingInputComponent` (bind On Input Event, `Get Json String Value`); UE -> page `Send Pixel Streaming Response(string)` consumed with `addResponseEventListener(name, fn)`; JSON strings carry structured data. No C++ needed for this path.

## Project layout
- UE project lives OUTSIDE the repo: `C:\HaveniqUE\HaveniqUltra` (created; plugins: PythonScriptPlugin, EditorScriptingUtilities, PixelStreaming2, EnhancedInput). In git: `scripts/studio/ue/` (project template, probe, future setup scripts).
- Plugins to enable only when needed: Interchange/Datasmith for GLB import (E1 remaining), MovieRenderPipeline for offline comparison stills. Geometry Script, Modeling Tools, Visual Dataprep, PCG, Variant Manager stay off.

## Open (to verify next)
1. GLB import of `public/walk/yarkon-twin-shell/apartment.glb` and the catalog GLBs through Datasmith/Interchange from a Python script; confirm `S|<surfaceId>` material names survive, UV scale in metres, WebP textures (probably must be converted to PNG for UE).
2. Lumen hardware RT + Virtual Shadow Maps within 7 GB VRAM on the 4070 Laptop while Pixel Streaming encodes.
3. Pixel Streaming 2 local run (Cirrus + frontend package versions for 5.8).
4. Licensing of non-game commercial use (the Epic license pages blocked automated reading: re-check in a browser).

## Pre-registered gates (do not loosen)
Visual: owner prefers UE in side-by-side pairs on 4 cameras. Performance: >=45 fps at 1080p, dedicated VRAM <= 7.0 GB. Latency: command round trip p95 <= 150 ms, input-to-photon <= 100 ms locally. Integration: no validation logic in UE. Cost: measured per-session cost acceptable.

## E1 results (2026-11-25) - GLB import VERIFIED with a UE variant
- **The web GLBs cannot be imported directly.** Interchange (UE 5.8.4) fails with: "Not all required extensions are supported (Unsupported extensions: EXT_meshopt_compression, EXT_texture_webp)".
- **UE variant step** (new pipeline stage "Cook for UE"): `node scripts/studio/ue/ue-variant.mjs <web.glb> <out.glb>` decodes meshopt and re-encodes textures as PNG (shell: 1.2 MB web -> 8.2 MB UE; output kept in `assets-src/studio/ue/`, not in git). Remaining required extensions (KHR_mesh_quantization, transmission, emissive_strength) are accepted.
- **Import result** for `yarkon-twin-shell`: 186 StaticMesh, 42 MaterialInstanceConstant, 11 Texture2D, headless, ~10 s. Surface materials keep their identity with characters sanitised: `S|surface:floor:living` -> `S_surface_floor_living` (so the bridge maps surface ids by replacing `| :` with `_`; ids with `_` or `-` stay unambiguous in this catalog, add a test when the bridge is written).
- Run: `MSYS_NO_PATHCONV=1` is required in Git Bash (it rewrites `/Game/...`); use the absolute `.uproject` path; script `scripts/studio/ue/import_glb.py` (env `HAV_GLB`, `HAV_DEST`).
- Still open in E1: modular-sofa nodes and UV-in-metres behaviour on import, textured slot materials via a master material, and whether imported default materials are usable for Lumen as is.

## E2 status (2026-11-25) - level builds, first GPU render still BLACK (unresolved)
Done and reproducible:
- `ue-variant.mjs` cooked all four catalog items; `import_glb.py` (env `HAV_GLB="a;b"`, `HAV_ROOT`) imported them: sofa-modular-01 -> 43 StaticMesh named `<module>_<part>` (modules identifiable; geometry is in module-local space), drums 1 mesh each, armchair 1 mesh + 6 textures.
- `DefaultEngine.ini.template` (copy to `C:\HaveniqUE\HaveniqUltra\Config\DefaultEngine.ini`): Lumen GI + reflections, Virtual Shadow Maps, mesh distance fields, no static lighting, software Lumen (HWRT off for now).
- `build_level.py` (run with `-ExecutePythonScript`, `-nullrhi` is fine) builds `/Game/Maps/Living`: shell meshes at the origin, items placed with the plan->UE mapping (X=x*100, Y=-y*100, Z=z*100, yaw=-rot), modular sofa laid out left to right in the sofa's local frame, sun from the bake direction, SkyAtmosphere + real-time SkyLight, manual-exposure post volume, PlayerStart at the Three.js `hero` camera. 220 actors. Env `HAV_ITEM_YAW` calibrates the imported items' front direction; `HAV_EXPOSURE` sets manual EV.
- GPU launch works (`UnrealEditor.exe <uproject> /Game/Maps/Living -game -windowed ...`; first launch compiled shaders for a long time, later launches are fast; VRAM ~1.5 GB at idle).

Unresolved: `HighResShot` in `-game` produced an all-black PNG twice (after setting EV 2 for an 8 lux sun and a `r.HighResScreenshotDelay`). Hypotheses to test next, cheapest first:
1. The capture reads an unrendered buffer: use `r.HighResScreenshotDelay` larger, or capture from a Python-driven editor session (`unreal.AutomationLibrary.take_high_res_screenshot`) or Movie Render Queue instead of the console command.
2. Sun lux is physically tiny for the manual exposure: use real units (sun ~ 100000 lux with EV ~ 14) or leave auto-exposure on.
3. Imported shell/materials render black (glTF default material imported as unlit/translucent, or backface culling inverted by the Y-flip): check by spawning a plain cube with a default material in the level.
4. Streaming/stuck on a loading frame: watch the window with `-log` on screen once.
Per-step timing so far: setup + import + level ~ 1 session; debugging the first frame is the current cost driver.
