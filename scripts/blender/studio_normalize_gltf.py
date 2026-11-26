"""
Normalizes downloaded glTF models (Poly Haven CC0) with the same contract as studio_normalize.py.

  blender -b --python studio_normalize_gltf.py -- '{"out": "<dir>", "src": "<dir with <phId>/<phId>.gltf>", "items": [{"id": "sofa-compact-01", "collection": "sofa_02", "rotZ": 180}]}'

Each glTF is imported into a collection named after its Poly Haven id, then the shared normalizer runs.
"""
import bpy, json, os, sys

cfg = json.loads(sys.argv[sys.argv.index("--") + 1])
bpy.ops.wm.read_factory_settings(use_empty=True)
for spec in cfg["items"]:
    name = spec["collection"]
    col = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(col)
    layer = bpy.context.view_layer.layer_collection.children[name]
    bpy.context.view_layer.active_layer_collection = layer
    bpy.ops.import_scene.gltf(filepath=os.path.join(cfg["src"], name, name + ".gltf"))
    # glTF import may leave an empty parent with scale; apply nothing here, the normalizer bakes world matrices

here = os.path.dirname(os.path.abspath(__file__))
exec(compile(open(os.path.join(here, "studio_normalize.py")).read(), "studio_normalize.py", "exec"))
