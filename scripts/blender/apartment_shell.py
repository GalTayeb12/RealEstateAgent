"""
Seed Yarkon — 4-room apartment (≈127 m² + balcony), built in Blender for
top-down / axonometric architectural renders.

Run inside Blender (via the blender-mcp socket or Blender's text editor).
Rebuilds the "APT" collection from scratch on every run; imported Poly Haven
assets live in the "ASSETS" collection and are placed by apartment_furnish.py.

Units: metres. Facade (glass) on y = 0, balcony y < 0, back wall y = 8.5.
"""
import bpy, bmesh
from mathutils import Vector

H = 2.8          # wall height
EXT = 0.25       # exterior wall thickness
INT = 0.12       # interior wall thickness
W, D = 15.0, 8.5 # apartment footprint
BAL = 2.2        # balcony depth
CUT = globals().get("CUT", 1.2)  # section height: everything above is cut away (dollhouse view)


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

APT = fresh_collection("APT")


# ── materials ────────────────────────────────────────────────────────────────
def pbr(name, scale=1.0, tint=None, rough=None):
    """Poly Haven material re-mapped to object space + box projection (metres)."""
    m = bpy.data.materials.get(name)
    if m is None:
        return solid(name + "_fallback", (0.8, 0.8, 0.8))
    nt = m.node_tree
    tc = next(n for n in nt.nodes if n.type == "TEX_COORD")
    mp = next(n for n in nt.nodes if n.type == "MAPPING")
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
    if tint is not None and nt.nodes.get("tint"):
        nt.nodes["tint"].inputs[7].default_value = (*tint, 1)   # re-run: already wired
    elif tint is not None:
        img = bsdf.inputs["Base Color"].links[0].from_node if bsdf.inputs["Base Color"].links else None
        if img and img.type == "TEX_IMAGE":
            mix = nt.nodes.get("tint") or nt.nodes.new("ShaderNodeMix")
            mix.name = "tint"
            mix.data_type = "RGBA"
            mix.blend_type = "MULTIPLY"
            mix.inputs["Factor"].default_value = 1.0
            mix.inputs[7].default_value = (*tint, 1)
            nt.links.new(img.outputs["Color"], mix.inputs[6])
            nt.links.new(mix.outputs[2], bsdf.inputs["Base Color"])
    if rough is not None and bsdf.inputs["Roughness"].links:
        nt.links.remove(bsdf.inputs["Roughness"].links[0])
        bsdf.inputs["Roughness"].default_value = rough
    return m


def solid(name, color, rough=0.5, metal=0.0, sheen=0.0, transmission=0.0, ior=1.45, alpha=1.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    b.inputs["Sheen Weight"].default_value = sheen
    b.inputs["Transmission Weight"].default_value = transmission
    b.inputs["IOR"].default_value = ior
    b.inputs["Alpha"].default_value = alpha
    return m


def srgb(h):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c)


M = {
    "floor":    pbr("laminate_floor_02", scale=0.35),
    "parquet":  pbr("rectangular_parquet", scale=0.5),
    "oak":      pbr("oak_veneer_01", scale=0.8),
    "greyoak":  pbr("grey_oak_veneer_01", scale=0.6),
    "marble":   pbr("marble_01", scale=0.45, rough=0.18),
    "terrazzo": pbr("terrazzo_tiles", scale=0.6),
    "bathfloor": solid("bath_stone", srgb("e4ddd1"), rough=0.35),
    "plaster":  pbr("painted_plaster_wall", scale=0.4, tint=(0.97, 0.95, 0.92)),
    "linen":    pbr("rough_linen", scale=2.5, tint=(0.95, 0.93, 0.9)),
    "white":    solid("wall_white", srgb("f3f0ea"), rough=0.85),
    "cap":      solid("wall_cap", srgb("2b2b2b"), rough=0.9),
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
    "deck":     pbr("grey_oak_veneer_01", scale=0.5, tint=(0.85, 0.8, 0.72)),
    "black":    solid("matte_black", srgb("222222"), rough=0.6),
    "screen":   solid("tv_screen", srgb("0a0a0a"), rough=0.08),
    "mirror":   solid("mirror", (0.9, 0.9, 0.9), rough=0.02, metal=1.0),
}


# ── geometry helpers ─────────────────────────────────────────────────────────
def box(name, x1, y1, z1, x2, y2, z2, mat, bevel=0.0, col=APT):
    """Axis-aligned box from min/max corners, real vertex coords (object coords = metres).
    Clipped at CUT so the model reads as an architectural section from above."""
    if z1 >= CUT:
        return None
    z2 = min(z2, CUT)
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x = x1 if v.co.x < 0 else x2
        v.co.y = y1 if v.co.y < 0 else y2
        v.co.z = z1 if v.co.z < 0 else z2
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    col.objects.link(ob)
    ob.data.materials.append(mat)
    if bevel > 0:
        b = ob.modifiers.new("bevel", "BEVEL")
        b.width = bevel
        b.segments = 3
        b.limit_method = "ANGLE"
    for p in ob.data.polygons:
        p.use_smooth = bevel > 0
    return ob


def cyl(name, x, y, z1, z2, r, mat, verts=48):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=z2 - z1, location=(x, y, (z1 + z2) / 2))
    ob = bpy.context.active_object
    ob.name = name
    for c in ob.users_collection:
        c.objects.unlink(ob)
    APT.objects.link(ob)
    ob.data.materials.append(mat)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return ob


def wall_x(y, x1, x2, t=INT, gaps=(), mat=None, h=H):
    """Wall running along x at y (centre line), with door/window gaps [(a, b), ...]."""
    mat = mat or M["white"]
    cuts = sorted(gaps)
    a = x1
    for g1, g2 in cuts + [(x2, x2)]:
        if g1 > a:
            box(f"wall_x_{y:.2f}_{a:.2f}", a, y - t / 2, 0, g1, y + t / 2, h, mat)
        a = max(a, g2)


def wall_y(x, y1, y2, t=INT, gaps=(), mat=None, h=H):
    mat = mat or M["white"]
    a = y1
    for g1, g2 in sorted(gaps) + [(y2, y2)]:
        if g1 > a:
            box(f"wall_y_{x:.2f}_{a:.2f}", x - t / 2, a, 0, x + t / 2, g1, h, mat)
        a = max(a, g2)


def window_x(y, x1, x2, sill=0.0, top=H):
    """Glazing in a gap of a wall along x (exterior back wall)."""
    box("win_glass", x1, y - 0.01, sill, x2, y + 0.01, top, M["glass"])
    box("win_frame_b", x1, y - 0.04, sill, x2, y + 0.04, sill + 0.05, M["frame"])
    box("win_frame_t", x1, y - 0.04, top - 0.05, x2, y + 0.04, top, M["frame"])


# ── floors ───────────────────────────────────────────────────────────────────
rooms = {
    # name: (x1, y1, x2, y2, material)
    "living":   (0.0, 0.0, 8.2, 4.6, "floor"),
    "kitchen":  (3.2, 4.6, 7.0, 8.5, "floor"),
    "corridor": (7.0, 3.4, 8.2, 8.5, "floor"),
    "bed3":     (0.0, 4.6, 3.2, 8.5, "floor"),
    "master":   (8.2, 0.0, 15.0, 4.6, "floor"),
    "bed2":     (8.2, 4.6, 11.2, 8.5, "floor"),
    "bath":     (11.2, 4.6, 15.0, 8.5, "bathfloor"),
}
for n, (x1, y1, x2, y2, m) in rooms.items():
    box(f"floor_{n}", x1, y1, -0.05, x2, y2, 0.0, M[m])

# slab under everything + balcony deck
box("slab", -EXT, -BAL, -0.35, W + EXT, D + EXT, -0.05, M["stone"])
box("balcony_deck", 0, -BAL, -0.05, W, 0, 0.0, M["deck"])


# ── exterior walls ───────────────────────────────────────────────────────────
back = D + EXT / 2
# back wall with windows: bed3, kitchen, entry door, bed2, bath
wall_x(back, -EXT, W + EXT, t=EXT, gaps=[(0.6, 2.6), (3.6, 4.6), (7.25, 8.0), (8.8, 10.6), (12.2, 14.4)], mat=M["plaster"])
for a, b in [(0.6, 2.6), (3.6, 4.6), (8.8, 10.6), (12.2, 14.4)]:
    window_x(back, a, b, sill=0.9)
box("entry_door", 7.25, D + 0.02, 0, 8.0, D + 0.08, 2.2, M["oak"])
wall_y(-EXT / 2, 0, D, t=EXT, mat=M["plaster"])
wall_y(W + EXT / 2, 0, D, t=EXT, mat=M["plaster"])

# front: floor-to-ceiling glass with slim mullions + sliding doors
for x in [0.0, 2.6, 5.2, 8.2, 11.4, 15.0]:
    box(f"mullion_{x}", x - 0.03, -0.04, 0, x + 0.03, 0.04, H, M["frame"])
box("facade_glass", 0, -0.01, 0, W, 0.01, H, M["glass"])
box("facade_sill", 0, -0.05, 0, W, 0.05, 0.03, M["frame"])

# balcony glass railing + posts
box("rail_glass", 0, -BAL, 0, W, -BAL + 0.02, 1.05, M["glass"])
box("rail_top", 0, -BAL - 0.01, 1.03, W, -BAL + 0.03, 1.07, M["steel"])


# ── interior walls ───────────────────────────────────────────────────────────
wall_x(4.6, 0.0, 3.2, gaps=[(2.25, 3.1)])                 # bed3 front (door)
wall_y(3.2, 4.6, 8.5)                                     # bed3 | kitchen
wall_y(7.0, 6.0, 8.5)                                     # kitchen | corridor
wall_y(8.2, 0.0, 8.5, gaps=[(3.55, 4.45), (5.2, 6.05)])   # corridor | master, bed2
wall_x(4.6, 8.2, 15.0, gaps=[(11.9, 12.75)])              # master back (bath door)
wall_y(11.2, 4.6, 8.5)                                    # bed2 | bath

# door leaves (open, thin oak slabs)
box("door_bed3", 3.08, 4.66, 0, 3.12, 5.5, 2.2, M["oak"])
box("door_master", 8.26, 2.7, 0, 8.3, 3.55, 2.2, M["oak"])
box("door_bed2", 8.26, 6.05, 0, 8.3, 6.9, 2.2, M["oak"])
box("door_bath", 12.75, 4.66, 0, 12.79, 5.5, 2.2, M["oak"])


# ── kitchen ──────────────────────────────────────────────────────────────────
kz = 0.9
box("k_base", 3.35, 7.86, 0.1, 6.85, 8.44, kz - 0.04, M["oak"], bevel=0.004)
box("k_plinth", 3.35, 7.9, 0, 6.85, 8.4, 0.1, M["black"])
box("k_top", 3.3, 7.82, kz - 0.04, 6.9, 8.46, kz, M["marble"], bevel=0.003)
box("k_tall", 6.2, 7.86, 0, 6.85, 8.44, 2.4, M["oak"], bevel=0.004)          # fridge column
box("k_shelf", 3.6, 8.2, 1.45, 5.9, 8.44, 1.49, M["oak"], bevel=0.003)
box("k_sink", 4.15, 7.96, kz - 0.18, 4.85, 8.32, kz + 0.002, M["steel"])
cyl("k_tap", 4.5, 8.36, kz, kz + 0.32, 0.015, M["steel"])
box("k_hob", 5.2, 7.95, kz, 5.95, 8.35, kz + 0.006, M["screen"])
# island
box("island", 3.9, 6.1, 0.0, 6.4, 7.05, kz - 0.04, M["oak"], bevel=0.005)
box("island_top", 3.82, 6.05, kz - 0.04, 6.48, 7.1, kz, M["marble"], bevel=0.004)

# ── bathroom ─────────────────────────────────────────────────────────────────
# freestanding tub (rounded via bevel) by the window
tub = box("tub", 12.5, 7.2, 0, 14.3, 8.05, 0.58, M["porcelain"], bevel=0.12)
box("tub_water", 12.62, 7.32, 0.4, 14.18, 7.93, 0.5, solid("water", (0.85, 0.92, 0.95), rough=0.0, transmission=1.0, ior=1.33))
box("vanity", 11.28, 5.2, 0.35, 11.83, 6.9, 0.85, M["oak"], bevel=0.004)
box("vanity_top", 11.26, 5.15, 0.85, 11.86, 6.95, 0.88, M["marble"], bevel=0.003)
for yy in (5.6, 6.45):
    box(f"basin_{yy}", 11.4, yy - 0.22, 0.86, 11.75, yy + 0.22, 0.89, M["porcelain"], bevel=0.02)
box("bath_mirror", 11.27, 5.25, 1.1, 11.29, 6.85, 1.9, M["mirror"])
box("shower_tray", 13.92, 4.7, 0, 14.95, 6.1, 0.02, M["bathfloor"])
box("shower_screen", 13.9, 4.7, 0, 13.92, 6.1, 0.03, M["frame"])
box("toilet", 14.55, 6.35, 0.0, 14.95, 6.9, 0.42, M["porcelain"], bevel=0.08)

# ── beds & built-ins ─────────────────────────────────────────────────────────
def bed(name, x1, y1, x2, y2, head_side, base_mat=None, duvet=None):
    """Platform bed + mattress + duvet + pillows. head_side: 'N','S','E','W'."""
    base_mat = base_mat or M["oak"]
    duvet = duvet or M["fabric_white"]
    box(f"{name}_base", x1, y1, 0.0, x2, y2, 0.3, base_mat, bevel=0.01)
    box(f"{name}_mattress", x1 + 0.04, y1 + 0.04, 0.3, x2 - 0.04, y2 - 0.04, 0.52, M["fabric_white"], bevel=0.05)
    hb = {"N": (x1, y2 - 0.08, x2, y2), "S": (x1, y1, x2, y1 + 0.08),
          "E": (x2 - 0.08, y1, x2, y2), "W": (x1, y1, x1 + 0.08, y2)}[head_side]
    box(f"{name}_headboard", hb[0], hb[1], 0.0, hb[2], hb[3], 1.05, M["fabric_sand"], bevel=0.02)
    # duvet covers the foot 2/3, folded throw at the foot
    if head_side in "NS":
        span = (y2 - y1)
        dy1, dy2 = (y1, y2 - span * 0.3) if head_side == "N" else (y1 + span * 0.3, y2)
        box(f"{name}_duvet", x1 + 0.02, dy1 + 0.02, 0.5, x2 - 0.02, dy2, 0.6, duvet, bevel=0.05)
        ty = dy1 + 0.1 if head_side == "N" else dy2 - 0.55
        box(f"{name}_throw", x1 + 0.0, ty, 0.6, x2, ty + 0.45, 0.63, M["fabric_sage"], bevel=0.02)
        n = 2 if (x2 - x1) > 1.3 else 1
        for i in range(n):
            px = x1 + (x2 - x1) * (i + 0.5) / n
            py = y2 - 0.35 if head_side == "N" else y1 + 0.35
            box(f"{name}_pillow{i}", px - 0.33, py - 0.18, 0.52, px + 0.33, py + 0.18, 0.68, M["fabric_white"], bevel=0.07)
    else:
        span = (x2 - x1)
        dx1, dx2 = (x1, x2 - span * 0.3) if head_side == "E" else (x1 + span * 0.3, x2)
        box(f"{name}_duvet", dx1 + 0.02, y1 + 0.02, 0.5, dx2, y2 - 0.02, 0.6, duvet, bevel=0.05)
        tx = dx1 + 0.1 if head_side == "E" else dx2 - 0.55
        box(f"{name}_throw", tx, y1, 0.6, tx + 0.45, y2, 0.63, M["fabric_sage"], bevel=0.02)
        n = 2 if (y2 - y1) > 1.3 else 1
        for i in range(n):
            py = y1 + (y2 - y1) * (i + 0.5) / n
            px = x2 - 0.35 if head_side == "E" else x1 + 0.35
            box(f"{name}_pillow{i}", px - 0.18, py - 0.33, 0.52, px + 0.18, py + 0.33, 0.68, M["fabric_white"], bevel=0.07)


# master: king bed, head against back wall (y = 4.6), foot to the view
bed("master_bed", 10.7, 2.35, 12.6, 4.5, "N")
box("ns_l", 10.05, 4.0, 0.0, 10.6, 4.5, 0.5, M["oak"], bevel=0.006)
box("ns_r", 12.7, 4.0, 0.0, 13.25, 4.5, 0.5, M["oak"], bevel=0.006)
box("master_rug", 9.9, 1.4, 0.0, 13.4, 4.2, 0.012, M["rug"], bevel=0.004)
box("master_wardrobe", 14.35, 0.4, 0.0, 14.95, 3.8, 2.5, M["oak"], bevel=0.004)

# bedroom 2: queen, head against bath wall (x = 11.2), clear of the desk
bed("bed2", 9.05, 4.85, 11.12, 6.5, "E")
box("bed2_desk", 8.4, 8.0, 0.72, 9.9, 8.42, 0.75, M["oak"], bevel=0.004)
box("bed2_rug", 8.6, 5.6, 0.0, 10.4, 8.0, 0.012, M["rug"])

# bedroom 3: double, head against the west wall (x = 0)
bed("bed3", 0.08, 6.0, 2.1, 7.6, "W")
box("bed3_wardrobe", 0.08, 4.7, 0.0, 2.1, 5.3, 2.4, M["oak"], bevel=0.004)

# living: TV/media console along bed3 wall (y = 4.6, x 0..2.2) is a wardrobe zone,
# so the media wall sits on the kitchen-side partition stub
box("living_rug", 0.6, 0.9, 0.0, 4.6, 3.9, 0.012, M["rug"], bevel=0.004)
box("media_console", 0.2, 4.0, 0.0, 2.1, 4.52, 0.45, M["oak"], bevel=0.005)
box("tv", 0.55, 4.48, 0.75, 1.85, 4.52, 1.5, M["screen"])

# modern low sofa (back to the glass, facing the TV wall) — fabric, rounded cushions
def sofa(x1, y1, x2, y2):
    """Facing +Y: back cushion along y1, seat towards y2."""
    box("sofa_base", x1, y1, 0.06, x2, y2, 0.38, M["fabric_beige"], bevel=0.04)
    box("sofa_back", x1, y1, 0.38, x2, y1 + 0.24, 0.78, M["fabric_beige"], bevel=0.08)
    box("sofa_arm_l", x1, y1, 0.38, x1 + 0.22, y2, 0.62, M["fabric_beige"], bevel=0.07)
    box("sofa_arm_r", x2 - 0.22, y1, 0.38, x2, y2, 0.62, M["fabric_beige"], bevel=0.07)
    n = 3
    w = (x2 - x1 - 0.44) / n
    for i in range(n):
        a = x1 + 0.22 + i * w
        box(f"sofa_seat{i}", a + 0.01, y1 + 0.25, 0.38, a + w - 0.01, y2 - 0.02, 0.52, M["fabric_beige"], bevel=0.06)
    for i, xx in enumerate((x1 + 0.55, x2 - 0.55)):
        box(f"sofa_pillow{i}", xx - 0.24, y1 + 0.2, 0.5, xx + 0.24, y1 + 0.36, 0.92, M["fabric_sage" if i else "fabric_sand"], bevel=0.07)
    for xx in (x1 + 0.12, x2 - 0.12):
        box(f"sofa_leg{xx:.1f}", xx - 0.03, y1 + 0.1, 0.0, xx + 0.03, y1 + 0.16, 0.06, M["black"])

sofa(1.25, 0.55, 3.95, 1.55)

# solid oak dining table, long axis north–south
box("dining_top", 5.65, 1.1, 0.72, 7.05, 3.3, 0.76, M["oak"], bevel=0.008)
for xx, yy in ((5.75, 1.2), (6.95, 1.2), (5.75, 3.2), (6.95, 3.2)):
    box(f"dining_leg{xx}{yy}", xx - 0.04, yy - 0.04, 0.0, xx + 0.04, yy + 0.04, 0.72, M["oak"], bevel=0.004)
box("dining_runner", 6.2, 1.35, 0.76, 6.5, 3.05, 0.765, M["linen"])

print("APT objects:", len(APT.objects))
