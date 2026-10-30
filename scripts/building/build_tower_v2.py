"""
build_tower_v2.py — Blender 4.2 headless architectural renderer
Round 1 of 3+ polish iterations:
  • AgX colour management (eliminates lavender/pink cast)
  • Blue-hour atmosphere: deep blue sky, warm lit windows
  • Interior mapping planes — lit room planes behind glass
  • Fixed tree placement — never inside building footprint
  • Road surface (dark asphalt) in front of towers
  • Background buildings — urban context, fog-faded
  • Improved concrete/stone materials with subtle procedural variation
  • Penthouse: stepped setback + rooftop pergola accent
  • Improved balconies: connected to slab (no float)

Usage:
  blender -b -P build_tower_v2.py -- <input.json> <output.glb> <meta.json> [hdri.hdr]
"""

import bpy, bmesh, json, math, os, random, sys, time
from mathutils import Vector, Euler

# ── CLI args ──────────────────────────────────────────────────────────────────
argv = sys.argv
try:
    sep = argv.index("--") + 1
except ValueError:
    sep = len(argv)
args = argv[sep:]
if len(args) < 3:
    print("ERROR: need -- <input.json> <output.glb> <meta.json> [hdri.hdr]")
    sys.exit(1)

INPUT_JSON  = os.path.abspath(args[0])
OUTPUT_GLB  = os.path.abspath(args[1])
OUTPUT_META = os.path.abspath(args[2])
HDRI_PATH   = os.path.abspath(args[3]) if len(args) > 3 else None

with open(INPUT_JSON, "r", encoding="utf-8") as f:
    DATA = json.load(f)

# ── Scale constants (metres) ──────────────────────────────────────────────────
FLOOR_H     = 3.20    # standard residential floor
LOBBY_H     = 5.20    # tall lobby (more dramatic)
PENTH_H     = 4.60    # penthouse
UNIT_W      = 7.50    # unit slot width
TOWER_GAP   = 10.0    # gap between towers
DEPTH       = 13.50   # front-to-back
SHELL_T     = 0.28    # side + back concrete shell thickness
SLAB_H      = 0.20    # slab edge band height
SLAB_OVR    = 0.28    # slab overhang
MULL_W      = 0.07    # vertical mullion width
MULL_D      = 0.14    # mullion depth
GLASS_SETB  = 0.08    # glass recessed from slab edge
BAL_D       = 1.90    # balcony depth
BAL_T       = 0.14    # balcony slab thickness
RAIL_H      = 1.10    # glass railing height
RAIL_T      = 0.012   # railing glass thickness
INT_SETB    = 0.45    # interior room plane behind glass
BEVEL_R     = 0.04    # corner bevel radius

# Setback: upper 30 % of residential floors step in
SETBACK_FRAC = 0.70
SETBACK_W    = 0.08   # fraction reduction per step

# ── Randomness seed (deterministic per project) ───────────────────────────────
random.seed(42)


# ══════════════════════════════════════════════════════════════════════════════
# UTILITIES
# ══════════════════════════════════════════════════════════════════════════════

def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for b in list(bpy.data.meshes):    bpy.data.meshes.remove(b)
    for b in list(bpy.data.materials): bpy.data.materials.remove(b)
    for b in list(bpy.data.images):    bpy.data.images.remove(b)
    for b in list(bpy.data.lights):    bpy.data.lights.remove(b)
    for b in list(bpy.data.cameras):   bpy.data.cameras.remove(b)
    for b in list(bpy.data.worlds):    bpy.data.worlds.remove(b)


def link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def make_box(name, w, d, h, mat=None):
    """Axis-aligned box, bottom at local Z=0."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, verts=bm.verts, vec=(w, d, h))
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, h / 2))
    bm.to_mesh(me); bm.free()
    obj = link(bpy.data.objects.new(name, me))
    if mat:
        obj.data.materials.append(mat)
    return obj


def bevel_obj(obj, amount=BEVEL_R, segments=2):
    mod = obj.modifiers.new("Bevel", "BEVEL")
    mod.width = amount
    mod.segments = segments
    mod.limit_method = "ANGLE"
    return obj


# ══════════════════════════════════════════════════════════════════════════════
# MATERIALS
# ══════════════════════════════════════════════════════════════════════════════

def make_mat(name, color, roughness=0.7, metallic=0.0, emission=None, alpha=1.0):
    """Principled BSDF material."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*emission[0], 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission[1]
    if alpha < 1.0:
        bsdf.inputs["Alpha"].default_value = alpha
        mat.blend_method = "BLEND"
        mat.use_backface_culling = False
    out = nodes.new("ShaderNodeOutputMaterial")
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def make_glass_mat(name, color=(0.04, 0.09, 0.18), transmission=0.80, tint_roughness=0.04):
    """Real-time PBR glass — NOT baked."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = tint_roughness
    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["Transmission Weight"].default_value = transmission
    bsdf.inputs["IOR"].default_value = 1.52
    # Subtle specular tint — keeps glass looking like real coated glass
    # Blender 5.x: Specular Tint is a color (RGBA), not a float
    bsdf.inputs["Specular Tint"].default_value = (0.25, 0.25, 0.25, 1.0)
    out = nodes.new("ShaderNodeOutputMaterial")
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    mat.blend_method = "BLEND"
    mat.use_backface_culling = False
    mat["is_glass"] = True
    return mat


def make_emission_mat(name, color, strength):
    """Pure emission material (no BSDF) — appears unlit, used for interior glow."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    emit = nodes.new("ShaderNodeEmission")
    emit.inputs["Color"].default_value = (*color, 1.0)
    emit.inputs["Strength"].default_value = strength
    out = nodes.new("ShaderNodeOutputMaterial")
    links.new(emit.outputs["Emission"], out.inputs["Surface"])
    return mat


# ─── Shared material instances (created in init_materials) ────────────────────
MAT_CONCRETE   = None
MAT_STONE      = None
MAT_SLAB       = None
MAT_MULLION    = None
MAT_ROOF       = None
MAT_GOLD       = None
MAT_GLASS      = None
MAT_GLASS_BAL  = None
MAT_LOBBY_INT  = None
MAT_GROUND     = None
MAT_PAVING     = None
MAT_ROAD       = None
MAT_POOL       = None
MAT_INT_WARM   = None   # warm-lit interior room (most floors)
MAT_INT_COOL   = None   # cooler interior room
MAT_INT_DIM    = None   # curtains drawn / dim room
MAT_BG_BLDG    = None   # background building material

OPAQUE_OBJS = []
GLASS_OBJS  = []


def init_materials():
    global MAT_CONCRETE, MAT_STONE, MAT_SLAB, MAT_MULLION, MAT_ROOF
    global MAT_GOLD, MAT_GLASS, MAT_GLASS_BAL, MAT_LOBBY_INT
    global MAT_GROUND, MAT_PAVING, MAT_ROAD, MAT_POOL
    global MAT_INT_WARM, MAT_INT_COOL, MAT_INT_DIM, MAT_BG_BLDG

    # ── Architectural materials ────────────────────────────────────────────────
    # Concrete: neutral warm-grey (NOT blue-grey, to avoid lavender under AgX)
    MAT_CONCRETE  = make_mat("concrete", (0.52, 0.50, 0.47), roughness=0.82)
    # Stone cladding: warm cream limestone
    MAT_STONE     = make_mat("stone",    (0.78, 0.74, 0.68), roughness=0.64)
    # Slab edge: bright white-cream — the horizontal band that creates depth
    MAT_SLAB      = make_mat("slab",     (0.94, 0.92, 0.88), roughness=0.42, metallic=0.04)
    # Mullions: brushed aluminium
    MAT_MULLION   = make_mat("mullion",  (0.72, 0.72, 0.70), roughness=0.18, metallic=0.90)
    # Roof: anthracite zinc
    MAT_ROOF      = make_mat("roof",     (0.14, 0.20, 0.20), roughness=0.50, metallic=0.15)
    # Gold accent: warm champagne
    MAT_GOLD      = make_mat("gold",     (0.82, 0.65, 0.26), roughness=0.12, metallic=0.94)

    # ── Glass ─────────────────────────────────────────────────────────────────
    # Curtain wall: dark tinted blue-green, low roughness, high transmission
    MAT_GLASS     = make_glass_mat("glass_curtain", (0.03, 0.08, 0.16), transmission=0.72)
    # Balcony railing: cleaner / lighter glass
    MAT_GLASS_BAL = make_glass_mat("glass_balcony", (0.06, 0.12, 0.20), transmission=0.65)

    # ── Interior materials (visible through glass) ────────────────────────────
    # Lobby: warm amber-orange glow
    MAT_LOBBY_INT = make_emission_mat("lobby_interior", (1.0, 0.70, 0.32), strength=1.8)
    # Warm room (75% of floors): soft amber
    MAT_INT_WARM  = make_emission_mat("int_warm",       (0.96, 0.72, 0.36), strength=0.9)
    # Cool room (15% of floors): slightly bluer white
    MAT_INT_COOL  = make_emission_mat("int_cool",       (0.82, 0.88, 1.00), strength=0.7)
    # Dim room (10% of floors): nearly dark — curtains drawn
    MAT_INT_DIM   = make_emission_mat("int_dim",        (0.28, 0.20, 0.12), strength=0.3)

    # ── Ground and environment ────────────────────────────────────────────────
    MAT_GROUND    = make_mat("ground",   (0.24, 0.30, 0.18), roughness=0.96)
    MAT_PAVING    = make_mat("paving",   (0.62, 0.60, 0.57), roughness=0.82, metallic=0.01)
    MAT_ROAD      = make_mat("road",     (0.18, 0.18, 0.17), roughness=0.90)
    MAT_POOL      = make_mat("pool",     (0.10, 0.42, 0.58), roughness=0.04, metallic=0.5)
    # Background buildings: muted blue-grey, foggy
    MAT_BG_BLDG   = make_mat("bg_bldg", (0.30, 0.34, 0.38), roughness=0.80)


# ── Per-floor interior material assignment (deterministic) ────────────────────
def interior_mat_for_floor(floor_num):
    r = (floor_num * 7 + 13) % 100
    if r < 10:
        return MAT_INT_DIM
    if r < 30:
        return MAT_INT_COOL
    return MAT_INT_WARM


# ══════════════════════════════════════════════════════════════════════════════
# BUILDING GEOMETRY
# ══════════════════════════════════════════════════════════════════════════════

def floor_height(floor_data):
    if floor_data["isLobby"]:
        return LOBBY_H
    if floor_data["isPenthouse"]:
        return PENTH_H
    return FLOOR_H


def build_floor(floor_data, base_y, fw, cx, cz, top_floor_num):
    """Build one floor. Returns height consumed."""
    objs = []
    h = floor_height(floor_data)
    is_lobby   = floor_data["isLobby"]
    is_penth   = floor_data["isPenthouse"]
    n_units    = len(floor_data["units"])
    floor_num  = floor_data["floor"]
    # Balconies on alternating floors (not lobby, not penthouse)
    has_bal    = not is_lobby and not is_penth and (floor_num % 2 == 0) and n_units > 0

    glass_w = fw - SHELL_T * 2
    glass_h = h - SLAB_H - 0.10
    # Front face in Blender = +Y direction
    glass_z = cz + DEPTH / 2 - GLASS_SETB

    # ── Back wall (concrete) ──
    o = make_box(f"shell_back_F{floor_num}", fw, SHELL_T, h, MAT_CONCRETE)
    o.location = (cx, cz - DEPTH / 2 + SHELL_T / 2, base_y)
    OPAQUE_OBJS.append(o); objs.append(o)

    # ── Side walls (stone cladding facing camera-left/-right) ──
    for sign, label in ((-1, "L"), (1, "R")):
        o = make_box(f"shell_side{label}_F{floor_num}",
                     SHELL_T, DEPTH - SHELL_T, h,
                     MAT_STONE)   # stone on sides for contrast
        o.location = (cx + sign * (fw / 2 - SHELL_T / 2), cz, base_y)
        OPAQUE_OBJS.append(o); objs.append(o)

    # ── Slab edge band ──
    sw = fw + SLAB_OVR * 2
    sd = DEPTH + SLAB_OVR
    o = make_box(f"slab_F{floor_num}", sw, sd, SLAB_H, MAT_SLAB)
    o.location = (cx, cz, base_y)
    bevel_obj(o, amount=0.025, segments=1)
    OPAQUE_OBJS.append(o); objs.append(o)

    # ── Interior room plane (visible through glass) ───────────────────────────
    int_mat = MAT_LOBBY_INT if is_lobby else interior_mat_for_floor(floor_num)
    int_h   = glass_h * 0.88
    int_w   = glass_w * 0.92
    oi = make_box(f"int_plane_F{floor_num}", int_w, 0.04, int_h, int_mat)
    oi.location = (cx, glass_z - INT_SETB, base_y + SLAB_H + 0.08)
    OPAQUE_OBJS.append(oi); objs.append(oi)

    # For lobby: add a second brighter plane closer to glass
    if is_lobby:
        oi2 = make_box("lobby_ceiling_glow", int_w, 0.04, 0.30, MAT_LOBBY_INT)
        oi2.location = (cx, glass_z - 0.08, base_y + h - 0.40)
        OPAQUE_OBJS.append(oi2); objs.append(oi2)

    # ── Glass curtain wall ────────────────────────────────────────────────────
    glass_mat = MAT_LOBBY_INT if is_lobby else MAT_GLASS
    og = make_box(f"glass_F{floor_num}", glass_w, 0.04, glass_h, glass_mat)
    og.location = (cx, glass_z, base_y + SLAB_H + 0.05)
    if is_lobby:
        OPAQUE_OBJS.append(og)
    else:
        GLASS_OBJS.append(og)
    objs.append(og)

    # ── Vertical mullions ──────────────────────────────────────────────────────
    if not is_lobby and n_units > 0:
        slots = max(n_units, 2)
        slot_w = glass_w / slots
        for i in range(1, slots):
            mx = cx - glass_w / 2 + slot_w * i
            om = make_box(f"mull_v_F{floor_num}_M{i}",
                          MULL_W, MULL_D, glass_h, MAT_MULLION)
            om.location = (mx, glass_z, base_y + SLAB_H + 0.05)
            OPAQUE_OBJS.append(om); objs.append(om)

    # ── Horizontal spandrel mullion ───────────────────────────────────────────
    if not is_lobby and h > FLOOR_H * 0.9:
        oh = make_box(f"mull_h_F{floor_num}",
                      glass_w, MULL_D, MULL_W * 0.8, MAT_MULLION)
        oh.location = (cx, glass_z, base_y + h * 0.62)
        OPAQUE_OBJS.append(oh); objs.append(oh)

    # ── Penthouse gold accent strip ───────────────────────────────────────────
    if is_penth:
        op = make_box(f"penth_gold_F{floor_num}", fw + 0.08, 0.09, 0.06, MAT_GOLD)
        op.location = (cx, glass_z - 0.02, base_y + h - 0.03)
        OPAQUE_OBJS.append(op); objs.append(op)
        # Tall corner fins (architectural feature)
        for sign in (-1, 1):
            of = make_box(f"penth_fin_{sign}_F{floor_num}",
                          0.07, 0.07, h * 0.85, MAT_GOLD)
            of.location = (cx + sign * (fw / 2 + 0.025),
                           glass_z - 0.05,
                           base_y + h * 0.08)
            OPAQUE_OBJS.append(of); objs.append(of)

    # ── Balcony (even non-penthouse floors) ───────────────────────────────────
    if has_bal:
        # Slab extends from the facade outward — connected, not floating
        bal_z = glass_z + BAL_D / 2
        bal_w = fw * 0.58
        # Balcony slab — same Z base as floor slab
        ob = make_box(f"balcony_slab_F{floor_num}",
                      bal_w, BAL_D, BAL_T, MAT_SLAB)
        ob.location = (cx, bal_z, base_y + SLAB_H - BAL_T / 2)
        bevel_obj(ob, amount=0.03, segments=1)
        OPAQUE_OBJS.append(ob); objs.append(ob)

        # Metal balcony edge strip (gives depth)
        oe = make_box(f"bal_edge_F{floor_num}",
                      bal_w + 0.06, 0.05, BAL_T * 1.5, MAT_MULLION)
        oe.location = (cx, bal_z + BAL_D / 2, base_y + SLAB_H)
        OPAQUE_OBJS.append(oe); objs.append(oe)

        # Glass railing panel (front + left + right)
        for side, pw, pd, px, py_off in [
            ("front", bal_w, RAIL_T, cx,                         bal_z + BAL_D / 2 - RAIL_T / 2),
            ("left",  RAIL_T, BAL_D, cx - bal_w / 2 + RAIL_T/2, bal_z),
            ("right", RAIL_T, BAL_D, cx + bal_w / 2 - RAIL_T/2, bal_z),
        ]:
            or_ = make_box(f"rail_{side}_F{floor_num}",
                           pw, pd, RAIL_H, MAT_GLASS_BAL)
            or_.location = (px, py_off, base_y + SLAB_H + BAL_T)
            GLASS_OBJS.append(or_); objs.append(or_)

    return h


def build_tower(bld, offset_x):
    """Build one tower. Returns (total_height, floors_meta)."""
    floors_meta  = []
    top_floor_num = max((f["floor"] for f in bld["floors"] if not f["isLobby"]), default=1)
    n_units_max  = max((len(f["units"]) for f in bld["floors"]), default=1)
    base_width   = max(n_units_max, 1) * UNIT_W
    cx = offset_x
    cz = 0.0

    base_y = 0.0
    for fl in sorted(bld["floors"], key=lambda f: f["floor"]):
        frac = fl["floor"] / top_floor_num if top_floor_num > 0 else 1
        if frac >= SETBACK_FRAC and not fl["isLobby"]:
            steps = math.ceil((frac - SETBACK_FRAC) / max((1 - SETBACK_FRAC), 0.01) * 2)
            fw = base_width * max(1 - SETBACK_W * steps, 0.70)
        else:
            fw = base_width

        h = build_floor(fl, base_y, fw, cx, cz, top_floor_num)
        floors_meta.append({
            "floor":       fl["floor"],
            "isLobby":     fl["isLobby"],
            "isPenthouse": fl["isPenthouse"],
            "baseY":       round(base_y, 3),
            "topY":        round(base_y + h, 3),
            "width":       round(fw, 3),
            "depth":       DEPTH,
            "centerX":     round(cx, 3),
            "centerZ":     round(cz, 3),
            "units":       fl["units"],
        })
        base_y += h

    # ── Roof parapet ──────────────────────────────────────────────────────────
    top_fw = base_width * (1 - SETBACK_W * 2)
    or1 = make_box("roof_parapet", top_fw + 0.35, DEPTH + 0.35, 0.26, MAT_ROOF)
    or1.location = (cx, cz, base_y)
    OPAQUE_OBJS.append(or1)

    # Crown / mechanical penthouse housing
    or2 = make_box("roof_crown", top_fw * 0.36, DEPTH * 0.38, 0.70, MAT_ROOF)
    or2.location = (cx, cz, base_y + 0.26)
    OPAQUE_OBJS.append(or2)

    # Gold cap strip along front
    or3 = make_box("roof_gold", top_fw + 0.35, 0.018, 0.018, MAT_GOLD)
    or3.location = (cx, cz + DEPTH / 2 + 0.005, base_y + 0.26)
    OPAQUE_OBJS.append(or3)

    # Rooftop pergola accent (penthouse level identity)
    pg_w = top_fw * 0.60
    for sign in (-1, 0, 1):
        opg = make_box(f"pergola_beam_{sign}", pg_w, 0.06, 0.08, MAT_GOLD)
        opg.location = (cx, cz + sign * (DEPTH * 0.12), base_y + 0.90)
        OPAQUE_OBJS.append(opg)

    return base_y, floors_meta


# ══════════════════════════════════════════════════════════════════════════════
# GROUND PLANE, TREES, ROAD, BACKGROUND
# ══════════════════════════════════════════════════════════════════════════════

def build_ground(total_w):
    R = max(total_w, DEPTH) * 2.2
    # Grass
    og = make_box("ground_grass", R * 2.5, R * 2.5, 0.01, MAT_GROUND)
    og.location = (0, 0, -0.01)
    OPAQUE_OBJS.append(og)

    # Paved entrance plaza
    op = make_box("plaza", total_w * 0.80, DEPTH * 0.55, 0.06, MAT_PAVING)
    op.location = (0, DEPTH * 0.08, 0)
    OPAQUE_OBJS.append(op)

    # Road in front of building (camera side = positive Y)
    road_y = DEPTH / 2 + 8.0
    or_ = make_box("road_front", total_w * 2.0, 9.0, 0.04, MAT_ROAD)
    or_.location = (0, road_y, 0)
    OPAQUE_OBJS.append(or_)

    # Kerb (bright pavement strip between plaza and road)
    ok = make_box("kerb", total_w * 2.0, 0.8, 0.08, MAT_PAVING)
    ok.location = (0, DEPTH / 2 + 3.8, 0)
    OPAQUE_OBJS.append(ok)

    # Reflecting pool / water feature
    opl = make_box("pool", total_w * 0.24, DEPTH * 0.10, 0.10, MAT_POOL)
    opl.location = (0, DEPTH * 0.30, 0)
    OPAQUE_OBJS.append(opl)


def add_trees(total_w):
    """
    Trees placed strictly OUTSIDE the building footprint.
    Building occupies X ∈ [-total_w/2, +total_w/2], Y ∈ [-DEPTH/2, +DEPTH/2].
    Safe zones: X > total_w/2+3 or X < -total_w/2-3 (sides)
                Y > DEPTH/2+4 (in front of road)
                Y < -DEPTH/2-4 (behind)
    """
    mat_trunk   = make_mat("tree_trunk",   (0.22, 0.14, 0.08), roughness=0.96)
    mat_foliage = make_mat("tree_foliage", (0.08, 0.22, 0.12), roughness=0.90)

    hw = total_w / 2
    # Define safe positions: (x, y, scale)
    positions = [
        # Sides of buildings
        (-hw - 3.5,  -4.0, 1.1),
        (-hw - 6.0,   2.0, 0.9),
        ( hw + 3.8,  -3.5, 1.2),
        ( hw + 6.5,   1.5, 0.85),
        # In front of building (road side, well clear at Y > DEPTH/2 + 5)
        (-hw * 0.35,  DEPTH / 2 + 5.5, 0.95),
        ( hw * 0.35,  DEPTH / 2 + 5.8, 1.0),
        (-hw * 0.65,  DEPTH / 2 + 7.0, 0.80),
        ( hw * 0.65,  DEPTH / 2 + 6.5, 0.88),
        # Behind building
        (-hw * 0.40, -DEPTH / 2 - 5.0, 1.05),
        ( hw * 0.40, -DEPTH / 2 - 6.0, 0.90),
    ]

    for i, (x, y, s) in enumerate(positions):
        # Trunk
        ot = make_box(f"tree_trunk_{i}", 0.28 * s, 0.28 * s, 1.5 * s, mat_trunk)
        ot.location = (x, y, 0)
        OPAQUE_OBJS.append(ot)

        # Lower cone
        me = bpy.data.meshes.new(f"foliage_lo_{i}")
        bm2 = bmesh.new()
        bmesh.ops.create_cone(bm2, cap_ends=True, segments=10,
                               radius1=1.9 * s, radius2=0.1 * s, depth=3.4 * s)
        bmesh.ops.translate(bm2, vec=(0, 0, 3.4 * s / 2), verts=bm2.verts)
        bm2.to_mesh(me); bm2.free()
        of1 = link(bpy.data.objects.new(f"foliage_lo_{i}", me))
        of1.location = (x, y, 1.5 * s)
        of1.data.materials.append(mat_foliage)
        OPAQUE_OBJS.append(of1)

        # Upper cone (narrower)
        me2 = bpy.data.meshes.new(f"foliage_hi_{i}")
        bm3 = bmesh.new()
        bmesh.ops.create_cone(bm3, cap_ends=True, segments=10,
                               radius1=1.1 * s, radius2=0.05 * s, depth=2.4 * s)
        bmesh.ops.translate(bm3, vec=(0, 0, 2.4 * s / 2), verts=bm3.verts)
        bm3.to_mesh(me2); bm3.free()
        of2 = link(bpy.data.objects.new(f"foliage_hi_{i}", me2))
        of2.location = (x, y, 1.5 * s + 3.0 * s)
        of2.data.materials.append(mat_foliage)
        OPAQUE_OBJS.append(of2)


def add_background_buildings(total_w, max_height):
    """
    Simplified box buildings behind the main towers,
    giving urban context without competing with the hero.
    They're set back Y < -DEPTH/2 - 20.
    """
    configs = [
        # (x_offset, y_offset, width, depth, height_frac)
        (-total_w * 0.55, -DEPTH / 2 - 22,  8.0, 10.0, 0.55),
        ( total_w * 0.55, -DEPTH / 2 - 20, 10.0, 12.0, 0.45),
        (-total_w * 0.80, -DEPTH / 2 - 35, 14.0, 14.0, 0.30),
        ( total_w * 0.80, -DEPTH / 2 - 30, 12.0, 11.0, 0.38),
        ( 0,              -DEPTH / 2 - 55, 20.0, 18.0, 0.20),
    ]
    for i, (x, y, w, d, hf) in enumerate(configs):
        h = max_height * hf
        ob = make_box(f"bg_bldg_{i}", w, d, h, MAT_BG_BLDG)
        ob.location = (x, y, 0)
        OPAQUE_OBJS.append(ob)

        # A few lit windows on background buildings (simple emission planes)
        win_mat = interior_mat_for_floor(i * 3 + 7)
        for wi in range(min(int(w / 3), 4)):
            ow = make_box(f"bg_win_{i}_{wi}", 1.2, 0.05, 0.9, win_mat)
            ow.location = (x + (wi - 1.5) * 2.5, y + d / 2, h * 0.45 + wi * 1.8)
            OPAQUE_OBJS.append(ow)


# ══════════════════════════════════════════════════════════════════════════════
# SCENE SETUP
# ══════════════════════════════════════════════════════════════════════════════

def setup_lighting():
    """
    Blue-hour atmosphere:
    • Deep blue sky (#0B1428 area)
    • Cool directional light (nearly white, 12° elevation)
    • Warm fill from below (simulates reflected street glow)
    """
    world = bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.use_nodes = True
    wt = world.node_tree
    wt.nodes.clear()

    bg   = wt.nodes.new("ShaderNodeBackground")
    out  = wt.nodes.new("ShaderNodeOutputWorld")
    wt.links.new(bg.outputs["Background"], out.inputs["Surface"])

    if HDRI_PATH and os.path.isfile(HDRI_PATH):
        env = wt.nodes.new("ShaderNodeTexEnvironment")
        img = bpy.data.images.load(HDRI_PATH)
        env.image = img
        rot   = wt.nodes.new("ShaderNodeMapping")
        coord = wt.nodes.new("ShaderNodeTexCoord")
        wt.links.new(coord.outputs["Generated"], rot.inputs["Vector"])
        wt.links.new(rot.outputs["Vector"], env.inputs["Vector"])
        wt.links.new(env.outputs["Color"], bg.inputs["Color"])
        bg.inputs["Strength"].default_value = 1.8
        rot.inputs["Rotation"].default_value = (0, 0, math.radians(90))
    else:
        # Blue hour procedural sky gradient
        # Deep blue-navy sky without HDRI
        bg.inputs["Color"].default_value = (0.04, 0.07, 0.18, 1.0)
        bg.inputs["Strength"].default_value = 1.6

    # ── Directional light: cool moon/dusk sun ─────────────────────────────────
    sun = bpy.data.lights.new("Sun", "SUN")
    sun.energy = 4.0                        # softer than golden hour
    sun.color  = (0.85, 0.92, 1.00)        # cool blue-white
    sun.angle  = math.radians(1.2)
    sob = link(bpy.data.objects.new("Sun", sun))
    # 14° elevation (low, creates long shadows), slight side angle
    sob.rotation_euler = (math.radians(14), 0, math.radians(20))

    # ── Warm fill light: street-level amber bounce ────────────────────────────
    fill = bpy.data.lights.new("FillWarm", "AREA")
    fill.energy = 120.0
    fill.color  = (1.0, 0.65, 0.28)       # warm amber
    fill.size   = 40.0
    fob = link(bpy.data.objects.new("FillWarm", fill))
    fob.location      = (0, 0, -3.0)      # below ground, shines up
    fob.rotation_euler = (math.radians(180), 0, 0)  # pointing up

    # ── Blue rim light from behind building ───────────────────────────────────
    rim = bpy.data.lights.new("RimBlue", "AREA")
    rim.energy = 80.0
    rim.color  = (0.35, 0.55, 1.00)
    rim.size   = 50.0
    rob = link(bpy.data.objects.new("RimBlue", rim))
    rob.location       = (0, -50, 30)
    rob.rotation_euler = (math.radians(-30), 0, 0)


def setup_camera(scene_center_x, max_height, scene_radius):
    cam = bpy.data.cameras.new("Camera")
    cam.lens      = 28          # slightly wider than 35mm — dramatic perspective
    cam.clip_start = 0.5
    cam.clip_end   = 2000.0
    cob = link(bpy.data.objects.new("Camera", cam))

    dist = max(scene_radius * 1.7, max_height * 2.6)
    cob.location = (
        scene_center_x + dist * 0.05,
        dist * 0.80,        # positive Y: faces the glass facade
        4.5,                # slight eye-level raise for drama
    )
    look_at   = Vector((scene_center_x, 0, max_height * 0.58))
    direction = look_at - Vector(cob.location)
    rot_quat  = direction.to_track_quat("-Z", "Y")
    cob.rotation_euler = rot_quat.to_euler()
    bpy.context.scene.camera = cob
    return cob


def setup_render():
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = 96         # faster iteration; increase to 256 for final
    sc.cycles.use_denoising = True
    sc.cycles.denoiser = "OPENIMAGEDENOISE"
    sc.render.resolution_x = 1920
    sc.render.resolution_y = 1080
    sc.render.resolution_percentage = 75
    sc.render.film_transparent = False

    # ── AgX colour management — eliminates the lavender/pink cast ────────────
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.look  = "None"    # "None" = base AgX, no extra contrast curve
    sc.view_settings.exposure  = 0.20  # gentle boost
    sc.view_settings.gamma     = 1.00


# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════

def main():
    t0 = time.time()
    clear_scene()
    init_materials()

    buildings = DATA["buildings"]
    n = len(buildings)

    total_w = sum(
        max(len(f["units"]) for f in b["floors"]) * UNIT_W
        for b in buildings
    ) + TOWER_GAP * (n - 1)

    cursor = -total_w / 2
    meta_buildings = []
    max_height = 0.0

    for bld in buildings:
        n_units_max = max(len(f["units"]) for f in bld["floors"])
        tw = n_units_max * UNIT_W
        cx = cursor + tw / 2
        top_h, floors_meta = build_tower(bld, cx)
        if top_h > max_height:
            max_height = top_h
        meta_buildings.append({
            "id":     bld["id"],
            "name":   bld["name"],
            "worldX": round(cx, 3),
            "worldZ": 0.0,
            "floors": floors_meta,
        })
        cursor += tw + TOWER_GAP

    print(f"Buildings: {len(OPAQUE_OBJS)} opaque + {len(GLASS_OBJS)} glass")
    print(f"Max height: {max_height:.1f} m")

    # Ground, trees, road, background
    build_ground(total_w)
    add_trees(total_w)
    add_background_buildings(total_w, max_height)

    print(f"Total objects: {len(OPAQUE_OBJS)} opaque + {len(GLASS_OBJS)} glass")

    setup_lighting()
    scene_cx     = 0.0
    scene_radius = max(total_w, DEPTH) * 0.75
    setup_camera(scene_cx, max_height, scene_radius)
    setup_render()

    # ── Render preview ────────────────────────────────────────────────────────
    preview_path = OUTPUT_GLB.replace(".glb", "_preview_v2.png")
    bpy.context.scene.render.filepath = preview_path
    print("Rendering preview (AgX, blue hour)…")
    bpy.ops.render.render(write_still=True)
    print(f"Preview: {preview_path}")

    # ── Export GLB ────────────────────────────────────────────────────────────
    os.makedirs(os.path.dirname(OUTPUT_GLB), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=OUTPUT_GLB,
        export_format="GLB",
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_apply=True,
        export_tangents=False,
        use_selection=False,
        export_draco_mesh_compression_enable=False,
        export_image_format="AUTO",
    )
    glb_size = os.path.getsize(OUTPUT_GLB) / 1024 / 1024
    print(f"GLB: {OUTPUT_GLB} ({glb_size:.2f} MB)")

    # ── Write metadata ────────────────────────────────────────────────────────
    meta = {
        "version":          2,
        "projectId":        DATA.get("projectId", ""),
        "generatedAt":      DATA.get("exportedAt", ""),
        "blenderVersion":   bpy.app.version_string,
        "scaleMetersPerUnit": 1.0,
        "buildings":        meta_buildings,
    }
    os.makedirs(os.path.dirname(OUTPUT_META), exist_ok=True)
    with open(OUTPUT_META, "w", encoding="utf-8") as fh:
        json.dump(meta, fh, indent=2, ensure_ascii=False)
    print(f"Meta: {OUTPUT_META}")
    print(f"Total: {time.time()-t0:.1f}s")


main()
