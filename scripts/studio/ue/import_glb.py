# headless: env HAV_GLB="a.glb;b.glb" -> /Game/<root>/<stem>/...  (HAV_ROOT default /Game/Imported)
import unreal, os
root = os.environ.get("HAV_ROOT", "/Game/Imported")
tasks = []
for p in os.environ["HAV_GLB"].split(";"):
    t = unreal.AssetImportTask()
    t.filename = p; t.destination_path = root + "/" + os.path.splitext(os.path.basename(p))[0]
    t.automated = True; t.save = True; t.replace_existing = True
    tasks.append(t)
unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks(tasks)
reg = unreal.AssetRegistryHelpers.get_asset_registry()
for t in tasks:
    kinds = {}
    for a in reg.get_assets_by_path(t.destination_path, recursive=True):
        k = str(a.asset_class_path.asset_name); kinds[k] = kinds.get(k, 0) + 1
    print("IMPORT", t.destination_path, kinds)
meshes = [str(a.asset_name) for a in reg.get_assets_by_path(root + "/sofa-modular-01", recursive=True) if "StaticMesh" in str(a.asset_class_path.asset_name)]
print("IMPORT sofa meshes", meshes)
