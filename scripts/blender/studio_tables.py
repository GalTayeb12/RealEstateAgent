"""
Design Studio: original travertine drum tables (organic modern), procedural, headless.

  blender -b --python studio_tables.py -- <outDir>

  coffee-drum-01   0.90 m dia, 0.36 m high, softly pillowed edges
  side-drum-01     0.45 m dia, 0.46 m high

Origin at the floor, centred, BACK of the footprint at y = 0 (the footprint is a
circle, so the centre sits at y = radius). Front toward +Y. One material slot,
"travertine", with UVs in METRES. Triangle budget is kept low: rings + subdivision.
"""
import bpy, bmesh, math, sys, os, json

OUT = sys.argv[sys.argv.index("--") + 1]
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
for m in list(bpy.data.meshes):
    bpy.data.meshes.remove(m)
col = bpy.data.collections.new("TABLES")
bpy.context.scene.collection.children.link(col)

TRAV = bpy.data.materials.new("travertine")
TRAV.use_nodes = True
b = next(n for n in TRAV.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
b.inputs["Base Color"].default_value = (0.87, 0.80, 0.68, 1.0)
b.inputs["Roughness"].default_value = 0.35


def metre_uvs(me):
    uv = me.uv_layers.new(name="UVMap")
    for p in me.polygons:
        n = p.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for li in p.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            u, v = {0: (co.y, co.z), 1: (co.x, co.z), 2: (co.x, co.y)}[ax]
            uv.data[li].uv = (u, v)


def drum(name, dia, h, bevel):
    r = dia / 2
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=48, radius1=r, radius2=r, depth=h)
    bmesh.ops.translate(bm, vec=(0, r, h / 2), verts=bm.verts)  # back of the circle at y = 0, base at z = 0
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    col.objects.link(ob)
    bv = ob.modifiers.new("bevel", "BEVEL")
    bv.width = bevel
    bv.segments = 6
    bv.limit_method = "ANGLE"
    ss = ob.modifiers.new("subsurf", "SUBSURF")
    ss.levels = 1
    ss.render_levels = 1
    dg = bpy.context.evaluated_depsgraph_get()
    ev = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), depsgraph=dg)
    ob.modifiers.clear()
    old = ob.data
    ob.data = ev
    bpy.data.meshes.remove(old)
    ev.materials.clear()
    ev.materials.append(TRAV)
    for p in ev.polygons:
        p.use_smooth = True
    metre_uvs(ev)
    return ob


os.makedirs(OUT, exist_ok=True)
report = []
for name, dia, h, bev in (("coffee-drum-01", 0.90, 0.36, 0.07), ("side-drum-01", 0.45, 0.46, 0.05)):
    ob = drum(name, dia, h, bev)
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(OUT, name + ".glb"), export_format="GLB", use_selection=True, export_apply=False,
        export_texcoords=True, export_normals=True, export_materials="EXPORT", export_image_format="AUTO",
        export_lights=False, export_cameras=False, export_yup=True)
    report.append((name, len(ob.data.polygons)))
    ob.select_set(False)
print("TABLES", json.dumps(report))
