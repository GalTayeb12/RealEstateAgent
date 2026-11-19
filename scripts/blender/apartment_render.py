"""
Cameras, world light and render settings for the apartment renders.

Set RENDER = {"view": "top"|"axo", "samples": int, "res": (w, h), "out": path}
in the exec namespace before running, or edit DEFAULTS below.
"""
import bpy, math
from mathutils import Vector

DEFAULTS = {"view": "top", "samples": 64, "res": (1600, 1120), "out": "//apt_top.png"}
cfg = {**DEFAULTS, **globals().get("RENDER", {})}

sc = bpy.context.scene
W, D, BAL = 15.0, 8.5, 2.2

# world: Poly Haven sky, slightly warm
world = bpy.data.worlds.get("PolyHavenWorld") or sc.world
sc.world = world
bg = next((n for n in world.node_tree.nodes if n.type == "BACKGROUND"), None)
if bg:
    bg.inputs["Strength"].default_value = 1.4

# sun: late-morning, from the south-west so the facade glass throws light in
sun = bpy.data.objects.get("Sun")
if sun is None:
    sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
    sc.collection.objects.link(sun)
sun.data.energy = 2.4
sun.data.angle = math.radians(2.5)
sun.data.color = (1.0, 0.96, 0.9)
sun.rotation_euler = (math.radians(32), 0, math.radians(-30))

# camera
cam = bpy.data.objects.get("Cam")
if cam is None:
    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
    sc.collection.objects.link(cam)
sc.camera = cam
cx, cy = W / 2, (D - BAL) / 2
if cfg["view"] == "top":
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = W + 1.6
    cam.location = (cx, cy, 30)
    cam.rotation_euler = (0, 0, 0)
else:  # 3/4 axonometric from the balcony side
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = W + 9.0
    target = Vector((cx + 1.0, cy + 1.1, 0.0))
    cam.location = target + Vector((-9.0, -17.0, 19.0))
    cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
cam.data.clip_end = 200

# render
r = sc.render
r.engine = "CYCLES"
sc.cycles.device = "GPU"
sc.cycles.samples = cfg["samples"]
sc.cycles.use_denoising = True
sc.cycles.denoiser = "OPTIX"
sc.cycles.max_bounces = 8
sc.cycles.caustics_reflective = False
sc.cycles.caustics_refractive = False
r.resolution_x, r.resolution_y = cfg["res"]
r.resolution_percentage = 100
r.film_transparent = cfg.get("transparent", True)
sc.view_settings.view_transform = "AgX"
sc.view_settings.look = "AgX - Medium High Contrast"
sc.view_settings.exposure = 0.0
r.image_settings.file_format = "PNG"
r.filepath = cfg["out"]
bpy.ops.render.render(write_still=True)
print("rendered", cfg["view"], r.filepath)
