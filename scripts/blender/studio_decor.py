"""Design Studio: original rug and arc floor lamp (procedural, headless).
  blender -b --python studio_decor.py -- <outDir>
rug-woven-01 2.4 x 1.7 x 0.02 m (rounded corners); floor-lamp-01 0.40 x 0.40 x 1.70 m.
Origin at the floor, centred left-right, back at y = 0, UVs in metres. Slots: rug -> "rug_fabric";
lamp -> "lamp_metal" (stem/base) and "lamp_shade"."""
import bpy, bmesh, math, sys, os, json
from mathutils import Matrix
OUT = sys.argv[sys.argv.index("--") + 1]
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
for m in list(bpy.data.meshes): bpy.data.meshes.remove(m)
col = bpy.data.collections.new("DECOR"); bpy.context.scene.collection.children.link(col)
def mat(n, c, r, m=0.0):
    x = bpy.data.materials.new(n); x.use_nodes = True
    b = next(k for k in x.node_tree.nodes if k.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = c; b.inputs["Roughness"].default_value = r; b.inputs["Metallic"].default_value = m
    return x
RUG = mat("rug_fabric", (0.78, 0.74, 0.68, 1), 0.95); MET = mat("lamp_metal", (0.55, 0.45, 0.3, 1), 0.3, 1.0)
SHADE = mat("lamp_shade", (0.93, 0.9, 0.84, 1), 0.8)
def uvs(me):
    uv = me.uv_layers.new(name="UVMap")
    for p in me.polygons:
        n = p.normal; ax = max(range(3), key=lambda i: abs(n[i]))
        for li in p.loop_indices:
            c = me.vertices[me.loops[li].vertex_index].co
            u, v = {0: (c.y, c.z), 1: (c.x, c.z), 2: (c.x, c.y)}[ax]; uv.data[li].uv = (u, v)
def obj(name, bm, mats):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for m in mats: me.materials.append(m)
    for p in me.polygons: p.use_smooth = True
    uvs(me); ob = bpy.data.objects.new(name, me); col.objects.link(ob); return ob
def finish(ob, mods):
    for kind, kw in mods:
        m = ob.modifiers.new(kind.lower(), kind)
        for k, v in kw.items(): setattr(m, k, v)
    dg = bpy.context.evaluated_depsgraph_get()
    ev = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), depsgraph=dg)
    mats = list(ob.data.materials); ob.modifiers.clear(); old = ob.data; ob.data = ev; bpy.data.meshes.remove(old)
    ev.materials.clear()
    for m in mats: ev.materials.append(m)
    for p in ev.polygons: p.use_smooth = True
    while len(ev.uv_layers): ev.uv_layers.remove(ev.uv_layers[0])
    uvs(ev)
# rug
bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
bmesh.ops.scale(bm, vec=(2.4, 1.7, 0.02), verts=bm.verts); bmesh.ops.translate(bm, vec=(0, 0.85, 0.01), verts=bm.verts)
rug = obj("rug-woven-01", bm, [RUG]); finish(rug, [("BEVEL", dict(width=0.006, segments=2, limit_method="ANGLE")), ("SUBSURF", dict(levels=1, render_levels=1))])
# lamp: base disc, stem, dome shade
bm = bmesh.new()
bmesh.ops.create_cone(bm, cap_ends=True, segments=40, radius1=0.17, radius2=0.17, depth=0.02); bmesh.ops.translate(bm, vec=(0, 0.2, 0.01), verts=bm.verts)
st = bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=0.012, radius2=0.012, depth=1.35); bmesh.ops.translate(bm, vec=(0, 0.2, 0.02 + 0.675), verts=st["verts"])
lamp_metal = obj("lamp_metal_part", bm, [MET])
bm = bmesh.new(); sp = bmesh.ops.create_uvsphere(bm, u_segments=40, v_segments=20, radius=0.2)
bmesh.ops.scale(bm, vec=(1, 1, 0.8), verts=bm.verts); bmesh.ops.translate(bm, vec=(0, 0.2, 1.55), verts=bm.verts)
shade = obj("lamp_shade_part", bm, [SHADE])
bpy.ops.object.select_all(action="DESELECT")
for o in (lamp_metal, shade): o.select_set(True)
bpy.context.view_layer.objects.active = lamp_metal; bpy.ops.object.join()
lamp = bpy.context.view_layer.objects.active; lamp.name = "floor-lamp-01"
os.makedirs(OUT, exist_ok=True); rep = []
for o in (rug, lamp):
    bpy.ops.object.select_all(action="DESELECT"); o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, o.name + ".glb"), export_format="GLB", use_selection=True, export_apply=False,
        export_texcoords=True, export_normals=True, export_materials="EXPORT", export_image_format="AUTO", export_yup=True)
    rep.append(o.name)
print("DECOR", json.dumps(rep))
