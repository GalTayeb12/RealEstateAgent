"""
Design Studio asset normalizer (pipeline v0).

Takes furniture collections from a .blend (the Poly Haven CC0 assets inside the
base apartment.blend) and writes one raw GLB per item with the catalog contract:

  * real-world metres, modifiers applied, transforms applied
  * origin at the floor, centred left-right, BACK of the item at y = 0
  * the front of the item faces +Y (Blender), so with glTF +Y-up export it points
    to -Z, which the viewer maps to plan +y (see lib/studio/schema/ids.ts docs)
  * one GLB per item, plus <id>.json with bounding box and material slot names

  blender -b apartment.blend --python studio_normalize.py -- '<json>'
  json: {"out": "<dir>", "items": [{"id": "sofa-03", "collection": "sofa_03", "rotZ": 180}]}

rotZ rotates the asset about the vertical axis BEFORE normalizing, so assets
modelled facing -Y (the Blender default front) can be turned to face +Y.
"""
import bpy, json, os, sys, math
from mathutils import Matrix, Vector

cfg = json.loads(sys.argv[sys.argv.index("--") + 1])
OUT = cfg["out"]
os.makedirs(OUT, exist_ok=True)
sc = bpy.context.scene


def realize(col, rot_z):
    """Evaluated, world-space copies of every mesh in the collection (origin = collection instance offset)."""
    dg = bpy.context.evaluated_depsgraph_get()
    off = Matrix.Translation(-Vector(col.instance_offset))
    rot = Matrix.Rotation(math.radians(rot_z), 4, "Z")
    made = []
    for o in col.all_objects:
        if o.type != "MESH":
            continue
        ev = o.evaluated_get(dg)
        me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=dg)
        if not me.polygons:
            bpy.data.meshes.remove(me)
            continue
        ob = bpy.data.objects.new(o.name, me)
        me.transform(rot @ off @ o.matrix_world)
        made.append(ob)
    return made


def bounds(objs):
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for ob in objs:
        for v in ob.data.vertices:
            for i in range(3):
                lo[i] = min(lo[i], v.co[i])
                hi[i] = max(hi[i], v.co[i])
    return lo, hi


report = []
for spec in cfg["items"]:
    col = bpy.data.collections[spec["collection"]]
    objs = realize(col, spec.get("rotZ", 0))
    lo, hi = bounds(objs)
    # floor at z = 0, centred in x, back (min y) at y = 0
    shift = Vector((-(lo.x + hi.x) / 2, -lo.y, -lo.z))
    tmp = bpy.data.collections.new("STUDIO_TMP")
    sc.collection.children.link(tmp)
    mats = []
    for ob in objs:
        ob.data.transform(Matrix.Translation(shift))
        tmp.objects.link(ob)
        for m in ob.data.materials:
            if m and m.name not in mats:
                mats.append(m.name)
    dims = [hi.x - lo.x, hi.y - lo.y, hi.z - lo.z]
    bpy.ops.object.select_all(action="DESELECT")
    for ob in objs:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    path = os.path.join(OUT, spec["id"] + ".glb")
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=True, export_apply=True,
        export_texcoords=True, export_normals=True, export_materials="EXPORT",
        export_image_format="AUTO", export_lights=False, export_cameras=False, export_yup=True)
    json.dump({"id": spec["id"], "collection": spec["collection"], "dims": {"w": dims[0], "d": dims[1], "h": dims[2]},
               "materials": mats, "meshes": len(objs)}, open(os.path.join(OUT, spec["id"] + ".json"), "w"), indent=1)
    report.append((spec["id"], [round(d, 3) for d in dims], len(objs), mats))
    for ob in objs:
        bpy.data.objects.remove(ob, do_unlink=True)
    bpy.data.collections.remove(tmp)

for r in report:
    print("ITEM", json.dumps(r))
