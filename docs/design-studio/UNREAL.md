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
