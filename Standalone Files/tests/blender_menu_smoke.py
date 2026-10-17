import bpy
import runpy
assert 'timer' not in bpy.types.Event.bl_rna.properties, 'Check timer handling if Blender changes Event API'
from types import SimpleNamespace
from pathlib import Path
script=Path(__file__).resolve().parents[1] / 'tools' / 'mocap_gta_importer.py'
menus=(bpy.types.TOPBAR_MT_file_import,bpy.types.TOPBAR_MT_file_export)
def unrelated(self, context):
    pass
menus[0].append(unrelated)
# Recreate callbacks from three runs of the old, unmarked script.
for i in range(3):
    scope={'MOCAP_OT_import':type('OldImport',(),{'bl_idname':'import_scene.webcam_mocap'}),'MOCAP_OT_export':type('OldExport',(),{'bl_idname':'export_scene.webcam_mocap_gta'})}
    exec('def import_menu(self, context):\n    self.layout.operator(MOCAP_OT_import.bl_idname)\ndef export_menu(self, context):\n    self.layout.operator(MOCAP_OT_export.bl_idname)',scope)
    menus[0].append(scope['import_menu'])
    menus[1].append(scope['export_menu'])
for i in range(3):
    loaded=runpy.run_path(str(script),run_name='__main__')
    export_cls=loaded['MOCAP_OT_export']
    assert bpy.ops.export_scene.webcam_mocap_gta.get_rna_type().properties['export_mirrored_copy'].default is True
    assert bpy.ops.import_scene.webcam_mocap_repair_xml.get_rna_type().name == 'Webcam Mocap: Repair Animation XML Cache IDs'
    for name in ('webcam_recording', 'webcam_recording.ycd.xml', 'webcam_recording.ycd.ycd.xml', 'webcam_recording.xml'):
        exporter=SimpleNamespace(filepath=str(script.parent / name))
        export_cls.check(exporter,bpy.context)
        assert Path(exporter.filepath).name == 'webcam_recording.ycd.xml'
        assert export_cls.check(exporter,bpy.context) is False, 'Filename must stay stable on repeated browser checks'
    for menu in menus:
        funcs=getattr(menu.draw,'_draw_funcs',())
        assert len([fn for fn in funcs if getattr(fn,'_webcam_mocap_menu',False)])==1
        assert len([fn for fn in funcs if getattr(fn,'__name__','') in ('import_menu','export_menu')])==1
    assert unrelated in menus[0].draw._draw_funcs
    object_callbacks=[fn for fn in bpy.types.VIEW3D_MT_object.draw._draw_funcs if getattr(fn,'_webcam_mocap_menu',False)]
    assert len(object_callbacks)==1, 'Repair menu duplicates across reruns'
    calls=[]
    object_callbacks[0](SimpleNamespace(layout=SimpleNamespace(separator=lambda:None,operator=lambda name,**kwargs:calls.append(name))),bpy.context)
    assert calls==['pose.webcam_mocap_neutral_face','object.webcam_mocap_repair_face_binding'], 'Object menu must expose both repair operators'
    cls=loaded['MOCAP_OT_import']
    assert bpy.ops.import_scene.webcam_mocap.get_rna_type().properties['target_object_name'].type == 'STRING'
    operator=SimpleNamespace(target_object_name='')
    cls.target_object.fset(operator,bpy.context.scene.camera)
    assert cls.target_object.fget(operator) is bpy.context.scene.camera
loaded['unregister']()
loaded['unregister']()
assert unrelated in menus[0].draw._draw_funcs
assert not any(getattr(fn,'_webcam_mocap_menu',False) for m in menus for fn in m.draw._draw_funcs)
assert bpy.types.Operator.bl_rna_get_subclass_py('IMPORT_SCENE_OT_webcam_mocap') is None
assert bpy.types.Operator.bl_rna_get_subclass_py('EXPORT_SCENE_OT_webcam_mocap_gta') is None
assert bpy.types.Operator.bl_rna_get_subclass_py('IMPORT_SCENE_OT_webcam_mocap_repair_xml') is None
assert not any(getattr(fn,'_webcam_mocap_menu',False) for fn in bpy.types.VIEW3D_MT_object.draw._draw_funcs)
assert bpy.types.Operator.bl_rna_get_subclass_py('POSE_OT_webcam_mocap_neutral_face') is None
assert bpy.types.Operator.bl_rna_get_subclass_py('OBJECT_OT_webcam_mocap_repair_face_binding') is None
print('PASS: legacy duplicates cleaned; repeated script runs produce one menu item; unrelated entries preserved; unregister is repeatable')
