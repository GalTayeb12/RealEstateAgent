import unreal
print("PROBE engine", unreal.SystemLibrary.get_engine_version())
for n in ["PixelStreaming2", "Interchange", "PythonScriptPlugin"]:
    print("PROBE plugin", n)
print("PROBE gltf factory:", [c for c in dir(unreal) if "GLTF" in c.upper()][:12])
print("PROBE rhi", unreal.SystemLibrary.get_platform_user_name() != "")
