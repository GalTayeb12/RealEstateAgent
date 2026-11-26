"""
Design Studio: original minimalist seating, procedural, headless.

  blender -b --python studio_chairs.py -- <outDir>

  dining-chair-01   Japandi dining chair: solid oak frame, tapered round legs, raked rear legs
                    carrying a curved bent-wood back rail, upholstered seat pad.  ~45 x 50 x 80 cm
  counter-stool-01  counter stool for a 90 cm counter: round upholstered seat at 65 cm,
                    four splayed black-steel legs, footrest ring.                 ~45 x 45 x 65 cm

Catalog contract: real metres, origin on the floor, centred left-right, BACK at y = 0,
front toward +Y (exports to -Z). Material slots by name ("wood" / "metal" and "upholstery"),
UVs in METRES so catalog textures tile at real size. Writes <id>.glb and <id>.json (size).
"""
import bpy, bmesh, math, sys, os, json
from mathutils import Vector, Matrix

OUT = sys.argv[sys.argv.index("--") + 1]
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
for m in list(bpy.data.meshes):
    bpy.data.meshes.remove(m)
col = bpy.data.collections.new("CHAIRS")
bpy.context.scene.collection.children.link(col)


def material(name, rgb, rough, metal=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*rgb, 1.0)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    return m


WOOD = material("wood", (0.62, 0.47, 0.32), 0.55)
UPH = material("upholstery", (0.78, 0.74, 0.67), 0.95)
METAL = material("metal", (0.035, 0.035, 0.037), 0.42, 1.0)


def finish(ob, mat, bevel=0.0, segs=3, subsurf=0):
    """Applies bevel / subdivision, assigns the material, smooth shading."""
    if bevel:
        bv = ob.modifiers.new("bevel", "BEVEL"); bv.width = bevel; bv.segments = segs; bv.limit_method = "ANGLE"
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


def box(name, x0, y0, z0, x1, y1, z1, mat, bevel=0.003, subsurf=0):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(x1 - x0, y1 - y0, z1 - z0), verts=bm.verts)
    bmesh.ops.translate(bm, vec=((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), verts=bm.verts)
    return finish(new_obj(name, bm), mat, bevel, 3, subsurf)


def tube(name, p1, p2, r1, r2, mat, segs=20):
    """Tapered round bar from p1 (radius r1) to p2 (radius r2)."""
    p1, p2 = Vector(p1), Vector(p2)
    d = p2 - p1
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r1, radius2=r2, depth=d.length)
    bmesh.ops.translate(bm, vec=(0, 0, d.length / 2), verts=bm.verts)
    rot = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_matrix().to_4x4()
    bmesh.ops.transform(bm, matrix=Matrix.Translation(p1) @ rot, verts=bm.verts)
    return finish(new_obj(name, bm), mat, min(r1, r2) * 0.35, 2)


def ring(name, centre, radius, r, mat, segs=48, sides=12):
    """Torus lying flat (footrest)."""
    bm = bmesh.new()
    verts = []
    for i in range(segs):
        a = 2 * math.pi * i / segs
        c = Vector((math.cos(a) * radius, math.sin(a) * radius, 0))
        out = Vector((math.cos(a), math.sin(a), 0))
        row = []
        for j in range(sides):
            b = 2 * math.pi * j / sides
            row.append(bm.verts.new(Vector(centre) + c + out * (math.cos(b) * r) + Vector((0, 0, math.sin(b) * r))))
        verts.append(row)
    for i in range(segs):
        for j in range(sides):
            bm.faces.new((verts[i][j], verts[(i + 1) % segs][j], verts[(i + 1) % segs][(j + 1) % sides], verts[i][(j + 1) % sides]))
    return finish(new_obj(name, bm), mat)


def curved_rail(name, y_back, z0, z1, half_w, radius, thick, mat, steps=24):
    """Bent-wood back rail: an arc panel (concave toward the sitter) of given thickness."""
    bm = bmesh.new()
    span = math.asin(min(0.99, half_w / radius))
    inner, outer = [], []
    for i in range(steps + 1):
        a = -span + 2 * span * i / steps
        x, y = radius * math.sin(a), y_back + radius * (1 - math.cos(a))
        nx, ny = math.sin(a), -math.cos(a)  # outward normal (toward the back)
        row = []
        for z in (z0, z1):
            row.append((bm.verts.new((x, y + thick, z)), bm.verts.new((x + nx * 0.0, y, z))))
        inner.append((row[0][0], row[1][0])); outer.append((row[0][1], row[1][1]))
    for i in range(steps):
        a0, a1 = inner[i], inner[i + 1]; b0, b1 = outer[i], outer[i + 1]
        bm.faces.new((a0[0], a1[0], a1[1], a0[1]))      # front face
        bm.faces.new((b0[1], b1[1], b1[0], b0[0]))      # back face
        bm.faces.new((a0[1], a1[1], b1[1], b0[1]))      # top
        bm.faces.new((b0[0], b1[0], a1[0], a0[0]))      # bottom
    bm.faces.new((inner[0][0], inner[0][1], outer[0][1], outer[0][0]))
    bm.faces.new((outer[-1][0], outer[-1][1], inner[-1][1], inner[-1][0]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return finish(new_obj(name, bm), mat, 0.004, 3)


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
    # normalise: centred left-right, floor at 0, back at y = 0 (no scaling)
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

# ── dining chair ─────────────────────────────────────────────────────────────
SEAT_H, HW = 0.465, 0.205  # seat top, half distance between leg centres
parts = []
for sx in (-1, 1):
    parts.append(tube(f"fl{sx}", (sx * HW, 0.425, 0), (sx * HW, 0.415, SEAT_H - 0.06), 0.013, 0.017, WOOD))  # front legs taper down
    parts.append(tube(f"rl{sx}", (sx * HW, 0.07, 0), (sx * (HW - 0.01), 0.02, 0.80), 0.013, 0.016, WOOD))    # raked rear legs to the rail
parts.append(box("apron-f", -HW, 0.400, SEAT_H - 0.09, HW, 0.425, SEAT_H - 0.045, WOOD))
parts.append(box("apron-b", -HW, 0.050, SEAT_H - 0.09, HW, 0.072, SEAT_H - 0.045, WOOD))
for sx in (-1, 1):
    parts.append(box(f"apron-s{sx}", sx * HW - 0.011, 0.06, SEAT_H - 0.09, sx * HW + 0.011, 0.415, SEAT_H - 0.045, WOOD))
parts.append(box("seat", -0.222, 0.035, SEAT_H - 0.05, 0.222, 0.455, SEAT_H, UPH, bevel=0.018, subsurf=1))
parts.append(curved_rail("rail", 0.0, 0.66, 0.80, 0.235, 0.55, 0.018, WOOD))
report["dining-chair-01"] = join_export("dining-chair-01", parts)

# ── counter stool ────────────────────────────────────────────────────────────
S_H, R_TOP, R_FOOT = 0.65, 0.12, 0.205
parts = []
for i in range(4):
    a = math.pi / 4 + i * math.pi / 2
    top = (math.cos(a) * R_TOP, 0.225 + math.sin(a) * R_TOP, S_H - 0.05)
    foot = (math.cos(a) * R_FOOT, 0.225 + math.sin(a) * R_FOOT, 0.0)
    parts.append(tube(f"leg{i}", foot, top, 0.011, 0.011, METAL, 16))
parts.append(ring("foot", (0, 0.225, 0.24), 0.172, 0.008, METAL))
parts.append(tube("plate", (0, 0.225, S_H - 0.055), (0, 0.225, S_H - 0.045), 0.15, 0.15, METAL, 40))
bm = bmesh.new()
bmesh.ops.create_cone(bm, cap_ends=True, segments=48, radius1=0.19, radius2=0.185, depth=0.05)
bmesh.ops.translate(bm, vec=(0, 0.225, S_H - 0.025), verts=bm.verts)
parts.append(finish(new_obj("seat", bm), UPH, 0.02, 4, 1))
report["counter-stool-01"] = join_export("counter-stool-01", parts)

print("CHAIRS", json.dumps(report))
