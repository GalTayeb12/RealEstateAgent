# usage (headless): UnrealEditor-Cmd <proj> -ExecutePythonScript="import_glb.py" with env HAV_GLB, HAV_DEST
import unreal, os
glb = os.environ["HAV_GLB"]; dest = os.environ.get("HAV_DEST", "/Game/Imported")
task = unreal.AssetImportTask()
task.filename = glb; task.destination_path = dest
task.automated = True; task.save = True; task.replace_existing = True
unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
print("IMPORT result", [str(p) for p in task.imported_object_paths][:5], "count", len(task.imported_object_paths))
reg = unreal.AssetRegistryHelpers.get_asset_registry()
assets = reg.get_assets_by_path(dest, recursive=True)
kinds = {}
for a in assets: kinds[str(a.asset_class_path.asset_name)] = kinds.get(str(a.asset_class_path.asset_name), 0) + 1
print("IMPORT kinds", kinds)
print("IMPORT sample materials", [str(a.asset_name) for a in assets if "Material" in str(a.asset_class_path.asset_name)][:8])
