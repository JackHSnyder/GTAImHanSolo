"""Blender 4.2+ tool: fit recorded motion to an imported GTA humanoid skeleton.

Run this file in Blender's Text Editor, then use File > Import > Webcam Mocap.
The imported rig must have normal GTA orientation (+Z up, +Y forward).
The selected rig is duplicated; source animation and meshes are left intact.
Sollumz is needed only for the subsequent GTA XML export operator.
"""
bl_info = {"name": "Webcam Mocap GTA Importer", "author": "Webcam Mocap Lab",
           "version": (0, 2, 8), "blender": (4, 2, 0), "category": "Import-Export"}

import bpy
import json
import math
import importlib
import traceback
import re
from pathlib import Path
from mathutils import Vector, Quaternion, Matrix
from bpy_extras.io_utils import ImportHelper, ExportHelper

MAPPING = {
    "SKEL_Pelvis": "Hips", "SKEL_Spine0": "Spine", "SKEL_Spine1": "Chest",
    "SKEL_Spine2": "Chest", "SKEL_Spine3": "Chest", "SKEL_Neck_1": "Neck", "SKEL_Head": "Head",
    "SKEL_L_Clavicle": "LeftShoulder", "SKEL_L_UpperArm": "LeftArm",
    "SKEL_L_Forearm": "LeftForeArm", "SKEL_L_Hand": "LeftHand",
    "SKEL_R_Clavicle": "RightShoulder", "SKEL_R_UpperArm": "RightArm",
    "SKEL_R_Forearm": "RightForeArm", "SKEL_R_Hand": "RightHand",
    "SKEL_L_Thigh": "LeftUpLeg", "SKEL_L_Calf": "LeftLeg", "SKEL_L_Foot": "LeftFoot",
    "SKEL_L_Toe0": "LeftToeBase", "SKEL_R_Thigh": "RightUpLeg", "SKEL_R_Calf": "RightLeg",
    "SKEL_R_Foot": "RightFoot", "SKEL_R_Toe0": "RightToeBase",
}
TARGET_CHILD = {
    "SKEL_L_Clavicle": "SKEL_L_UpperArm", "SKEL_L_UpperArm": "SKEL_L_Forearm",
    "SKEL_L_Forearm": "SKEL_L_Hand", "SKEL_R_Clavicle": "SKEL_R_UpperArm",
    "SKEL_R_UpperArm": "SKEL_R_Forearm", "SKEL_R_Forearm": "SKEL_R_Hand",
    "SKEL_L_Hand": "SKEL_L_Finger20", "SKEL_R_Hand": "SKEL_R_Finger20",
    "SKEL_L_Thigh": "SKEL_L_Calf", "SKEL_L_Calf": "SKEL_L_Foot", "SKEL_L_Foot": "SKEL_L_Toe0",
    "SKEL_R_Thigh": "SKEL_R_Calf", "SKEL_R_Calf": "SKEL_R_Foot", "SKEL_R_Foot": "SKEL_R_Toe0",
}
REQUIRED = ("SKEL_Pelvis", "SKEL_L_UpperArm", "SKEL_R_UpperArm", "SKEL_L_Thigh", "SKEL_R_Thigh",
            "SKEL_L_Calf", "SKEL_R_Calf", "SKEL_L_Foot", "SKEL_R_Foot")
CONVERSION = Quaternion((1, 0, 0), math.pi / 2)


def source_quat(q, conversion=CONVERSION):
    return conversion @ Quaternion((q[3], q[0], q[1], q[2])).normalized() @ conversion.inverted()


def source_vector(v, conversion=CONVERSION):
    return conversion @ Vector(v)


def basis_rotation(side, up):
    if side.length < 1e-6 or up.length < 1e-6:
        return None
    x = side.normalized()
    z = x.cross(up)
    if z.length < 1e-6:
        return None
    z.normalize()
    y = z.cross(x).normalized()
    return Matrix((x, y, z)).transposed().to_quaternion()


def target_body_frame(rest):
    """Measure facing from the rig itself, including rigs facing -Y."""
    right = rest["SKEL_R_UpperArm"].translation - rest["SKEL_L_UpperArm"].translation
    top = next((rest[n].translation for n in ("SKEL_Neck_1", "SKEL_Head", "SKEL_Spine3") if n in rest), None)
    if top is None:
        raise ValueError("The GTA rig needs a neck, head or upper-spine bone to establish its facing.")
    frame = basis_rotation(right, top - rest["SKEL_Pelvis"].translation)
    if frame is None:
        raise ValueError("Cannot establish the GTA rig's right/up axes from its rest skeleton.")
    return frame


def end_effector_rest_frames(rest, conversion):
    result = {}
    up = conversion @ Vector((0, 1, 0))
    for side in ("L", "R"):
        hand = f"SKEL_{side}_Hand"
        names = [hand, f"SKEL_{side}_Finger20", f"SKEL_{side}_Finger10", f"SKEL_{side}_Finger40"]
        if all(n in rest for n in names):
            wrist, middle, index, pinky = [rest[n].translation for n in names]
            frame = basis_rotation(index - pinky, middle - wrist)
            if frame is not None:
                result[hand] = frame
        foot, toe = f"SKEL_{side}_Foot", f"SKEL_{side}_Toe0"
        if foot in rest and toe in rest:
            forward = rest[toe].translation - rest[foot].translation
            frame = basis_rotation(forward.cross(up), up)
            if frame is not None:
                result[foot] = frame
    return result


def stable_rotation(previous, rotation, limit):
    if previous is None:
        return rotation
    dot = min(1.0, abs(previous.dot(rotation)))
    angle = 2 * math.acos(dot)
    if previous.dot(rotation) < 0:
        rotation = rotation.copy()
        rotation.negate()
    amount = min(.45, limit / angle) if angle > 1e-6 else 1.0
    return previous.slerp(rotation, amount)


def facial_bone_names(ordered):
    """Body-only capture has no facial expression data; hold face to head."""
    names = set()
    for bone in ordered:
        name = bone.name.casefold()
        if (name.startswith(("fb_", "facial_", "skel_jaw", "skel_tongue", "mh_jaw", "mh_mouth", "mh_tongue")) or
                (bone.parent is not None and bone.parent.name in names)):
            names.add(bone.name)
    return names


def write_pose_transform(bone, pose, matrix, rest, parent, previous, frame_index, location=False, scale=False):
    basis = bone.convert_local_to_pose(matrix, rest[bone.name],
        parent_matrix=parent if parent is not None else Matrix.Identity(4),
        parent_matrix_local=rest[bone.parent.name] if bone.parent else Matrix.Identity(4), invert=True)
    pose.matrix_basis = basis
    pose.rotation_mode = "QUATERNION"
    rotation = pose.rotation_quaternion.copy()
    if bone.name in previous and rotation.dot(previous[bone.name]) < 0:
        rotation.negate()
    pose.rotation_quaternion = rotation
    previous[bone.name] = rotation.copy()
    pose.keyframe_insert("rotation_quaternion", frame=frame_index, group=bone.name)
    if location:
        pose.keyframe_insert("location", frame=frame_index, group=bone.name)
    if scale:
        pose.keyframe_insert("scale", frame=frame_index, group=bone.name)


def validate(data):
    if data.get("format") != "webcam-mocap-animation" or data.get("version") != 1:
        raise ValueError("Choose the .animation.json download, not original tracking JSON.")
    skeleton, frames = data.get("skeleton", []), data.get("frames", [])
    if not 1 <= len(skeleton) <= 100 or not 2 <= len(frames) <= 3601 or data.get("fps") != 30:
        raise ValueError("Unsupported animation size or frame rate.")
    if len({b["name"] for b in skeleton}) != len(skeleton):
        raise ValueError("Duplicate joint names.")
    for i, bone in enumerate(skeleton):
        if not isinstance(bone["parent"], int) or not -1 <= bone["parent"] < i:
            raise ValueError("Invalid skeleton hierarchy.")
        if len(bone["offset"]) != 3 or not all(math.isfinite(v) and abs(v) < 10 for v in bone["offset"]):
            raise ValueError("Invalid skeleton offset.")
    for frame in frames:
        if len(frame["root"]) != 3 or not all(math.isfinite(v) and abs(v) < 10 for v in frame["root"]):
            raise ValueError("Invalid root position.")
        if len(frame["rotations"]) != len(skeleton):
            raise ValueError("Invalid rotation count.")
        for q in frame["rotations"]:
            if len(q) != 4 or not all(math.isfinite(v) for v in q) or abs(sum(v*v for v in q) - 1) > .02:
                raise ValueError("Invalid rotation quaternion.")
        ends = frame.get("endEffectors", {})
        if not isinstance(ends, dict):
            raise ValueError("Invalid wrist/foot orientation data.")
        for name, q in ends.items():
            if name not in ("LeftHand", "RightHand", "LeftFoot", "RightFoot") or len(q) != 4 or not all(math.isfinite(v) for v in q) or abs(sum(v*v for v in q) - 1) > .02:
                raise ValueError("Invalid wrist/foot orientation quaternion.")


def resolve_target(context):
    """Resolve selection before opening Blender's file-browser context."""
    active = context.view_layer.objects.active
    if active is not None and active.type == "ARMATURE":
        return active
    if active is not None and active.type == "MESH":
        armature = active.find_armature()
        if armature is not None:
            return armature
    selected = [obj for obj in context.selected_objects if obj.type == "ARMATURE"]
    if len(selected) == 1:
        return selected[0]
    raise ValueError("Select the GTA skeleton (armature) in the Outliner before opening Webcam Mocap Import.")


def create_preview_rig(context, target, name):
    # A fresh armature prevents action, constraint or driver changes to the source.
    rig = bpy.data.objects.new(name + "_preview", target.data.copy())
    context.collection.objects.link(rig)
    rig.matrix_world = target.matrix_world.copy()
    rig.show_in_front = True
    rig.data.pose_position = "POSE"
    # Linking alone does not guarantee Object.pose is initialized. Update the
    # dependency graph before accessing pose.bones on the newly created object.
    context.view_layer.update()
    if rig.pose is None:
        armature_data = rig.data
        bpy.data.objects.remove(rig, do_unlink=True)
        if armature_data.users == 0:
            bpy.data.armatures.remove(armature_data)
        raise RuntimeError("Blender could not initialize the preview skeleton's pose. Switch to Object Mode and retry; the source skeleton was preserved.")
    return rig


def import_motion(context, data, target, name):
    validate(data)
    if target is None or target.type != "ARMATURE" or target.data is None:
        raise ValueError("Select an imported GTA humanoid armature first.")
    if target.mode == "EDIT":
        raise ValueError("Switch the GTA skeleton from Edit Mode to Object Mode, then import again.")
    missing = [n for n in REQUIRED if n not in target.data.bones]
    if missing:
        raise ValueError("Missing GTA bones: " + ", ".join(missing))
    skeleton = data["skeleton"]
    indices = {b["name"]: i for i, b in enumerate(skeleton)}
    if any(n not in indices for n in MAPPING.values()):
        raise ValueError("The animation is missing required source joints.")
    rig = create_preview_rig(context, target, name)
    for p in rig.pose.bones:
        p.rotation_mode = "QUATERNION"
        p.matrix_basis = Matrix.Identity(4)
        for constraint in p.constraints:
            constraint.mute = True
    ordered = sorted(rig.data.bones, key=lambda b: len(b.parent_recursive))
    facial = facial_bone_names(ordered)
    # Some ped facial roots are attached above the head in the hierarchy. Solve
    # the animated head first, then explicitly keep every facial bone neutral
    # relative to it, including mouth helpers outside the usual head branch.
    if facial and "SKEL_Head" not in rig.data.bones:
        raise ValueError("A facial skeleton requires SKEL_Head for neutral mouth stabilization.")
    ordered = [b for b in ordered if b.name not in facial] + [b for b in ordered if b.name in facial]
    rest = {b.name: b.matrix_local.copy() for b in ordered}
    rest_rot = {n: m.to_quaternion() for n, m in rest.items()}
    conversion = target_body_frame(rest)
    up = conversion @ Vector((0, 1, 0))
    end_rest = end_effector_rest_frames(rest, conversion)
    leg = lambda side: sum((rest[f"SKEL_{side}_{a}"].translation - rest[f"SKEL_{side}_{b}"].translation).length
                           for a, b in [("Thigh", "Calf"), ("Calf", "Foot")])
    source_leg = sum(Vector(skeleton[indices[n]]["offset"]).length for n in ("LeftLeg", "LeftFoot", "RightLeg", "RightFoot")) / 2
    scale = ((leg("L") + leg("R")) / 2) / max(source_leg, .01)
    floor = min(rest[n].translation.dot(up) for n in ("SKEL_L_Toe0", "SKEL_R_Toe0") if n in rest) if any(n in rest for n in ("SKEL_L_Toe0", "SKEL_R_Toe0")) else min(rest[n].translation.dot(up) for n in ("SKEL_L_Foot", "SKEL_R_Foot"))
    pelvis_height = rest["SKEL_Pelvis"].translation.dot(up) - floor
    rig.animation_data_create()
    action = bpy.data.actions.new(name)
    rig.animation_data.action = action
    context.scene.render.fps = data["fps"]
    context.scene.render.fps_base = 1
    context.scene.frame_start = 0
    context.scene.frame_end = len(data["frames"]) - 1
    previous = {}
    previous_feet = {}
    for frame_index, frame in enumerate(data["frames"]):
        global_q = []
        for i, b in enumerate(skeleton):
            q = source_quat(frame["rotations"][i], conversion)
            global_q.append(q if b["parent"] < 0 else global_q[b["parent"]] @ q)
        pose_matrices = {}
        for b in ordered:
            p = rig.pose.bones[b.name]
            parent = pose_matrices.get(b.parent.name) if b.parent else None
            posed_rest = (parent @ rest[b.parent.name].inverted() @ rest[b.name]) if parent is not None else rest[b.name].copy()
            if b.name in facial:
                matrix = pose_matrices["SKEL_Head"] @ rest["SKEL_Head"].inverted() @ rest[b.name]
                write_pose_transform(b, p, matrix, rest, parent, previous, frame_index, location=True, scale=True)
                pose_matrices[b.name] = matrix
                continue
            source_name = MAPPING.get(b.name)
            if source_name:
                i = indices[source_name]
                child = skeleton[i]["child"]
                recorded_end = frame.get("endEffectors", {}).get(source_name)
                if b.name in end_rest and (recorded_end is not None or b.name.endswith("_Foot")):
                    if recorded_end is not None:
                        desired_frame = conversion @ Quaternion((recorded_end[3], *recorded_end[:3])).normalized()
                    else:
                        # Old takes did not store sole frames. Discard their
                        # unconstrained calf/foot roll and use level feet.
                        direction = global_q[i] @ source_vector(skeleton[child]["offset"], conversion)
                        desired_frame = basis_rotation(direction.cross(up), up) or conversion
                    if b.name.endswith("_Foot"):
                        desired_frame = stable_rotation(previous_feet.get(b.name), desired_frame, math.pi / 18)
                        previous_feet[b.name] = desired_frame.copy()
                    q = desired_frame @ end_rest[b.name].inverted() @ rest_rot[b.name]
                elif b.name.endswith("_Toe0"):
                    q = posed_rest.to_quaternion()
                elif b.name in TARGET_CHILD and TARGET_CHILD[b.name] in rest and child >= 0:
                    rest_direction = rest[TARGET_CHILD[b.name]].translation - rest[b.name].translation
                    parent_delta = (parent.to_quaternion() @ rest_rot[b.parent.name].inverted()) if parent is not None else Quaternion()
                    base = parent_delta @ rest_rot[b.name]
                    original = parent_delta @ rest_direction
                    desired = global_q[i] @ source_vector(skeleton[child]["offset"], conversion)
                    q = original.rotation_difference(desired) @ base if original.length > 1e-6 and desired.length > 1e-6 else base
                else:
                    q = global_q[i] @ rest_rot[b.name]
                matrix = q.to_matrix().to_4x4()
                matrix.translation = posed_rest.translation
                if b.name == "SKEL_Pelvis":
                    matrix.translation += up * (frame["root"][1] * scale - pelvis_height)
                write_pose_transform(b, p, matrix, rest, parent, previous, frame_index, location=b.name == "SKEL_Pelvis")
                pose_matrices[b.name] = matrix
            else:
                p.matrix_basis = Matrix.Identity(4)
                pose_matrices[b.name] = posed_rest
    # Store the real action used by Blender (including its slot on newer versions).
    rig["mocap_clip"] = name
    rig["mocap_frames"] = len(data["frames"])
    context.scene.frame_set(0)
    for obj in context.selected_objects:
        obj.select_set(False)
    rig.select_set(True)
    context.view_layer.objects.active = rig
    context.view_layer.update()
    return rig


def sollumz_modules():
    for module in context_addons():
        try:
            importer = importlib.import_module(module + ".ycd.ycdimport")
            exporter = importlib.import_module(module + ".ycd.ycdexport")
            types = importlib.import_module(module + ".sollumz_properties")
            return importer, exporter, types.SollumType
        except ImportError:
            continue
    raise RuntimeError("Enable a recent Sollumz add-on with YCD XML export. The baked Blender action is already available.")


def context_addons():
    return [name for name in bpy.context.preferences.addons.keys() if "sollumz" in name.lower()]


def facial_binding_key(name):
    if not name.casefold().startswith(("fb_", "facial_")):
        return None
    return re.sub(r"_\d{3}$", "", name.casefold())


def repair_facial_mesh_bindings(context, rig):
    if rig is None or rig.type != "ARMATURE" or "mocap_clip" not in rig:
        raise ValueError("Select the animated mocap preview or a mesh bound to it.")
    by_key = {}
    for bone in rig.data.bones:
        key = facial_binding_key(bone.name)
        if key:
            by_key.setdefault(key, []).append(bone.name)
    plan, unresolved = [], []
    for obj in context.scene.objects:
        if obj.type != "MESH" or not any(m.type == "ARMATURE" and m.object == rig for m in obj.modifiers):
            continue
        for group in obj.vertex_groups:
            key = facial_binding_key(group.name)
            if not key or group.name in rig.data.bones:
                continue
            matches = by_key.get(key, [])
            if len(matches) == 1 and obj.vertex_groups.get(matches[0]) is None:
                plan.append((obj, group, group.name, matches[0]))
            else:
                unresolved.append(obj.name + ": " + group.name)
    if unresolved:
        raise ValueError("Facial binding names are ambiguous or missing; no groups changed: " + ", ".join(unresolved[:6]))
    # Only group names change. Indices, vertex memberships and every weight
    # remain intact, as do the armature's rest skeleton and existing animation.
    for obj, group, old, new in plan:
        group.name = new
        print(f"Mocap facial binding: {obj.name}: {old} -> {new}")
    context.view_layer.update()
    return len(plan)


def neutralize_preview_face(context, rig):
    if rig is None or rig.type != "ARMATURE" or "mocap_clip" not in rig:
        raise ValueError("Select the animated mocap preview skeleton or a mesh bound to it.")
    if rig.mode == "EDIT":
        raise ValueError("Switch to Object Mode before stabilizing the face.")
    if rig.animation_data is None or rig.animation_data.action is None:
        raise ValueError("The mocap preview has no animation action.")
    ordered = sorted(rig.data.bones, key=lambda b: len(b.parent_recursive))
    facial = facial_bone_names(ordered)
    if not facial:
        raise ValueError("No recognized GTA facial bones were found on this skeleton.")
    if "SKEL_Head" not in rig.data.bones:
        raise ValueError("The skeleton needs SKEL_Head to anchor the neutral face.")
    rest = {b.name: b.matrix_local.copy() for b in ordered}
    original_action = rig.animation_data.action
    corrected = original_action.copy()
    corrected.name = original_action.name + "_neutral_face"
    rig.animation_data.action = corrected
    old_frame = context.scene.frame_current
    previous = {}
    begin = math.floor(original_action.frame_range[0])
    end = math.ceil(original_action.frame_range[1])
    try:
        for frame in range(begin, end + 1):
            context.scene.frame_set(frame)
            context.view_layer.update()
            head_delta = rig.pose.bones["SKEL_Head"].matrix.copy() @ rest["SKEL_Head"].inverted()
            solved = {}
            for bone in ordered:
                if bone.name not in facial:
                    continue
                matrix = head_delta @ rest[bone.name]
                parent = solved.get(bone.parent.name, rig.pose.bones[bone.parent.name].matrix.copy()) if bone.parent else None
                write_pose_transform(bone, rig.pose.bones[bone.name], matrix, rest, parent, previous, frame, location=True, scale=True)
                solved[bone.name] = matrix
    except Exception:
        rig.animation_data.action = original_action
        raise
    finally:
        context.scene.frame_set(old_frame)
        context.view_layer.update()
    return len(facial)


def mirrored_bone_name(name):
    for left, right in (("_L_", "_R_"),):
        if left in name:
            return name.replace(left, right, 1)
        if right in name:
            return name.replace(right, left, 1)
    for left, right in ((".L", ".R"), ("_L", "_R")):
        if name.endswith(left):
            return name[:-len(left)] + right
        if name.endswith(right):
            return name[:-len(right)] + left
    return name


def create_mirrored_rig(context, source):
    """Bake reflected opposite-side deformation, preserving the GTA rest rig.

    Reflecting an object's scale is not enough: it leaves the wrong anatomical
    limb animated and can invert the mesh. Reflect the deformation matrices on
    both sides of the transform, then apply them to the destination rest bones.
    """
    if source is None or source.type != "ARMATURE" or "mocap_clip" not in source:
        raise ValueError("Select the animated Webcam Mocap preview rig first.")
    if source.mode != "OBJECT":
        raise ValueError("Switch to Object Mode before creating a mirrored animation.")
    if source.animation_data is None or source.animation_data.action is None:
        raise ValueError("The selected mocap rig has no animation action.")
    if source.get("mocap_mirrored", False):
        raise ValueError("This rig is already marked mirrored. Select the original to export the pair.")
    rest = {b.name: b.matrix_local.copy() for b in source.data.bones}
    if any(n not in rest for n in REQUIRED):
        raise ValueError("The selected rig is missing required GTA body bones.")
    side = (rest["SKEL_R_UpperArm"].translation - rest["SKEL_L_UpperArm"].translation).normalized()
    if side.length < .5:
        raise ValueError("Cannot establish the rig's left/right mirror plane.")
    reflection = Matrix.Identity(4)
    for row in range(3):
        for col in range(3):
            reflection[row][col] -= 2 * side[row] * side[col]
    center = rest["SKEL_Pelvis"].translation
    reflection.translation = center - reflection.to_3x3() @ center
    ordered = sorted(source.data.bones, key=lambda b: len(b.parent_recursive))
    facial = facial_bone_names(ordered)
    ordered = [b for b in ordered if b.name not in facial] + [b for b in ordered if b.name in facial]
    pairs = {b.name: mirrored_bone_name(b.name) if mirrored_bone_name(b.name) in rest else b.name for b in ordered}
    rig = create_preview_rig(context, source, source["mocap_clip"] + "_mirrored")
    rig.animation_data_create()
    action = bpy.data.actions.new(source["mocap_clip"] + "_mirrored")
    rig.animation_data.action = action
    old_frame = context.scene.frame_current
    previous = {}
    try:
        for frame in range(int(source["mocap_frames"])):
            context.scene.frame_set(frame)
            context.view_layer.update()
            evaluated = source.evaluated_get(context.evaluated_depsgraph_get())
            captured = {b.name: evaluated.pose.bones[b.name].matrix.copy() for b in ordered}
            solved = {}
            for bone in ordered:
                parent = solved.get(bone.parent.name) if bone.parent else None
                if bone.name in facial:
                    matrix = solved["SKEL_Head"] @ rest["SKEL_Head"].inverted() @ rest[bone.name]
                else:
                    partner = pairs[bone.name]
                    matrix = reflection @ captured[partner] @ rest[partner].inverted() @ reflection @ rest[bone.name]
                write_pose_transform(bone, rig.pose.bones[bone.name], matrix, rest, parent,
                                     previous, frame, location=True, scale=True)
                solved[bone.name] = matrix
        rig["mocap_clip"] = source["mocap_clip"]
        rig["mocap_frames"] = source["mocap_frames"]
        rig["mocap_mirrored"] = True
        rig["mocap_source_rig"] = source.name
    except Exception:
        armature = rig.data
        bpy.data.objects.remove(rig, do_unlink=True)
        if action.users == 0:
            bpy.data.actions.remove(action)
        if armature.users == 0:
            bpy.data.armatures.remove(armature)
        raise
    finally:
        context.scene.frame_set(old_frame)
        context.view_layer.update()
    for obj in context.selected_objects:
        obj.select_set(False)
    rig.select_set(True)
    context.view_layer.objects.active = rig
    return rig


def export_xml(rig, filepath):
    if not rig or rig.type != "ARMATURE" or "mocap_clip" not in rig:
        raise ValueError("Select the rig created by the Webcam Mocap importer.")
    importer, exporter, types = sollumz_modules()
    action = rig.animation_data.action
    if not action:
        raise ValueError("The imported rig has no animation action.")
    name = rig["mocap_clip"]
    dictionary, clips, animations = importer.create_clip_dictionary_template(Path(filepath).name.removesuffix(".ycd.xml"))
    animation = importer.create_anim_obj(types.ANIMATION)
    animation.parent = animations
    props = animation.animation_properties
    props.hash = name + "_animation"
    # Assign target before action: Sollumz must not reinterpret the already
    # baked local-pose curves as canonical GTA-space curves during assignment.
    if hasattr(props, "target_id"):
        props.target_id = rig.data
    else:
        raise RuntimeError("This export bridge requires Sollumz's target_id animation API. Update Sollumz; the baked action is preserved.")
    props.action = action
    clip = importer.create_anim_obj(types.CLIP)
    clip.parent = clips
    clip.clip_properties.hash = name
    clip.clip_properties.name = name
    clip.clip_properties.duration = (rig["mocap_frames"] - 1) / bpy.context.scene.render.fps
    link = clip.clip_properties.animations.add()
    link.animation = animation
    link.start_frame = 0
    link.end_frame = rig["mocap_frames"] - 1
    bpy.context.view_layer.update()
    if not exporter.export_ycd(dictionary, filepath):
        raise RuntimeError("Sollumz rejected the export; inspect its report. The baked action is preserved.")
    if not Path(filepath).is_file() or Path(filepath).stat().st_size == 0:
        raise RuntimeError("No GTA XML file was produced.")


class MOCAP_OT_import(bpy.types.Operator, ImportHelper):
    bl_idname = "import_scene.webcam_mocap"
    bl_label = "Webcam Mocap Animation (.animation.json)"
    bl_options = {"REGISTER", "UNDO"}
    filename_ext = ".json"
    # Browser download suffixes such as '(1)' can break a multi-dot glob. Check
    # the format field in validate(), rather than hiding other JSON filenames.
    filter_glob: bpy.props.StringProperty(default="*.json", options={"HIDDEN", "SKIP_SAVE"})
    # Operators cannot store datablock PointerProperties in current Blender.
    target_object_name: bpy.props.StringProperty(default="", options={"HIDDEN", "SKIP_SAVE"})

    @property
    def target_object(self):
        return bpy.data.objects.get(self.target_object_name)

    @target_object.setter
    def target_object(self, value):
        self.target_object_name = value.name if value is not None else ""

    def invoke(self, context, event):
        try:
            self.target_object = resolve_target(context)
            self.filter_glob = "*.json"
        except ValueError as error:
            self.report({"ERROR"}, str(error))
            return {"CANCELLED"}
        return ImportHelper.invoke(self, context, event)

    def draw(self, context):
        if self.target_object is not None:
            self.layout.label(text="GTA skeleton: " + self.target_object.name)
        self.layout.label(text="Choose animation JSON; original tracking JSON is not an animation.")

    def execute(self, context):
        try:
            path = Path(self.filepath)
            if path.stat().st_size > 50_000_000:
                raise ValueError("Animation file is too large.")
            data = json.loads(path.read_text(encoding="utf-8"))
            name = "webcam_take"
            target = self.target_object if self.target_object is not None else resolve_target(context)
            import_motion(context, data, target, name)
            self.report({"INFO"}, "Motion baked to a new rig. Preview and check feet before exporting.")
            return {"FINISHED"}
        except Exception as error:
            traceback.print_exc()
            self.report({"ERROR"}, str(error))
            return {"CANCELLED"}


class MOCAP_OT_export(bpy.types.Operator, ExportHelper):
    bl_idname = "export_scene.webcam_mocap_gta"
    bl_label = "Webcam Mocap GTA XML (.ycd.xml)"
    filename_ext = ".ycd.xml"
    filter_glob: bpy.props.StringProperty(default="*.ycd.xml", options={"HIDDEN"})
    export_mirrored_copy: bpy.props.BoolProperty(
        name="Also export mirrored dictionary", default=True,
        description="Bake a mirrored rig and export a second _mirrored.ycd.xml for the FiveM config switch")

    def check(self, context):
        # ExportHelper strips only .xml before reappending .ycd.xml, causing
        # repeated .ycd suffixes whenever the file browser checks the name.
        path = Path(self.filepath)
        name = path.name
        if not name:
            return False
        while name.lower().endswith((".ycd", ".xml")):
            name = name.rsplit(".", 1)[0]
        normalized = str(path.with_name((name or "webcam_recording") + ".ycd.xml"))
        if normalized != self.filepath:
            self.filepath = normalized
            return True
        return False

    def execute(self, context):
        try:
            rig = resolve_target(context)
            export_xml(rig, self.filepath)
            if self.export_mirrored_copy and not rig.get("mocap_mirrored", False):
                mirror = create_mirrored_rig(context, rig)
                path = Path(self.filepath)
                mirror_path = path.with_name(path.name.removesuffix(".ycd.xml") + "_mirrored.ycd.xml")
                try:
                    export_xml(mirror, str(mirror_path))
                finally:
                    mirror.select_set(False)
                    rig.select_set(True)
                    context.view_layer.objects.active = rig
                self.report({"INFO"}, "Original and mirrored XML exported. Compile BOTH to .ycd with CodeWalker and install in stream.")
            else:
                self.report({"INFO"}, "GTA XML exported. Compile to .ycd using CodeWalker before FiveM playback.")
            return {"FINISHED"}
        except Exception as error:
            traceback.print_exc()
            self.report({"ERROR"}, str(error))
            return {"CANCELLED"}


class MOCAP_OT_neutral_face(bpy.types.Operator):
    bl_idname = "pose.webcam_mocap_neutral_face"
    bl_label = "Webcam Mocap: Neutralize Jaw and Face"
    bl_description = "Keep facial bones neutral relative to the moving head; preserve the original action as a backup"
    bl_options = {"REGISTER", "UNDO"}

    def execute(self, context):
        try:
            rig = resolve_target(context)
            bindings = repair_facial_mesh_bindings(context, rig)
            count = neutralize_preview_face(context, rig)
            self.report({"INFO"}, f"Repaired {bindings} facial mesh groups and neutralized {count} facial bones. Original action kept as a backup.")
            return {"FINISHED"}
        except Exception as error:
            traceback.print_exc()
            self.report({"ERROR"}, str(error))
            return {"CANCELLED"}


class MOCAP_OT_repair_face_binding(bpy.types.Operator):
    bl_idname = "object.webcam_mocap_repair_face_binding"
    bl_label = "Webcam Mocap: Repair Facial Mesh Binding"
    bl_description = "Match head mesh facial group names to the animated rig, preserving all skin weights"
    bl_options = {"REGISTER", "UNDO"}

    def execute(self, context):
        try:
            count = repair_facial_mesh_bindings(context, resolve_target(context))
            self.report({"INFO"}, f"Repaired {count} facial group names. Skin weights, skeleton and animation preserved.")
            return {"FINISHED"}
        except Exception as error:
            traceback.print_exc()
            self.report({"ERROR"}, str(error))
            return {"CANCELLED"}


def import_menu(self, context):
    self.layout.operator(MOCAP_OT_import.bl_idname)


def export_menu(self, context):
    self.layout.operator(MOCAP_OT_export.bl_idname)


def mocap_object_menu(self, context):
    self.layout.separator()
    self.layout.operator(MOCAP_OT_neutral_face.bl_idname, text="Webcam Mocap: Neutralize Jaw and Face")
    self.layout.operator(MOCAP_OT_repair_face_binding.bl_idname, text="Webcam Mocap: Repair Facial Mesh Binding")


def remove_mocap_menu_entries():
    # Text Editor reruns create new function objects. Remove the old callbacks
    # by our marker or their original, specific operator reference; function
    # identity alone cannot find callbacks left by earlier script versions.
    for menu, callback_name, operator_name in (
        (bpy.types.TOPBAR_MT_file_import, "import_menu", "MOCAP_OT_import"),
        (bpy.types.TOPBAR_MT_file_export, "export_menu", "MOCAP_OT_export"),
        (bpy.types.VIEW3D_MT_object, "mocap_object_menu", "MOCAP_OT_neutral_face"),
    ):
        for callback in tuple(getattr(menu.draw, "_draw_funcs", ())):
            code = getattr(callback, "__code__", None)
            legacy = (getattr(callback, "__name__", "") == callback_name and
                      code is not None and operator_name in code.co_names)
            if getattr(callback, "_webcam_mocap_menu", False) or legacy:
                menu.remove(callback)


def register():
    remove_mocap_menu_entries()
    for cls in (MOCAP_OT_import, MOCAP_OT_export, MOCAP_OT_neutral_face, MOCAP_OT_repair_face_binding):
        prefix, suffix = cls.bl_idname.split(".", 1)
        existing = bpy.types.Operator.bl_rna_get_subclass_py(prefix.upper() + "_OT_" + suffix)
        if existing:
            bpy.utils.unregister_class(existing)
        bpy.utils.register_class(cls)
    import_menu._webcam_mocap_menu = True
    export_menu._webcam_mocap_menu = True
    mocap_object_menu._webcam_mocap_menu = True
    bpy.types.TOPBAR_MT_file_import.append(import_menu)
    bpy.types.TOPBAR_MT_file_export.append(export_menu)
    bpy.types.VIEW3D_MT_object.append(mocap_object_menu)
    print("Webcam Mocap importer 0.2.8 ready. File > Export > Webcam Mocap GTA XML includes a mirrored dictionary option.")


def unregister():
    remove_mocap_menu_entries()
    for cls in (MOCAP_OT_repair_face_binding, MOCAP_OT_neutral_face, MOCAP_OT_export, MOCAP_OT_import):
        prefix, suffix = cls.bl_idname.split(".", 1)
        existing = bpy.types.Operator.bl_rna_get_subclass_py(prefix.upper() + "_OT_" + suffix)
        if existing:
            bpy.utils.unregister_class(existing)


if __name__ == "__main__":
    register()
