"""
Irradiance proof helper: recolour the shell's surface materials to dark, flat
colours (floor -> dark walnut, walls -> deep green) and save a variant blend.

  blender -b twin_walk.blend --python studio_variant.py -- <out.blend>

If the lightmap stores irradiance (not surface colour), baking this variant must
give nearly the same lightmap as the original, apart from bounce light.
Prints the mean albedo luminance change as JSON on a line starting with ALBEDO.
"""
import bpy, sys, json

args = sys.argv[sys.argv.index("--") + 1:]
out = args[0]
variant = args[1] if len(args) > 1 else "extreme"
# linear albedo. extreme: dark walnut floor + deep green walls (~9x darker);
# moderate: mid oak floor + warm grey walls (~1.6-2.5x darker)
FLOOR, WALL = {
    "extreme": ((0.06, 0.035, 0.02, 1.0), (0.05, 0.14, 0.08, 1.0)),
    "moderate": ((0.45, 0.32, 0.20, 1.0), (0.55, 0.52, 0.46, 1.0)),
}[variant]
lum = lambda c: 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
before, after = [], []

for m in bpy.data.materials:
    if not (m.name.startswith("S|surface:") and m.use_nodes):
        continue
    if ":ceiling:" in m.name:
        continue
    target = FLOOR if ":floor:" in m.name else WALL
    nt = m.node_tree
    bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if not bsdf:
        continue
    bc = bsdf.inputs["Base Color"]
    before.append(lum(bc.default_value))
    for n in [n for n in nt.nodes if n.type in {"TEX_IMAGE"} or n.name == "tint"]:
        nt.nodes.remove(n)  # texture and tint chain: the bake's box_uvs would otherwise reconnect it
    for l in list(bc.links):
        nt.links.remove(l)
    bc.default_value = target
    after.append(lum(target))

mean = lambda a: sum(a) / max(1, len(a))
print("ALBEDO", json.dumps({"surfaces": len(after), "meanBefore": mean(before), "meanAfter": mean(after)}))
bpy.ops.wm.save_as_mainfile(filepath=out)
