# Builds /Game/Maps/Living: shell + the living-room items (same layout as the Three.js "hero" scene), Lumen lighting.
import unreal, math, os
EL = unreal.EditorLevelLibrary; EA = unreal.EditorAssetLibrary
YAW_OFFSET = float(os.environ.get("HAV_ITEM_YAW", "0"))   # to calibrate imported item front direction
def load(p): return EA.load_asset(p)
def spawn_mesh(mesh_path, loc, yaw=0.0, label=None):
    m = load(mesh_path)
    a = EL.spawn_actor_from_class(unreal.StaticMeshActor, unreal.Vector(*loc), unreal.Rotator(0, yaw, 0))
    a.static_mesh_component.set_static_mesh(m)
    a.static_mesh_component.set_mobility(unreal.ComponentMobility.MOVABLE)
    if label: a.set_actor_label(label)
    return a
def plan_to_ue(x, y, z=0.0): return (x * 100.0, -y * 100.0, z * 100.0)

EL.new_level("/Game/Maps/Living")
reg = unreal.AssetRegistryHelpers.get_asset_registry()
def meshes(folder):
    return {str(a.asset_name): str(a.package_name) + "." + str(a.asset_name) for a in reg.get_assets_by_path(folder, recursive=True) if "StaticMesh" in str(a.asset_class_path.asset_name)}
# shell: every mesh has world-space vertices, so spawn at the origin
for n, p in meshes("/Game/Shell").items():
    spawn_mesh(p, (0, 0, 0), 0, "shell_" + n)
def place_item(folder, parts_prefix, plan, rot, dx=0.0):
    ms = meshes(folder)
    for n, p in ms.items():
        if parts_prefix is None or n.startswith(parts_prefix):
            x, y, z = plan
            lx, ly, lz = plan_to_ue(x, y, z)
            c, s = math.cos(-rot), math.sin(-rot)
            # module offset along the item's local x (plan), rotated into the world
            ox, oy = dx * 100.0, 0.0
            spawn_mesh(p, (lx + ox * c - oy * s, ly + ox * s + oy * c, lz), math.degrees(-rot) + YAW_OFFSET, "item_" + n)
PI = math.pi
# sofa: arm-l, seat-120, seat-120, arm-r (2.8 m), centred at x=4.2 -> modules laid out left to right in the sofa's local frame
mods = [("arm-l", 0.2), ("seat-120", 1.2), ("seat-120", 1.2), ("arm-r", 0.2)]
x0 = -sum(w for _, w in mods) / 2.0; cur = x0
for i, (m, w) in enumerate(mods):
    ms = meshes("/Game/Items/sofa-modular-01")
    for n, p in ms.items():
        if n.startswith(m + "_"):
            c, s = math.cos(-PI), math.sin(-PI)
            off = (cur + w / 2) * 100.0
            lx, ly, lz = plan_to_ue(4.2, 4.5)
            spawn_mesh(p, (lx + off * c, ly + off * s, 0), math.degrees(-PI) + YAW_OFFSET, "sofa%d_%s" % (i, n))
    cur += w
place_item("/Game/Items/coffee-drum-01", None, (4.2, 2.2, 0), 0)
place_item("/Game/Items/side-drum-01", None, (6.15, 3.9, 0), 0)
place_item("/Game/Items/armchair-modern-01", None, (6.6, 2.5, 0), PI / 2)

# lighting: sun direction of the bake (plan axes 0.47, 0.671, -0.574) -> UE (x, -y, z)
d = unreal.Vector(0.47, -0.671, -0.574)
rot = unreal.MathLibrary.find_look_at_rotation(unreal.Vector(0, 0, 0), d)
sun = EL.spawn_actor_from_class(unreal.DirectionalLight, unreal.Vector(0, 0, 1000), rot)
sun.set_actor_label("Sun"); sun.get_component_by_class(unreal.DirectionalLightComponent).set_editor_property("intensity", 8.0)
sun.get_component_by_class(unreal.DirectionalLightComponent).set_editor_property("atmosphere_sun_light", True)
EL.spawn_actor_from_class(unreal.SkyAtmosphere, unreal.Vector(0, 0, 0))
sky = EL.spawn_actor_from_class(unreal.SkyLight, unreal.Vector(0, 0, 200))
sky.get_component_by_class(unreal.SkyLightComponent).set_editor_property("real_time_capture", True)
ppv = EL.spawn_actor_from_class(unreal.PostProcessVolume, unreal.Vector(0, 0, 0))
ppv.set_editor_property("unbound", True)
s = ppv.get_editor_property("settings")
s.override_auto_exposure_method = True; s.auto_exposure_method = unreal.AutoExposureMethod.AEM_MANUAL
s.override_auto_exposure_bias = True; s.auto_exposure_bias = float(os.environ.get("HAV_EXPOSURE", "9.5"))
ppv.set_editor_property("settings", s)
ps = EL.spawn_actor_from_class(unreal.PlayerStart, unreal.Vector(*plan_to_ue(3.4, 0.7, 0.0)), unreal.Rotator(0, -90.0, 0))
EL.save_current_level()
print("LEVEL built actors", len(EL.get_all_level_actors()))
