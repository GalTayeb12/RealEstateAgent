"""
Place Poly Haven furniture (CC0) into the apartment as collection instances.

Each asset is a collection named after its Poly Haven id (imported with the
blender-mcp add-on, format "blend"), excluded from the view layer and with its
instance_offset at the bottom-centre of its bounding box.
Assets face -Y by default; rot is degrees around Z.
"""
import bpy, math

def fresh(name):
    col = bpy.data.collections.get(name)
    if col:
        for o in list(col.objects):
            bpy.data.objects.remove(o, do_unlink=True)
    else:
        col = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(col)
    return col

PLACED = fresh("PLACED")

def put(asset, x, y, rot=0.0, z=0.0, s=1.0):
    src = bpy.data.collections.get(asset)
    if src is None:
        print("missing", asset)
        return None
    e = bpy.data.objects.new(f"{asset}@{x:.1f},{y:.1f}", None)
    e.instance_type = "COLLECTION"
    e.instance_collection = src
    e.location = (x, y, z)
    e.rotation_euler = (0, 0, math.radians(rot))
    e.scale = (s, s, s)
    PLACED.objects.link(e)
    return e

# living: sofa faces the TV wall (north), armchairs face in from the sides
put("modern_coffee_table_01", 2.6, 2.45)
put("modern_arm_chair_01", 0.85, 2.7, rot=90)
put("modern_arm_chair_01", 4.35, 2.7, rot=-90)
put("side_table_01", 4.3, 1.1)
put("potted_plant_01", 0.45, 0.45)
put("potted_plant_01", 7.75, 0.45)

# dining: table long axis north–south, three chairs per side
for yy in (1.55, 2.2, 2.85):
    put("dining_chair_02", 5.4, yy, rot=90)
    put("dining_chair_02", 7.3, yy, rot=-90)
put("ceramic_vase_01", 6.35, 2.2, z=0.765)

# kitchen island stools face the island (north)
for xx in (4.4, 5.15, 5.9):
    put("bar_chair_round_01", xx, 5.65, rot=180)
put("ceramic_vase_01", 6.0, 6.6, z=0.9, s=0.8)

# master bedroom reading corner by the glass
put("modern_arm_chair_01", 9.1, 0.95, rot=145)
put("side_table_01", 9.0, 1.85, s=0.8)
put("potted_plant_01", 8.65, 0.4, s=0.9)

# bedroom 2 desk chair, bedroom 3 plant
put("painted_wooden_chair_02", 9.15, 7.6, rot=180)
put("potted_plant_01", 2.75, 8.1, s=0.8)

# balcony
put("mid_century_lounge_chair", 2.0, -1.1)
put("mid_century_lounge_chair", 3.5, -1.1)
put("outdoor_table_chair_set_01", 11.6, -1.1, rot=90)
for xx in (0.45, 7.1, 14.55):
    put("potted_plant_01", xx, -1.75)

print("placed", len(PLACED.objects))
