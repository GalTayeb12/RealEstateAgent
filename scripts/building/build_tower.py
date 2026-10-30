"""
build_tower.py — Blender 4.2 headless architectural renderer
Usage:
  blender -b -P build_tower.py -- <input.json> <output.glb> <meta.json> [hdri.hdr]

Produces:
  output.glb  — baked architectural GLB (opaque meshes have combined bake,
                glass is real-time PBR via KHR_materials_transmission)
  meta.json   — floor-position metadata for browser hit-test layer
"""

import bpy, bmesh, json, math, os, sys, time
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

# ── Scale constants (meters) ──────────────────────────────────────────────────
FLOOR_H    = 3.20   # regular residential floor
LOBBY_H    = 4.80   # tall lobby
PENTH_H    = 4.40   # penthouse
UNIT_W     = 7.50   # unit slot width
TOWER_GAP  = 10.0   # gap between adjacent towers
DEPTH      = 13.50  # building front-to-back
SHELL_T    = 0.25   # concrete shell thickness
SLAB_H     = 0.16   # slab edge height
SLAB_OVR   = 0.22   # slab overhang past shell
MULL_W     = 0.08   # mullion width
MULL_D     = 0.12   # mullion depth
GLASS_SETB = 0.10   # glass recessed from slab edge
BAL_D      = 1.80   # balcony depth
BAL_T      = 0.12   # balcony slab thickness
RAIL_H     = 1.10   # glass railing height
RAIL_T     = 0.014  # railing thickness
INT_SETB   = 0.50   # interior room plane setback (behind glass)
BEVEL_R    = 0.04   # subtle corner bevel

# Setback: top 25% of residential floors step in
SETBACK_FRAC = 0.75
SETBACK_W    = 0.10  # fraction of width reduction per step


# ══════════════════════════════════════════════════════════════════════════════
# UTILITIES
# ══════════════════════════════════════════════════════════════════════════════

def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for b in list(bpy.data.meshes):   bpy.data.meshes.remove(b)
    for b in list(bpy.data.materials): bpy.data.materials.remove(b)
    for b in list(bpy.data.images):   bpy.data.images.remove(b)
    for b in list(bpy.data.lights):   bpy.data.lights.remove(b)
    for b in list(bpy.data.cameras):  bpy.data.cameras.remove(b)
    for b in list(bpy.data.worlds):   bpy.data.worlds.remove(b)


def link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def make_box(name, w, d, h, mat=None):
    """Box mesh with given dimensions, bottom at Z=0."""
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
    """Add a Bevel modifier for rounded corners."""
    mod = obj.modifiers.new("Bevel", "BEVEL")
    mod.width = amount
    mod.segments = segments
    mod.limit_method = "ANGLE"
    return obj


# ══════════════════════════════════════════════════════════════════════════════
# MATERIALS
# ══════════════════════════════════════════════════════════════════════════════

def make_mat(name, color, roughness=0.7, metallic=0.0, emission=None):
    """Simple Principled BSDF material (used pre-bake)."""
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
    out = nodes.new("ShaderNodeOutputMaterial")
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def make_glass_mat(name, color=(0.05, 0.12, 0.18), transmission=0.82):
    """Transparent glass — NOT baked, kept as real-time PBR."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.05
    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["Transmission Weight"].default_value = transmission
    bsdf.inputs["IOR"].default_value = 1.52
    out = nodes.new("ShaderNodeOutputMaterial")
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    mat.blend_method = "BLEND"
    mat.use_backface_culling = False
    # Tag this material so we skip it during baking
    mat["is_glass"] = True
    return mat


def make_emission_mat_from_image(name, img):
    """Emission-only material with baked image — exports as KHR_materials_unlit."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = img
    emit = nodes.new("ShaderNodeEmission")
    emit.inputs["Strength"].default_value = 1.0
    out = nodes.new("ShaderNodeOutputMaterial")
    links.new(tex.outputs["Color"], emit.inputs["Color"])
    links.new(emit.outputs["Emission"], out.inputs["Surface"])
    return mat


# ══════════════════════════════════════════════════════════════════════════════
# BUILDING GEOMETRY
# ══════════════════════════════════════════════════════════════════════════════

# These are populated in init_materials() after clear_scene(), so the
# Blender StructRNA references remain valid.
MAT_CONCRETE  = None
MAT_STONE     = None
MAT_SLAB      = None
MAT_MULLION   = None
MAT_ROOF      = None
MAT_GOLD      = None
MAT_GLASS     = None
MAT_GLASS_BAL = None
MAT_LOBBY_INT = None
MAT_GROUND    = None
MAT_PAVING    = None
MAT_POOL      = None

OPAQUE_OBJS = []  # collected for baking
GLASS_OBJS  = []  # NOT baked


def init_materials():
    """Create all shared materials. Must be called AFTER clear_scene()."""
    global MAT_CONCRETE, MAT_STONE, MAT_SLAB, MAT_MULLION, MAT_ROOF
    global MAT_GOLD, MAT_GLASS, MAT_GLASS_BAL, MAT_LOBBY_INT
    global MAT_GROUND, MAT_PAVING, MAT_POOL
    MAT_CONCRETE  = make_mat("concrete",  (0.55, 0.53, 0.50), roughness=0.80)   # darker — slab bands pop
    MAT_STONE     = make_mat("stone",     (0.70, 0.67, 0.62), roughness=0.66)
    MAT_SLAB      = make_mat("slab",      (0.92, 0.90, 0.86), roughness=0.50, metallic=0.02)  # bright contrast band
    MAT_MULLION   = make_mat("mullion",   (0.65, 0.63, 0.60), roughness=0.22, metallic=0.85)
    MAT_ROOF      = make_mat("roof",      (0.10, 0.26, 0.25), roughness=0.48, metallic=0.10)
    MAT_GOLD      = make_mat("gold",      (0.78, 0.61, 0.22), roughness=0.14, metallic=0.92)
    MAT_GLASS     = make_glass_mat("glass_curtain", (0.03, 0.07, 0.14), transmission=0.78)
    MAT_GLASS_BAL = make_glass_mat("glass_balcony", (0.04, 0.09, 0.16), transmission=0.72)
    # Lobby interior: warm glow but not overblown in WebGL (emission * 0.6)
    MAT_LOBBY_INT = make_mat("lobby_interior", (0.95, 0.78, 0.52), roughness=0.88,
                              emission=((1.0, 0.75, 0.38), 0.6))
    MAT_GROUND    = make_mat("ground",    (0.40, 0.48, 0.32), roughness=0.96)
    MAT_PAVING    = make_mat("paving",    (0.70, 0.68, 0.64), roughness=0.80, metallic=0.01)
    MAT_POOL      = make_mat("pool",      (0.14, 0.55, 0.68), roughness=0.03, metallic=0.6)


def floor_height(floor_data, top_floor_num):
    if floor_data["isLobby"]:
        return LOBBY_H
    if floor_data["isPenthouse"]:
        return PENTH_H
    return FLOOR_H


def build_floor(floor_data, base_y, fw, cx, cz, top_floor_num):
    """
    Build a single floor at the given world position.
    fw = effective front width, cx = tower center X, cz = tower front Z center.
    Returns list of opaque objects for this floor.
    """
    objs = []
    h = floor_height(floor_data, top_floor_num)
    is_lobby   = floor_data["isLobby"]
    is_penth   = floor_data["isPenthouse"]
    n_units    = len(floor_data["units"])
    even_floor = floor_data["floor"] % 2 == 0
    has_bal    = not is_lobby and not is_penth and even_floor and n_units > 0

    # ── Concrete shell: back wall ──
    o = make_box(f"shell_back_F{floor_data['floor']}", fw, SHELL_T, h, MAT_CONCRETE)
    o.location = (cx, cz - DEPTH / 2 + SHELL_T / 2, base_y)
    OPAQUE_OBJS.append(o); objs.append(o)

    # ── Concrete shell: side walls ──
    for sign, label in ((-1, "L"), (1, "R")):
        o = make_box(f"shell_side{label}_F{floor_data['floor']}",
                     SHELL_T, DEPTH - SHELL_T, h, MAT_CONCRETE)
        o.location = (cx + sign * (fw / 2 - SHELL_T / 2),
                      cz,
                      base_y)
        OPAQUE_OBJS.append(o); objs.append(o)

    # ── Slab edge band at floor base ──
    sw = fw + SLAB_OVR * 2
    sd = DEPTH + SLAB_OVR
    o = make_box(f"slab_F{floor_data['floor']}", sw, sd, SLAB_H, MAT_SLAB)
    o.location = (cx, cz, base_y)
    bevel_obj(o, amount=0.02, segments=1)
    OPAQUE_OBJS.append(o); objs.append(o)

    # ── Glass curtain wall (front face only) ──
    glass_w = fw - SHELL_T * 2
    glass_h = h - SLAB_H - 0.08
    glass_d = 0.04
    glass_z = cz + DEPTH / 2 - GLASS_SETB
    og = make_box(f"glass_F{floor_data['floor']}", glass_w, glass_d, glass_h,
                  MAT_LOBBY_INT if is_lobby else MAT_GLASS)
    og.location = (cx, glass_z, base_y + SLAB_H + 0.04)
    if is_lobby:
        OPAQUE_OBJS.append(og)
    else:
        GLASS_OBJS.append(og)
    objs.append(og)

    # ── Vertical mullions ──
    if not is_lobby and n_units > 0:
        slots = max(n_units, 2)
        slot_w = glass_w / slots
        for i in range(1, slots):
            mx = cx - glass_w / 2 + slot_w * i
            om = make_box(f"mull_v_F{floor_data['floor']}_M{i}",
                          MULL_W, MULL_D, glass_h, MAT_MULLION)
            om.location = (mx, glass_z, base_y + SLAB_H + 0.04)
            OPAQUE_OBJS.append(om); objs.append(om)

    # ── Horizontal spandrel mullion at 2/3 height ──
    if not is_lobby and h > FLOOR_H * 0.9:
        oh = make_box(f"mull_h_F{floor_data['floor']}",
                      glass_w, MULL_D, MULL_W, MAT_MULLION)
        oh.location = (cx, glass_z, base_y + h * 0.65)
        OPAQUE_OBJS.append(oh); objs.append(oh)

    # ── Lobby warm interior plane ──
    if is_lobby:
        oi = make_box("lobby_interior_plane",
                      glass_w - 0.4, 0.02, glass_h * 0.85, MAT_LOBBY_INT)
        oi.location = (cx, glass_z - INT_SETB, base_y + SLAB_H + 0.08)
        OPAQUE_OBJS.append(oi); objs.append(oi)

    # ── Penthouse gold accent strip ──
    if is_penth:
        op = make_box(f"penth_gold_F{floor_data['floor']}",
                      fw + 0.06, 0.08, 0.05, MAT_GOLD)
        op.location = (cx, glass_z, base_y + h - 0.025)
        OPAQUE_OBJS.append(op); objs.append(op)
        # Side fins
        for sign in (-1, 1):
            of = make_box(f"penth_fin_{sign}_F{floor_data['floor']}",
                          0.06, 0.06, h * 0.82, MAT_GOLD)
            of.location = (cx + sign * (fw / 2 + 0.02),
                           glass_z - 0.04,
                           base_y + h * 0.09)
            OPAQUE_OBJS.append(of); objs.append(of)

    # ── Balcony ──
    if has_bal:
        bal_z = glass_z + BAL_D / 2
        bal_w = fw * 0.55
        # Slab
        ob = make_box(f"balcony_slab_F{floor_data['floor']}",
                      bal_w, BAL_D, BAL_T, MAT_SLAB)
        ob.location = (cx, bal_z, base_y)
        bevel_obj(ob, amount=0.03, segments=1)
        OPAQUE_OBJS.append(ob); objs.append(ob)
        # Glass railing (front + two sides)
        for side, w, d, pos_y in [
            ("front", bal_w, RAIL_T, glass_z + BAL_D - RAIL_T / 2),
            ("L",     RAIL_T, BAL_D, glass_z + BAL_D / 2),
            ("R",     RAIL_T, BAL_D, glass_z + BAL_D / 2),
        ]:
            sgn = -1 if side == "L" else 1
            or_ = make_box(f"rail_{side}_F{floor_data['floor']}",
                           w if side == "front" else RAIL_T,
                           d if side != "front" else RAIL_T,
                           RAIL_H, MAT_GLASS_BAL)
            if side == "front":
                or_.location = (cx, pos_y, base_y + BAL_T)
            else:
                or_.location = (cx + sgn * (bal_w / 2 - RAIL_T / 2),
                                glass_z + BAL_D / 2, base_y + BAL_T)
            GLASS_OBJS.append(or_); objs.append(or_)

    return h  # return height consumed


def build_tower(bld, offset_x):
    """
    Build one tower. Returns list of (floor_num, base_y, top_y) for metadata.
    """
    floors_meta = []
    top_floor_num = max((f["floor"] for f in bld["floors"] if not f["isLobby"]), default=1)
    n_units_max = max((len(f["units"]) for f in bld["floors"]), default=1)
    base_width = max(n_units_max, 1) * UNIT_W
    cx = offset_x
    cz = 0.0  # tower centered at Z=0 (front face at cz + DEPTH/2)

    base_y = 0.0
    for fl in sorted(bld["floors"], key=lambda f: f["floor"]):
        # Setback for upper floors
        frac = fl["floor"] / top_floor_num if top_floor_num > 0 else 1
        if frac >= SETBACK_FRAC and not fl["isLobby"]:
            steps = math.ceil((frac - SETBACK_FRAC) / (1 - SETBACK_FRAC) * 2)
            fw = base_width * (1 - SETBACK_W * steps)
        else:
            fw = base_width

        h = build_floor(fl, base_y, fw, cx, cz, top_floor_num)
        floors_meta.append({
            "floor": fl["floor"],
            "isLobby": fl["isLobby"],
            "isPenthouse": fl["isPenthouse"],
            "baseY": round(base_y, 3),
            "topY": round(base_y + h, 3),
            "width": round(fw, 3),
            "depth": DEPTH,
            "centerX": round(cx, 3),
            "centerZ": round(cz, 3),
            "units": fl["units"],
        })
        base_y += h

    # ── Roof parapet ──
    top_fl = bld["floors"][-1]
    top_fw = base_width * (1 - SETBACK_W * 2)
    or1 = make_box("roof_parapet", top_fw + 0.30, DEPTH + 0.30, 0.22, MAT_ROOF)
    or1.location = (cx, cz, base_y)
    OPAQUE_OBJS.append(or1)

    # Crown / mechanical room
    or2 = make_box("roof_crown", top_fw * 0.38, DEPTH * 0.40, 0.65, MAT_ROOF)
    or2.location = (cx, cz, base_y + 0.22)
    OPAQUE_OBJS.append(or2)

    # Gold parapet cap strip
    or3 = make_box("roof_gold", top_fw + 0.30, 0.015, 0.015, MAT_GOLD)
    or3.location = (cx, cz + DEPTH / 2 + 0.005, base_y + 0.22)
    OPAQUE_OBJS.append(or3)

    return base_y, floors_meta


def build_ground(total_w, total_h):
    """Ground plane with grass, paving plaza, reflecting pool."""
    R = max(total_w, total_h) * 1.8
    # Grass
    og = make_box("ground_grass", R * 2, R * 2, 0.02, MAT_GROUND)
    og.location = (0, 0, -0.02)
    OPAQUE_OBJS.append(og)
    # Paved plaza
    op = make_box("plaza", total_w * 0.75, total_h * 0.45, 0.04, MAT_PAVING)
    op.location = (0, total_h * 0.08, 0)
    OPAQUE_OBJS.append(op)
    # Reflecting pool
    opl = make_box("pool", total_w * 0.22, total_h * 0.08, 0.08, MAT_POOL)
    opl.location = (0, total_h * 0.28, 0)
    OPAQUE_OBJS.append(opl)
    # Paths
    for xi in (-total_w * 0.18, total_w * 0.18):
        opa = make_box("path", total_w * 0.04, R, 0.02, MAT_PAVING)
        opa.location = (xi, 0, 0)
        OPAQUE_OBJS.append(opa)


def add_trees(total_w, total_h):
    """Simple low-poly trees (cone+cylinder) placed around the scene."""
    positions = [
        (-total_w * 0.36, -total_h * 0.20, 2.4),
        ( total_w * 0.36, -total_h * 0.25, 2.1),
        (-total_w * 0.44,  total_h * 0.18, 2.7),
        ( total_w * 0.42,  total_h * 0.14, 2.3),
        (-total_w * 0.20, -total_h * 0.40, 1.9),
        ( total_w * 0.22, -total_h * 0.38, 2.2),
    ]
    mat_trunk   = make_mat("tree_trunk",   (0.28, 0.18, 0.10), roughness=0.95)
    mat_foliage = make_mat("tree_foliage", (0.16, 0.32, 0.18), roughness=0.90)
    for i, (x, y, s) in enumerate(positions):
        # Trunk
        ot = make_box(f"tree_trunk_{i}", 0.32 * s, 0.32 * s, 1.6 * s, mat_trunk)
        ot.location = (x, y, 0)
        OPAQUE_OBJS.append(ot)
        # Lower foliage
        me = bpy.data.meshes.new(f"foliage_lower_{i}")
        bm2 = bmesh.new()
        bmesh.ops.create_cone(bm2, cap_ends=True, segments=10,
                               radius1=2.2 * s, radius2=0, depth=3.8 * s)
        bmesh.ops.translate(bm2, vec=(0, 0, 3.8 * s / 2), verts=bm2.verts)
        bm2.to_mesh(me); bm2.free()
        of1 = link(bpy.data.objects.new(f"foliage_lower_{i}", me))
        of1.location = (x, y, 1.6 * s)
        of1.data.materials.append(mat_foliage)
        OPAQUE_OBJS.append(of1)
        # Upper foliage (slightly narrower)
        me2 = bpy.data.meshes.new(f"foliage_upper_{i}")
        bm3 = bmesh.new()
        bmesh.ops.create_cone(bm3, cap_ends=True, segments=10,
                               radius1=1.4 * s, radius2=0, depth=2.6 * s)
        bmesh.ops.translate(bm3, vec=(0, 0, 2.6 * s / 2), verts=bm3.verts)
        bm3.to_mesh(me2); bm3.free()
        of2 = link(bpy.data.objects.new(f"foliage_upper_{i}", me2))
        of2.location = (x, y, 1.6 * s + 3.2 * s)
        of2.data.materials.append(mat_foliage)
        OPAQUE_OBJS.append(of2)


# ══════════════════════════════════════════════════════════════════════════════
# SCENE SETUP
# ══════════════════════════════════════════════════════════════════════════════

def setup_lighting():
    """HDRI + sun light for golden hour."""
    world = bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.use_nodes = True
    wt = world.node_tree
    wt.nodes.clear()
    bg = wt.nodes.new("ShaderNodeBackground")
    out_w = wt.nodes.new("ShaderNodeOutputWorld")
    wt.links.new(bg.outputs["Background"], out_w.inputs["Surface"])

    if HDRI_PATH and os.path.isfile(HDRI_PATH):
        env_tex = wt.nodes.new("ShaderNodeTexEnvironment")
        img = bpy.data.images.load(HDRI_PATH)
        env_tex.image = img
        rotate = wt.nodes.new("ShaderNodeMapping")
        coord  = wt.nodes.new("ShaderNodeTexCoord")
        wt.links.new(coord.outputs["Generated"], rotate.inputs["Vector"])
        wt.links.new(rotate.outputs["Vector"], env_tex.inputs["Vector"])
        wt.links.new(env_tex.outputs["Color"], bg.inputs["Color"])
        # Boost HDRI strength for vivid golden hour color cast
        bg.inputs["Strength"].default_value = 2.5
        # Rotate HDRI so the warm golden horizon is behind/left of the buildings
        # (visible in background above/around the towers)
        rotate.inputs["Rotation"].default_value = (0, 0, math.radians(160))
        print("HDRI loaded:", HDRI_PATH)
    else:
        bg.inputs["Color"].default_value = (0.85, 0.56, 0.22, 1.0)
        bg.inputs["Strength"].default_value = 2.0

    # Sun light — warm golden hour, very low angle (18°) from upper-left
    # This rakes across the glass facade, creating strong shadows and warm highlights
    sun = bpy.data.lights.new("Sun", "SUN")
    sun.energy = 10.0
    sun.color = (1.0, 0.75, 0.38)
    sun.angle = math.radians(0.8)
    sob = link(bpy.data.objects.new("Sun", sun))
    # 18° elevation, -30° azimuth — sun behind-left of camera, hitting the front facade
    sob.rotation_euler = (math.radians(18), 0, math.radians(-30))


def setup_camera(scene_center_x, max_height, scene_radius):
    cam = bpy.data.cameras.new("Camera")
    # 35mm gives wider FOV — important to frame full building height + some sky
    # 24mm ultra-wide — dramatic eye-level looking-up composition
    cam.lens = 24
    cam.clip_start = 0.1
    cam.clip_end = 1000.0
    cob = link(bpy.data.objects.new("Camera", cam))

    # 24mm on 36mm sensor (16:9): HFOV≈73.7°, half_HFOV≈36.9°
    # Need dist s.t. total_w / (2*tan(36.9°)) fits: dist ≥ total_w/2 / 0.75 ≈ total_w*0.67
    # We want buildings to fill ~80% of horizontal frame, plus be close for drama
    # Pull back enough for both towers to fit: left edge at -total_w/2, right edge +total_w/2
    # 24mm half-HFOV ≈ 36.9°. Need camera_Y > (total_w/2) / tan(36.9°) = total_w * 0.665
    # total_w ≈ 2*n_units*UNIT_W + GAP, estimated via scene_radius
    dist = max(scene_radius * 1.75, max_height * 2.8)

    # Symmetric / very slight side offset so BOTH towers fully fit
    cob.location = (
        scene_center_x + dist * 0.06,   # minimal X offset — nearly frontal
        +dist * 0.76,                    # positive Y — sees the glass front facade
        3.5,                             # eye level (3.5m above ground)
    )
    # Strong upward look — dramatic tower perspective
    look_at = Vector((scene_center_x, 0, max_height * 0.62))
    direction = look_at - Vector(cob.location)
    rot_quat = direction.to_track_quat("-Z", "Y")
    cob.rotation_euler = rot_quat.to_euler()
    bpy.context.scene.camera = cob
    return cob


def setup_render():
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = 128
    sc.cycles.use_denoising = True
    sc.cycles.denoiser = "OPENIMAGEDENOISE"
    sc.render.resolution_x = 1920
    sc.render.resolution_y = 1080
    sc.render.resolution_percentage = 75  # 1440×810 for previews — faster iteration
    sc.render.film_transparent = False
    # Filmic colour management
    sc.view_settings.view_transform = "Filmic"
    sc.view_settings.look = "Medium High Contrast"
    sc.view_settings.exposure = 0.3


# ══════════════════════════════════════════════════════════════════════════════
# BAKING
# ══════════════════════════════════════════════════════════════════════════════

BAKE_RES = 2048

def uv_unwrap_object(obj):
    """Smart UV project, returns True on success."""
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    try:
        bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.02)
    except Exception as e:
        print(f"  UV fail on {obj.name}: {e}")
    finally:
        bpy.ops.object.mode_set(mode="OBJECT")


def bake_object(obj):
    """
    UV-unwrap and bake COMBINED light to an image texture.
    Replace material with emission-only material using the baked image.
    """
    # Apply modifiers first
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    for mod in obj.modifiers:
        try:
            bpy.ops.object.modifier_apply(modifier=mod.name)
        except Exception:
            pass

    uv_unwrap_object(obj)

    # Create bake image
    img_name = f"bake_{obj.name}"
    bake_img = bpy.data.images.new(img_name, width=BAKE_RES, height=BAKE_RES,
                                    alpha=False, float_buffer=False)
    bake_img.colorspace_settings.name = "sRGB"

    # Add Image Texture node to all materials
    for slot in obj.material_slots:
        mat = slot.material
        if mat is None:
            continue
        mat.use_nodes = True
        nodes = mat.node_tree.nodes
        img_node = nodes.new("ShaderNodeTexImage")
        img_node.image = bake_img
        # Make it the active node for baking
        nodes.active = img_node

    # Bake
    bpy.context.scene.cycles.bake_type = "COMBINED"
    bpy.ops.object.bake(
        type="COMBINED",
        use_clear=True,
        # AO was removed from pass_filter in Blender 4.x — use DIRECT+INDIRECT only
        pass_filter={"DIRECT", "INDIRECT", "COLOR", "DIFFUSE", "GLOSSY"},
    )

    # Replace material with emission-only using the baked image
    baked_mat = make_emission_mat_from_image(f"baked_{obj.name}", bake_img)
    obj.data.materials.clear()
    obj.data.materials.append(baked_mat)

    # Save image to disk (for GLB embedding we'll pack later)
    img_path = os.path.join(os.path.dirname(OUTPUT_GLB),
                             f"{img_name}.png")
    bake_img.filepath_raw = img_path
    bake_img.file_format = "PNG"
    bake_img.save()


# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════

def main():
    t0 = time.time()
    clear_scene()
    init_materials()

    buildings = DATA["buildings"]
    n = len(buildings)

    # Layout towers along X axis, centred at origin
    total_w = sum(max(len(f["units"]) for f in b["floors"]) * UNIT_W
                  for b in buildings) + TOWER_GAP * (n - 1)
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
            "id": bld["id"],
            "name": bld["name"],
            "worldX": round(cx, 3),
            "worldZ": 0.0,
            "floors": floors_meta,
        })
        cursor += tw + TOWER_GAP

    # Ground + trees
    build_ground(total_w, DEPTH)
    add_trees(total_w, DEPTH * 2)

    print(f"Geometry built: {len(OPAQUE_OBJS)} opaque + {len(GLASS_OBJS)} glass objects")
    print(f"Max building height: {max_height:.1f} m")
    print(f"Time: {time.time()-t0:.1f}s")

    # ── Lighting, camera, render settings ──
    setup_lighting()
    scene_cx = 0.0  # centred
    scene_radius = max(total_w, DEPTH) * 0.75
    setup_camera(scene_cx, max_height, scene_radius)
    setup_render()

    # ── Render preview (Cycles, 75% resolution for speed) ──
    preview_path = OUTPUT_GLB.replace(".glb", "_preview.png")
    bpy.context.scene.render.filepath = preview_path
    print("Rendering preview...")
    bpy.ops.render.render(write_still=True)
    print(f"Preview saved: {preview_path}")

    # ── NOTE on baking ──
    # Per-object Cycles baking is prohibitively slow (~5 min/object × 161 objects).
    # Strategy: export PBR GLB with Principled BSDF materials; the browser handles
    # real-time lighting via HDRI + drei <Environment>.  Lightmap baking can be
    # revisited later with a single merged mesh + UV atlas approach.

    # ── Export GLB ──
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
        export_draco_mesh_compression_enable=False,  # will compress externally
        export_image_format="AUTO",
    )
    glb_size = os.path.getsize(OUTPUT_GLB) / 1024 / 1024
    print(f"GLB exported: {OUTPUT_GLB} ({glb_size:.1f} MB)")

    # ── Write metadata JSON ──
    meta = {
        "version": 1,
        "projectId": DATA.get("projectId", ""),
        "generatedAt": DATA.get("exportedAt", ""),
        "blenderVersion": bpy.app.version_string,
        "scaleMetersPerUnit": 1.0,
        "buildings": meta_buildings,
    }
    os.makedirs(os.path.dirname(OUTPUT_META), exist_ok=True)
    with open(OUTPUT_META, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2, ensure_ascii=False)
    print(f"Metadata written: {OUTPUT_META}")
    print(f"Total time: {time.time()-t0:.1f}s")


main()
