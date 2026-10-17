"""Optional integration test: installed Sollumz, synthetic rigs, no user scenes.

Run Blender in background with --python this_file -- <output-directory>.
"""
import bpy
import runpy
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from types import SimpleNamespace

bpy.ops.preferences.addon_enable(module="bl_ext.user_default.sollumz")
if not hasattr(bpy.types.Bone, "bone_properties"):
    print("SKIP: installed Sollumz has not initialized its asset API; required dependencies are unavailable in this Blender environment.")
    raise SystemExit(0)
fixture = runpy.run_path(str(Path(__file__).with_name("blender_retarget_smoke.py")))
module, rig = fixture["module"], fixture["rig"]
module["register"]()
for obj in bpy.context.selected_objects:
    obj.select_set(False)
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
original_action = rig.animation_data.action
output = Path(sys.argv[sys.argv.index("--") + 1])
output.mkdir(parents=True, exist_ok=True)
original = output / "mirror_export.ycd.xml"
mirrored = output / "mirror_export_mirrored.ycd.xml"
operator = SimpleNamespace(filepath=str(original), export_mirrored_copy=True, report=lambda *args: print(*args))
assert module["MOCAP_OT_export"].execute(operator, bpy.context) == {"FINISHED"}
assert rig.animation_data.action is original_action
assert bpy.context.view_layer.objects.active == rig
roots = []
for path in (original, mirrored):
    assert path.is_file() and path.stat().st_size > 1000
    root = ET.parse(path).getroot()
    assert root.find("Clips/Item") is not None
    assert root.find("Animations/Item") is not None
    roots.append(root)
assert original.read_bytes() != mirrored.read_bytes(), "Mirrored export is identical to original"
for field in ("Hash", "Unknown1C"):
    assert roots[0].findtext('Animations/Item/' + field) != roots[1].findtext('Animations/Item/' + field), 'Original/mirror cache identity collision: ' + field
for root in roots:
    assert root.findtext('Clips/Item/AnimationHash') == root.findtext('Animations/Item/Hash')
for field in ("Hash", "Name", "EndTime"):
    a, b = (root.find("Clips/Item/" + field) for root in roots)
    assert a is not None and b is not None
    assert ET.tostring(a) == ET.tostring(b), "Mirroring changes clip " + field
module["unregister"]()
print("PASS: actual Sollumz paired XML export, distinct motion, matching clip metadata, preserved source action")
