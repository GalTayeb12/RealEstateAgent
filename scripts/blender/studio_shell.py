"""
Design Studio: give the empty apartment shell addressable surfaces.

Run on the blend written by twin_build.py --no-furnish:

  blender -b twin_walk.blend --python studio_shell.py -- <twinDir> <out.blend>

Every paintable baseline surface gets its own material named
"S|<surfaceId>" (ids as in lib/studio/schema/ids.ts: surface:<wall>:a|b,
surface:floor:<room>, surface:ceiling:<room>). Wall boxes are split by face
normal: faces looking to the left of the wall direction a->b belong to side "a",
faces looking right to side "b"; wall ends and tops keep the original material.
Wet-room tile cladding is assigned to the surface it covers.

The geometry is untouched, so the lightmap atlas (irradiance only) stays valid
when the viewer swaps these materials at runtime. Writes <twinDir>/surfaces.json.
"""
import bpy, os, re, sys, json

HERE = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else globals().get("SCRIPTS_DIR", "")
sys.path.insert(0, HERE)
import twin_plan as TP

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
SRC = globals().get("TWIN_DIR") or argv[0]
OUT_BLEND = globals().get("OUT_BLEND") or (argv[1] if len(argv) > 1 else None)

P = TP.Plan.load(SRC)
WALLS = {w.id: w for w in P.walls}
ROOMS = set(P.rooms.keys())
made = {}      # material name -> {"base": source material name, "uvScale": texture repeats per metre of the source}
assigned = {}  # surface id -> object count


def longest_id(rest, ids):
    """Longest id such that rest == id or rest starts with id + '_'."""
    best = None
    for i in ids:
        if (rest == i or rest.startswith(i + "_")) and (best is None or len(i) > len(best)):
            best = i
    return best


def mat_scale(m):
    """Same rule as apartment_bake.mat_scale: the Mapping node scale = texture repeats per metre."""
    if m and m.use_nodes:
        mp = next((n for n in m.node_tree.nodes if n.type == "MAPPING"), None)
        if mp:
            return float(mp.inputs["Scale"].default_value[0])
    return 1.0


def surf_mat(base, sid):
    name = f"S|{sid}"
    m = bpy.data.materials.get(name)
    if m is None:
        m = base.copy()
        m.name = name
        made[name] = {"base": base.name, "uvScale": mat_scale(base)}
    assigned[sid] = assigned.get(sid, 0) + 1
    return m


def slot_index(ob, mat):
    for i, m in enumerate(ob.data.materials):
        if m == mat:
            return i
    ob.data.materials.append(mat)
    return len(ob.data.materials) - 1


def whole_object(ob, sid):
    base = ob.data.materials[0] if ob.data.materials else None
    if base is None:
        return
    ob.data.materials[0] = surf_mat(base, sid)


def split_wall(ob, wall):
    base = ob.data.materials[0] if ob.data.materials else None
    if base is None:
        return
    nx, ny = wall.n
    rot = ob.matrix_world.to_3x3()
    idx = {}
    for p in ob.data.polygons:
        n = rot @ p.normal
        d = n.x * nx + n.y * ny
        side = "a" if d > 0.9 else "b" if d < -0.9 else None
        if side is None:
            continue
        if side not in idx:
            idx[side] = slot_index(ob, surf_mat(base, f"surface:{wall.id}:{side}"))
        p.material_index = idx[side]


apt = bpy.data.collections["APT"]
for ob in list(apt.objects):
    if ob.type != "MESH":
        continue
    n = ob.name
    for prefix in ("wall_", "lintel_", "sill_wall_"):
        if n.startswith(prefix):
            wid = longest_id(n[len(prefix):], WALLS.keys())
            if wid:
                split_wall(ob, WALLS[wid])
            break
    else:
        if n.startswith("tile_"):
            rest = n[len("tile_"):]
            wid = longest_id(rest, WALLS.keys())
            m = wid and re.match(r"^(-?1)_\d+_\d+$", rest[len(wid) + 1:])
            if m:
                whole_object(ob, f"surface:{wid}:{'a' if m.group(1) == '1' else 'b'}")
        elif n.startswith("floor_") and n[6:] in ROOMS:
            whole_object(ob, f"surface:floor:{n[6:]}")
        elif n.startswith("ceiling_") and n[8:] in ROOMS:
            whole_object(ob, f"surface:ceiling:{n[8:]}")
        elif n == "balcony_deck" and "balcony" in ROOMS:
            whole_object(ob, "surface:floor:balcony")
        elif n.startswith("balcony_deck_") and n[13:] in ROOMS:
            whole_object(ob, f"surface:floor:{n[13:]}")
        elif n.startswith("balcony_soffit_") and n[15:] in ROOMS:
            whole_object(ob, f"surface:ceiling:{n[15:]}")

json.dump({"materials": made, "objectsPerSurface": assigned}, open(os.path.join(SRC, "surfaces.json"), "w"), indent=1)
print(f"studio shell: {len(made)} surface materials, {sum(assigned.values())} object assignments")
if OUT_BLEND:
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
    print("saved", OUT_BLEND)
