"""Regression checks with a deferred-pose Blender stand-in; not a Blender runtime test."""
import ast
from pathlib import Path
from types import SimpleNamespace as NS
import unittest

SOURCE = Path(__file__).resolve().parents[1] / "tools" / "mocap_gta_importer.py"
TREE = ast.parse(SOURCE.read_text(encoding="utf-8"))


def load_functions(namespace, names):
    functions = [node for node in TREE.body if isinstance(node, ast.FunctionDef) and node.name in names]
    exec(compile(ast.Module(body=functions, type_ignores=[]), str(SOURCE), "exec"), namespace)
    return namespace


class ImporterRegressionTests(unittest.TestCase):
    def test_paired_export_keeps_clip_rig_and_writes_suffixed_dictionary(self):
        cls = next(n for n in TREE.body if isinstance(n, ast.ClassDef) and n.name == "MOCAP_OT_export")
        execute = next(n for n in cls.body if isinstance(n, ast.FunctionDef) and n.name == "execute")
        for enabled, already_mirrored, expected_count in ((True, False, 2), (False, False, 1), (True, True, 1)):
            writes, selected = [], []
            rig = NS(get=lambda key, default=False: already_mirrored, select_set=lambda flag: selected.append(('source', flag)))
            mirror = NS(select_set=lambda flag: selected.append(('mirror', flag)))
            namespace = {"Path": Path, "resolve_target": lambda ctx: rig,
                         "export_xml": lambda r, p: writes.append((r, str(p))),
                         "create_mirrored_rig": lambda ctx, r: mirror}
            exec(compile(ast.Module(body=[execute], type_ignores=[]), str(SOURCE), "exec"), namespace)
            context = NS(view_layer=NS(objects=NS(active=rig)))
            operator = NS(filepath="webcam_recording.ycd.xml", export_mirrored_copy=enabled, report=lambda *_: None)
            self.assertEqual(namespace['execute'](operator, context), {'FINISHED'})
            self.assertEqual(len(writes), expected_count)
            if expected_count == 2:
                self.assertEqual(writes[1], (mirror, "webcam_recording_mirrored.ycd.xml"))
                self.assertIs(context.view_layer.objects.active, rig)

    def test_new_armature_pose_is_evaluated_before_bones_are_read(self):
        linked, created = [], []
        source_data = NS(copy=lambda: NS(users=1))
        target = NS(data=source_data, matrix_world=[1, 2, 3])
        def new(name, data):
            rig = NS(name=name, data=data, pose=None)
            created.append(rig)
            return rig
        def update():
            self.assertEqual(linked, created)
            for rig in linked:
                rig.pose = NS(bones={"SKEL_Pelvis": object()})
        context = NS(collection=NS(objects=NS(link=linked.append)), view_layer=NS(update=update))
        namespace = load_functions({"bpy": NS(data=NS(objects=NS(new=new)))}, {"create_preview_rig"})
        rig = namespace["create_preview_rig"](context, target, "take")
        self.assertIn("SKEL_Pelvis", rig.pose.bones)
        self.assertIsNot(rig.data, source_data)
        self.assertIs(target.data, source_data)

    def test_unavailable_pose_reports_actionable_error_and_cleans_only_new_rig(self):
        deleted, data_deleted = [], []
        rig = NS(data=NS(users=0), pose=None)
        target = NS(data=NS(copy=lambda: rig.data), matrix_world=[])
        context = NS(collection=NS(objects=NS(link=lambda obj: None)), view_layer=NS(update=lambda: None))
        bpy = NS(data=NS(objects=NS(new=lambda *_: rig, remove=lambda obj, **_: deleted.append(obj)),
                         armatures=NS(remove=data_deleted.append)))
        function = load_functions({"bpy": bpy}, {"create_preview_rig"})["create_preview_rig"]
        with self.assertRaisesRegex(RuntimeError, "initialize.*pose"):
            function(context, target, "take")
        self.assertEqual(deleted, [rig])
        self.assertEqual(data_deleted, [rig.data])

    def test_target_selection_accepts_armature_or_its_mesh_and_rejects_empty_selection(self):
        resolve = load_functions({}, {"resolve_target"})["resolve_target"]
        armature = NS(type="ARMATURE")
        context = NS(view_layer=NS(objects=NS(active=armature)), selected_objects=[])
        self.assertIs(resolve(context), armature)
        context.view_layer.objects.active = NS(type="MESH", find_armature=lambda: armature)
        self.assertIs(resolve(context), armature)
        context.view_layer.objects.active = None
        with self.assertRaisesRegex(ValueError, "Select the GTA skeleton"):
            resolve(context)

    def test_file_picker_captures_target_and_uses_json_filter(self):
        cls = next(n for n in TREE.body if isinstance(n, ast.ClassDef) and n.name == "MOCAP_OT_import")
        invoke = next(n for n in cls.body if isinstance(n, ast.FunctionDef) and n.name == "invoke")
        execute = next(n for n in cls.body if isinstance(n, ast.FunctionDef) and n.name == "execute")
        namespace = {}
        exec(compile(ast.Module(body=[invoke, execute], type_ignores=[]), str(SOURCE), "exec"), namespace)
        target = object()
        operator = NS(target_object=None, report=lambda *_: None)
        namespace.update(resolve_target=lambda _: target, ImportHelper=NS(invoke=lambda *_: {"RUNNING_MODAL"}))
        self.assertEqual(namespace["invoke"](operator, NS(), None), {"RUNNING_MODAL"})
        self.assertIs(operator.target_object, target)
        self.assertEqual(operator.filter_glob, "*.json")
        # Execute from a file-browser context with no active object: use the
        # target saved by invoke, rather than looking up the active selection.
        received = []
        namespace.update(Path=lambda _: NS(stat=lambda: NS(st_size=100), read_text=lambda **_: "{}"),
                         json=NS(loads=lambda _: {}), import_motion=lambda *args: received.append(args),
                         resolve_target=lambda _: self.fail("selection must survive file browser"))
        operator.filepath = "take.animation (1).json"
        self.assertEqual(namespace["execute"](operator, NS()), {"FINISHED"})
        self.assertIs(received[0][2], target)


if __name__ == "__main__":
    unittest.main(argv=[__file__])
