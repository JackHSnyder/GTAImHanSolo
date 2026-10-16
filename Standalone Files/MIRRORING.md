# Mirrored recorded animations

Set `mirrorRecordedAnimation: true` inside `globalThis.MocapLabConfig` in your installed resource's `config.js`. Set it to `false` to return to the original motion. Restart `webcam_mocap_animlab` after changing it.

This is a full left/right motion mirror, including wrists, legs, torso and head. It applies to the main model and both backup dancers. It selects a separately baked animation; it does not reflect the character mesh or turn the character around. GTA's documented animation playback controls do not expose a runtime mirror option.

## One-time preparation for each animation

1. Install this update's `client.js` and `fxmanifest.lua` in the existing `webcam_mocap_animlab` resource. Keep your config, HUD, audio and stream folder.
2. Open your existing animated Blender scene. In the Text Editor, open and run this update's `tools/mocap_gta_importer.py`. This is version 0.2.8; repeated runs replace the existing menu entries.
3. Return to Object Mode and select the original animated mocap preview armature. The existing action, including face repairs, is used. You do not need to record or import your take again.
4. Choose **File > Export > Webcam Mocap GTA XML (.ycd.xml)**. Leave **Also export mirrored dictionary** checked in the export options. Save as `webcam_recording.ycd.xml` (or your original dictionary's filename).
5. The exporter writes both `webcam_recording.ycd.xml` and `webcam_recording_mirrored.ycd.xml`. The mirrored action/preview rig is also retained in Blender; your original rig, action and meshes are preserved. Both files use the same clip name, normally `webcam_take`.
6. Compile the new `webcam_recording_mirrored.ycd.xml` to `webcam_recording_mirrored.ycd` with the same CodeWalker XML-import workflow used for the original. Put the compiled file in `webcam_mocap_animlab/stream/`, alongside `webcam_recording.ycd`. The XML file itself is not playable by FiveM.
7. Add `mirrorRecordedAnimation: true,` inside the existing `MocapLabConfig` object in your installed `config.js`. Do not replace your other settings. Run `restart webcam_mocap_animlab` in the server console, then use your usual `/mocaplabvisit` command.

The command still names the original dictionary. For example, `/mocaplabvisit webcam_recording webcam_take` selects `webcam_recording_mirrored / webcam_take` when the setting is true. Custom dictionary names follow the same `_mirrored` suffix convention. Names already ending in `_mirrored` are not suffixed twice.

If the mirrored dictionary is missing, the resource gives an installation message and restores your player. It does not silently play the original. `/mocaplabplayinfo` shows the dictionary actually being played.

## Behavior

The mirrored export swaps left/right bone deformation across the rig's body plane, preserves the rest skeleton and neutral facial bones, and bakes regular positive-scale animation transforms. It does not require a special replacement ped model. The existing grounding, music offset, animation duration and score countdown continue to work. Scoring reads the hand positions of the playing model, so it follows the selected mirrored motion. The live skeleton HUD keeps its existing display orientation.

Automated checks include actual Blender baking on synthetic GTA rigs facing both directions, wrist directions, left/right hand and leg positions, neutral facial attachment, positive transform determinants and original-action preservation. The exported user clip still needs the usual Blender preview and in-game check.

Native references: [TaskPlayAnim](https://github.com/citizenfx/natives/blob/master/TASK/TaskPlayAnim.md), [TaskSynchronizedScene](https://github.com/citizenfx/natives/blob/master/TASK/TaskSynchronizedScene.md).
