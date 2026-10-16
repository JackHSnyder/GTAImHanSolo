"""Run with Blender --background --factory-startup --python this_file.

Uses synthetic GTA-style rest rigs with deliberately unusual bone axes.
No user scene, installed game assets or Sollumz settings are loaded.
"""
import bpy
import math
import runpy
from pathlib import Path
from mathutils import Vector, Quaternion

module = runpy.run_path(str(Path(__file__).resolve().parents[1] / "tools" / "mocap_gta_importer.py"))
layout = [
    ("Hips", -1, 1, (0, 0, 0)), ("Spine", 0, 2, (0, .2, 0)), ("Chest", 1, 3, (0, .2, 0)),
    ("Neck", 2, 4, (0, .15, 0)), ("Head", 3, -1, (0, .1, 0)),
    ("LeftShoulder", 2, 6, (-.1, 0, 0)), ("LeftArm", 5, 7, (-.1, 0, 0)),
    ("LeftForeArm", 6, 8, (-.3, 0, 0)), ("LeftHand", 7, 9, (-.25, 0, 0)), ("LeftHandEnd", 8, -1, (-.1, 0, 0)),
    ("RightShoulder", 2, 11, (.1, 0, 0)), ("RightArm", 10, 12, (.1, 0, 0)),
    ("RightForeArm", 11, 13, (.3, 0, 0)), ("RightHand", 12, 14, (.25, 0, 0)), ("RightHandEnd", 13, -1, (.1, 0, 0)),
    ("LeftUpLeg", 0, 16, (-.1, 0, 0)), ("LeftLeg", 15, 17, (0, -.42, 0)),
    ("LeftFoot", 16, 18, (0, -.42, 0)), ("LeftToeBase", 17, -1, (0, -.04, -.16)),
    ("RightUpLeg", 0, 20, (.1, 0, 0)), ("RightLeg", 19, 21, (0, -.42, 0)),
    ("RightFoot", 20, 22, (0, -.42, 0)), ("RightToeBase", 21, -1, (0, -.04, -.16)),
]
names = ["SKEL_Pelvis", "SKEL_Spine0", "SKEL_Spine1", "SKEL_Neck_1", "SKEL_Head",
         "SKEL_L_Clavicle", "SKEL_L_UpperArm", "SKEL_L_Forearm", "SKEL_L_Hand", None,
         "SKEL_R_Clavicle", "SKEL_R_UpperArm", "SKEL_R_Forearm", "SKEL_R_Hand", None,
         "SKEL_L_Thigh", "SKEL_L_Calf", "SKEL_L_Foot", "SKEL_L_Toe0",
         "SKEL_R_Thigh", "SKEL_R_Calf", "SKEL_R_Foot", "SKEL_R_Toe0"]
def xyzw(q):
    return [q.x, q.y, q.z, q.w]


def make_rig(yaw):
    convert = Quaternion((0, 0, 1), yaw) @ Quaternion((1, 0, 0), math.pi / 2)
    arm = bpy.data.armatures.new("SyntheticGTA")
    obj = bpy.data.objects.new("SyntheticGTA", arm)
    bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    positions = []
    for i, (_, parent, _, offset) in enumerate(layout):
        p = Vector((0, .9, 0)) if parent < 0 else positions[parent] + Vector(offset)
        positions.append(p)
        if names[i] is None:
            continue
        b = arm.edit_bones.new(names[i])
        b.head = convert @ p
        # GTA bone display axes need not point toward the next joint.
        b.tail = b.head + Vector((.03, .01, .04))
        if parent >= 0:
            b.parent = arm.edit_bones[names[parent]]
    for side in ("L", "R"):
        wrist = arm.edit_bones[f"SKEL_{side}_Hand"]
        for tag, across in ((20, 0), (10, .025), (40, -.025)):
            finger = arm.edit_bones.new(f"SKEL_{side}_Finger{tag}")
            # Rest fingers point down, unlike the source's T-pose fingers.
            finger.head = wrist.head + convert @ Vector((across, -.10, 0))
            finger.tail = finger.head + Vector((.01, .01, .02))
            finger.parent = wrist
    head = arm.edit_bones["SKEL_Head"]
    for name, parent_name, offset in (
        ("FB_Jaw_000", "SKEL_Head", (0, -.04, -.025)),
        ("FACIAL_facialRoot", "SKEL_Spine0", (0, 0, -.02)),
        ("FB_L_LipBot_000", "FACIAL_facialRoot", (-.015, -.02, -.04)),
        ("mouth_helper", "FB_Jaw_000", (.01, -.05, -.02)),
    ):
        bone = arm.edit_bones.new(name)
        bone.head = head.head + convert @ Vector(offset)
        bone.tail = bone.head + Vector((.01, .015, .02))
        bone.parent = arm.edit_bones[parent_name]
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.context.view_layer.update()
    return obj, convert


def data(with_ends):
    frames = []
    for j in range(12):
        rotations = [[0, 0, 0, 1] for _ in layout]
        # Raise the left arm forward, not backward, in source coordinates.
        rotations[6] = xyzw(Vector((-1, 0, 0)).rotation_difference(Vector((0, 0, -1))))
        rotations[4] = xyzw(Quaternion((0, 1, 0), .4 * j / 11) @
                            Quaternion((1, 0, 0), .5 * j / 11) @
                            Quaternion((0, 0, 1), -.3 * j / 11))
        # Deliberately corrupt old foot roll without changing its toe direction.
        roll = Quaternion(Vector((0, -.04, -.16)).normalized(), (j % 2) * math.pi)
        rotations[17] = xyzw(roll)
        rotations[21] = xyzw(roll)
        frame = {"root": [0, .9, 0], "rotations": rotations}
        if with_ends:
            frame["endEffectors"] = {"LeftHand": xyzw(Quaternion((1, 0, 0), -.6 * j / 11)),
                                     "RightHand": [0, 0, 0, 1], "LeftFoot": [0, 0, 0, 1], "RightFoot": [0, 0, 0, 1]}
        frames.append(frame)
    return {"format": "webcam-mocap-animation", "version": 1, "fps": 30,
            "skeleton": [dict(name=n, parent=p, child=c, offset=o) for n, p, c, o in layout], "frames": frames}


for yaw in (0, math.pi):
    for with_ends in (False, True):
        target, convert = make_rig(yaw)
        motion = data(with_ends)
        rig = module["import_motion"](bpy.context, motion, target, "smoke_take")
        previous_feet = {}
        facial = ("FB_Jaw_000", "FACIAL_facialRoot", "FB_L_LipBot_000", "mouth_helper")
        rest_face = {name: target.data.bones["SKEL_Head"].matrix_local.inverted() @ target.data.bones[name].matrix_local for name in facial}
        for frame_index in range(len(motion["frames"])):
            bpy.context.scene.frame_set(frame_index)
            bpy.context.view_layer.update()
            bones = rig.pose.bones
            head_q = motion['frames'][frame_index]['rotations'][4]
            expected_head = convert @ Quaternion((head_q[3], *head_q[:3])) @ convert.inverted() @ target.data.bones['SKEL_Head'].matrix_local.to_quaternion()
            assert abs(bones['SKEL_Head'].matrix.to_quaternion().dot(expected_head)) > .99999, 'Recorded turn/nod/tilt does not reach GTA head bone'
            for name in facial:
                relative = bones["SKEL_Head"].matrix.inverted() @ bones[name].matrix
                assert max(abs(relative[r][c] - rest_face[name][r][c]) for r in range(4) for c in range(4)) < 1e-4, "Mouth/jaw drifts away from neutral head-relative pose"
            direction = (bones["SKEL_L_Forearm"].head - bones["SKEL_L_UpperArm"].head).normalized()
            assert direction.dot(convert @ Vector((0, 0, -1))) > .99, "Arm moves backward on a reversed-facing rig"
            for side in ("L", "R"):
                q = bones[f"SKEL_{side}_Foot"].matrix.to_quaternion()
                if side in previous_feet:
                    angle = 2 * math.acos(min(1, abs(q.dot(previous_feet[side]))))
                    assert angle < .05, "Unobserved foot roll survives retargeting"
                previous_feet[side] = q
            if with_ends:
                wrist = bones["SKEL_L_Hand"].head
                middle = bones["SKEL_L_Finger20"].head
                observed = (middle - wrist).normalized()
                end = motion["frames"][frame_index]["endEffectors"]["LeftHand"]
                expected = convert @ (Quaternion((end[3], *end[:3])) @ Vector((0, 1, 0)))
                assert observed.dot(expected) > .99, "Hand rest axes override recorded palm orientation"
            else:
                observed = (bones["SKEL_L_Finger20"].head - bones["SKEL_L_Hand"].head).normalized()
                assert observed.dot(convert @ Vector((0, 0, -1))) > .99, "Legacy hand stays pointed down instead of following recorded fingers"
        assert target.animation_data is None, "Source rig was modified"
        curves = rig.animation_data.action.layers[0].strips[0].channelbags[0].fcurves
        for name in facial:
            for channel in ("location", "rotation_quaternion", "scale"):
                assert any(fc.data_path == bones[name].path_from_id(channel) for fc in curves), "Neutral face track missing from baked action"
        original_action = rig.animation_data.action
        expected_heads = []
        for frame_index in range(len(motion["frames"])):
            bpy.context.scene.frame_set(frame_index)
            bpy.context.view_layer.update()
            expected_heads.append(bones["SKEL_Head"].matrix.copy())
            bones["FB_Jaw_000"].rotation_quaternion = Quaternion((1, 0, 0), .7)
            bones["FB_Jaw_000"].keyframe_insert("rotation_quaternion", frame=frame_index)
        assert module["neutralize_preview_face"](bpy.context, rig) == len(facial)
        assert rig.animation_data.action is not original_action, "Face repair must preserve the original action"
        for frame_index, head in enumerate(expected_heads):
            bpy.context.scene.frame_set(frame_index)
            bpy.context.view_layer.update()
            assert max(abs(bones["SKEL_Head"].matrix[r][c] - head[r][c]) for r in range(4) for c in range(4)) < 1e-5, "Face repair changes head movement"
            for name in facial:
                relative = bones["SKEL_Head"].matrix.inverted() @ bones[name].matrix
                assert max(abs(relative[r][c] - rest_face[name][r][c]) for r in range(4) for c in range(4)) < 1e-4, "Repair leaves a distorted jaw pose"
        # Reflect the current baked action, including all face repairs. Measure
        # in body space rather than assuming the rig faces Blender's +Y axis.
        original_action = rig.animation_data.action
        mirror = module["create_mirrored_rig"](bpy.context, rig)
        normal = (rig.data.bones['SKEL_R_UpperArm'].head_local-rig.data.bones['SKEL_L_UpperArm'].head_local).normalized()
        center = rig.data.bones['SKEL_Pelvis'].head_local
        reflected_point = lambda p: p - 2 * normal * (p-center).dot(normal)
        reflected_vector = lambda v: v - 2 * normal * v.dot(normal)
        for frame_index in range(len(motion['frames'])):
            bpy.context.scene.frame_set(frame_index);bpy.context.view_layer.update()
            for left,right in [('SKEL_L_Hand','SKEL_R_Hand'),('SKEL_L_Foot','SKEL_R_Foot'),('SKEL_L_Forearm','SKEL_R_Forearm')]:
                for a,b in [(left,right),(right,left)]:
                    # Synthetic rest is symmetric, so reflected end positions
                    # must match opposite-side positions in the baked action.
                    error=(mirror.pose.bones[a].head-reflected_point(rig.pose.bones[b].head)).length
                    assert error<2e-4, f'Mirror does not swap {a}: {error}'
            for side,other in [('L','R'),('R','L')]:
                old_fingers=rig.pose.bones[f'SKEL_{other}_Finger20'].head-rig.pose.bones[f'SKEL_{other}_Hand'].head
                new_fingers=mirror.pose.bones[f'SKEL_{side}_Finger20'].head-mirror.pose.bones[f'SKEL_{side}_Hand'].head
                assert (new_fingers-reflected_vector(old_fingers)).length<2e-4, 'Mirrored wrist orientation lost'
            for name in facial:
                relative=mirror.pose.bones['SKEL_Head'].matrix.inverted() @ mirror.pose.bones[name].matrix
                assert max(abs(relative[r][c]-rest_face[name][r][c]) for r in range(4) for c in range(4))<2e-4,'Mirroring distorts neutral face'
            assert all(b.matrix.to_3x3().determinant()>.99 for b in mirror.pose.bones),'Mirroring introduces negative scale'
        assert rig.animation_data.action is original_action,'Mirroring replaces the original action'
        assert mirror['mocap_clip']==rig['mocap_clip'] and mirror['mocap_mirrored'] is True
        mirror.select_set(False);rig.select_set(True);bpy.context.view_layer.objects.active=rig
        print(f"PASS: native Blender retarget yaw={round(yaw, 3)} endEffectors={with_ends}")
module["register"]()
assert bpy.ops.pose.webcam_mocap_neutral_face() == {"FINISHED"}
mesh_data = bpy.data.meshes.new("FacialBindingTest")
mesh_data.from_pydata([(0, 0, 0), (.01, 0, 0), (0, .01, 0)], [], [(0, 1, 2)])
mesh = bpy.data.objects.new("FacialBindingTest", mesh_data)
bpy.context.collection.objects.link(mesh)
modifier = mesh.modifiers.new("Skin", "ARMATURE")
modifier.object = rig
group = mesh.vertex_groups.new(name="FB_Jaw_045")
group.add([0, 1, 2], .75, "REPLACE")
head_group = mesh.vertex_groups.new(name="SKEL_Head")
head_group.add([0, 1, 2], .25, "REPLACE")
before_weights = [[(g.group, g.weight) for g in v.groups] for v in mesh_data.vertices]
assert module["repair_facial_mesh_bindings"](bpy.context, rig) == 1
assert group.name == "FB_Jaw_000"
assert before_weights == [[(g.group, g.weight) for g in v.groups] for v in mesh_data.vertices]
assert module["repair_facial_mesh_bindings"](bpy.context, rig) == 0
module["unregister"]()
print("PASS: all native Blender retarget and neutral-face command checks")
