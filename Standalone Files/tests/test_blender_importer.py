"""Regression checks with a deferred-pose Blender stand-in; not a Blender runtime test."""
import ast
from pathlib import Path
from types import SimpleNamespace as NS
import unittest
import hashlib
import re
import xml.etree.ElementTree as ET
import tempfile
import itertools

SOURCE = Path(__file__).resolve().parents[1] / "tools" / "mocap_gta_importer.py"
TREE = ast.parse(SOURCE.read_text(encoding="utf-8"))


def load_functions(namespace, names):
    functions = [node for node in TREE.body if isinstance(node, ast.FunctionDef) and node.name in names]
    exec(compile(ast.Module(body=functions, type_ignores=[]), str(SOURCE), "exec"), namespace)
    return namespace


class ImporterRegressionTests(unittest.TestCase):
    def test_interactive_export_yields_progress_and_can_cancel_or_finish_without_blocking_execute(self):
        cls = next(n for n in TREE.body if isinstance(n, ast.ClassDef) and n.name == 'MOCAP_OT_export')
        methods = [n for n in cls.body if isinstance(n, ast.FunctionDef) and n.name in {'execute', 'modal', 'finish_mirror_job'}]
        for cancel in (False, True):
            calls, writes = [], []
            timer = object()
            source = NS(get=lambda *args: False, select_set=lambda state: calls.append(('source', state)))
            mirror = NS(select_set=lambda state: calls.append(('mirror', state)))
            def job(context, rig):
                try:
                    for frame in range(10):
                        yield frame / 10, str(frame)
                    return mirror
                finally:
                    calls.append(('closed',))
            wm = NS(progress_begin=lambda *a: calls.append(('begin',)), progress_update=lambda n: calls.append(('progress', n)),
                    progress_end=lambda: calls.append(('end',)), event_timer_add=lambda *a, **k: timer,
                    event_timer_remove=lambda t: calls.append(('remove_timer', t)), modal_handler_add=lambda op: None)
            context = NS(window_manager=wm, workspace=NS(status_text_set=lambda text: calls.append(('status', text))),
                         view_layer=NS(objects=NS(active=source)), window=NS(screen=NS(areas=[])))
            clock = itertools.count(step=.01)
            namespace = {'Path': Path, 'bpy': NS(app=NS(background=False)), 'resolve_target': lambda ctx: source,
                         'export_xml': lambda rig, path: writes.append(str(path)), 'iter_mirrored_rig': job,
                         'time': NS(perf_counter=lambda: next(clock))}
            exec(compile(ast.Module(body=methods, type_ignores=[]), str(SOURCE), 'exec'), namespace)
            operator = NS(filepath='webcam_recording.ycd.xml', export_mirrored_copy=True, report=lambda *_: None)
            operator.finish_mirror_job = lambda ctx: namespace['finish_mirror_job'](operator, ctx)
            self.assertEqual(namespace['execute'](operator, context), {'RUNNING_MODAL'})
            self.assertEqual(writes, ['webcam_recording.ycd.xml'])
            self.assertEqual(namespace['modal'](operator, context, NS(type='MOUSEMOVE')), {'RUNNING_MODAL'})
            namespace['modal'](operator, context, NS(type='TIMER'))
            if cancel:
                result = namespace['modal'](operator, context, NS(type='ESC'))
                self.assertEqual(result, {'CANCELLED'})
                self.assertEqual(len(writes), 1)
            else:
                for tick in range(20):
                    result = namespace['modal'](operator, context, NS(type='TIMER'))
                    if result == {'FINISHED'}:
                        break
                self.assertEqual(result, {'FINISHED'})
                self.assertEqual(writes[-1], 'webcam_recording_mirrored.ycd.xml')
            self.assertIn(('closed',), calls)
            self.assertEqual(calls.count(('end',)), 1)
            operator.finish_mirror_job(context)
            self.assertEqual(calls.count(('end',)), 1, 'cleanup is idempotent')
            self.assertIs(context.view_layer.objects.active, source)

    def test_exported_variants_have_distinct_content_cache_ids_and_preserve_motion_and_clip_name(self):
        namespace = load_functions({'ET': ET, 'hashlib': hashlib, 're': re},
                                   {'animation_hash_value', 'rekey_animation_xml'})
        repair = namespace['rekey_animation_xml']
        xml = b'''<ClipDictionary><Clips><Item><Hash>webcam_take</Hash><Name>pack:/webcam_take</Name>
          <AnimationHash>webcam_take_animation</AnimationHash><StartTime value="0"/><EndTime value="95"/>
          </Item></Clips><Animations><Item><Hash>webcam_take_animation</Hash><Unknown1C>hash_12345678</Unknown1C>
          <Duration value="95"/><FrameCount value="2851"/><BoneIds><Item><BoneId value="18905"/></Item></BoneIds>
          <Sequences><Item><Hash>hash_00000000</Hash><SequenceData><Item><Channels><Item type="RawFloat">
          <Values>0 0.25 0.5</Values></Item></Channels></Item></SequenceData></Item></Sequences>
          </Item></Animations></ClipDictionary>'''
        normal_bytes = repair(xml, 'webcam_recording')
        mirror_bytes = repair(xml, 'webcam_recording_mirrored')
        normal, mirror = ET.fromstring(normal_bytes), ET.fromstring(mirror_bytes)
        for field in ('Hash', 'Unknown1C'):
            self.assertNotEqual(normal.findtext('Animations/Item/' + field), mirror.findtext('Animations/Item/' + field))
        for root in (normal, mirror):
            self.assertEqual(root.findtext('Clips/Item/AnimationHash'), root.findtext('Animations/Item/Hash'))
            self.assertEqual(root.findtext('Clips/Item/Hash'), 'webcam_take')
            self.assertEqual(root.findtext('Clips/Item/Name'), 'pack:/webcam_take')
            self.assertEqual(root.find('Animations/Item/Duration').attrib, {'value': '95'})
            self.assertEqual(root.findtext('.//Values'), '0 0.25 0.5')
        self.assertEqual(repair(mirror_bytes, 'webcam_recording_mirrored'), mirror_bytes, 'repair must be stable on rerun')
        edited = repair(xml.replace(b'0.25', b'0.75'), 'webcam_recording_mirrored')
        self.assertNotEqual(ET.fromstring(edited).findtext('Animations/Item/Unknown1C'), mirror.findtext('Animations/Item/Unknown1C'))
        # Clip references may be hexadecimal while the animation ID is named.
        equivalent = 'hash_%08x' % namespace['animation_hash_value']('webcam_take_animation')
        numeric = xml.replace(b'<AnimationHash>webcam_take_animation', ('<AnimationHash>' + equivalent).encode())
        self.assertEqual(repair(numeric, 'webcam_recording'), normal_bytes)
        with self.assertRaisesRegex(ValueError, 'missing'):
            repair(xml.replace(b'<AnimationHash>webcam_take_animation', b'<AnimationHash>another_animation'), 'take')

    def test_xml_repair_operator_writes_a_separate_fixed_file_without_needing_an_armature(self):
        cls = next(n for n in TREE.body if isinstance(n, ast.ClassDef) and n.name == 'MOCAP_OT_repair_xml')
        execute = next(n for n in cls.body if isinstance(n, ast.FunctionDef) and n.name == 'execute')
        namespace = {'Path': Path, 'rekey_animation_xml': lambda data, name: data + b' repaired'}
        exec(compile(ast.Module(body=[execute], type_ignores=[]), str(SOURCE), 'exec'), namespace)
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / 'webcam_recording_mirrored.ycd.xml'
            source.write_bytes(b'original')
            operator = NS(filepath=str(source), report=lambda *_: None)
            self.assertEqual(namespace['execute'](operator, NS()), {'FINISHED'})
            self.assertEqual(source.read_bytes(), b'original')
            self.assertEqual((source.parent / 'fixed' / source.name).read_bytes(), b'original repaired')

    def test_paired_export_keeps_clip_rig_and_writes_suffixed_dictionary(self):
        cls = next(n for n in TREE.body if isinstance(n, ast.ClassDef) and n.name == "MOCAP_OT_export")
        execute = next(n for n in cls.body if isinstance(n, ast.FunctionDef) and n.name == "execute")
        for enabled, already_mirrored, expected_count in ((True, False, 2), (False, False, 1), (True, True, 1)):
            writes, selected = [], []
            rig = NS(get=lambda key, default=False: already_mirrored, select_set=lambda flag: selected.append(('source', flag)))
            mirror = NS(select_set=lambda flag: selected.append(('mirror', flag)))
            namespace = {"Path": Path, "resolve_target": lambda ctx: rig,
                         "bpy": NS(app=NS(background=True)),
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
