"""
Shared Blender helpers for the apartment generators: collections, the material
library (Poly Haven PBR re-mapped to object space + flat solids) and box /
cylinder primitives in plan metres.

Used by twin_build.py / twin_furnish.py (generated from a plan twin). The
hand-built Yarkon scripts (apartment_shell.py / apartment_walk.py) define the
same materials inline; materials() below is their union, so a twin build and
the Yarkon build share one look.

Import from a script run inside Blender:
    import sys; sys.path.insert(0, SCRIPTS_DIR); import apt_lib as L
"""
import math
import bpy
import bmesh
from mathutils import Matrix, Vector


class Ctx:
    """Where new objects go and the section height (CUT) above which boxes are clipped."""
    col = None
    cut = 99.0


ctx = Ctx()


# ── collections ──────────────────────────────────────────────────────────────
def fresh_collection(name):
    col = bpy.data.collections.get(name)
    if col:
        for o in list(col.objects):
            bpy.data.objects.remove(o, do_unlink=True)
    else:
        col = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(col)
    return col


# ── materials ────────────────────────────────────────────────────────────────
def solid(name, color, rough=0.5, metal=0.0, sheen=0.0, transmission=0.0, ior=1.45, alpha=1.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    b.inputs["Sheen Weight"].default_value = sheen
    b.inputs["Transmission Weight"].default_value = transmission
    b.inputs["IOR"].default_value = ior
    b.inputs["Alpha"].default_value = alpha
    return m


def pbr(name, scale=1.0, rough=None, flat_color=None):
    """Poly Haven material re-mapped to object space + box projection (metres).
    flat_color replaces the colour texture with a flat paint (glTF can't carry a tint node)."""
    m = bpy.data.materials.get(name)
    if m is None:
        return solid(name + "_fallback", flat_color or (0.8, 0.8, 0.8))
    nt = m.node_tree
    tc = next((n for n in nt.nodes if n.type == "TEX_COORD"), None)
    mp = next((n for n in nt.nodes if n.type == "MAPPING"), None)
    if tc and mp:
        for l in list(mp.inputs["Vector"].links):
            nt.links.remove(l)
        nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
        mp.inputs["Scale"].default_value = (scale, scale, scale)
    for n in nt.nodes:
        if n.type == "TEX_IMAGE":
            n.projection = "BOX"
            n.projection_blend = 0.25
    m.displacement_method = "BUMP"
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    if flat_color is not None:
        for l in list(bsdf.inputs["Base Color"].links):
            nt.links.remove(l)
        bsdf.inputs["Base Color"].default_value = (*flat_color, 1)
        if nt.nodes.get("tint"):
            nt.nodes.remove(nt.nodes["tint"])
    if rough is not None and bsdf.inputs["Roughness"].links:
        nt.links.remove(bsdf.inputs["Roughness"].links[0])
        bsdf.inputs["Roughness"].default_value = rough
    return m


def srgb(h):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c)


def emissive(name, color=(1.0, 0.78, 0.55), strength=6.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (1, 0.85, 0.65, 1)
    b.inputs["Emission Color"].default_value = (*color, 1)
    b.inputs["Emission Strength"].default_value = strength
    return m


def materials():
    """The Yarkon material set (apartment_shell.py M + apartment_walk.py extras)."""
    return {
        "floor":    pbr("laminate_floor_02", scale=0.35),
        "oak":      pbr("oak_veneer_01", scale=0.8),
        "marble":   pbr("marble_01", scale=0.45, rough=0.18),
        "tile":     pbr("marble_01", scale=0.45, rough=0.18),
        "bathfloor": solid("bath_stone", srgb("e4ddd1"), rough=0.35),
        "plaster":  pbr("painted_plaster_wall", scale=0.4, flat_color=srgb("eeebe5")),
        "linen":    pbr("rough_linen", scale=2.5),
        "white":    solid("wall_white", srgb("f3f0ea"), rough=0.85),
        "glass":    solid("glass", (0.9, 0.95, 1.0), rough=0.02, transmission=1.0, ior=1.5),
        "frame":    solid("frame_black", srgb("1d1d1f"), rough=0.35, metal=0.6),
        "steel":    solid("steel", srgb("b8b8b8"), rough=0.25, metal=1.0),
        "porcelain": solid("porcelain", srgb("f7f6f2"), rough=0.12),
        "stone":    solid("stone_light", srgb("d9d2c6"), rough=0.4),
        "fabric_beige": solid("fabric_beige", srgb("d6cbbb"), rough=0.9, sheen=0.4),
        "fabric_sand":  solid("fabric_sand", srgb("bfae96"), rough=0.9, sheen=0.4),
        "fabric_white": solid("fabric_white", srgb("efece6"), rough=0.85, sheen=0.5),
        "fabric_sage":  solid("fabric_sage", srgb("9aa38f"), rough=0.9, sheen=0.4),
        "rug":      solid("rug_wool", srgb("cfc6b8"), rough=1.0, sheen=0.6),
        "deck":     pbr("grey_oak_veneer_01", scale=0.5),
        "black":    solid("matte_black", srgb("222222"), rough=0.6),
        "screen":   solid("tv_screen", srgb("0a0a0a"), rough=0.08),
        "mirror":   solid("mirror", (0.9, 0.9, 0.9), rough=0.02, metal=1.0),
        "ceiling":  solid("ceiling_white", srgb("f4f2ee"), rough=0.9),
        "lacquer":  solid("lacquer_greige", srgb("cfc8bc"), rough=0.35),
        "lacquer_dark": solid("lacquer_charcoal", srgb("3a3a3a"), rough=0.4),
        "brass":    solid("brushed_brass", srgb("b8935a"), rough=0.3, metal=1.0),
        "led":      emissive("led_warm"),
        "clear_glass": solid("shower_glass", (0.95, 0.97, 0.97), rough=0.03, transmission=1.0, ior=1.5),
        "quartz":   solid("quartz_white", srgb("eeebe4"), rough=0.22),
        "water":    solid("water", (0.85, 0.92, 0.95), rough=0.0, transmission=1.0, ior=1.33),
    }


# ── primitives ───────────────────────────────────────────────────────────────
def _link(ob, mat, props):
    (ctx.col or bpy.context.scene.collection).objects.link(ob)
    if mat is not None:
        ob.data.materials.append(mat)
    for k, v in (props or {}).items():
        ob[k] = v
    return ob


def box(name, x1, y1, z1, x2, y2, z2, mat, bevel=0.0, props=None):
    """Axis-aligned box from two corners (any order), real vertex coords in metres."""
    x1, x2 = sorted((x1, x2))
    y1, y2 = sorted((y1, y2))
    z1, z2 = sorted((z1, z2))
    if z1 >= ctx.cut or x2 - x1 < 1e-4 or y2 - y1 < 1e-4 or z2 - z1 < 1e-4:
        return None
    z2 = min(z2, ctx.cut)
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x = x1 if v.co.x < 0 else x2
        v.co.y = y1 if v.co.y < 0 else y2
        v.co.z = z1 if v.co.z < 0 else z2
    bm.to_mesh(me)
    bm.free()
    ob = _link(bpy.data.objects.new(name, me), mat, props)
    if bevel > 0:
        b = ob.modifiers.new("bevel", "BEVEL")
        b.width = bevel
        b.segments = 3
        b.limit_method = "ANGLE"
    for p in ob.data.polygons:
        p.use_smooth = bevel > 0
    return ob


def obox(name, p, q, off1, off2, z1, z2, mat, props=None):
    """Box along the 2D segment p→q, from offset off1 to off2 along its left normal.
    Works for walls at any angle (axis-aligned ones give the same mesh as box())."""
    ux, uy = q[0] - p[0], q[1] - p[1]
    L = math.hypot(ux, uy)
    if L < 1e-4 or z2 - z1 < 1e-4 or z1 >= ctx.cut:
        return None
    if abs(ux) < 1e-9 or abs(uy) < 1e-9:
        nx, ny = -uy / L, ux / L
        xs = [p[0] + nx * off1, p[0] + nx * off2, q[0] + nx * off1, q[0] + nx * off2]
        ys = [p[1] + ny * off1, p[1] + ny * off2, q[1] + ny * off1, q[1] + ny * off2]
        return box(name, min(xs), min(ys), z1, max(xs), max(ys), z2, mat, props=props)
    ux, uy = ux / L, uy / L
    nx, ny = -uy, ux
    z2 = min(z2, ctx.cut)
    corners = [(p[0] + nx * o, p[1] + ny * o) for o in (off1, off2)] + [(q[0] + nx * o, q[1] + ny * o) for o in (off2, off1)]
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    vs = [bm.verts.new((x, y, z)) for z in (z1, z2) for x, y in corners]
    for f in ([0, 1, 2, 3], [7, 6, 5, 4], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]):
        bm.faces.new([vs[i] for i in f])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    return _link(bpy.data.objects.new(name, me), mat, props)


def prism(name, poly, z1, z2, mat, props=None):
    """Vertical extrusion of a 2D polygon (floors, ceilings, slabs of any room shape)."""
    if z1 >= ctx.cut:
        return None
    z2 = min(z2, ctx.cut)
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    vs = [bm.verts.new((x, y, z1)) for x, y in poly]
    f = bm.faces.new(vs)
    bmesh.ops.recalc_face_normals(bm, faces=[f])
    if f.normal.z > 0:
        f.normal_flip()
    r = bmesh.ops.extrude_face_region(bm, geom=[f])
    top = [v for v in r["geom"] if isinstance(v, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=(0, 0, z2 - z1), verts=top)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    return _link(bpy.data.objects.new(name, me), mat, props)


def cyl(name, x, y, z1, z2, r, mat, verts=32, props=None):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=verts, radius1=r, radius2=r, depth=z2 - z1,
                          matrix=Matrix.Translation((x, y, (z1 + z2) / 2)))
    bm.to_mesh(me)
    bm.free()
    ob = _link(bpy.data.objects.new(name, me), mat, props)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def subsurf(ob, lv=2):
    m = ob.modifiers.new("subsurf", "SUBSURF")
    m.levels = m.render_levels = lv
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def join(objs, name):
    """Join meshes into one object (keeps materials)."""
    objs = [o for o in objs if o is not None]
    if not objs:
        return None
    with bpy.context.temp_override(active_object=objs[0], selected_editable_objects=objs, selected_objects=objs):
        bpy.ops.object.join()
    objs[0].name = name
    return objs[0]


class Frame:
    """Local furniture frame: origin on a wall face, u along the wall, v into the room.
    Only multiples of 90° (axis-aligned rooms), so boxes stay axis-aligned."""

    def __init__(self, ox, oy, ux, uy):
        self.o = (ox, oy)
        self.u = (round(ux), round(uy))
        self.v = (-self.u[1], self.u[0])

    def pt(self, a, b):
        return (self.o[0] + self.u[0] * a + self.v[0] * b, self.o[1] + self.u[1] * a + self.v[1] * b)

    def box(self, name, a1, b1, z1, a2, b2, z2, mat, bevel=0.0, props=None):
        p, q = self.pt(a1, b1), self.pt(a2, b2)
        return box(name, p[0], p[1], z1, q[0], q[1], z2, mat, bevel=bevel, props=props)

    def cyl(self, name, a, b, z1, z2, r, mat, verts=32):
        p = self.pt(a, b)
        return cyl(name, p[0], p[1], z1, z2, r, mat, verts)

    def rot_deg(self):
        """Z rotation (deg) that turns an asset facing -Y to face +v (into the room)."""
        return math.degrees(math.atan2(self.v[0], -self.v[1]))


def enable_gpu():
    """Cycles on the GPU in background mode (prefs aren't applied without the UI)."""
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
    except KeyError:
        return "CPU"
    for kind in ("OPTIX", "CUDA", "HIP", "ONEAPI", "METAL"):
        try:
            prefs.compute_device_type = kind
        except TypeError:
            continue
        prefs.get_devices()
        devs = [d for d in prefs.devices if d.type == kind]
        if devs:
            for d in prefs.devices:
                d.use = d.type == kind
            bpy.context.scene.cycles.device = "GPU"
            return kind
    bpy.context.scene.cycles.device = "CPU"
    return "CPU"
