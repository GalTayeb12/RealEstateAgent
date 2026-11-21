"""
Stills of a built apartment for the buyer's building page: one picture per room
(from the doorway, looking in), a top-down plan view and a 3/4 cutaway.

    blender -b twin_walk.blend --python twin_stills.py -- <twin dir> <out dir> [samples]

Reads <twin dir>/layout.json (room boxes and openings, as written by the twin
export) and renders from the shell + furniture blend (before the bake), so the
downlights and sun are the real ones. Writes still-<room>.png, top.png and axo.png.
"""
import bpy, math, os, sys, json
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else globals().get("SCRIPTS_DIR")
sys.path.insert(0, HERE)
import apt_lib as L

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
TWIN_DIR, OUT_DIR = argv[0], argv[1]
SAMPLES = int(argv[2]) if len(argv) > 2 else 64
os.makedirs(OUT_DIR, exist_ok=True)

layout = json.load(open(os.path.join(TWIN_DIR, "layout.json"), encoding="utf-8"))
rooms = layout["rooms"]          # id -> [x1, y1, x2, y2]
types = layout.get("roomTypes", {})
openings = layout.get("openings", [])
twin = json.load(open(os.path.join(TWIN_DIR, "twin.json"), encoding="utf-8"))
H = float(twin.get("wallHeight", 2.8))

sc = bpy.context.scene
r = sc.render
r.engine = "CYCLES"
L.enable_gpu()
sc.cycles.samples = SAMPLES
sc.cycles.use_denoising = True
sc.cycles.denoiser = "OPENIMAGEDENOISE"
sc.cycles.max_bounces = 8
sc.view_settings.view_transform = "AgX"
sc.view_settings.look = "AgX - Medium High Contrast"
r.resolution_percentage = 100
r.image_settings.file_format = "PNG"

cam = bpy.data.objects.get("StillCam")
if cam is None:
    cam = bpy.data.objects.new("StillCam", bpy.data.cameras.new("StillCam"))
    sc.collection.objects.link(cam)
sc.camera = cam
cam.data.clip_start, cam.data.clip_end = 0.05, 200


def shoot(name):
    r.filepath = os.path.join(OUT_DIR, name)
    bpy.ops.render.render(write_still=True)
    print("rendered", name)


def look_at(target):
    cam.rotation_euler = (Vector(target) - cam.location).to_track_quat("-Z", "Y").to_euler()


def doors_of(room):
    out = []
    for o in openings:
        if o.get("kind") in ("window",):
            continue
        if room in (o.get("front"), o.get("back")):
            out.append(o)
    return out


# ── room stills: from the doorway (or the far corner), 1.55 m eye height, wide lens ──
r.resolution_x, r.resolution_y = 1600, 900
r.film_transparent = False
sc.view_settings.exposure = 0.9   # the baked walk is lit by lightmaps; a plain render of the shell needs a lift
cam.data.type = "PERSP"
cam.data.lens = 18
for rid, (x1, y1, x2, y2) in rooms.items():
    cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
    inset = min(0.35, (x2 - x1) / 4, (y2 - y1) / 4)
    pos = None
    ds = doors_of(rid)
    if ds:
        d = ds[0]
        nx, ny = d["normal"]
        # step from the door centre into this room (the normal points to the "front" room)
        sgn = 1 if d.get("front") == rid else -1
        px, py = d["centre"][0] + nx * sgn * 0.45, d["centre"][1] + ny * sgn * 0.45
        pos = (min(max(px, x1 + inset), x2 - inset), min(max(py, y1 + inset), y2 - inset))
    if pos is None:
        # no door: the corner farthest from the centre of the apartment
        ax = sum((b[0] + b[2]) / 2 for b in rooms.values()) / len(rooms)
        ay = sum((b[1] + b[3]) / 2 for b in rooms.values()) / len(rooms)
        corners = [(x1 + inset, y1 + inset), (x2 - inset, y1 + inset), (x1 + inset, y2 - inset), (x2 - inset, y2 - inset)]
        pos = max(corners, key=lambda c: math.hypot(c[0] - ax, c[1] - ay))
    # look at the point of the room farthest from the camera, at table height
    far = max([(x1, y1), (x2, y1), (x1, y2), (x2, y2), (cx, cy)], key=lambda c: math.hypot(c[0] - pos[0], c[1] - pos[1]))
    tgt = ((far[0] + cx) / 2, (far[1] + cy) / 2, 1.0)
    cam.location = (pos[0], pos[1], 1.55)
    look_at(tgt)
    shoot(f"still-{rid}.png")

# ── plan view and cutaway: ceilings and roof off ──
sc.view_settings.exposure = 0.3
for o in bpy.data.objects:
    if o.name.startswith(("ceiling_", "balcony_soffit_")) or o.name.startswith("roof_slab"):
        o.hide_render = True
        o.hide_viewport = True

xs = [v for b in rooms.values() for v in (b[0], b[2])]
ys = [v for b in rooms.values() for v in (b[1], b[3])]
bx1, bx2, by1, by2 = min(xs) - 0.4, max(xs) + 0.4, min(ys) - 0.4, max(ys) + 0.4
w, d = bx2 - bx1, by2 - by1
mx, my = (bx1 + bx2) / 2, (by1 + by2) / 2
r.film_transparent = True
cam.data.type = "ORTHO"

res_w = 1600
res_h = max(int(res_w * d / w), 400)
r.resolution_x, r.resolution_y = res_w, res_h
cam.data.ortho_scale = max(w, d * res_w / res_h)
cam.location = (mx, my, 40)
cam.rotation_euler = (0, 0, 0)
shoot("top.png")

# 3/4 cutaway from the south-west, like the Yarkon axonometric
r.resolution_x, r.resolution_y = 1600, 1000
span = math.hypot(w, d)
cam.data.ortho_scale = span * 1.12
target = Vector((mx, my, 0.9))
cam.location = target + Vector((-0.45, -0.75, 0.62)).normalized() * 60
look_at(target)
shoot("axo.png")
print("stills done")
