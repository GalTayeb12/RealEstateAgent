"""
Walk-ready apartment shell from a plan twin — the generated counterpart of the
hand-built apartment_shell.py + apartment_walk.py.

    blender -b assets-src/yarkon-v2/blender/apartment.blend --python scripts/blender/twin_build.py -- \
        <twinDir> <out.blend> [--no-furnish]

<twinDir> holds twin.json + layout.json (scripts/twin/export-twin.ts). The base
.blend provides the Poly Haven materials, the furniture asset collections and
the world HDRI; its hand-built APT / PLACED / LIGHTS collections are replaced.

Builds into APT:
  * walls with door / passage gaps and lintels, windows with sill walls,
    headers, glass, frames and stone sills; glazing walls as glass with
    mullions and an open slider; glass railings
  * door leaves (open 90° into the more private room, hinge by the nearer
    corner; the front door closed)
  * floors per room type (laminate, stone in wet rooms, deck on balconies),
    ceilings, balcony soffit, slab and roof (bake occluders)
  * skirting along dry rooms, full-height tiles in wet rooms
  * recessed downlights per room, sun + sky
then runs twin_furnish.py (furniture by rule) and saves <out.blend>.

Object custom property shell=True marks architecture whose collision boxes
come from lib/twin/walk.ts instead of from Blender (apartment_bake.py
collision() skips them).
"""
import bpy, math, os, sys, time, importlib

HERE = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else globals().get("SCRIPTS_DIR")
sys.path.insert(0, HERE)
import apt_lib as L
import twin_plan as TP
importlib.reload(L)
importlib.reload(TP)
from apt_lib import box, obox, prism, cyl

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
TWIN_DIR = globals().get("TWIN_DIR") or argv[0]
OUT_BLEND = globals().get("OUT_BLEND") or (argv[1] if len(argv) > 1 else None)
FURNISH = "--no-furnish" not in argv

t0 = time.time()
P = TP.Plan.load(TWIN_DIR)
H = P.H
SHELL = {"shell": True}

for name in ("APT", "PLACED", "LIGHTS", "EXPORT"):
    c = bpy.data.collections.get(name)
    if c:
        for o in list(c.objects):
            bpy.data.objects.remove(o, do_unlink=True)
APT = L.fresh_collection("APT")
L.ctx.col, L.ctx.cut = APT, 99.0
M = L.materials()


def inside_sign(w, s):
    """+1 if the left side of wall w at s is indoors (a non-balcony room), -1 otherwise."""
    for sgn in (1, -1):
        x, y = w.at(s, sgn * (w.t / 2 + 0.2))
        r = P.room_at(x, y)
        if r and P.rtype[r] != "balcony":
            return sgn
    return 1


# ── walls ────────────────────────────────────────────────────────────────────
def solid_wall(w):
    mat = M["plaster"] if w.kind == "exterior" else M["white"]
    h2 = w.t / 2
    for i, (s1, s2) in enumerate(w.solid_spans()):
        obox(f"wall_{w.id}_{i}", w.at(s1), w.at(s2), -h2, h2, 0, H, mat, props=SHELL)
    for o in w.openings:
        s1, s2 = o["at"] - o["width"] / 2, o["at"] + o["width"] / 2
        p, q = w.at(s1), w.at(s2)
        head = min(o.get("head", 2.2), H)
        if head < H - 0.005:
            obox(f"lintel_{w.id}_{o['id']}", p, q, -h2, h2, head, H, mat, props=SHELL)
        if o["kind"] == "window":
            sill = o.get("sill", 0.9)
            if sill > 0.005:
                obox(f"sill_wall_{w.id}_{o['id']}", p, q, -h2, h2, 0, sill, mat, props=SHELL)
                obox(f"sill_stone_{w.id}_{o['id']}", w.at(s1 - 0.02), w.at(s2 + 0.02), -h2 - 0.04, h2 + 0.04,
                     sill - 0.02, sill, M["stone"], props=SHELL)
            obox(f"win_glass_{o['id']}", p, q, -0.01, 0.01, sill, head, M["glass"], props=SHELL)
            obox(f"win_frame_b_{o['id']}", p, q, -0.04, 0.04, sill, sill + 0.05, M["frame"], props=SHELL)
            obox(f"win_frame_t_{o['id']}", p, q, -0.04, 0.04, head - 0.05, head, M["frame"], props=SHELL)
            for k, s in enumerate((s1, s2 - 0.05)):
                obox(f"win_frame_s{k}_{o['id']}", w.at(s), w.at(s + 0.05), -0.04, 0.04, sill, head, M["frame"], props=SHELL)
        elif o["kind"] == "slider":
            # two panes in the gap: the outer one fixed on one half, the inner one parked behind it,
            # so half the width is open (the twin has no "open width" field yet)
            mid = o["at"]
            ins = inside_sign(w, o["at"])
            obox(f"slider_fixed_{o['id']}", w.at(mid), q, -ins * 0.03, -ins * 0.01, 0, head, M["glass"])
            obox(f"slider_parked_{o['id']}", w.at(mid - 0.04), w.at(s2 - 0.04), ins * 0.01, ins * 0.03, 0, head, M["glass"])
            for k, s in enumerate((s1, mid - 0.04, s2 - 0.05)):
                obox(f"slider_frame{k}_{o['id']}", w.at(s), w.at(s + 0.05), -0.045, 0.045, 0, head, M["frame"], props=SHELL)
            obox(f"slider_track_{o['id']}", p, q, -0.05, 0.05, 0, 0.02, M["frame"], props=SHELL)
            obox(f"slider_head_{o['id']}", p, q, -0.05, 0.05, head - 0.05, head, M["frame"], props=SHELL)


def glazing_wall(w):
    """Floor-to-ceiling glass with slim mullions; sliders open (panel parked on the inside)."""
    spans = w.solid_spans()
    # mullions: span ends, junctions with walls that touch this one, and every <= 3 m
    posts = set()
    for s1, s2 in spans:
        posts.update((round(s1, 3), round(s2, 3)))
        n = max(1, math.ceil((s2 - s1) / 3.0 - 1e-6))
        posts.update(round(s1 + (s2 - s1) * k / n, 3) for k in range(1, n))
    for o2 in P.walls:
        if o2 is w or o2.kind in ("glazing", "railing"):
            continue
        for end in (o2.a, o2.b):
            s = (end[0] - w.a[0]) * w.u[0] + (end[1] - w.a[1]) * w.u[1]
            off = (end[0] - w.a[0]) * w.n[0] + (end[1] - w.a[1]) * w.n[1]
            if 0 < s < w.L and abs(off) < 0.05 and not w.opening_at(s):
                posts.add(round(s, 3))
    for i, (s1, s2) in enumerate(spans):
        obox(f"facade_glass_{w.id}_{i}", w.at(s1), w.at(s2), -0.01, 0.01, 0, H, M["glass"], props=SHELL)
    for s in sorted(posts):
        obox(f"mullion_{w.id}_{s:.2f}", w.at(s - 0.03), w.at(s + 0.03), -0.04, 0.04, 0, H, M["frame"], props=SHELL)
    obox(f"facade_head_{w.id}", w.a, w.b, -0.06, 0.06, H - 0.06, H, M["frame"], props=SHELL)
    for i, (s1, s2) in enumerate(spans):
        obox(f"facade_sill_{w.id}_{i}", w.at(s1), w.at(s2), -0.05, 0.05, 0, 0.03, M["frame"], props=SHELL)
    for o in w.openings:
        if o["kind"] != "slider":
            continue
        s1, s2 = o["at"] - o["width"] / 2, o["at"] + o["width"] / 2
        ins = inside_sign(w, o["at"])
        # park the sliding pane behind the fixed glass on whichever side has glass
        if any(a <= s2 + 0.01 and b >= s2 + o["width"] for a, b in spans):
            pa, pb = s2, s2 + o["width"]
        else:
            pa, pb = s1 - o["width"], s1
        obox(f"slider_parked_{o['id']}", w.at(pa), w.at(pb), ins * 0.03, ins * 0.05, 0, H, M["glass"])
        for k, s in enumerate((s1, s2)):
            obox(f"slider_frame{k}_{o['id']}", w.at(s - 0.03), w.at(s + 0.03), -0.04, ins * 0.06 if k else 0.04, 0, H, M["frame"], props=SHELL)


def railing(w):
    obox(f"rail_glass_{w.id}", w.a, w.b, -0.01, 0.01, 0, 1.05, M["glass"], props=SHELL)
    obox(f"rail_top_{w.id}", w.a, w.b, -0.02, 0.02, 1.03, 1.07, M["steel"], props=SHELL)


for w in P.walls:
    {"glazing": glazing_wall, "railing": railing}.get(w.kind, solid_wall)(w)

# ── doors ────────────────────────────────────────────────────────────────────
for d in P.doors:
    kind, p, q, o1, o2 = P.door_leaf(d)
    if kind == "closed":
        obox(f"entry_door_{d['id']}", p, q, o1, o2, 0, d["head"], M["oak"])
        w, sw = d["wall"], d["swing"]
        hx, hy = w.at(d["s2"] - 0.12, sw * (w.t / 2 + 0.01))
        box(f"entry_handle_{d['id']}", hx - 0.02, hy - 0.02, 1.0, hx + 0.02, hy + 0.02, 1.03, M["steel"])
    else:
        obox(f"door_{d['room']}_{d['id']}", p, q, o1, o2, 0, d["head"] - 0.01, M["oak"])

# ── floors, ceilings, slabs ──────────────────────────────────────────────────
FLOOR = {"bath": "bathfloor", "wc": "bathfloor", "laundry": "bathfloor", "balcony": "deck"}
for rid, r in P.rooms.items():
    poly = r["polygon"]
    if r["type"] == "balcony":
        prism(f"balcony_deck_{rid}" if rid != "balcony" else "balcony_deck", poly, -0.05, 0, M["deck"], props=SHELL)
        prism(f"balcony_soffit_{rid}", poly, H - 0.02, H, M["ceiling"], props=SHELL)
    else:
        prism(f"floor_{rid}", poly, -0.05, 0, M[FLOOR.get(r["type"], "floor")], props=SHELL)
        prism(f"ceiling_{rid}", poly, H, H + 0.02, M["ceiling"], props=SHELL)

slab, roof = [], []
for rid, r in P.rooms.items():
    slab.append(prism("slab_p", r["polygon"], -0.35, -0.05, M["stone"]))
    roof.append(prism("roof_p", r["polygon"], H + 0.02, H + 0.32, M["stone"]))
for w in P.walls:
    if w.axis and w.kind != "railing":
        f = w.footprint(pad=0.02)
        slab.append(box("slab_w", f[0], f[1], -0.35, f[2], f[3], -0.05, M["stone"]))
        roof.append(box("roof_w", f[0], f[1], H, f[2], f[3], H + 0.32, M["stone"]))
L.join(slab, "slab")
L.join(roof, "roof_slab")

# ── skirting (dry rooms) and tiles (wet rooms) ──────────────────────────────
for w in P.walls:
    if w.kind not in ("exterior", "interior"):
        continue
    for sgn in (1, -1):
        for i, (s1, s2, room, o) in enumerate(P.face_runs(w, sgn)):
            if room is None or s2 - s1 < 0.05:
                continue
            rt = P.rtype[room]
            f1, f2 = sgn * w.t / 2, sgn * (w.t / 2 + 0.012)
            if rt in TP.WET:
                zs = [(0, H)] if o is None else (
                    [(0, o.get("sill", 0)), (o.get("head", 2.2), H)] if o["kind"] == "window" else [(o.get("head", 2.2), H)])
                for k, (z1, z2) in enumerate(zs):
                    if z2 - z1 > 0.01:
                        obox(f"tile_{w.id}_{sgn}_{i}_{k}", w.at(s1), w.at(s2), f1, sgn * (w.t / 2 + 0.01), z1, z2, M["tile"], props=SHELL)
            elif rt != "balcony" and (o is None or (o["kind"] == "window" and o.get("sill", 0) > 0.1)):
                obox(f"sk_{w.id}_{sgn}_{i}", w.at(s1), w.at(s2), f1, f2, 0, 0.08, M["white"], props=SHELL)

# ── lights ──────────────────────────────────────────────────────────────────
LIGHTS = L.fresh_collection("LIGHTS")


def downlight(x, y, watts=18.0):
    ld = bpy.data.lights.new(f"dl_{x:.1f}_{y:.1f}", "SPOT")
    ld.energy = watts
    ld.color = (1.0, 0.82, 0.62)
    ld.spot_size = math.radians(95)
    ld.spot_blend = 0.6
    ld.shadow_soft_size = 0.04
    ob = bpy.data.objects.new(ld.name, ld)
    ob.location = (x, y, H - 0.03)
    LIGHTS.objects.link(ob)
    cyl(f"dl_trim_{x:.1f}_{y:.1f}", x, y, H - 0.004, H, 0.045, M["white"], verts=24)
    cyl(f"dl_lens_{x:.1f}_{y:.1f}", x, y, H - 0.006, H - 0.004, 0.03, M["led"], verts=24)


n_lights = 0
for rid, r in P.rooms.items():
    if r["type"] == "balcony":
        continue
    poly = r["polygon"]
    xs, ys = [p[0] for p in poly], [p[1] for p in poly]
    x1, y1, x2, y2 = min(xs), min(ys), max(xs), max(ys)
    nx, ny = max(1, round((x2 - x1) / 2.2)), max(1, round((y2 - y1) / 2.2))
    for i in range(nx):
        for j in range(ny):
            x, y = x1 + (x2 - x1) * (i + 0.5) / nx, y1 + (y2 - y1) * (j + 0.5) / ny
            if all(TP.pip(x + dx, y + dy, poly) for dx, dy in ((0.35, 0), (-0.35, 0), (0, 0.35), (0, -0.35))):
                downlight(round(x, 2), round(y, 2))
                n_lights += 1

sc = bpy.context.scene
bg = next((n for n in sc.world.node_tree.nodes if n.type == "BACKGROUND"), None) if sc.world else None
if bg:
    bg.inputs["Strength"].default_value = 1.8
sun = bpy.data.objects.get("Sun") or bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
if sun.name not in sc.collection.objects:
    sc.collection.objects.link(sun)
sun.data.energy = 4.0
sun.data.angle = math.radians(1.5)
sun.data.color = (1.0, 0.96, 0.9)
sun.rotation_euler = (math.radians(55), 0, math.radians(-35))

print(f"twin shell: {len(APT.objects)} objects, {n_lights} downlights, {time.time() - t0:.1f}s")

if FURNISH:
    ns = {"__name__": "twin_furnish", "P": P, "M": M, "SCRIPTS_DIR": HERE, "TWIN_DIR": TWIN_DIR}
    exec(open(os.path.join(HERE, "twin_furnish.py"), encoding="utf-8").read(), ns)

if OUT_BLEND:
    os.makedirs(os.path.dirname(OUT_BLEND), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
    print("saved", OUT_BLEND)
