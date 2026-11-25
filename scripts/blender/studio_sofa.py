"""
Design Studio: original HAVENIQ modular sofa family (procedural, headless).

  blender -b --python studio_sofa.py -- <out.glb>

Modules (each is a top-level glTF node named like the module id in the catalog
manifest, origin at the floor, centred left-right, BACK at y = 0, front toward
+Y in Blender = -Z in glTF):

  arm-l, arm-r       slim track arms        0.20 m wide
  seat-80/100/120    seat modules           0.80 / 1.00 / 1.20 m wide
  chaise             chaise longue end      1.00 m wide, 1.60 m deep

Every module is 0.95 m deep (chaise 1.60), 0.80 m high. Cushions are bevelled
boxes with a subdivision surface (soft, plump silhouettes, no hard box corners);
the legs are slim tapered metal. UVs are in METRES (1 UV unit = 1 m) so the
fabric material can be tiled at its real-world tile size.
Material slots: "sofa_upholstery" (all fabric) and "sofa_legs".
"""
import bpy, bmesh, math, sys, os, json
from mathutils import Vector

OUT = sys.argv[sys.argv.index("--") + 1]
H_TOTAL = 0.80
D = 0.95

for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
for m in list(bpy.data.meshes):
    bpy.data.meshes.remove(m)
col = bpy.data.collections.get("SOFA") or bpy.data.collections.new("SOFA")
if col.name not in bpy.context.scene.collection.children:
    bpy.context.scene.collection.children.link(col)


def material(name, color, rough, metal=0.0, sheen=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = color
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if sheen:
        b.inputs["Sheen Weight"].default_value = sheen
        b.inputs["Sheen Roughness"].default_value = 0.5
    return m


FAB = material("sofa_upholstery", (0.62, 0.60, 0.56, 1.0), 0.88, 0.0, 0.5)
LEG = material("sofa_legs", (0.06, 0.06, 0.065, 1.0), 0.32, 0.85)


def metre_uvs(me):
    """Box-projected UVs in metres: dominant normal axis picks the plane."""
    uv = me.uv_layers.new(name="UVMap")
    for p in me.polygons:
        n = p.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for li in p.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            u, v = {0: (co.y, co.z), 1: (co.x, co.z), 2: (co.x, co.y)}[ax]
            uv.data[li].uv = (u, v)


def soft_box(name, x0, x1, y0, y1, z0, z1, bevel, subd=2, tilt_deg=0.0, mat=FAB, parent=None):
    """Bevelled, subdivided box (plump cushion) built from explicit extents. tilt rotates about the X axis through the bottom-back edge."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(x1 - x0, y1 - y0, z1 - z0), verts=bm.verts)
    bmesh.ops.translate(bm, vec=((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), verts=bm.verts)
    if tilt_deg:
        pivot = Vector(((x0 + x1) / 2, y0, z0))
        bmesh.ops.rotate(bm, cent=pivot, matrix=__import__("mathutils").Matrix.Rotation(math.radians(tilt_deg), 3, "X"), verts=bm.verts)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    col.objects.link(ob)
    bv = ob.modifiers.new("bevel", "BEVEL")
    bv.width = bevel
    bv.segments = 4
    bv.limit_method = "ANGLE"
    ss = ob.modifiers.new("subsurf", "SUBSURF")
    ss.levels = subd
    ss.render_levels = subd
    dg = bpy.context.evaluated_depsgraph_get()
    ev = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), depsgraph=dg)
    ob.modifiers.clear()
    old = ob.data
    ob.data = ev
    bpy.data.meshes.remove(old)
    ev.materials.clear()
    ev.materials.append(mat)
    for p in ev.polygons:
        p.use_smooth = True
    metre_uvs(ev)
    if parent:
        ob.parent = parent
    return ob


def welt(name, x0, x1, y, z, r, parent):
    """Piping: a thin fabric tube along X (the seam between a cushion top and its front face)."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    length = x1 - x0
    bmesh.ops.create_cone(bm, cap_ends=True, segments=10, radius1=r, radius2=r, depth=length)
    bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=__import__("mathutils").Matrix.Rotation(math.radians(90), 3, "Y"), verts=bm.verts)
    bmesh.ops.translate(bm, vec=((x0 + x1) / 2, y, z), verts=bm.verts)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(FAB)
    for p in me.polygons:
        p.use_smooth = True
    metre_uvs(me)
    ob = bpy.data.objects.new(name, me)
    col.objects.link(ob)
    ob.parent = parent
    return ob


def leg(name, x, y, parent, h=0.12):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=20, radius1=0.026, radius2=0.017, depth=h)
    bmesh.ops.translate(bm, vec=(x, y, h / 2), verts=bm.verts)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(LEG)
    for p in me.polygons:
        p.use_smooth = True
    metre_uvs(me)
    ob = bpy.data.objects.new(name, me)
    col.objects.link(ob)
    ob.parent = parent
    return ob


def empty(name):
    e = bpy.data.objects.new(name, None)
    col.objects.link(e)
    return e


def seat_module(name, w, depth=D, back=True):
    root = empty(name)
    hw = w / 2
    # plinth (body) and seat cushion + back cushion
    soft_box(name + "_base", -hw, hw, 0.0, depth, 0.12, 0.30, 0.025, 1, parent=root)
    soft_box(name + "_seat", -hw + 0.004, hw - 0.004, 0.22, depth - 0.005, 0.28, 0.47, 0.055, 2, parent=root)
    welt(name + "_welt_seat", -hw + 0.02, hw - 0.02, depth - 0.012, 0.455, 0.009, root)
    welt(name + "_welt_base", -hw + 0.02, hw - 0.02, depth - 0.003, 0.285, 0.008, root)
    if back:
        soft_box(name + "_back", -hw + 0.004, hw - 0.004, 0.02, 0.27, 0.40, 0.80, 0.07, 2, tilt_deg=-9.0, parent=root)
    for sx in (-1, 1):
        for y in (0.07, depth - 0.07):
            leg(f"{name}_leg_{sx}_{y:.2f}", sx * (hw - 0.07), y, root)
    return root


def arm_module(name, depth=D):
    root = empty(name)
    hw = 0.10
    soft_box(name + "_base", -hw, hw, 0.0, depth, 0.12, 0.30, 0.02, 1, parent=root)
    soft_box(name + "_arm", -hw, hw, 0.0, depth, 0.28, 0.62, 0.05, 2, parent=root)
    for y in (0.07, depth - 0.07):
        leg(f"{name}_leg_{y:.2f}", 0.0, y, root)
    return root


def chaise_module(name, w=1.0, depth=1.60):
    root = empty(name)
    hw = w / 2
    soft_box(name + "_base", -hw, hw, 0.0, depth, 0.12, 0.30, 0.025, 1, parent=root)
    soft_box(name + "_seat", -hw + 0.004, hw - 0.004, 0.22, depth - 0.005, 0.28, 0.47, 0.055, 2, parent=root)
    welt(name + "_welt_seat", -hw + 0.02, hw - 0.02, depth - 0.012, 0.455, 0.009, root)
    soft_box(name + "_back", -hw + 0.004, hw - 0.004, 0.02, 0.27, 0.40, 0.80, 0.07, 2, tilt_deg=-9.0, parent=root)
    for sx in (-1, 1):
        for y in (0.07, depth - 0.07):
            leg(f"{name}_leg_{sx}_{y:.2f}", sx * (hw - 0.07), y, root)
    return root


MODULES = {
    "arm-l": lambda: arm_module("arm-l"),
    "arm-r": lambda: arm_module("arm-r"),
    "seat-80": lambda: seat_module("seat-80", 0.80),
    "seat-100": lambda: seat_module("seat-100", 1.00),
    "seat-120": lambda: seat_module("seat-120", 1.20),
    "chaise": lambda: chaise_module("chaise"),
}
for fn in MODULES.values():
    fn()

bpy.ops.object.select_all(action="DESELECT")
for o in col.objects:
    o.select_set(True)
bpy.context.view_layer.objects.active = next(iter(col.objects))
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=OUT, export_format="GLB", use_selection=True, export_apply=False,
    export_texcoords=True, export_normals=True, export_materials="EXPORT", export_image_format="AUTO",
    export_lights=False, export_cameras=False, export_yup=True)

tris = sum(len(o.data.polygons) for o in col.objects if o.type == "MESH")
print("SOFA", json.dumps({"modules": list(MODULES), "polys": tris}))
