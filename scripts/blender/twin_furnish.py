"""
Furnish a generated apartment by rule — run by twin_build.py after the shell
(or on its own, with P = twin_plan.Plan and M = apt_lib.materials() in globals).

Every room type has a short recipe: which pieces, against which walls, with
what clearance. Candidates are generated along the room's wall stretches (or
on a grid for free-standing pieces), scored, and the first one that
  * stays inside the room and off the walls,
  * stays out of every door swing and doorway approach (Plan.keepouts),
  * keeps its own clearance zone (front of a wardrobe, foot of a bed) free,
  * and still leaves a 0.6 m wide path from the entry to both sides of every
    doorway (Grid.ok: a 0.3 m-radius walker flood-filled from the spawn)
is built. Optional pieces (armchairs, plants, desks) are simply skipped when
nothing passes.

Built-ins (beds, wardrobes, kitchen, bath fixtures, sofa, dining table) are
procedural boxes in APT, as in apartment_walk.py (lightmap group A); loose
furniture is Poly Haven collection instances in PLACED (group B), as in
apartment_furnish.py. Writes furniture.json next to the twin (the plan's own
view of every piece) for debugging.
"""
import bpy, bmesh, json, math, os, sys, time, importlib
from mathutils import Matrix

HERE = globals().get("SCRIPTS_DIR") or os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import apt_lib as L
import twin_plan as TP

t0 = time.time()
P = globals().get("P")
M = globals().get("M") or L.materials()
APT = bpy.data.collections["APT"]
L.ctx.col, L.ctx.cut = APT, 99.0
PLACED = L.fresh_collection("PLACED")
H = P.H
GRID = P.grid()
print(f"furnish: grid {GRID.nx}x{GRID.ny} in {time.time() - t0:.1f}s, doors unreachable before furniture: {GRID.unreachable()}")

SOLIDS = []   # (rect, name) of everything placed: later pieces must not overlap
CLEARS = []   # clearance zones of placed pieces: later solids must not overlap
LOG = []      # what furniture.json records

# Poly Haven footprints (x, y) when facing -Y, measured from apartment.blend's asset collections
ASSET = {
    "modern_arm_chair_01": (0.82, 0.99), "side_table_01": (0.55, 0.45), "potted_plant_01": (0.55, 0.55),
    "dining_chair_02": (0.43, 0.58), "bar_chair_round_01": (0.48, 0.49), "modern_coffee_table_01": (1.2, 0.6),
    "mid_century_lounge_chair": (1.01, 1.19), "outdoor_table_chair_set_01": (0.78, 1.83),
    "painted_wooden_chair_02": (0.64, 0.66), "ceramic_vase_01": (0.2, 0.21),
}


# ── small geometry helpers ───────────────────────────────────────────────────
def frect(fr, a1, b1, a2, b2):
    p, q = fr.pt(a1, b1), fr.pt(a2, b2)
    return [min(p[0], q[0]), min(p[1], q[1]), max(p[0], q[0]), max(p[1], q[1])]


def rot_to(d):
    """Z rotation (deg) that turns an asset facing -Y to face direction d."""
    return math.degrees(math.atan2(d[0], -d[1]))


def asset_rect(asset, x, y, rot):
    sx, sy = ASSET[asset]
    if abs(math.sin(math.radians(rot))) > 0.7:
        sx, sy = sy, sx
    return [x - sx / 2, y - sy / 2, x + sx / 2, y + sy / 2]


def inside_room(r, rid, allow=()):
    """All sample points of rect r lie in room rid (or an allowed neighbour) and off the walls."""
    x1, y1, x2, y2 = r
    nx, ny = max(2, int((x2 - x1) / 0.1) + 1), max(2, int((y2 - y1) / 0.1) + 1)
    for i in range(nx):
        for j in range(ny):
            x = x1 + 0.01 + (x2 - x1 - 0.02) * i / (nx - 1)
            y = y1 + 0.01 + (y2 - y1 - 0.02) * j / (ny - 1)
            room = P.room_at(x, y)
            if (room != rid and room not in allow) or P.in_wall(x, y):
                return False
    return True


class Room:
    def __init__(self, rid):
        self.id, self.type = rid, P.rtype[rid]
        self.inner, self.sides = P.room_sides(rid)
        self.keep = P.keepouts(rid)
        X1, Y1, X2, Y2 = self.inner
        self.w, self.d = X2 - X1, Y2 - Y1
        # which side of the rectangle each doorway of this room is on
        self.door_sides = set()
        for o in P.layout["openings"]:
            if o["kind"] in TP.PASSABLE and rid in (o["front"], o["back"]):
                cx, cy = o["centre"]
                dist = {"S": abs(cy - Y1), "N": abs(cy - Y2), "W": abs(cx - X1), "E": abs(cx - X2)}
                self.door_sides.add(min(dist, key=dist.get))

    def depth(self, side):
        return self.d if side["name"] in "SN" else self.w

    def frame(self, side):
        return L.Frame(side["o"][0], side["o"][1], side["u"][0], side["u"][1])

    def relation(self, side):
        """'opposite' / 'beside' / 'door' relative to this room's doors."""
        opp = {"S": "N", "N": "S", "E": "W", "W": "E"}
        n = side["name"]
        if n in self.door_sides:
            return "door"
        if opp[n] in self.door_sides:
            return "opposite"
        return "beside"

    def wall_cands(self, length, ok, step=0.1, align="any"):
        """(side, a1, a2) for a piece of `length` against stretches whose kinds pass ok()."""
        out = []
        for side in self.sides.values():
            for s1, s2 in P.stretches(side, ok):
                if s2 - s1 < length - 1e-6:
                    continue
                n = int((s2 - s1 - length) / step + 1e-6)
                pos = sorted({round(s1 + k * step, 3) for k in range(n + 1)} | {round(s2 - length, 3)})
                if align == "ends":
                    pos = sorted({round(s1, 3), round(s2 - length, 3)})
                for a1 in pos:
                    out.append((side, a1, a1 + length, s1, s2))
        return out


def overlaps_any(r, rects):
    return any(TP.overlap(r, o) for o in rects)


def try_place(name, room, cands, allow=(), max_path_checks=30, quiet=False):
    """cands: [(score, solids[list rect], clears[list rect], must[list pt], payload)].
    Returns the payload of the best candidate that passes, after registering its boxes."""
    cands = sorted(cands, key=lambda c: -c[0])
    checked = 0
    why = {"outside": 0, "solid": 0, "clear": 0, "keep": 0, "clear_blocked": 0, "path": 0}
    solid_rects = [s for s, _ in SOLIDS]
    for score, solids, clears, must, payload in cands:
        if any(not inside_room(s, room.id, allow) for s in solids):
            why["outside"] += 1
            continue
        if any(overlaps_any(s, solid_rects) for s in solids):
            why["solid"] += 1
            continue
        if any(overlaps_any(s, CLEARS) for s in solids):
            why["clear"] += 1
            continue
        if any(overlaps_any(s, room.keep) for s in solids):
            why["keep"] += 1
            continue
        if any(overlaps_any(c, solid_rects) or not inside_room(c, room.id, allow + tuple(P.rooms)) for c in clears):
            why["clear_blocked"] += 1
            continue
        checked += 1
        if checked > max_path_checks:
            break
        if not GRID.ok(extra=solids, must=must):
            why["path"] += 1
            continue
        for s in solids:
            SOLIDS.append((s, name))
            GRID.add(s)
        CLEARS.extend(clears)
        LOG.append({"room": room.id, "item": name, "boxes": [[round(v, 3) for v in s] for s in solids], "score": round(score, 2)})
        return payload
    if not quiet:
        print(f"  - {room.id}: no spot for {name} ({len(cands)} candidates, {checked} path-checked; rejected: " + ", ".join(f"{k}={v}" for k, v in why.items() if v) + ")")
    return None


def snapshot():
    return len(SOLIDS), len(CLEARS), len(LOG), bytearray(GRID.blocked)


def restore(snap):
    n1, n2, n3, blocked = snap
    del SOLIDS[n1:], CLEARS[n2:], LOG[n3:]
    GRID.blocked = blocked


def put(asset, x, y, rot=0.0, z=0.0, s=1.0):
    src = bpy.data.collections.get(asset)
    if src is None:
        print("missing asset", asset)
        return None
    e = bpy.data.objects.new(f"{asset}@{x:.1f},{y:.1f}", None)
    e.instance_type = "COLLECTION"
    e.instance_collection = src
    e.location = (x, y, z)
    e.rotation_euler = (0, 0, math.radians(rot))
    e.scale = (s, s, s)
    PLACED.objects.link(e)
    return e


def kind_wall(k):
    return k == "wall"


def kind_wall_or_high_window(min_sill):
    return lambda k: k == "wall" or (k.startswith("window:") and float(k[7:]) >= min_sill)


# ── procedural pieces (local frame: a along the wall, b into the room) ──────
def build_bed(fr, name, a1, a2, bl):
    box = fr.box
    box(f"{name}_base", a1, 0.0, 0.0, a2, bl, 0.3, M["oak"], bevel=0.01)
    box(f"{name}_mattress", a1 + 0.04, 0.04, 0.3, a2 - 0.04, bl - 0.04, 0.52, M["fabric_white"], bevel=0.05)
    box(f"{name}_headboard", a1, 0.0, 0.0, a2, 0.08, 1.05, M["fabric_sand"], bevel=0.02)
    box(f"{name}_duvet", a1 + 0.02, bl * 0.3, 0.5, a2 - 0.02, bl - 0.02, 0.6, M["fabric_white"], bevel=0.05)
    box(f"{name}_throw", a1, bl - 0.55, 0.6, a2, bl - 0.1, 0.63, M["fabric_sage"], bevel=0.02)
    n = 2 if a2 - a1 > 1.3 else 1
    for i in range(n):
        pa = a1 + (a2 - a1) * (i + 0.5) / n
        box(f"{name}_pillow{i}", pa - 0.33, 0.17, 0.52, pa + 0.33, 0.53, 0.68, M["fabric_white"], bevel=0.07)
    for o in APT.objects:
        if o.name.startswith(name) and any(k in o.name for k in ("_duvet", "_pillow", "_mattress", "_throw")):
            for m in o.modifiers:
                if m.type == "BEVEL":
                    m.segments, m.width = 6, m.width * 1.4


def build_wardrobe(fr, name, a1, a2, dep=0.58, h=None):
    h = h or H - 0.02
    GAP = 0.003
    fr.box(f"{name}_carcass", a1, 0.0, 0.0, a2, dep, h, M["lacquer"])
    fr.box(f"{name}_plinth", a1, dep - 0.04, 0.0, a2, dep, 0.06, M["lacquer_dark"])
    n = max(2, round((a2 - a1) / 0.55))
    w = (a2 - a1) / n
    for i in range(n):
        a, b = a1 + i * w + GAP, a1 + (i + 1) * w - GAP
        fr.box(f"{name}_door{i}", a, dep, 0.065, b, dep + 0.02, h - 0.01, M["oak"], bevel=0.002)
        pa = b - 0.06 if i % 2 == 0 else a + 0.045
        fr.box(f"{name}_pull{i}", pa, dep + 0.02, 0.85, pa + 0.015, dep + 0.035, 1.45, M["lacquer_dark"])


def build_sofa(fr, name, a1, a2, b1, b2):
    """Sofa with its back at b1, seat towards b2 (faces +v)."""
    box, fb = fr.box, M["fabric_beige"]
    box(f"{name}_base", a1, b1, 0.06, a2, b2, 0.38, fb, bevel=0.04)
    box(f"{name}_back", a1, b1, 0.38, a2, b1 + 0.24, 0.78, fb, bevel=0.08)
    box(f"{name}_arm_l", a1, b1, 0.38, a1 + 0.22, b2, 0.62, fb, bevel=0.07)
    box(f"{name}_arm_r", a2 - 0.22, b1, 0.38, a2, b2, 0.62, fb, bevel=0.07)
    n = 3 if a2 - a1 > 2.2 else 2
    w = (a2 - a1 - 0.44) / n
    for i in range(n):
        a = a1 + 0.22 + i * w
        box(f"{name}_seat{i}", a + 0.01, b1 + 0.25, 0.38, a + w - 0.01, b2 - 0.02, 0.52, fb, bevel=0.06)
    for i, aa in enumerate((a1 + 0.55, a2 - 0.55)):
        box(f"{name}_pillow{i}", aa - 0.24, b1 + 0.2, 0.5, aa + 0.24, b1 + 0.36, 0.92,
            M["fabric_sage" if i else "fabric_sand"], bevel=0.07)
    for aa in (a1 + 0.12, a2 - 0.12):
        box(f"{name}_leg{aa:.1f}", aa - 0.03, b1 + 0.1, 0.0, aa + 0.03, b1 + 0.16, 0.06, M["black"])
    for o in APT.objects:
        if o.name.startswith(name) and any(k in o.name for k in ("_seat", "_back", "_arm", "_pillow")):
            for m in o.modifiers:
                if m.type == "BEVEL":
                    m.segments, m.width = 6, m.width * 1.4


def build_tub(x1, y1, x2, y2, h=0.58, wall=0.06):
    me = bpy.data.meshes.new("tub")
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x = x1 if v.co.x < 0 else x2
        v.co.y = y1 if v.co.y < 0 else y2
        v.co.z = 0.0 if v.co.z < 0 else h
    top = next(f for f in bm.faces if f.normal.z > 0.9)
    bmesh.ops.inset_region(bm, faces=[top], thickness=wall, depth=0)
    bmesh.ops.inset_region(bm, faces=[top], thickness=0.04, depth=0)
    bmesh.ops.translate(bm, vec=(0, 0, -(h - 0.12)), verts=top.verts)
    bmesh.ops.scale(bm, vec=(0.88, 0.8, 1), space=Matrix.Translation(-top.calc_center_median()), verts=top.verts)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("tub", me)
    APT.objects.link(ob)
    ob.data.materials.append(M["porcelain"])
    return L.subsurf(ob, 3)


# ── recipes ──────────────────────────────────────────────────────────────────
def furnish_kitchen(room):
    kz = 0.9
    best = None
    for allow_window, bonus in ((False, 2.0), (True, 0.0)):
        ok = kind_wall if not allow_window else kind_wall_or_high_window(0.85)
        cands = []
        for side in room.sides.values():
            fr = room.frame(side)
            for s1, s2 in P.stretches(side, ok):
                # longest run first, shortened in 30 cm steps to clear doorways; at either end or centred
                lengths = [L for L in (min(s2 - s1, 4.2) - k * 0.3 for k in range(8)) if L >= 1.8]
                for Lr, a1 in [(Lr, a1) for Lr in lengths for a1 in sorted({s1, s2 - Lr, (s1 + s2) / 2 - Lr / 2})]:
                    a2 = a1 + Lr
                    corner = a1 < 0.05 or a2 > side["L"] - 0.05
                    score = bonus + Lr + (0.5 if room.relation(side) != "door" else 0) + (0.3 if corner else 0)
                    win = any(k.startswith("window") for k in side["kinds"][int(a1 / side["step"]):int(a2 / side["step"])])
                    cands.append((score, [frect(fr, a1, 0, a2, 0.64)], [frect(fr, a1, 0.64, a2, 1.6)], [], (side, a1, a2, win)))
        best = try_place("kitchen_run", room, cands)
        if best:
            break
    if not best:
        return
    side, a1, a2, win = best
    fr = room.frame(side)
    box = fr.box
    GAP = 0.003
    tall = a2 - a1 >= 2.6
    e = a2 - 0.68 if tall else a2
    box("k_plinth", a1, 0.0, 0, e, 0.52, 0.1, M["lacquer_dark"])
    box("k_carcass", a1, 0.0, 0.1, e, 0.56, kz - 0.04, M["lacquer"])
    n = max(2, round((e - a1) / 0.6))
    cols = [a1 + (e - a1) * i / n for i in range(n + 1)]
    sink_i = max(0, round(n * 0.3) - (1 if n > 2 else 0))
    hob_i = min(n - 1, max(sink_i + 1, round(n * 0.75) - 1))
    for i in range(n):
        a, c = cols[i] + GAP, cols[i + 1] - GAP
        if i == sink_i:
            box(f"k_front_{i}", a, 0.56, 0.11, c, 0.58, kz - 0.05, M["lacquer"], bevel=0.002)
        else:
            for j, (z1, z2) in enumerate([(0.11, 0.38), (0.38 + GAP, 0.62), (0.62 + GAP, kz - 0.05)]):
                box(f"k_drawer_{i}_{j}", a, 0.56, z1, c, 0.58, z2, M["lacquer"], bevel=0.002)
        box(f"k_pull_{i}", a + 0.05, 0.58, kz - 0.09, c - 0.05, 0.592, kz - 0.075, M["brass"])
    box("k_top", a1, 0.0, kz - 0.03, e, 0.61, kz, M["quartz"], bevel=0.002)
    box("k_backsplash", a1, 0.0, kz, e, 0.015, 1.5 if not win else kz + 0.1, M["marble"])
    sc = (cols[sink_i] + cols[sink_i + 1]) / 2
    box("k_sink_rim", sc - 0.35, 0.1, kz - 0.002, sc + 0.35, 0.46, kz + 0.0005, M["steel"])
    box("k_sink_bowl", sc - 0.32, 0.13, kz - 0.2, sc + 0.32, 0.43, kz - 0.001, M["steel"])
    fr.cyl("k_tap", sc, 0.06, kz, kz + 0.34, 0.016, M["steel"])
    box("k_spout", sc - 0.012, 0.06, kz + 0.31, sc + 0.012, 0.26, kz + 0.335, M["steel"])
    hc = (cols[hob_i] + cols[hob_i + 1]) / 2
    box("k_hob", hc - 0.33, 0.1, kz, hc + 0.33, 0.5, kz + 0.004, M["screen"], bevel=0.002)
    if not win:
        box("k_hood", hc - 0.3, 0.0, 1.62, hc + 0.3, 0.5, 1.72, M["steel"], bevel=0.003)
        box("k_hood_chimney", hc - 0.15, 0.0, 1.72, hc + 0.15, 0.3, H, M["lacquer"])
        for k, (u1, u2) in enumerate(((a1, hc - 0.35), (hc + 0.35, e))):
            if u2 - u1 < 0.3:
                continue
            box(f"k_upper_{k}", u1, 0.0, 1.55, u2, 0.34, 2.35, M["lacquer"], bevel=0.002)
            m = max(1, round((u2 - u1) / 0.45))
            for i in range(m):
                p1, p2 = u1 + (u2 - u1) * i / m + GAP, u1 + (u2 - u1) * (i + 1) / m - GAP
                box(f"k_upper_door_{k}_{i}", p1, 0.34, 1.55, p2, 0.36, 2.35, M["lacquer"], bevel=0.002)
            box(f"k_upper_led_{k}", u1 + 0.05, 0.26, 1.545, u2 - 0.05, 0.3, 1.55, M["led"])
            box(f"k_upper_tail_{k}", u1, 0.0, 2.35, u2, 0.3, H, M["lacquer"])
    if tall:
        box("k_tall", e, 0.0, 0, a2, 0.56, H - 0.01, M["lacquer"])
        box("k_fridge_door", e + GAP, 0.56, 0.1, a2 - GAP, 0.58, 1.85, M["lacquer"], bevel=0.002)
        box("k_tall_door", e + GAP, 0.56, 1.85 + GAP, a2 - GAP, 0.58, H - 0.02, M["lacquer"], bevel=0.002)
        box("k_tall_pull", e + 0.04, 0.58, 0.6, e + 0.055, 0.6, 1.6, M["brass"])

    # island when the room is deep enough: run 0.64 + aisle 1.05 + island 1.05 + stools 0.9
    if room.depth(side) >= 3.55:
        Li = min(e - a1 - 0.2, 2.6)
        cands = []
        if Li >= 1.4:
            for shift in (0.0, -0.2, 0.2, -0.4, 0.4):
                ia1 = (a1 + e) / 2 - Li / 2 + shift
                b1 = 0.64 + 1.05
                solid = frect(fr, ia1, b1, ia1 + Li, b1 + 1.05)
                stools = frect(fr, ia1, b1 + 1.05, ia1 + Li, b1 + 1.6)
                cands.append((-abs(shift), [solid, stools], [frect(fr, ia1, 0.64, ia1 + Li, b1)], [], (ia1, b1)))
        got = try_place("island", room, cands, allow=tuple(r for r in P.rooms if P.rtype[r] in ("living", "dining", "corridor")))
        if got:
            ia1, b1 = got
            ia2 = ia1 + Li
            box("island_core", ia1 + 0.13, b1 + 0.07, 0.0, ia2 - 0.13, b1 + 0.98, kz - 0.03, M["lacquer"])
            box("island_oak", ia1 + 0.13, b1 + 0.98, 0.1, ia2 - 0.13, b1 + 1.02, kz - 0.03, M["oak"], bevel=0.002)
            box("island_top", ia1, b1, kz - 0.03, ia2, b1 + 1.05, kz, M["quartz"], bevel=0.002)
            box("island_wf_a", ia1, b1, 0.0, ia1 + 0.03, b1 + 1.05, kz - 0.03, M["quartz"])
            box("island_wf_b", ia2 - 0.03, b1, 0.0, ia2, b1 + 1.05, kz - 0.03, M["quartz"])
            n = max(2, int(Li / 0.7))
            for i in range(n):
                x, y = fr.pt(ia1 + Li * (i + 0.5) / n, b1 + 1.3)
                put("bar_chair_round_01", x, y, rot=rot_to((-fr.v[0], -fr.v[1])))
            x, y = fr.pt(ia2 - 0.4, b1 + 0.5)
            put("ceramic_vase_01", x, y, z=kz, s=0.8)


def furnish_bath(room):
    big = room.w * room.d >= 9.0 and max(room.w, room.d) >= 2.6
    # freestanding tub in big bathrooms, under a window if there is one
    if big:
        cands = []
        for side, a1, a2, s1, s2 in room.wall_cands(1.75, kind_wall_or_high_window(0.62)):
            fr = room.frame(side)
            win = any(k.startswith("window") for k in side["kinds"][int(a1 / side["step"]):int(a2 / side["step"])])
            cands.append((1.0 * win - 0.1 * abs((a1 + a2) / 2 - side["L"] / 2),
                          [frect(fr, a1, 0.05, a2, 0.95)], [frect(fr, a1, 0.95, a2, 1.6)], [], (side, a1, a2)))
        got = try_place("tub", room, cands)
        if got:
            side, a1, a2 = got
            fr = room.frame(side)
            r = frect(fr, a1 + 0.03, 0.1, a2 - 0.03, 0.9)
            build_tub(*r)
            fr.box("tub_filler", a2 + 0.02, 0.4, 0, a2 + 0.06, 0.44, 0.95, M["steel"]) if a2 + 0.1 < side["L"] else None

    # Order matters in a small bathroom: the shower needs a corner, then the toilet a stretch of wall,
    # and the vanity (the most flexible piece: three widths) takes what is left. In a small room the
    # open side of a walk-in shower is not kept clear (it is entered from the room anyway).
    # walk-in shower in a corner (two walls), screen on the room side, entry left open
    cands = []
    for S in (((1.2, 0.95), (1.0, 0.9), (0.9, 0.85)) if room.w * room.d >= 6.0 else ((0.9, 0.85),)):
        for side, a1, a2, s1, s2 in room.wall_cands(S[0], kind_wall_or_high_window(1.2), align="ends"):
            at_corner = (a1 < 0.02 and side["kinds"][0] != "open") or (a2 > side["L"] - 0.02)
            if not at_corner:
                continue
            fr = room.frame(side)
            cands.append((S[0] + (0.5 if room.relation(side) != "door" else 0), [frect(fr, a1, 0, a2, S[1])],
                          ([frect(fr, a1, S[1], a2, S[1] + 0.6)] if room.w * room.d >= 6.0 else []), [], (side, a1, a2, S[1])))
    got = try_place("shower", room, cands)
    if got:
        side, a1, a2, dep = got
        fr = room.frame(side)
        fr.box("shower_tray", a1, 0.0, 0, a2, dep, 0.015, M["bathfloor"])
        inner_end = a2 if a1 < 0.02 else a1  # the open end of the stall faces the room
        # glass on the long open side, leaving 0.6 m to step in at the room end
        g1, g2 = (a1, a2 - 0.6) if inner_end == a2 else (a1 + 0.6, a2)
        fr.box("shower_glass", g1, dep - 0.01, 0, g2, dep, 2.0, M["clear_glass"])
        fr.box("shower_bar", g1, dep - 0.012, 1.98, g2, dep + 0.002, 2.0, M["frame"])
        c = (a1 + a2) / 2
        fr.cyl("shower_head", c, dep / 2, 2.3, 2.31, 0.15, M["steel"])
        fr.box("shower_arm", c - 0.01, 0.0, 2.3, c + 0.01, dep / 2, 2.32, M["steel"])

    # wall-hung toilet with a concealed cistern ledge
    got = None
    for clear_depth in (0.6, 0.3):  # a small bathroom gets a tighter step-in zone rather than no toilet
        cands = []
        for side, a1, a2, s1, s2 in room.wall_cands(0.8, kind_wall_or_high_window(1.1)):
            fr = room.frame(side)
            score = {"opposite": 0.3, "beside": 1.0, "door": 0.6}[room.relation(side)] - 0.1 * min(a1 - s1, s2 - a2)
            cands.append((score, [frect(fr, a1 + 0.2, 0, a2 - 0.2, 0.75)], [frect(fr, a1, 0.75, a2, 0.75 + clear_depth)], [], (side, a1, a2)))
        got = try_place("toilet", room, cands, quiet=clear_depth > 0.3)
        if got:
            break
    if got:
        side, a1, a2 = got
        fr = room.frame(side)
        c = (a1 + a2) / 2
        fr.box("wc_ledge", a1 + 0.05, 0.0, 0, a2 - 0.05, 0.2, 1.05, M["tile"])
        L.subsurf(fr.box("toilet", c - 0.19, 0.2, 0.32, c + 0.19, 0.72, 0.42, M["porcelain"]), 3)
        fr.box("wc_lid", c - 0.18, 0.21, 0.42, c + 0.18, 0.71, 0.44, M["porcelain"], bevel=0.015)
        fr.box("wc_flush", c - 0.1, 0.2, 0.85, c + 0.1, 0.21, 0.95, M["steel"])

    # vanity against a plain wall (the mirror needs one), double basin when there is room
    cands = []
    for Lv in ((1.6, 1.2, 0.9) if big else (1.2, 0.9, 0.7)):
        for side, a1, a2, s1, s2 in room.wall_cands(Lv, kind_wall):
            fr = room.frame(side)
            score = Lv * 2 + {"opposite": 1.0, "beside": 0.6, "door": 0.0}[room.relation(side)] - 0.2 * abs((a1 + a2) / 2 - (s1 + s2) / 2)
            cands.append((score, [frect(fr, a1, 0, a2, 0.6)], [frect(fr, a1, 0.6, a2, 1.3)], [], (side, a1, a2)))
    got = try_place("vanity", room, cands)
    if got:
        side, a1, a2 = got
        fr = room.frame(side)
        fr.box("vanity", a1 + 0.02, 0.0, 0.35, a2 - 0.02, 0.55, 0.85, M["oak"], bevel=0.004)
        fr.box("vanity_top", a1, 0.0, 0.85, a2, 0.6, 0.88, M["quartz"], bevel=0.003)
        nb = 2 if a2 - a1 >= 1.4 else 1
        for i in range(nb):
            c = a1 + (a2 - a1) * (i + 0.5) / nb
            fr.box(f"basin_{i}", c - 0.22, 0.12, 0.86, c + 0.22, 0.47, 0.89, M["porcelain"], bevel=0.02)
            fr.cyl(f"basin_tap_{i}", c, 0.06, 0.88, 1.08, 0.012, M["brass"])
            fr.box(f"basin_spout_{i}", c - 0.01, 0.05, 1.06, c + 0.01, 0.21, 1.08, M["brass"])
        fr.box("bath_mirror", a1 + 0.05, 0.0, 1.1, a2 - 0.05, 0.02, 1.9, M["mirror"])
        fr.box("bath_led", a1 + 0.05, 0.02, 1.9, a2 - 0.05, 0.04, 1.92, M["led"])

def furnish_bedroom(room):
    t = room.type
    small = min(room.w, room.d) < 3.0
    bw, bl = {"master": (1.9, 2.15)}.get(t, (1.45 if small else 1.65, 2.05))
    ok = kind_wall_or_high_window(1.1)
    cands = []
    for side, a1, a2, s1, s2 in room.wall_cands(bw, ok, step=0.05):
        fr = room.frame(side)
        if room.depth(side) < bl + 0.6:
            continue
        mid = side["L"] / 2
        ns = (a1 - 0.5 >= s1 - 1e-6) + (a2 + 0.5 <= s2 + 1e-6)
        score = {"opposite": 3.0, "beside": 1.8, "door": 0.0}[room.relation(side)] - 0.6 * abs((a1 + a2) / 2 - mid) + 0.5 * ns
        solid = frect(fr, a1, 0, a2, bl)
        foot = frect(fr, a1, bl, a2, bl + 0.55)
        must = [fr.pt(a1 - 0.35, bl / 2)] if a1 - 0.5 > 0 else [fr.pt(a2 + 0.35, bl / 2)]
        cands.append((score, [solid], [foot], must, (side, a1, a2, s1, s2)))
    # wardrobe candidates, tried against each bed position until both fit
    target = {"master": 2.4, "mamad": 1.5}.get(t, 1.8)

    def wardrobe_cands():
        out = []
        for Lw in (target, target - 0.4, target - 0.8, 1.0):
            if Lw < 1.0:
                continue
            for side, a1, a2, s1, s2 in room.wall_cands(Lw, kind_wall, align="ends"):
                fr = room.frame(side)
                corner = a1 < 0.05 or a2 > side["L"] - 0.05
                score = Lw + (0.8 if corner else 0) + {"beside": 0.6, "door": 0.4, "opposite": 0.0}[room.relation(side)]
                out.append((score, [frect(fr, a1, 0, a2, 0.62)], [frect(fr, a1, 0.62, a2, 1.4)], [fr.pt((a1 + a2) / 2, 1.0)], (side, a1, a2)))
        return out

    got = wgot = None
    tried = 0
    for c in sorted(cands, key=lambda c: -c[0]):
        snap = snapshot()
        got = try_place(f"bed_{room.id}", room, [c], max_path_checks=1, quiet=True)
        if not got:
            continue
        tried += 1
        wgot = try_place(f"wardrobe_{room.id}", room, wardrobe_cands(), quiet=True)
        if wgot or tried >= 15:
            break
        restore(snap)
        got = None
    if not got:  # no bed position leaves room for a wardrobe: best bed alone
        got = try_place(f"bed_{room.id}", room, cands)
        wgot = try_place(f"wardrobe_{room.id}", room, wardrobe_cands())
    if wgot:
        side, a1, a2 = wgot
        build_wardrobe(room.frame(side), f"wardrobe_{room.id}", a1, a2)
    if got:
        side, a1, a2, s1, s2 = got
        fr = room.frame(side)
        build_bed(fr, f"bed_{room.id}", a1, a2, bl)
        rug = frect(fr, a1 - 0.6, 0.6, a2 + 0.6, bl + 0.45)
        L.box(f"rug_{room.id}", rug[0], rug[1], 0.0, rug[2], rug[3], 0.012, M["rug"], bevel=0.004)
        for k, (n1, n2) in enumerate(((a1 - 0.52, a1 - 0.04), (a2 + 0.04, a2 + 0.52))):
            if n1 < s1 - 1e-6 or n2 > s2 + 1e-6:
                continue
            r = frect(fr, n1, 0, n2, 0.42)
            if try_place(f"ns_{room.id}_{k}", room, [(0, [r], [], [], 1)]):
                fr.box(f"ns_{room.id}_{k}", n1, 0.0, 0.0, n2, 0.42, 0.5, M["oak"], bevel=0.006)

    # desk + chair in secondary bedrooms, reading chair in the master
    if t == "master":
        cands = []
        for side in room.sides.values():
            for s1, s2 in P.stretches(side, lambda k: k != "open"):
                fr = room.frame(side)
                for a1 in (s1 + 0.15, s2 - 1.6):
                    if a1 < s1 or a1 + 1.45 > s2:
                        continue
                    win = any(k.startswith("window") or k == "glass" for k in side["kinds"])
                    cands.append((1.0 * win, [frect(fr, a1, 0.1, a1 + 0.85, 1.1), frect(fr, a1 + 0.9, 0.05, a1 + 1.45, 0.5)],
                                  [], [], (side, a1)))
        got = try_place(f"armchair_{room.id}", room, cands, max_path_checks=8)
        if got:
            side, a1 = got
            fr = room.frame(side)
            x, y = fr.pt(a1 + 0.42, 0.6)
            put("modern_arm_chair_01", x, y, rot=fr.rot_deg())
            x, y = fr.pt(a1 + 1.17, 0.27)
            put("side_table_01", x, y, s=0.8)
    else:
        cands = []
        for side, a1, a2, s1, s2 in room.wall_cands(1.2, kind_wall_or_high_window(0.78)):
            fr = room.frame(side)
            win = any(k.startswith("window") for k in side["kinds"][int(a1 / side["step"]):int(a2 / side["step"])])
            cands.append((1.0 * win + (0.3 if a1 - s1 < 0.05 or s2 - a2 < 0.05 else 0),
                          [frect(fr, a1, 0, a2, 0.55), frect(fr, (a1 + a2) / 2 - 0.33, 0.45, (a1 + a2) / 2 + 0.33, 1.05)],
                          [], [fr.pt((a1 + a2) / 2, 1.4)], (side, a1, a2)))
        got = try_place(f"desk_{room.id}", room, cands, max_path_checks=10)
        if got:
            side, a1, a2 = got
            fr = room.frame(side)
            fr.box(f"desk_{room.id}", a1, 0.0, 0.72, a2, 0.55, 0.75, M["oak"], bevel=0.004)
            for k, a in enumerate((a1 + 0.02, a2 - 0.05)):
                fr.box(f"desk_leg{k}_{room.id}", a, 0.02, 0.0, a + 0.03, 0.53, 0.72, M["oak"])
            x, y = fr.pt((a1 + a2) / 2, 0.75)
            put("painted_wooden_chair_02", x, y, rot=fr.rot_deg() + 180)
    plant_in_corner(room, 0.9)


def plant_in_corner(room, s=1.0, n=1, near=None):
    X1, Y1, X2, Y2 = room.inner
    pts = [(X1 + 0.35, Y1 + 0.35), (X2 - 0.35, Y1 + 0.35), (X2 - 0.35, Y2 - 0.35), (X1 + 0.35, Y2 - 0.35)]
    for k in range(n):
        cands = []
        for x, y in pts:
            score = -math.hypot(x - near[0], y - near[1]) if near else 0
            cands.append((score, [[x - 0.25 * s, y - 0.25 * s, x + 0.25 * s, y + 0.25 * s]], [], [], (x, y)))
        got = try_place(f"plant_{room.id}_{k}", room, cands, max_path_checks=4)
        if got:
            put("potted_plant_01", got[0], got[1], s=s)
            pts.remove(got)


def furnish_living(room):
    # TV wall: the longest plain stretch, best opposite the view (glass / windows)
    cands = []
    for side in room.sides.values():
        opp = room.sides[{"S": "N", "N": "S", "E": "W", "W": "E"}[side["name"]]]
        view = sum(1 for k in opp["kinds"] if k == "glass" or k.startswith("window") or k == "door") / max(1, len(opp["kinds"]))
        for s1, s2, Lc in [(s1, s2, Lc) for s1, s2 in P.stretches(side, kind_wall) for Lc in (2.2, 1.9, 1.6)]:
            Lc = min(Lc, s2 - s1 - 0.1)
            if Lc < 1.5:
                continue
            fr = room.frame(side)
            depth = room.depth(side)
            if depth < 3.4:
                continue
            for a1 in sorted({s1 + 0.05, (s1 + s2) / 2 - Lc / 2, s2 - 0.05 - Lc}):
                cands.append((2.0 * view + 0.3 * Lc + 0.1 * min(depth, 5), [frect(fr, a1, 0, a1 + Lc, 0.5)],
                              [frect(fr, a1, 0.5, a1 + Lc, 1.3)], [], (side, a1, a1 + Lc, depth)))
    got = try_place("media_console", room, cands)
    if got:
        side, a1, a2, depth = got
        fr = room.frame(side)
        fr.box("media_console", a1, 0.0, 0.0, a2, 0.5, 0.45, M["oak"], bevel=0.005)
        c = (a1 + a2) / 2
        fr.box("tv", c - 0.65, 0.0, 0.75, c + 0.65, 0.04, 1.5, M["screen"])
        # sofa facing the TV, 2.2-3.0 m away, kept inside the room
        cands = []
        for sw in (2.7, 2.4, 2.1, 1.9):
            for dist in (2.6, 2.4, 2.9, 2.2, 3.1):
                bf = 0.5 + dist
                bb = bf + 1.0
                if bb > depth - 0.05:
                    continue
                for shift in [k * 0.15 for k in range(-8, 9)]:
                    sa1 = c - sw / 2 + shift
                    sa1 = max(0.05, min(sa1, side["L"] - sw - 0.05))
                    solid = frect(fr, sa1, bf, sa1 + sw, bb)
                    gap = depth - bb
                    cands.append((-abs(dist - 2.6) - abs(shift) + sw - (0.5 if 0.08 < gap < 0.6 else 0), [solid], [], [],
                                  (sa1, sw, bf, bb)))
        s = try_place("sofa", room, cands)
        if s:
            sa1, sw, bf, bb = s
            # a sofa frame looking back at the TV
            p = fr.pt(sa1 + sw, bb)
            sfr = L.Frame(p[0], p[1], -fr.u[0], -fr.u[1])
            build_sofa(sfr, "sofa", 0.0, sw, 0.0, 1.0)
            mid_b = (0.5 + bf) / 2
            x, y = fr.pt(sa1 + sw / 2, mid_b)
            put("modern_coffee_table_01", x, y, rot=fr.rot_deg())
            SOLIDS.append((asset_rect("modern_coffee_table_01", x, y, fr.rot_deg()), "coffee_table"))
            GRID.add(SOLIDS[-1][0])
            rug = frect(fr, sa1 - 0.4, 0.75, sa1 + sw + 0.4, bf + 0.6)
            L.box("living_rug", rug[0], rug[1], 0.0, rug[2], rug[3], 0.012, M["rug"], bevel=0.004)
            for k, sgn in enumerate((-1, 1)):
                a = sa1 + sw / 2 + sgn * (sw / 2 + 0.65)
                x, y = fr.pt(a, mid_b + 0.1)
                rot = rot_to((-sgn * fr.u[0], -sgn * fr.u[1]))
                r = asset_rect("modern_arm_chair_01", x, y, rot)
                if try_place(f"armchair_{k}", room, [(0, [r], [], [], 1)], max_path_checks=2):
                    put("modern_arm_chair_01", x, y, rot=rot)
    furnish_dining(room)
    plant_in_corner(room, 1.0, n=2)


def furnish_dining(room):
    kitchen = next((r for r in P.rooms if P.rtype[r] == "kitchen"), None)
    kc = None
    if kitchen:
        x1, y1, x2, y2 = P.rects[kitchen]
        kc = ((x1 + x2) / 2, (y1 + y2) / 2)
    cands = []
    xs = [p[0] for p in P.rooms[room.id]["polygon"]]
    ys = [p[1] for p in P.rooms[room.id]["polygon"]]
    for tw, tl, nper in ((1.0, 2.2, 3), (0.9, 1.6, 2), (0.8, 1.2, 1)):
        for along_x in (True, False):
            sx, sy = (tl, tw) if along_x else (tw, tl)
            zx, zy = (sx + 0.7, sy + 1.3) if along_x else (sx + 1.3, sy + 0.7)  # chairs on the long sides
            x = min(xs) + zx / 2 + 0.05
            while x <= max(xs) - zx / 2 - 0.05:
                y = min(ys) + zy / 2 + 0.05
                while y <= max(ys) - zy / 2 - 0.05:
                    zone = [x - zx / 2, y - zy / 2, x + zx / 2, y + zy / 2]
                    near = -math.hypot(x - kc[0], y - kc[1]) * 0.6 if kc else 0
                    cands.append((tl * 1.5 + near, [zone], [TP.grow(zone, 0.25)], [], (x, y, sx, sy, along_x, nper)))
                    y += 0.1
                x += 0.1
    got = try_place("dining", room, cands, max_path_checks=40)
    if not got:
        return
    x, y, sx, sy, along_x, nper = got
    L.box("dining_top", x - sx / 2, y - sy / 2, 0.72, x + sx / 2, y + sy / 2, 0.76, M["oak"], bevel=0.008)
    for dx in (-1, 1):
        for dy in (-1, 1):
            lx, ly = x + dx * (sx / 2 - 0.1), y + dy * (sy / 2 - 0.1)
            L.box(f"dining_leg{dx}{dy}", lx - 0.04, ly - 0.04, 0.0, lx + 0.04, ly + 0.04, 0.72, M["oak"], bevel=0.004)
    if along_x:
        L.box("dining_runner", x - sx / 2 + 0.25, y - 0.15, 0.76, x + sx / 2 - 0.25, y + 0.15, 0.765, M["linen"])
        for i in range(nper):
            cx = x - sx / 2 + sx * (i + 0.5) / nper
            put("dining_chair_02", cx, y - sy / 2 - 0.25, rot=180)  # south side, faces north
            put("dining_chair_02", cx, y + sy / 2 + 0.25, rot=0)
    else:
        L.box("dining_runner", x - 0.15, y - sy / 2 + 0.25, 0.76, x + 0.15, y + sy / 2 - 0.25, 0.765, M["linen"])
        for i in range(nper):
            cy = y - sy / 2 + sy * (i + 0.5) / nper
            put("dining_chair_02", x - sx / 2 - 0.25, cy, rot=90)
            put("dining_chair_02", x + sx / 2 + 0.25, cy, rot=-90)
    put("ceramic_vase_01", x, y, z=0.765)


def furnish_balcony(room):
    cands = []
    X1, Y1, X2, Y2 = room.inner
    for side in room.sides.values():
        fr = room.frame(side)
        if room.depth(side) < 1.5:
            continue
        for s1, s2 in P.stretches(side, lambda k: k != "door"):
            for a in (s2 - 1.2, s1 + 1.2, (s1 + s2) / 2):
                if a - 0.5 < s1 or a + 0.5 > s2:
                    continue
                x, y = fr.pt(a, 0.55)
                rot = fr.rot_deg() + 90
                r = asset_rect("outdoor_table_chair_set_01", x, y, rot)
                cands.append((0.5 if side["kinds"][0] in ("wall", "glass") else 0, [TP.grow(r, 0.05)], [], [], (x, y, rot)))
    got = try_place("outdoor_set", room, cands)
    if got:
        put("outdoor_table_chair_set_01", got[0], got[1], rot=got[2])
    # two lounge chairs looking out over the railing
    rail = next((s for s in room.sides.values() if sum(k == "glass" for k in s["kinds"]) > len(s["kinds"]) / 2), None)
    if rail:
        fr = room.frame(rail)
        for k in range(2):
            cands = []
            a = 0.8
            while a < rail["L"] - 0.6:
                x, y = fr.pt(a, 0.75)
                rot = fr.rot_deg() + 180
                cands.append((-abs(a - rail["L"] * 0.3), [asset_rect("mid_century_lounge_chair", x, y, rot)], [], [], (x, y, rot)))
                a += 0.1
            got = try_place(f"lounge_{k}", room, cands, max_path_checks=6)
            if got:
                put("mid_century_lounge_chair", *got[:2], rot=got[2])
    plant_in_corner(room, 1.0, n=3)


RECIPES = {"kitchen": furnish_kitchen, "bath": furnish_bath, "wc": furnish_bath, "bedroom": furnish_bedroom,
           "master": furnish_bedroom, "mamad": furnish_bedroom, "living": furnish_living, "dining": furnish_dining,
           "balcony": furnish_balcony}
ORDER = ["kitchen", "bath", "wc", "master", "bedroom", "mamad", "living", "dining", "balcony"]

for rt in ORDER:
    for rid in P.rooms:
        if P.rtype[rid] == rt:
            t1 = time.time()
            RECIPES[rt](Room(rid))
            print(f"  {rid} ({rt}): {time.time() - t1:.1f}s")

bad = GRID.unreachable()
print(f"furnished: {len(LOG)} pieces, {len(PLACED.objects)} assets, {time.time() - t0:.1f}s; doors without a 0.6 m path: {bad or 'none'}")
with open(os.path.join(globals().get("TWIN_DIR", "."), "furniture.json"), "w") as f:
    json.dump({"pieces": LOG, "unreachable": bad}, f, indent=1)
