"""
Design Studio: original table lamps, procedural, headless.

  blender -b --python studio_lamps.py -- <outDir>

  table-lamp-01  Japandi ceramic table lamp: lathe-turned gourd base, brass neck,
                 linen drum shade with a softly glowing inside.       ~34 x 34 x 52 cm
  table-lamp-02  mushroom lamp: opal glass dome on a slim brushed stem and a
                 weighted disc base; the dome glows.                  ~28 x 28 x 36 cm

Catalog contract (same as studio_chairs.py): real metres, origin on the floor, centred,
BACK at y = 0, front toward +Y, material slots by name, UVs in METRES.
"""
import bpy, bmesh, math, sys, os, json
from mathutils import Vector

OUT = sys.argv[sys.argv.index("--") + 1]
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
for m in list(bpy.data.meshes):
    bpy.data.meshes.remove(m)
col = bpy.data.collections.new("LAMPS")
bpy.context.scene.collection.children.link(col)


def material(name, rgb, rough, metal=0.0, emit=None, strength=0.0, transmission=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*rgb, 1.0)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit:
        for key in ("Emission Color", "Emission"):
            if key in b.inputs:
                b.inputs[key].default_value = (*emit, 1.0)
                break
        b.inputs["Emission Strength"].default_value = strength
    return m


BASE = material("base", (0.86, 0.82, 0.74), 0.45)                       # glazed stoneware
BRASS = material("metal", (0.80, 0.62, 0.36), 0.32, 1.0)
SHADE = material("lamp_shade", (0.93, 0.89, 0.82), 0.85, emit=(1.0, 0.86, 0.66), strength=0.6)
OPAL = material("lamp_glass", (0.96, 0.94, 0.90), 0.25, emit=(1.0, 0.84, 0.62), strength=1.4)


def finish(ob, mat, bevel=0.0, subsurf=0):
    if bevel:
        bv = ob.modifiers.new("bevel", "BEVEL"); bv.width = bevel; bv.segments = 3; bv.limit_method = "ANGLE"
    if subsurf:
        ss = ob.modifiers.new("subsurf", "SUBSURF"); ss.levels = subsurf; ss.render_levels = subsurf
    dg = bpy.context.evaluated_depsgraph_get()
    ev = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), depsgraph=dg)
    ob.modifiers.clear()
    old = ob.data; ob.data = ev; bpy.data.meshes.remove(old)
    ev.materials.clear(); ev.materials.append(mat)
    for p in ev.polygons:
        p.use_smooth = True
    return ob


def new_obj(name, bm):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); col.objects.link(ob)
    return ob


def lathe(name, profile, mat, cx=0.0, cy=0.0, segs=64, cap_top=True, cap_bottom=True, bevel=0.0, subsurf=0):
    """Surface of revolution from a (radius, z) profile listed bottom to top."""
    bm = bmesh.new()
    rings = []
    for r, z in profile:
        ring = []
        for i in range(segs):
            a = 2 * math.pi * i / segs
            ring.append(bm.verts.new((cx + math.cos(a) * r, cy + math.sin(a) * r, z)))
        rings.append(ring)
    for k in range(len(rings) - 1):
        for i in range(segs):
            j = (i + 1) % segs
            bm.faces.new((rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]))
    if cap_bottom and profile[0][0] > 1e-4:
        bm.faces.new(list(reversed(rings[0])))
    if cap_top and profile[-1][0] > 1e-4:
        bm.faces.new(rings[-1])
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return finish(new_obj(name, bm), mat, bevel, subsurf)


def shell(name, outer, thick, mat, cx=0.0, cy=0.0, segs=72):
    """Open, thin-walled surface of revolution (a shade): outer profile plus an inner wall `thick` inside, joined at the rims."""
    inner = [(max(r - thick, 0.0), z) for r, z in outer]
    loop = outer + list(reversed(inner)) + [outer[0]]
    return lathe(name, loop, mat, cx, cy, segs, cap_top=False, cap_bottom=False)


def metre_uvs(me):
    uv = me.uv_layers.new(name="UVMap")
    for p in me.polygons:
        n = p.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for li in p.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            uv.data[li].uv = {0: (co.y, co.z), 1: (co.x, co.z), 2: (co.x, co.y)}[ax]


def join_export(item_id, parts):
    bpy.ops.object.select_all(action="DESELECT")
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = item_id
    xs = [v.co.x for v in ob.data.vertices]; ys = [v.co.y for v in ob.data.vertices]; zs = [v.co.z for v in ob.data.vertices]
    off = Vector((-(min(xs) + max(xs)) / 2, -min(ys), -min(zs)))
    for v in ob.data.vertices:
        v.co += off
    metre_uvs(ob.data)
    size = {"w": round(max(xs) - min(xs), 3), "d": round(max(ys) - min(ys), 3), "h": round(max(zs) - min(zs), 3)}
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, item_id + ".glb"), export_format="GLB", use_selection=True, export_apply=False,
                              export_texcoords=True, export_normals=True, export_materials="EXPORT", export_lights=False, export_cameras=False, export_yup=True)
    json.dump({"size": size, "materials": [m.name for m in ob.data.materials], "tris": sum(len(p.vertices) - 2 for p in ob.data.polygons)},
              open(os.path.join(OUT, item_id + ".json"), "w"))
    ob.select_set(False)
    return size


os.makedirs(OUT, exist_ok=True)
report = {}

# ── table-lamp-01: ceramic gourd + linen drum ────────────────────────────────
parts = []
gourd = [(0.055, 0.0), (0.075, 0.006), (0.095, 0.03), (0.105, 0.07), (0.100, 0.11), (0.080, 0.15),
         (0.050, 0.185), (0.032, 0.21), (0.026, 0.235), (0.030, 0.25)]
parts.append(lathe("gourd", gourd, BASE, subsurf=1))
parts.append(lathe("neck", [(0.016, 0.248), (0.016, 0.30), (0.010, 0.30), (0.010, 0.36)], BRASS, segs=32))
parts.append(lathe("harp", [(0.006, 0.355), (0.006, 0.37)], BRASS, segs=24))
drum = [(0.170, 0.30), (0.168, 0.40), (0.150, 0.52)]  # a slightly tapered drum
parts.append(shell("shade", drum, 0.004, SHADE))
for z in (0.302, 0.518):  # thin brass rims top and bottom
    r = 0.170 if z < 0.4 else 0.150
    parts.append(lathe(f"rim{z}", [(r + 0.0015, z - 0.002), (r + 0.0015, z + 0.002)], BRASS, segs=72, cap_top=False, cap_bottom=False))
report["table-lamp-01"] = join_export("table-lamp-01", parts)

# ── table-lamp-02: mushroom, opal dome ───────────────────────────────────────
parts = []
parts.append(lathe("disc", [(0.090, 0.0), (0.095, 0.004), (0.095, 0.014), (0.088, 0.02), (0.0, 0.02)], BRASS, segs=64, bevel=0.0))
parts.append(lathe("stem", [(0.010, 0.019), (0.009, 0.20), (0.0, 0.20)], BRASS, segs=32))
dome = []
for i in range(19):
    a = math.pi / 2 * i / 18
    dome.append((0.14 * math.cos(a) if i < 18 else 0.0, 0.20 + 0.15 * math.sin(a)))
dome.insert(0, (0.135, 0.195))  # a softly turned-in lip
parts.append(lathe("dome", dome, OPAL, segs=72, cap_bottom=True, subsurf=1))
report["table-lamp-02"] = join_export("table-lamp-02", parts)

print("LAMPS", json.dumps(report))
