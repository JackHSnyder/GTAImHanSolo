# Mirrored recorded animations

Set `mirrorRecordedAnimation: true` inside `globalThis.MocapLabConfig` in your installed resource's `config.js`. Set it to `false` to return to the original motion. Restart `webcam_mocap_animlab` after changing it.

This is a full left/right motion mirror, including wrists, legs, torso and head. It applies to the main model and both backup dancers. It selects a separately baked animation without reflecting the character mesh. GTA's documented animation playback controls do not expose a runtime mirror option.

## Mirrored playback facing correction (resource 0.3.25)

Mirrored playback now adds a 180-degree heading correction so this take faces the camera. The correction applies to the main dancer and both backups, including synchronized-scene grounding, and restores their standing headings when playback ends. It does not move the camera or affect the original dictionary. No Blender export or YCD replacement is required.

Optional config: `mirroredAnimationHeadingOffsetDegrees: 180,`. This defaults to 180 when omitted, so existing config files work without replacement. Set it to 0 for another mirrored animation already facing correctly, or choose another finite angle in degrees. The actual dictionary's `_mirrored` suffix determines whether the correction applies, including explicitly named dictionaries and visits captured before changing the mirror override. `/mocaplabplayinfo` reports the active facing correction.

Install client.js and fxmanifest.lua from webcam-mocap-mirror-facing-update.zip over the corresponding files in the active resource. Keep the existing config, HUD, audio and stream files. Restart webcam_mocap_animlab and enter a new visit. When replacing streamed YCDs in future, restart the resource and reconnect as well; the earlier unchanged-mirror issue cleared after reconnecting.

## Blender timer event fix (tool 0.2.11)

The 0.2.10 progress handler incorrectly accessed event.timer. Blender Event exposes event.type but no timer attribute, so the mirror job could fail on its first timer event after the original XML was saved. The handler now checks only event.type == TIMER and retains its WindowManager Timer handle solely for cleanup. The bounded bake, progress reporting and Esc cancellation are unchanged.

Save any scene changes and restart Blender to clear the previously failed modal job, open/run this update's tools/mocap_gta_importer.py (version 0.2.11), then retry the paired export from the original animated rig. No FiveM resource/config changes are needed.

Regression coverage now uses TIMER events with NO timer property, checks non-timer events, drives completion and cancellation, and inspects actual Blender 5.2.2 Event RNA to verify the absence of that attribute. The earlier stand-in incorrectly included a timer property and concealed the bug. Eight Python importer/operator/XML checks and repeated native Blender registration/menu checks pass.

## Responsive mirrored bake (Blender tool 0.2.10)

The original file can finish exporting while the second mirrored bake occupies Blender's UI thread. Version 0.2.9 inserted location/quaternion/scale keys bone-by-bone on every frame and evaluated the growing destination action during sampling. Long takes were much more expensive than the original short smoke fixtures. The user was using the correct custom exporter; the earlier suggestion of a different export menu did not explain this failure.

Version 0.2.10 first samples the mirrored transforms into compact float arrays, then allocates/writes F-curves in bulk. Rest-matrix inverses are cached. Constant channels use two endpoint keys, preserving full duration while avoiding millions of redundant keys; varying channels retain one key per captured frame with linear interpolation. The sampled destination action stays empty until curve assembly, avoiding repeated evaluation of growing key lists. Mirror/body/wrist/face math and unique cache IDs remain covered by the previous checks.

Interactive paired export now runs mirror sampling/curve assembly in timer-driven chunks (roughly 25ms work budget per timer event, yielding between frames/bones). Watch Blender's bottom status bar for frame/curve progress. Press Esc to cancel this bake; partial generated rig/action data is removed and the source rig/action/frame plus already written original XML are preserved. The final Sollumz XML writer itself remains synchronous, is explicitly labeled as the file-writing stage, and may briefly pause the UI. Cancellation is processed between bake chunks, not during that external writer call.

Download webcam-mocap-mirror-bake-performance-update.zip, open its tools/mocap_gta_importer.py in Blender's Text Editor and run it with Alt+P. Select the ORIGINAL animated rig in Object Mode and repeat File > Export > Webcam Mocap GTA XML with Also export mirrored dictionary checked. There are no FiveM resource/config/audio changes in this update. Future export files still need the usual CodeWalker compilation.

Measured in local Blender 5.2.2: a synthetic 95-second (2851-frame), 231-bone fixture baked in 6.55s with 47,355 curve points and 3,082 progress yields. The actual HanSolo.blend take webcam_take_preview.003 (2851 frames, 128 bones) baked in 7.08s, producing 313,101 curve points and 2,979 yields. The user blend was read without saving or changing its file. Laptop speed and the final Sollumz export stage may differ. Modal progress/cancellation control flow is tested with stand-ins; a live interactive GUI run and actual installed Sollumz XML export were not verified locally.

## Mirrored cache identity fix (Blender tool 0.2.9)

The game now reports webcam_recording_mirrored / webcam_take, establishing that the mirrored dictionary is selected. The previous exporter nevertheless assigned webcam_take_animation to both variants. Sollumz derives the animation-cache signature (Unknown1C) from that value and explicitly requires uniqueness. Thus different dictionaries/motion could share a cache identity. This is a confirmed exporter defect and a plausible explanation for the reported original-looking motion; the specific user YCD has not been inspected.

Version 0.2.9 namespaces the initial animation name by dictionary and then writes deterministic dictionary/content-specific internal animation hashes and Unknown1C signatures. Clip AnimationHash references are updated consistently. Public clip name webcam_take, timing, bone IDs and sequence/motion values remain unchanged. Re-exported changed content receives a new cache identity as well. There is no new FiveM resource or config setting in this fix.

To repair an EXISTING mirrored XML without another bake:

1. Open and run this update's tools/mocap_gta_importer.py in Blender's Text Editor (Alt+P).
2. Choose File > Import > Webcam Mocap: Repair Animation XML Cache IDs.
3. Select the already-exported webcam_recording_mirrored.ycd.xml. No armature selection is needed.
4. The tool writes fixed/webcam_recording_mirrored.ycd.xml beside the original. The original is preserved.
5. Compile the XML FROM THAT fixed FOLDER with CodeWalker. Replace the streamed webcam_recording_mirrored.ycd with the newly compiled binary.
6. Restart webcam_mocap_animlab, reconnect to the server and visit again. Keep the existing mirror setting/command enabled. The game command still uses webcam_recording / webcam_take.

For future exports, the normal File > Export > Webcam Mocap GTA XML command repairs IDs automatically for both files. If no previous XML is available, run the new script and export the pair from your existing original animated rig, then compile/install the newly generated mirrored file.

The repair only addresses IDs; it cannot create mirrored motion if the chosen XML accidentally contains the original motion. If the corrected file still plays identically, inspect the mirrored rig or compare the actual two XML exports next. The standard asset suffix remains _mirrored; the latest playback output shows that correctly spelled dictionary is already loading, so file spelling is not the current diagnosis.

Source: https://github.com/Sollumz/Sollumz/blob/main/ycd/ycdexport.py (animation_from_object: unique cache signature derived from animation hash). XML fields/reference format: https://github.com/dexyfex/CodeWalker/blob/master/CodeWalker.Core/GameFiles/Resources/Clip.cs

## Mirror setting diagnosis (resource 0.3.24)

The reported playback used webcam_recording / webcam_take, so FiveM was playing the original dictionary. With this resource's boolean mirror setting enabled on entry, it selects webcam_recording_mirrored instead. Check the installed asset spelling: webcam_recording_mirrored.ycd has an e before the final d; webcam_recording_mirrord.ycd is a different asset name and will not satisfy that request.

Install client.js and fxmanifest.lua from webcam-mocap-mirror-selection-update.zip into the active server resource, then restart webcam_mocap_animlab. Use /mocaplabmirror status to print the client version, actual loaded mirrorRecordedAnimation value and its type, effective setting, and current visit/replay dictionaries. A missing/false value suggests the wrong config/key or resource copy was edited; a string value "true" must be corrected to the boolean true without quotes.

For a direct test, exit the visit using /mocaplabvisit stop, run /mocaplabmirror on, then /mocaplabvisit. The temporary override lasts until resource restart and applies on entry to the next visit; it does not replace a running round. /mocaplabmirror off temporarily disables mirroring; /mocaplabmirror config (or reset) returns to the config value. During playback /mocaplabplayinfo must show webcam_recording_mirrored / webcam_take. Missing mirrored assets produce a clear filename/install error instead of silently playing the original.

Blender's generated mirrored skeleton is normally named webcam_take_mirrored_preview (possibly with a numeric suffix). Search for that object in the Outliner and select it to inspect its bone motion. The existing character meshes remain bound to the original rig; watching those meshes alone does not preview the new skeleton. The immediate reported issue is game dictionary selection, so confirm that selection before re-exporting the animation.

## One-time preparation for each animation

1. Install this update's `client.js` and `fxmanifest.lua` in the existing `webcam_mocap_animlab` resource. Keep your config, HUD, audio and stream folder.
2. Open your existing animated Blender scene. In the Text Editor, open and run this update's `tools/mocap_gta_importer.py`. This is version 0.2.11; repeated runs replace the existing menu entries.
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
