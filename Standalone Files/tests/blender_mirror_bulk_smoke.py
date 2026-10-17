"""Long-take mirror performance/cancellation test using synthetic bones only."""
import bpy
import runpy
import time
from pathlib import Path
from mathutils import Vector

fixture = runpy.run_path(str(Path(__file__).with_name("blender_retarget_smoke.py")))
module, source = fixture["module"], fixture["rig"]
for obj in bpy.context.selected_objects:
    obj.select_set(False)
source.select_set(True)
bpy.context.view_layer.objects.active = source
bpy.ops.object.mode_set(mode="EDIT")
head = source.data.edit_bones["SKEL_Head"]
for index in range(200):
    bone = source.data.edit_bones.new(f"FB_MirrorStress_{index}")
    bone.head = head.head + Vector((index * .0001, .01, .01))
    bone.tail = bone.head + Vector((0, 0, .01))
    bone.parent = head
bpy.ops.object.mode_set(mode="OBJECT")
for curve in module["action_curves"](source):
    for point in curve.keyframe_points:
        point.co.x *= 2850 / 11
        point.handle_left.x *= 2850 / 11
        point.handle_right.x *= 2850 / 11
    curve.update()
source["mocap_frames"] = 2851
bpy.context.scene.frame_end = 2850
original_action = source.animation_data.action
original_objects = set(bpy.data.objects.keys())
original_actions = set(bpy.data.actions.keys())
original_frame = bpy.context.scene.frame_current
job = module["iter_mirrored_rig"](bpy.context, source)
next(job)
job.close()
assert set(bpy.data.objects.keys()) == original_objects, "Cancelled bake leaves an orphan rig"
assert set(bpy.data.actions.keys()) == original_actions, "Cancelled bake leaves an orphan action"
assert bpy.context.scene.frame_current == original_frame

began = time.perf_counter()
job = module["iter_mirrored_rig"](bpy.context, source)
updates = 0
while True:
    try:
        progress, label = next(job)
        updates += 1
    except StopIteration as done:
        mirror = done.value
        break
seconds = time.perf_counter() - began
curves = list(module["action_curves"](mirror))
points = sum(len(curve.keyframe_points) for curve in curves)
assert updates >= 2851, "Long bake must yield between frames"
assert points < len(source.data.bones) * 2851, "Constant channels were not reduced"
assert source.animation_data.action is original_action
assert mirror["mocap_frames"] == 2851
assert tuple(mirror.animation_data.action.frame_range) == (0, 2850)
for frame in (0, 250, 1000, 2850):
    bpy.context.scene.frame_set(frame)
    bpy.context.view_layer.update()
    normal = (source.data.bones["SKEL_R_UpperArm"].head_local-source.data.bones["SKEL_L_UpperArm"].head_local).normalized()
    center = source.data.bones["SKEL_Pelvis"].head_local
    for left, right in (("SKEL_L_Hand", "SKEL_R_Hand"), ("SKEL_L_Foot", "SKEL_R_Foot")):
        point = source.pose.bones[right].head
        expected = point - 2 * normal * (point-center).dot(normal)
        assert (mirror.pose.bones[left].head-expected).length < .0002
print(f"PASS: 95-second take, {len(source.data.bones)} bones, {seconds:.2f}s bulk bake, {points} curve points, {updates} progress yields; cancellation cleans rig/action/frame")
