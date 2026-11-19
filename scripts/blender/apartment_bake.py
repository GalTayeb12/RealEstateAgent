"""
Seed Yarkon walkthrough — bake + export for the web (run after apartment_walk.py).

Why baked lightmaps (not real-time lights, not Gaussian splats):
  * Cycles path-traced daylight + downlights, including bounce light, soft
    contact shadows and colour bleeding, is what makes the rooms read as
    photographs.  Real-time three.js lights can't do global illumination and
    SSAO only fakes contact shadows.
  * Lightmaps hold *irradiance only* (diffuse bake without colour), so the
    tiled PBR textures (oak, marble, plaster, Poly Haven furniture) stay sharp
    at any distance while the lighting lives in a low-frequency atlas.
  * Splats rendered from Cycles views would look even more photographic from
    trained viewpoints, but need a training toolchain, hundreds of MB for a
    whole apartment at walkable density, break down in unseen corners, and
    give no geometry for collisions.  A lightmapped mesh is ~20 MB, runs on
    phones and collides cheaply.

Steps (each a function, all run at the bottom):
  1. realize()      Poly Haven collection instances + modifiers -> plain meshes
                    in collection EXPORT, named "<group>|<room>|<name>".
  2. box_uvs()      the shell's object-space box-projected PBR materials become
                    real UVs in metres x texture scale (glTF needs UVs).
  3. lightmap_uvs() second UV map "LM", one shared atlas per group
                    (A = architecture + built-ins, B = Poly Haven furniture).
  4. bake()         Cycles DIFFUSE (direct+indirect, no colour) per group into a
                    float atlas -> EXR + 8-bit sRGB WebP-ready PNG with a scale.
  5. probes()       equirect reflection probes per room (for glossy floors).
  6. collision()    2D AABBs of everything you can bump into -> JSON.
  7. export()       GLB (WebP textures) for gltf-transform.

Configure with a WALK dict in the exec namespace, e.g.
  WALK = {"out": r"C:/.../assets-src/yarkon-v2/walk", "lm_size": 4096, "samples": 512}
"""
import bpy, bmesh, math, os, json
import numpy as np
from mathutils import Matrix, Vector

cfg = {"out": r"C:\RealEstateAgent\assets-src\yarkon-v2\walk", "lm_size": 4096,
       "samples": 512, "probe_samples": 256, "steps": "all"}
cfg.update(globals().get("WALK", {}))
OUT = cfg["out"]
os.makedirs(OUT, exist_ok=True)
H = 2.8
sc = bpy.context.scene

ROOMS = {  # name: (x1, y1, x2, y2) -- probe at the centre, eye-ish height
    "living":   (0.0, 0.0, 7.0, 4.6),
    "kitchen":  (3.2, 4.6, 7.0, 8.5),
    "corridor": (7.0, 3.4, 8.2, 8.5),
    "bed3":     (0.0, 4.6, 3.2, 8.5),
    "master":   (8.2, 0.0, 15.0, 4.6),
    "bed2":     (8.2, 4.6, 11.2, 8.5),
    "bath":     (11.2, 4.6, 15.0, 8.5),
    "balcony":  (0.0, -2.2, 15.0, 0.0),
}
PROBE_AT = {"living": (3.6, 2.4, 1.4), "kitchen": (5.1, 5.6, 1.4), "corridor": (7.6, 6.0, 1.4),
            "bed3": (1.6, 6.6, 1.4), "master": (11.4, 1.8, 1.4), "bed2": (9.8, 6.8, 1.4),
            "bath": (12.6, 6.0, 1.4)}
GLASS = {"glass", "shower_glass", "water"}
NO_LM = ("leaves", "calathea", "pachira", "potted_plant", "stem", "pebbles")  # alpha foliage: env-lit


def room_of(p):
    x, y = p.x, p.y
    if 7.0 <= x <= 7.0 + 1.2 and y >= 3.4:
        return "corridor"
    for n, (x1, y1, x2, y2) in ROOMS.items():
        if x1 - 0.05 <= x <= x2 + 0.05 and y1 - 0.05 <= y <= y2 + 0.05:
            return n
    return "living"


def fresh(name):
    col = bpy.data.collections.get(name)
    if col:
        for o in list(col.objects):
            bpy.data.objects.remove(o, do_unlink=True)
    else:
        col = bpy.data.collections.new(name)
        sc.collection.children.link(col)
    return col


def world_center(ob):
    bb = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    return sum(bb, Vector()) / 8, bb


# ── 1. realize ──────────────────────────────────────────────────────────────
def realize():
    EXP = fresh("EXPORT")
    dg = bpy.context.evaluated_depsgraph_get()

    def add(src, mw, group):
        ev = src.evaluated_get(dg)
        me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=dg)
        if len(me.polygons) == 0:
            bpy.data.meshes.remove(me)
            return None
        ob = bpy.data.objects.new("tmp", me)
        ob.matrix_world = mw
        EXP.objects.link(ob)
        c, _ = world_center(ob)
        mats = [m.name for m in me.materials if m]
        grp = group
        if any(k in src.name for k in NO_LM) or any(m in GLASS for m in mats):
            grp = "N"
        if any(m.startswith("led_warm") for m in mats):
            grp = "E"  # emissive: no lightmap needed
        ob.name = f"{grp}|{room_of(c)}|{src.name}"
        ob["lm_group"] = grp
        return ob

    for o in bpy.data.collections["APT"].objects:
        if o.type in {"MESH", "CURVE"} and o.name not in {"roof_slab", "slab"}:
            add(o, o.matrix_world.copy(), "A")
    for e in bpy.data.collections["PLACED"].objects:
        col = e.instance_collection
        off = Matrix.Translation(-Vector(col.instance_offset))
        for o in col.all_objects:
            if o.type == "MESH":
                add(o, e.matrix_world @ off @ o.matrix_world, "B")
    # apply transforms so vertex coords are world metres (box UVs + LM texel density)
    for ob in EXP.objects:
        ob.data = ob.data.copy() if ob.data.users > 1 else ob.data
        ob.data.transform(ob.matrix_world)
        ob.matrix_world = Matrix.Identity(4)
    for name in ("APT", "PLACED", "LIGHTS"):
        lc = bpy.context.view_layer.layer_collection.children.get(name)
        if lc and name != "LIGHTS":
            lc.exclude = True
    print("realized", len(EXP.objects))


def cull_hidden(ob):
    """Drop faces nobody can see from inside (wall tops in the ceiling, bottoms on the slab)."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    dead = []
    for f in bm.faces:
        c, n = f.calc_center_median(), f.normal
        if c.z > H + 0.005 or (n.z < -0.9 and c.z <= 0.001) or (n.z > 0.9 and c.z >= H - 0.001 and "ceiling" not in ob.name):
            dead.append(f)
    if dead and len(dead) < len(bm.faces):
        bmesh.ops.delete(bm, geom=dead, context="FACES")
        bm.to_mesh(ob.data)
    bm.free()


# ── 2. box UVs for the procedural shell ─────────────────────────────────────
def mat_scale(m):
    if m and m.use_nodes:
        mp = next((n for n in m.node_tree.nodes if n.type == "MAPPING"), None)
        if mp:
            return mp.inputs["Scale"].default_value[0]
    return 1.0


def box_uvs():
    for ob in bpy.data.collections["EXPORT"].objects:
        if ob["lm_group"] == "B" or "|" not in ob.name:
            continue
        src = ob.name.split("|", 2)[2]
        if src in bpy.data.objects and bpy.data.objects[src].name in bpy.data.collections["APT"].objects:
            cull_hidden(ob)
        me = ob.data
        while len(me.uv_layers) > 0:
            me.uv_layers.remove(me.uv_layers[0])
        uv = me.uv_layers.new(name="UVMap")
        for p in me.polygons:
            s = mat_scale(me.materials[p.material_index] if me.materials else None)
            n = p.normal
            ax = max(range(3), key=lambda i: abs(n[i]))
            for li in p.loop_indices:
                co = me.vertices[me.loops[li].vertex_index].co
                u, v = {0: (co.y, co.z), 1: (co.x, co.z), 2: (co.x, co.y)}[ax]
                uv.data[li].uv = (u * s, v * s)
    # materials: UV coords instead of object coords, scale baked into the UVs, no tint/bump nodes
    for m in bpy.data.materials:
        if not (m.use_nodes and m.users):
            continue
        nt = m.node_tree
        tc = next((n for n in nt.nodes if n.type == "TEX_COORD"), None)
        mp = next((n for n in nt.nodes if n.type == "MAPPING"), None)
        if not (tc and mp) or not any(l.from_socket == tc.outputs["Object"] for l in nt.links):
            continue
        for l in list(mp.inputs["Vector"].links):
            nt.links.remove(l)
        nt.links.new(tc.outputs["UV"], mp.inputs["Vector"])
        mp.inputs["Scale"].default_value = (1, 1, 1)
        for n in nt.nodes:
            if n.type == "TEX_IMAGE":
                n.projection = "FLAT"
        tint = nt.nodes.get("tint")
        if tint:
            img = tint.inputs[6].links[0].from_node
            bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
            nt.links.new(img.outputs["Color"], bsdf.inputs["Base Color"])
            nt.nodes.remove(tint)
    print("box uvs done")


# ── 3. lightmap UVs ─────────────────────────────────────────────────────────
def group_objs(g):
    return [o for o in bpy.data.collections["EXPORT"].objects if o.get("lm_group") == g]


def lightmap_uvs(g, margin=0.0015):
    obs = group_objs(g)
    for ob in obs:
        me = ob.data
        while len(me.uv_layers) > 1:
            me.uv_layers.remove(me.uv_layers[-1])
        if len(me.uv_layers) == 0:
            me.uv_layers.new(name="UVMap")
        me.uv_layers[0].active_render = True
        lm = me.uv_layers.new(name="LM")
        me.uv_layers.active = lm
    bpy.ops.object.mode_set(mode="OBJECT") if bpy.context.object and bpy.context.object.mode != "OBJECT" else None
    bpy.ops.object.select_all(action="DESELECT")
    for ob in obs:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=margin, area_weight=0.0,
                             correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.pack_islands(rotate=True, margin_method="FRACTION", margin=margin)
    bpy.ops.object.mode_set(mode="OBJECT")
    print("LM uvs", g, len(obs))


# ── 4. bake ─────────────────────────────────────────────────────────────────
def srgb_encode(x):
    x = np.clip(x, 0, 1)
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1 / 2.4) - 0.055)


def bake(g):
    obs = group_objs(g)
    size = cfg["lm_size"]
    name = f"LM_{g}"
    if name in bpy.data.images:
        bpy.data.images.remove(bpy.data.images[name])
    img = bpy.data.images.new(name, size, size, float_buffer=True, alpha=False)
    img.colorspace_settings.name = "Linear Rec.709" if "Linear Rec.709" in [i.name for i in bpy.types.ColorManagedInputColorspaceSettings.bl_rna.properties["name"].enum_items] else img.colorspace_settings.name
    mats = {m for o in obs for m in o.data.materials if m}
    for m in mats:
        nt = m.node_tree
        n = nt.nodes.get("LM_BAKE") or nt.nodes.new("ShaderNodeTexImage")
        n.name = "LM_BAKE"
        n.image = img
        uvn = nt.nodes.get("LM_UV") or nt.nodes.new("ShaderNodeUVMap")
        uvn.name = "LM_UV"
        uvn.uv_map = "LM"
        nt.links.new(uvn.outputs["UV"], n.inputs["Vector"])
        for x in nt.nodes:
            x.select = False
        n.select = True
        nt.nodes.active = n
    # glass would block daylight (refractive caustics off) -> hide it for the bake
    hidden = []
    for o in bpy.data.collections["EXPORT"].objects:
        if o.get("lm_group") == "N" and any(m and m.name in GLASS for m in o.data.materials):
            o.hide_render = True
            hidden.append(o)
    sc.render.engine = "CYCLES"
    sc.cycles.device = "GPU"
    sc.cycles.samples = cfg["samples"]
    sc.cycles.use_denoising = False
    sc.cycles.max_bounces = 8
    sc.cycles.diffuse_bounces = 6
    sc.cycles.caustics_reflective = False
    sc.cycles.caustics_refractive = False
    rb = sc.render.bake
    rb.use_pass_direct = rb.use_pass_indirect = True
    rb.use_pass_color = False
    rb.margin = 12
    rb.margin_type = "EXTEND"
    rb.use_clear = True
    rb.target = "IMAGE_TEXTURES"
    # Cycles bakes every selected object as its own session (slow with 200 objects):
    # bake one joined copy instead -- it carries the same LM UVs -- with the originals hidden.
    bpy.ops.object.select_all(action="DESELECT")
    tmp = []
    for o in obs:
        c = o.copy()
        c.data = o.data.copy()
        sc.collection.objects.link(c)
        tmp.append(c)
        o.hide_render = True
        hidden.append(o)
    with bpy.context.temp_override(active_object=tmp[0], selected_editable_objects=tmp, selected_objects=tmp):
        bpy.ops.object.join()
    joined = tmp[0]
    joined.name = f"BAKE_{g}"
    bpy.ops.object.select_all(action="DESELECT")
    joined.select_set(True)
    bpy.context.view_layer.objects.active = joined
    import time
    t = time.time()
    bpy.ops.object.bake(type="DIFFUSE", pass_filter={"DIRECT", "INDIRECT"}, use_clear=True, margin=12)
    print("baked", g, f"{time.time() - t:.0f}s")
    bpy.data.objects.remove(joined, do_unlink=True)
    for o in hidden:
        o.hide_render = False
    img.filepath_raw = os.path.join(OUT, f"{name}.exr")
    img.file_format = "OPEN_EXR"
    img.save()
    for m in mats:  # unhook so the exporter ignores it
        for k in ("LM_BAKE", "LM_UV"):
            if m.node_tree.nodes.get(k):
                m.node_tree.nodes.remove(m.node_tree.nodes[k])
    denoise(name)
    encode(name)


def denoise(name):
    """OIDN over the float atlas: a compositor-only render (Image -> Denoise -> output)."""
    src = os.path.join(OUT, f"{name}.exr")
    ng = bpy.data.node_groups.get("lm_denoise")
    if ng is not None and "src" not in ng.nodes:
        bpy.data.node_groups.remove(ng)
        ng = None
    if ng is None:
        ng = bpy.data.node_groups.new("lm_denoise", "CompositorNodeTree")
        ng.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
        a, d, o = ng.nodes.new("CompositorNodeImage"), ng.nodes.new("CompositorNodeDenoise"), ng.nodes.new("NodeGroupOutput")
        a.name = "src"
        ng.links.new(a.outputs["Image"], d.inputs["Image"])
        ng.links.new(d.outputs["Image"], o.inputs[0])
    for im in [i for i in bpy.data.images if i.filepath and os.path.normcase(bpy.path.abspath(i.filepath)) == os.path.normcase(src)]:
        bpy.data.images.remove(im)
    ng.nodes["src"].image = bpy.data.images.load(src)
    r = sc.render
    keep = (sc.compositing_node_group, r.use_compositing, r.resolution_x, r.resolution_y, r.resolution_percentage,
            sc.cycles.samples, r.image_settings.file_format, r.filepath)
    sc.compositing_node_group, r.use_compositing = ng, True
    r.resolution_x = r.resolution_y = cfg["lm_size"]
    r.resolution_percentage = 100
    sc.cycles.samples = 1
    r.image_settings.file_format = "OPEN_EXR"
    r.filepath = os.path.join(OUT, f"{name}_dn.exr")
    bpy.ops.render.render(write_still=True)
    (sc.compositing_node_group, r.use_compositing, r.resolution_x, r.resolution_y, r.resolution_percentage,
     sc.cycles.samples, r.image_settings.file_format, r.filepath) = keep
    print("denoised", name)


def encode(name, src=None, pct=99.7):
    """Float image -> 8-bit sRGB PNG of (value / scale); scale goes to lightmaps.json."""
    img = bpy.data.images.load(src or os.path.join(OUT, f"{name}_dn.exr"))
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(h, w, 4)[..., :3]
    lum = px.mean(axis=2)
    scale = float(np.percentile(lum[lum > 1e-5], pct)) * 1.25 if (lum > 1e-5).any() else 1.0
    enc = srgb_encode(px / scale)
    bpy.data.images.remove(img)
    if name + "_8" in bpy.data.images:
        bpy.data.images.remove(bpy.data.images[name + "_8"])
    out = bpy.data.images.new(name + "_8", w, h, alpha=False)
    out.colorspace_settings.name = "Non-Color"
    rgba = np.ones((h, w, 4), dtype=np.float32)
    rgba[..., :3] = enc
    out.pixels.foreach_set(rgba.ravel())
    out.filepath_raw = os.path.join(OUT, f"{name}.png")
    out.file_format = "PNG"
    out.save()
    meta_p = os.path.join(OUT, "lightmaps.json")
    meta = json.load(open(meta_p)) if os.path.exists(meta_p) else {}
    meta[name] = {"scale": scale, "size": w}
    json.dump(meta, open(meta_p, "w"), indent=1)
    print("encoded", name, "scale", scale)


# ── 5. reflection probes ────────────────────────────────────────────────────
def probes(res=(1024, 512)):
    cam = bpy.data.objects.get("ProbeCam") or bpy.data.objects.new("ProbeCam", bpy.data.cameras.new("ProbeCam"))
    if cam.name not in sc.collection.objects:
        sc.collection.objects.link(cam)
    cam.data.type = "PANO"
    try:
        cam.data.panorama_type = "EQUIRECTANGULAR"
    except (AttributeError, TypeError):
        cam.data.cycles.panorama_type = "EQUIRECTANGULAR"
    cam.rotation_euler = (math.pi / 2, 0, -math.pi / 2)  # equirect centre looks +Y? (fixed in JS by rotation)
    sc.camera = cam
    sc.compositing_node_group = None
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = False
    sc.cycles.samples = cfg["probe_samples"]
    sc.cycles.use_denoising = True
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    sc.view_settings.exposure = 0
    sc.render.image_settings.file_format = "OPEN_EXR"
    sc.render.image_settings.color_depth = "16"
    for r, p in PROBE_AT.items():
        cam.location = p
        sc.render.filepath = os.path.join(OUT, f"probe_{r}.exr")
        bpy.ops.render.render(write_still=True)
        encode(f"probe_{r}", src=sc.render.filepath, pct=98.0)
        print("probe", r)
    sc.view_settings.view_transform = "AgX"


# ── 5b. sky backdrop ────────────────────────────────────────────────────────
def sky():
    """World HDRI -> sky.png (scaled sRGB); its scale includes the Background strength
    and the mapping's Z rotation is reported for the viewer."""
    nt = sc.world.node_tree
    env = next(n for n in nt.nodes if n.type == "TEX_ENVIRONMENT")
    bg = next(n for n in nt.nodes if n.type == "BACKGROUND")
    mp = next((n for n in nt.nodes if n.type == "MAPPING"), None)
    path = os.path.join(OUT, "sky_src.exr")
    im = env.image.copy()
    im.filepath_raw = path
    im.file_format = "OPEN_EXR"
    im.save()
    bpy.data.images.remove(im)
    encode("sky", src=path, pct=99.0)
    meta_p = os.path.join(OUT, "lightmaps.json")
    meta = json.load(open(meta_p))
    meta["sky"]["scale"] *= bg.inputs["Strength"].default_value
    meta["sky"]["rot_z"] = mp.inputs["Rotation"].default_value[2] if mp else 0.0
    json.dump(meta, open(meta_p, "w"), indent=1)
    print("sky", meta["sky"])


# ── 6. collision boxes ──────────────────────────────────────────────────────
SKIP = ("floor_", "rug", "balcony_deck", "slab", "ceiling", "soffit", "cove", "lintel", "kitchen_header",
        "dl_", "led", "facade_head", "k_upper", "k_hood", "shower_head", "shower_arm", "sk_", "throw", "runner",
        "k_spout", "k_tap", "basin_tap", "basin_spout", "bath_mirror", "bath_led", "sill_stone", "k_backsplash",
        "bt_", "tv", "shower_tray", "wc_flush", "k_pull", "k_tall_pull", "island_oak", "win_frame", "pebbles")


def collision():
    boxes = []
    for o in bpy.data.collections["EXPORT"].objects:
        src = o.name.split("|", 2)[2]
        if any(k in src for k in SKIP):
            continue
        _, bb = world_center(o)
        xs, ys, zs = [v.x for v in bb], [v.y for v in bb], [v.z for v in bb]
        if min(zs) > 1.4 or max(zs) < 0.12:
            continue
        boxes.append([round(min(xs), 3), round(min(ys), 3), round(max(xs), 3), round(max(ys), 3)])
    json.dump({"boxes": boxes, "rooms": ROOMS, "probes": PROBE_AT, "spawn": [7.6, 7.9, 3.14159]},
              open(os.path.join(OUT, "collision.json"), "w"))
    print("collision boxes", len(boxes))


# ── 7. export ───────────────────────────────────────────────────────────────
def export():
    bpy.ops.object.select_all(action="DESELECT")
    for o in bpy.data.collections["EXPORT"].objects:
        o.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(OUT, "apartment_raw.glb"), export_format="GLB", use_selection=True,
        export_apply=True, export_texcoords=True, export_normals=True, export_materials="EXPORT",
        export_image_format="AUTO", export_lights=False, export_cameras=False, export_yup=True)
    print("exported")


steps = cfg["steps"]
if steps == "all":
    steps = ["realize", "box_uvs", "lm_A", "lm_B", "bake_A", "bake_B", "probes", "sky", "collision", "export"]
for s in steps:
    {"realize": realize, "box_uvs": box_uvs, "lm_A": lambda: lightmap_uvs("A"), "lm_B": lambda: lightmap_uvs("B"),
     "bake_A": lambda: bake("A"), "bake_B": lambda: bake("B"), "probes": probes, "sky": sky, "collision": collision,
     "export": export}[s]()
