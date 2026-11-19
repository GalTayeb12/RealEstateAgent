"""
Seed Yarkon — full-height apartment for the first-person walkthrough.

Re-runs apartment_shell.py with CUT = 3.0 (no section cut), then adds what a
walk-through needs and the dollhouse view never showed: ceilings and roof slab,
lintels over doors, wall under the back windows, an open sliding panel to the
balcony, a dropped-ceiling cove in the living room, recessed downlights, and
higher-detail kitchen / bathroom / bed models in place of the boxy ones.
Finally runs apartment_furnish.py to place the Poly Haven furniture.

Run inside Blender (blender-mcp socket or the text editor) with the source
.blend open (assets-src/yarkon-v2/blender/apartment.blend, saved as
apartment_walk.blend). Next step: apartment_bake.py.
"""
import bpy, bmesh, math, os
from mathutils import Vector, Matrix

HERE = os.path.dirname(globals().get("__file__", "") or r"C:\RealEstateAgent\scripts\blender\x")
HERE = globals().get("SCRIPTS_DIR", HERE)

ns = {"CUT": 3.0, "__name__": "apt_shell"}
exec(open(os.path.join(HERE, "apartment_shell.py"), encoding="utf-8").read(), ns)
box, cyl, M, solid, srgb, APT = ns["box"], ns["cyl"], ns["M"], ns["solid"], ns["srgb"], ns["APT"]
H, W, D, BAL, EXT, INT = ns["H"], ns["W"], ns["D"], ns["BAL"], ns["EXT"], ns["INT"]


def drop(*names):
    """Remove shell objects that get replaced by better models (prefix match)."""
    for o in list(APT.objects):
        if any(o.name == n or o.name.startswith(n + ".") for n in names):
            bpy.data.objects.remove(o, do_unlink=True)


def subsurf(ob, lv=2):
    m = ob.modifiers.new("subsurf", "SUBSURF")
    m.levels = m.render_levels = lv
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


# ── extra materials ──────────────────────────────────────────────────────────
M["ceiling"] = solid("ceiling_white", srgb("f4f2ee"), rough=0.9)
M["lacquer"] = solid("lacquer_greige", srgb("cfc8bc"), rough=0.35)
M["lacquer_dark"] = solid("lacquer_charcoal", srgb("3a3a3a"), rough=0.4)
M["brass"] = solid("brushed_brass", srgb("b8935a"), rough=0.3, metal=1.0)
M["tile"] = ns["pbr"]("marble_01", scale=0.45, rough=0.18)
M["led"] = bpy.data.materials.get("led_warm") or bpy.data.materials.new("led_warm")
led = M["led"]
led.use_nodes = True
b = next(n for n in led.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
b.inputs["Base Color"].default_value = (1, 0.85, 0.65, 1)
b.inputs["Emission Color"].default_value = (1.0, 0.78, 0.55, 1)
b.inputs["Emission Strength"].default_value = 6.0
M["clear_glass"] = solid("shower_glass", (0.95, 0.97, 0.97), rough=0.03, transmission=1.0, ior=1.5)
M["quartz"] = solid("quartz_white", srgb("eeebe4"), rough=0.22)

# Painted plaster: the shell multiplies the Poly Haven texture by a tint node, which glTF
# can't carry (the exporter would drop it and the walls turn concrete-grey). Keep the
# texture's normal/roughness detail, but make the colour a flat warm-white paint.
_pl = M["plaster"].node_tree
_bsdf = next(n for n in _pl.nodes if n.type == "BSDF_PRINCIPLED")
for _l in list(_bsdf.inputs["Base Color"].links):
    _pl.links.remove(_l)
_bsdf.inputs["Base Color"].default_value = (*srgb("eeebe5"), 1)
if _pl.nodes.get("tint"):
    _pl.nodes.remove(_pl.nodes["tint"])

# ── facade: replace full glass with fixed panes + one open sliding panel ────
drop("facade_glass")
OPEN = (3.0, 4.25)  # living room → balcony
box("facade_glass_a", 0, -0.01, 0, OPEN[0], 0.01, H, M["glass"])
box("facade_glass_b", OPEN[1], -0.01, 0, W, 0.01, H, M["glass"])
box("slider_parked", OPEN[1], 0.03, 0, OPEN[1] + (OPEN[1] - OPEN[0]), 0.05, H, M["glass"])  # slid behind
box("slider_frame_l", OPEN[0] - 0.03, -0.04, 0, OPEN[0] + 0.03, 0.04, H, M["frame"])
box("slider_frame_r", OPEN[1] - 0.03, -0.04, 0, OPEN[1] + 0.03, 0.06, H, M["frame"])
box("facade_head", 0, -0.06, H - 0.06, W, 0.06, H, M["frame"])

# ── ceilings, roof slab, balcony soffit ──────────────────────────────────────
box("ceiling", -EXT, -0.06, H, W + EXT, D + EXT, H + 0.02, M["ceiling"])
box("roof_slab", -EXT, -BAL, H + 0.02, W + EXT, D + EXT, H + 0.32, M["stone"])
box("balcony_soffit", -EXT, -BAL, H - 0.02, W + EXT, -0.06, H, M["ceiling"])
box("balcony_wall_w", -EXT, -BAL, 0, 0, 0, H, M["plaster"])
box("balcony_wall_e", W, -BAL, 0, W + EXT, 0, H, M["plaster"])

# living/dining: dropped perimeter bulkhead with an LED cove facing the room
CZ = H - 0.25
for nm, (x1, y1, x2, y2) in {
    "cove_n": (0.0, 4.25, 7.0, 4.54),
    "cove_w": (0.0, 0.3, 0.35, 4.25),
}.items():
    box(nm, x1, y1, CZ, x2, y2, H, M["ceiling"])
box("cove_led_n", 0.35, 4.22, CZ + 0.03, 7.0, 4.25, CZ + 0.06, M["led"])
box("cove_led_w", 0.35, 0.3, CZ + 0.03, 0.38, 4.22, CZ + 0.06, M["led"])

# ── lintels over door gaps, wall under the back windows ─────────────────────
DOOR_TOP = 2.2
lintels = [  # (x1, y1, x2, y2)
    (2.25, 4.6 - INT / 2, 3.1, 4.6 + INT / 2),          # bed3
    (8.2 - INT / 2, 3.55, 8.2 + INT / 2, 4.45),         # master
    (8.2 - INT / 2, 5.2, 8.2 + INT / 2, 6.05),          # bed2
    (11.9, 4.6 - INT / 2, 12.75, 4.6 + INT / 2),        # bath
    (7.25, D, 8.0, D + EXT),                            # entry
]
for i, (x1, y1, x2, y2) in enumerate(lintels):
    box(f"lintel_{i}", x1, y1, DOOR_TOP, x2, y2, H, M["white"] if i < 4 else M["plaster"])
for i, (a, bb) in enumerate([(0.6, 2.6), (3.6, 4.6), (8.8, 10.6), (12.2, 14.4)]):
    box(f"sill_wall_{i}", a, D, 0, bb, D + EXT, 0.9, M["plaster"])
    box(f"sill_stone_{i}", a - 0.02, D - 0.04, 0.88, bb + 0.02, D + 0.06, 0.9, M["stone"])
# kitchen | corridor stub stops at 6.0; open the kitchen to the corridor with a header
box("kitchen_header", 7.0 - INT / 2, 3.4, DOOR_TOP + 0.2, 7.0 + INT / 2, 6.0, H, M["white"])

# skirting boards (painted, 8 cm) along the main runs
for nm, (x1, y1, x2, y2) in {
    "sk_back_bed3": (0.0, D - 0.012, 3.2, D), "sk_back_bed2": (8.2, D - 0.012, 11.2, D),
    "sk_west": (0.0, 0.0, 0.012, 4.6), "sk_east": (W - 0.012, 0.0, W, 4.6),
}.items():
    box(nm, x1, y1, 0, x2, y2, 0.08, M["white"])

# ── kitchen (replaces the boxy run) ─────────────────────────────────────────
drop("k_base", "k_plinth", "k_top", "k_tall", "k_shelf", "k_sink", "k_tap", "k_hob", "island", "island_top")
kz, y0, y1 = 0.9, 7.88, 8.44
GAP = 0.003
box("k_plinth", 3.35, y0 + 0.06, 0, 6.2, y1, 0.1, M["lacquer_dark"])
box("k_carcass", 3.35, y0 + 0.02, 0.1, 6.2, y1, kz - 0.04, M["lacquer"])
xs = [3.35, 3.95, 4.95, 5.45, 6.2]           # drawer/door columns (sink cabinet 4.0–4.9)
for i in range(len(xs) - 1):
    a, c = xs[i] + GAP, xs[i + 1] - GAP
    if i == 1:  # sink: single tall door
        box(f"k_front_{i}", a, y0, 0.11, c, y0 + 0.02, kz - 0.05, M["lacquer"], bevel=0.002)
    else:       # 3 drawers
        for j, (z1, z2) in enumerate([(0.11, 0.38), (0.38 + GAP, 0.62), (0.62 + GAP, kz - 0.05)]):
            box(f"k_drawer_{i}_{j}", a, y0, z1, c, y0 + 0.02, z2, M["lacquer"], bevel=0.002)
    box(f"k_pull_{i}", a + 0.05, y0 - 0.012, kz - 0.09, c - 0.05, y0, kz - 0.075, M["brass"])
box("k_top", 3.3, y0 - 0.03, kz - 0.03, 6.25, y1, kz, M["quartz"], bevel=0.002)
box("k_backsplash", 3.3, y1 - 0.015, kz, 6.25, y1, 1.5, M["marble"])
# undermount sink
box("k_sink_rim", 4.15, 7.98, kz - 0.002, 4.85, 8.34, kz + 0.0005, M["steel"])
box("k_sink_bowl", 4.18, 8.01, kz - 0.2, 4.82, 8.31, kz - 0.001, M["steel"])
# tap: column + arched spout
cyl("k_tap", 4.5, 8.36, kz, kz + 0.34, 0.016, M["steel"])
cv = bpy.data.curves.new("k_spout", "CURVE")
cv.dimensions = "3D"
cv.bevel_depth = 0.012
cv.bevel_resolution = 4
sp = cv.splines.new("BEZIER")
sp.bezier_points.add(1)
p0, p1 = sp.bezier_points
p0.co, p0.handle_left, p0.handle_right = (4.5, 8.36, kz + 0.33), (4.5, 8.36, kz + 0.25), (4.5, 8.36, kz + 0.45)
p1.co, p1.handle_left, p1.handle_right = (4.5, 8.16, kz + 0.24), (4.5, 8.16, kz + 0.40), (4.5, 8.16, kz + 0.2)
spout = bpy.data.objects.new("k_spout", cv)
APT.objects.link(spout)
spout.data.materials.append(M["steel"])
# induction hob, flush
box("k_hob", 5.45, 7.97, kz, 6.12, 8.36, kz + 0.004, M["screen"], bevel=0.002)
# upper cabinets with LED underlight, open shelf next to hood
box("k_upper", 3.35, 8.1, 1.55, 4.95, y1, 2.35, M["lacquer"], bevel=0.002)
for i, (a, c) in enumerate([(3.35, 3.75), (3.75, 4.15), (4.15, 4.55), (4.55, 4.95)]):
    box(f"k_upper_door_{i}", a + GAP, 8.08, 1.55, c - GAP, 8.1, 2.35, M["lacquer"], bevel=0.002)
box("k_upper_led", 3.4, 8.12, 1.545, 4.9, 8.16, 1.55, M["led"])
box("k_hood", 5.5, 8.0, 1.62, 6.1, y1, 1.72, M["steel"], bevel=0.003)
box("k_hood_chimney", 5.65, 8.15, 1.72, 5.95, y1, H, M["lacquer"])
box("k_upper_tail", 4.95, 8.15, 2.35, 6.2, y1, H, M["lacquer"])
# tall unit: fridge + oven column, ceiling height
box("k_tall", 6.2, y0 + 0.02, 0, 6.88, y1, H - 0.01, M["lacquer"])
box("k_fridge_door", 6.2 + GAP, y0, 0.1, 6.88 - GAP, y0 + 0.02, 1.85, M["lacquer"], bevel=0.002)
box("k_tall_door", 6.2 + GAP, y0, 1.85 + GAP, 6.88 - GAP, y0 + 0.02, H - 0.02, M["lacquer"], bevel=0.002)
box("k_tall_pull", 6.24, y0 - 0.02, 0.6, 6.255, y0, 1.6, M["brass"])
# island with waterfall marble ends + oak front for the stools
box("island_core", 3.95, 6.12, 0.0, 6.35, 7.03, kz - 0.03, M["lacquer"])
box("island_oak", 3.95, 6.08, 0.1, 6.35, 6.12, kz - 0.03, M["oak"], bevel=0.002)
box("island_top", 3.82, 6.05, kz - 0.03, 6.48, 7.1, kz, M["quartz"], bevel=0.002)
box("island_wf_w", 3.82, 6.05, 0.0, 3.85, 7.1, kz - 0.03, M["quartz"])
box("island_wf_e", 6.45, 6.05, 0.0, 6.48, 7.1, kz - 0.03, M["quartz"])

# ── wardrobes: carcass + door leaves with shadow gaps and slim pulls ─────────
drop("master_wardrobe", "bed3_wardrobe")


def wardrobe(name, x1, y1, x2, y2, h, face, doors):
    """face: side the doors look at ('-x', '+y', ...). doors: number of leaves."""
    box(f"{name}_carcass", x1, y1, 0.0, x2, y2, h, M["lacquer"])
    box(f"{name}_plinth", x1, y1, 0.0, x2, y2, 0.06, M["lacquer_dark"])
    along_x = face in ("+y", "-y")
    a0, a1 = (x1, x2) if along_x else (y1, y2)
    w = (a1 - a0) / doors
    for i in range(doors):
        a, b = a0 + i * w + GAP, a0 + (i + 1) * w - GAP
        if face == "-x":
            box(f"{name}_door{i}", x1 - 0.02, a, 0.065, x1, b, h - 0.01, M["oak"], bevel=0.002)
            px = x1 - 0.035
            pa = b - 0.06 if i % 2 == 0 else a + 0.045
            box(f"{name}_pull{i}", px, pa, 0.85, x1 - 0.02, pa + 0.015, 1.45, M["lacquer_dark"])
        elif face == "+y":
            box(f"{name}_door{i}", a, y2, 0.065, b, y2 + 0.02, h - 0.01, M["oak"], bevel=0.002)
            pa = b - 0.06 if i % 2 == 0 else a + 0.045
            box(f"{name}_pull{i}", pa, y2 + 0.02, 0.85, pa + 0.015, y2 + 0.035, 1.45, M["lacquer_dark"])


wardrobe("master_wardrobe", 14.37, 0.4, 14.95, 3.8, H - 0.02, "-x", 6)
wardrobe("bed3_wardrobe", 0.08, 4.7, 2.1, 5.26, H - 0.02, "+y", 4)

# ── bathroom (replaces the boxy tub/toilet/shower) ──────────────────────────
drop("tub", "tub_water", "shower_tray", "shower_screen", "toilet", "vanity_top")
box("vanity_top", 11.26, 5.15, 0.85, 11.86, 6.95, 0.88, M["quartz"], bevel=0.003)


def tub(x1, y1, x2, y2, h=0.58, wall=0.06):
    """Freestanding tub: inset + extruded cavity, smoothed with subsurf + creases."""
    me = bpy.data.meshes.new("tub")
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x = x1 if v.co.x < 0 else x2
        v.co.y = y1 if v.co.y < 0 else y2
        v.co.z = 0.0 if v.co.z < 0 else h
    top = next(f for f in bm.faces if f.normal.z > 0.9)
    r = bmesh.ops.inset_region(bm, faces=[top], thickness=wall, depth=0)
    bmesh.ops.inset_region(bm, faces=[top], thickness=0.04, depth=0)
    bmesh.ops.translate(bm, vec=(0, 0, -(h - 0.12)), verts=top.verts)
    bmesh.ops.scale(bm, vec=(0.88, 0.8, 1), space=Matrix.Translation(-top.calc_center_median()), verts=top.verts)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("tub", me)
    APT.objects.link(ob)
    ob.data.materials.append(M["porcelain"])
    return subsurf(ob, 3)


tub(12.55, 7.2, 14.25, 8.05)
box("tub_filler", 14.35, 7.6, 0, 14.39, 7.64, 0.95, M["steel"])
# walk-in shower: tray, frameless glass, rain head
box("shower_tray", 13.92, 4.7, 0, 15.0, 6.1, 0.015, M["bathfloor"])
box("shower_glass", 13.9, 4.7, 0, 13.91, 5.75, 2.0, M["clear_glass"])
box("shower_bar", 13.9, 4.7, 1.98, 13.92, 5.75, 2.0, M["frame"])
cyl("shower_head", 14.45, 5.4, 2.3, 2.31, 0.15, M["steel"])
box("shower_arm", 14.44, 5.4, 2.3, 14.46, 6.1, 2.32, M["steel"])
# wall-hung toilet + concealed cistern ledge
box("wc_ledge", 14.62, 6.2, 0, 15.0, 7.0, 1.05, M["tile"])
wc = box("toilet", 14.1, 6.4, 0.32, 14.62, 6.78, 0.42, M["porcelain"], bevel=0.0)
subsurf(wc, 3)
box("wc_lid", 14.11, 6.41, 0.42, 14.6, 6.77, 0.44, M["porcelain"], bevel=0.015)
box("wc_flush", 14.615, 6.5, 0.85, 14.625, 6.7, 0.95, M["steel"])
# tiled walls in the bathroom (marble cladding, full height)
for nm, (x1, y1, x2, y2) in {
    "bt_w": (11.26, 4.66, 11.27, 8.5), "bt_s": (11.26, 4.66, 15.0, 4.67),
    "bt_e": (14.99, 4.66, 15.0, 8.5),
}.items():
    box(nm, x1, y1, 0, x2, y2, H, M["tile"])
box("bath_led", 11.29, 5.25, 1.9, 11.31, 6.85, 1.92, M["led"])
# brass taps over the basins
for yy in (5.6, 6.45):
    cyl(f"basin_tap_{yy}", 11.33, yy, 0.88, 1.08, 0.012, M["brass"])
    box(f"basin_spout_{yy}", 11.32, yy - 0.01, 1.06, 11.48, yy + 0.01, 1.08, M["brass"])

# ── master bed: the shell put the headboard across the en-suite door (x 11.9-12.75);
#    shift it west so the bathroom is reachable, one night table on the free side ──
drop(*[o.name for o in APT.objects if o.name.startswith("master_bed_")], "ns_l", "ns_r", "master_rug")
ns["bed"]("master_bed", 9.45, 2.35, 11.35, 4.5, "N")
box("ns_r", 11.4, 4.0, 0.0, 11.85, 4.5, 0.5, M["oak"], bevel=0.006)
box("master_rug", 8.75, 1.4, 0.0, 12.05, 4.2, 0.012, M["rug"], bevel=0.004)

# ── softer beds: more bevel segments on the soft parts ──────────────────────
for o in APT.objects:
    if any(k in o.name for k in ("_duvet", "_pillow", "_mattress", "_throw", "sofa_seat", "sofa_back", "sofa_arm", "sofa_pillow")):
        for m in o.modifiers:
            if m.type == "BEVEL":
                m.segments = 6
                m.width *= 1.4

# ── lights (Cycles; baked into the lightmaps) ───────────────────────────────
def fresh(name):
    col = bpy.data.collections.get(name)
    if col:
        for o in list(col.objects):
            bpy.data.objects.remove(o, do_unlink=True)
    else:
        col = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(col)
    return col


LIGHTS = fresh("LIGHTS")


def downlight(x, y, watts=18.0, z=H):
    ld = bpy.data.lights.new(f"dl_{x:.1f}_{y:.1f}", "SPOT")
    ld.energy = watts
    ld.color = (1.0, 0.82, 0.62)
    ld.spot_size = math.radians(95)
    ld.spot_blend = 0.6
    ld.shadow_soft_size = 0.04
    ob = bpy.data.objects.new(ld.name, ld)
    ob.location = (x, y, z - 0.03)
    LIGHTS.objects.link(ob)
    # visible fixture: trim ring + glowing lens
    cyl(f"dl_trim_{x:.1f}_{y:.1f}", x, y, z - 0.004, z, 0.045, M["white"], verts=24)
    cyl(f"dl_lens_{x:.1f}_{y:.1f}", x, y, z - 0.006, z - 0.004, 0.03, M["led"], verts=24)


for x, y in [(1.4, 3.6), (3.0, 3.6), (4.6, 3.6), (6.0, 1.4), (6.0, 3.0),          # living/dining
             (4.2, 5.5), (5.6, 5.5), (4.2, 7.4), (5.6, 7.4),                       # kitchen
             (7.6, 4.2), (7.6, 6.2), (7.6, 7.9),                                    # corridor
             (1.6, 5.4), (1.6, 7.6),                                                # bed3
             (9.4, 3.4), (13.6, 3.4), (11.6, 1.2),                                  # master
             (9.7, 5.4), (9.7, 7.6),                                                # bed2
             (12.4, 5.4), (13.6, 6.8), (12.4, 7.8)]:                                # bath
    downlight(x, y)

# cove strips as area lights pointing up into the bulkhead recess
for nm, (cx, cy, sx, sy) in {"cove_light_n": (3.6, 4.2, 6.5, 0.04), "cove_light_w": (0.4, 2.25, 0.04, 3.9)}.items():
    ld = bpy.data.lights.new(nm, "AREA")
    ld.shape = "RECTANGLE"
    ld.size, ld.size_y = sx, sy
    ld.energy = 60.0
    ld.color = (1.0, 0.78, 0.55)
    ob = bpy.data.objects.new(nm, ld)
    ob.location = (cx, cy, CZ + 0.05)
    ob.rotation_euler = (math.pi, 0, 0)  # area lights face -Z; flip to light the ceiling
    LIGHTS.objects.link(ob)

# daylight: Poly Haven partly-cloudy sky + afternoon sun from the south-west, low enough to
# reach through the facade glass (facade faces -Y)
sc = bpy.context.scene
_bg = next((n for n in sc.world.node_tree.nodes if n.type == "BACKGROUND"), None)
if _bg:
    _bg.inputs["Strength"].default_value = 1.8
sun = bpy.data.objects.get("Sun") or bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
if sun.name not in sc.collection.objects:
    sc.collection.objects.link(sun)
sun.data.energy = 4.0
sun.data.angle = math.radians(1.5)
sun.data.color = (1.0, 0.96, 0.9)
sun.rotation_euler = (math.radians(55), 0, math.radians(-35))

print("walk shell:", len(APT.objects), "objects,", len(LIGHTS.objects), "lights")

exec(open(os.path.join(HERE, "apartment_furnish.py"), encoding="utf-8").read(), {"__name__": "apt_furnish"})
