# Record now, play in GTA later

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

## Audio lifecycle diagnosis (resource and UI 0.3.23)

The reported repeated beginning fragments persisted after the prior update; no runtime 0.3.22 backend confirmation was supplied yet. The exact laptop cause is still unknown. This update adds measurable source/session/heartbeat diagnostics instead of assuming another cause. Background and animation players now share one AudioContext so switching tracks uses the same audio device context as the working background player.

Merge the supplied webcam_mocap_animlab folder from webcam-mocap-audio-diagnostics-update.zip into the installed resource, replace its client/manifest/HUD files and restart webcam_mocap_animlab. No config, audio, animation or saved-preference changes are needed.

While walking in the visit area, use /mocaplabmusic test animation. While it glitches, run /mocaplabmusic status twice about two seconds apart within that ten-second test. Confirm client and UI 0.3.23 and backend decoded-animation. Paste both full outputs. They now include source starts/stops, session changes, natural audio clock, last start offset/stop reason, received messages, mode/session changes, heartbeat timeout count and the latest mode/stop events. One source start and zero stops during a continuous session indicates no script-level restart; increasing counters identify actual source replacement. A stationary audio clock despite continued messages indicates an audio-context/output issue rather than repeated script starts. These are diagnostic distinctions, not a claim about the laptop's confirmed cause.

Also run /mocaplabmusic test animation-loop. This plays the configured animation file through the background player for ten seconds with zero crossfade, without changing the file or config. Report whether it sounds clean. /mocaplabmusic test background-once does the opposite: it plays the background file through the animation player. Both tests restore normal music after ten seconds or /mocaplabmusic stop. They distinguish audio-file behavior from playback-mode behavior.

## Continuous animation audio (resource and audio UI 0.3.22)

The laptop report showed both OGG files present, HTML animation playback ready at 4/4 with no media error, Web Audio available, and glitching even during the standalone music test. There is no forgotten animation-audio setup command. The previous player could repeatedly assign currentTime whenever its measured position was more than 0.35s behind the game timeline. On a slow or buffering player that can repeatedly interrupt playback. The telemetry does not prove that was the laptop's exact cause, but the new player removes that failure mode.

Animation music now uses a decoded Web Audio buffer, like the working background backend, but plays once at the original duration with no loop overlap or crossfade. It aligns once at startup, including any elapsed decode time, then runs continuously on the audio device clock. HUD heartbeats update volume and pending startup timing but do not seek, recreate or restart an active source. New replay sessions start fresh; cancellation and scene exit cancel pending starts, and completion restores background audio. A track that ends before its animation stays silent rather than restarting. Existing signed animationStartDelaySeconds timing is preserved. Background crossfade settings are unchanged.

If Web Audio is unavailable, the HTML fallback now seeks only on session start or initial metadata availability, rather than repeatedly chasing the game clock. Persistent clock drift after startup is not continuously corrected, to prioritize uninterrupted audio.

Merge the webcam_mocap_animlab folder from webcam-mocap-animation-audio-update.zip into the installed resource, replacing the supplied client, manifest and HUD files. Keep config.js, your audio files and animations. Restart webcam_mocap_animlab. Run /mocaplabmusic test animation while walking in the visit area, then /mocaplabmusic status within that 10-second test. It should report Music client 0.3.22, Music UI 0.3.22 and backend: decoded-animation. No companion update or new command variable is required. If the audio still glitches with that backend, capture the full status so file decoding, context state and laptop-specific playback can be checked next.

## Saved point goal (resource 0.3.21)

Use /mocaplabgoal 2500 to set and save a custom goal. It updates the current or final score HUD immediately without changing earned points, and overrides the calculated goal on every subsequent replay. /mocaplabgoal or /mocaplabgoal status shows the current setting. /mocaplabgoal reset removes the saved override and restores automatic duration-based goals.

The value is a non-negative whole number, including zero. It is saved using FiveM resource KVP storage on this player's FiveM installation, like the existing model and crossfade preferences. It survives visits, reconnects, resource restarts and server restarts; it does not configure other players' clients. Config edits and new animations do not replace the override. Resetting while a round is active or its final score is shown restores that round's original calculated goal, even if the scoring delay for the next round has changed. Scoring cadence, countdown and point awards are unchanged.

Install client.js and fxmanifest.lua from webcam-mocap-saved-goal-update.zip into the existing resource and run restart webcam_mocap_animlab once. Keep config, HUD, audio and animations. The goal command itself applies without a restart.

## Mirrored animation selection (resource 0.3.20 / Blender tool 0.2.8)

New config setting mirrorRecordedAnimation: false selects the original motion by default. Setting true selects the matching _mirrored dictionary for all recorded actors, keeping the same clip name. The alternate compiled YCD must be installed first. Missing variants produce an actionable error; there is no silent fallback or negative mesh scaling. Scoring uses the playing model's hand positions.

The updated Blender File > Export > Webcam Mocap GTA XML command has Also export mirrored dictionary enabled by default. It bakes a reflected opposite-side action to a separate preview rig and writes a second _mirrored.ycd.xml alongside the original. Compile that file with CodeWalker and install its YCD in stream. Original rigs/actions/meshes are preserved. No new camera recording or animation-JSON import is needed when your existing animated mocap rig is available. See [MIRRORING.md](MIRRORING.md) for the exact one-time setup and config instructions.

## Signed animation/music offset (resource 0.3.19)

animationStartDelaySeconds now accepts -120 to 120 seconds, including fractions:

- 0.5: animation waits half a second; animation music starts immediately.
- -0.5: animation starts immediately; animation music waits half a second.
- 0: both start together.

With a negative offset, background audio pauses immediately on approach and the music wait is silent. Animation music starts from its beginning when the deadline arrives, on its own timeline. Background audio resumes at playback completion. Scoring and the countdown still follow animation time. If the round ends or is cancelled before the music deadline, the animation music never starts. Timing is evaluated on game frames without a pending timer that could fire after exit.

Install client.js and fxmanifest.lua from webcam-mocap-signed-timing-update.zip into the existing webcam_mocap_animlab resource. Edit animationStartDelaySeconds in your existing config.js to the desired signed value and restart webcam_mocap_animlab. The patch preserves your config, audio and clips; no companion update, HUD update or animation export is needed.

## Grounding through the animation origin (resource 0.3.18)

Recorded clips now use local synchronized scenes, one per stage actor. Grounding adjusts each scene's animation origin instead of teleporting the character entity. This addresses the case where entity coordinates move successfully but the animation task continues placing the pose from its own origin. Main/backup phases, score timing, delayed dancer start and immediate animation music are retained. No recording, Blender or CodeWalker export changes are required.

The reported 0.3.17 sample showed a 0.125m foot gap and a successful 0.125m entity move, but did not prove that the rendered pose followed the move. A regression now simulates that distinction across frame boundaries: plain entity movement leaves feet floating, while scene-origin movement grounds the same pose. The exact live-game behavior still needs confirmation with the user's clip.

Install client.js and fxmanifest.lua from webcam-mocap-scene-grounding-update.zip into the existing webcam_mocap_animlab resource, then restart webcam_mocap_animlab. Keep config.js, audio, HUD and stream files. If feet remain airborne, run /mocaplabground status while this is visible. It should show client 0.3.18, backend: synchronized-scene, and a foot error near zero once settled. The status reports measured contact before the current correction; scene-origin changes are evaluated by the animation system at the next pose update. The previous immediate entity-movement readout was not a contact measurement.

Stopping or completing playback releases each scene, clears its actor's task, restores its original stage location and frozen state, and hides backups. Failed scene allocation/startup performs the same cleanup. Grounding can still be toggled with /mocaplabground on or off, and groundRecordedFeet: false preserves airborne clips. Movement stays bounded to 1.5m around the stage origin. A legacy entity-coordinate fallback is retained only when synchronized-scene natives are unavailable; diagnostics identify that backend.

Native references: https://github.com/citizenfx/natives/blob/master/PED/SetSynchronizedSceneOrigin.md and https://github.com/citizenfx/natives/blob/master/TASK/TaskSynchronizedScene.md

## Independent music timing and grounding update (resource 0.3.17)

Animation music begins as soon as you approach the model. animationStartDelaySeconds now delays only the characters; music keeps its original timeline through that wait. Completion or cancellation returns to background music. Scoring still follows animation time.

Grounding now reads animated entity-bone positions through numeric skeleton indices, accepts native vector objects as well as arrays, and removes override-physics animation playback so the task does not compete with scripted height placement. The existing 1.5m correction bound and single-foot lifts are preserved. User status confirmed grounding was enabled in 0.3.16, but the runtime cause of floating is not yet confirmed.

During playback, /mocaplabground status reports the measured left/right foot heights, target floor, requested and actual movement, and total height offset. /mocaplabground off restores the original actor height; /mocaplabground on enables it again. These temporary overrides last until resource restart. If feet still float, capture the status while this happens.

Merge client.js and fxmanifest.lua from the timing-grounding patch into the existing resource and restart webcam_mocap_animlab. Keep config.js, HUD, audio and stream files. No new recording or animation export is needed. All automated checks pass; actual GTA foot contact remains to be checked in game.

Native references: https://github.com/citizenfx/natives/blob/master/TASK/TaskPlayAnim.md and https://github.com/citizenfx/natives/blob/master/ENTITY/SetEntityCoordsNoOffset.md

## Recorded crouch grounding (resource 0.3.16)

For recordings that crouch correctly in Blender but lift both legs in GTA, recorded playback now grounds each stage actor using its actual animated left/right foot-bone heights. The lowest foot is kept at the stage contact plane and the actor's vertical position compensates for missing body-height displacement. This works with existing compiled clips and applies individually to the main model and both backup dancers. It does not generate or replace leg rotations; it corrects the position of the already animated pose. Single-foot lifts remain free while the other foot supports the body.

The correction runs before scoring/scene updates and preserves animation tasks and IK when repositioning. Height changes are bounded to 1.5 metres around each actor's starting stage position. Playback completion/stop restores those positions. Relative hand scoring, start delay, music timing and camera behavior remain unchanged. This is a grounded-animation mode: it also grounds clips where both feet intentionally leave the floor. Set groundRecordedFeet: false inside MocapLabConfig to preserve airborne/jump motion. Default is true even if the setting is absent from an older config.js.

Install client.js and fxmanifest.lua from this update and restart webcam_mocap_animlab. Keep config.js, HUD, audio, stream and website files. No new recording, Blender import, or animation re-export is required for this playback correction. Actual in-game foot contact and skin appearance need confirmation on the user's clip. The exact reason the compiled clip's body translation is not appearing has not been verified from the user's YCD; this addresses the visible in-game result.

Native movement parameters: https://raw.githubusercontent.com/citizenfx/natives/master/ENTITY/SetEntityCoordsNoOffset.md


## More consistent recorded hands (companion 0.4.1)

Recording sessions now request 1280x720 video when available, use 0.5 hand detection/presence/tracking thresholds instead of the live mode's 0.6, and retry a transient hand-model inference failure after 500ms rather than disabling dedicated hands for the whole take. Actual resolution and frame rate still depend on the webcam and computer.

Recording-only hand association checks the wrist and palm anchors instead of requiring every unused fingertip to be inside the image. Recent wrist locations help preserve anatomical left/right identity for up to 350ms when body wrist/elbow references briefly disappear. History expires; absent hands are not fabricated. Dedicated image wrist positions now refine the exported body's X/Y relative to the elbow while preserving body-world depth. Raw capture observations remain unchanged.

The offline converter interpolates wrist positions and dedicated palm rotations over gaps up to 0.8s. Isolated near-180-degree palm spikes are rejected only when the neighboring observations agree. During longer palm losses, wrist JOINT rotation is held relative to the current forearm instead of holding a fixed world-space palm angle. Reacquisition is smoothed with a 15-degree-per-output-frame angular bound. The animation still has no finger articulation, and the hand-only in-game scoring comparison is unchanged. Hidden wrist turns cannot be reconstructed from a single camera.

Install by stopping the companion, merging the updated companion folder into the original package where START-COMPANION.cmd is run, restarting the companion, and refreshing http://127.0.0.1:8788. The website header should say 0.4.1. Keep Refine wrists with hand tracking enabled. No FiveM resource/config/music changes are needed.

For existing takes, use Rebuild a saved recording with the ORIGINAL .capture.json file. This applies improved association, interpolation and joint-space holding to the stored observations. It cannot recover observations never recorded. Download the rebuilt animation, reimport into Blender, and repeat the usual Sollumz/CodeWalker export to update the animation in GTA. A plain .animation.json or .ycd cannot recover the original hand observations.

MediaPipe configuration reference: https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js


## Animation start delay (resource 0.3.15)

Add animationStartDelaySeconds: 0.25 inside the MocapLabConfig object in the installed config.js, alongside scoringDelaySeconds. Values may be fractional and range from -120 to 120 seconds; negative values delay music instead of the animation. Default zero preserves immediate playback. Restart the resource after changing config.js.

Upon approaching the model, the camera locks and hides/freezes the player immediately. The animation waits for animationStartDelaySeconds, then starts the main actor, both backup dancers and performance lighting through the existing playback routine. Animation music starts immediately on approach and continues without restarting when the dancers begin. Calm lighting remains during the wait. The delay is captured per approach and applied on the first game frame at/after its deadline. Exiting the visit or stopping the resource cancels the pending start. No new countdown is added for this wait.

This setting is independent of scoringDelaySeconds. The existing scoring warmup/countdown begins when the clip starts, and the score goal still uses the full clip duration minus the scoring delay. There are no scoring opportunities during the new pre-playback delay. It applies to nightclub visits; the diagnostic /mocaplabplay and the website recording countdown keep their existing behavior.

Install the two files client.js and fxmanifest.lua from the animation-start-delay patch into the installed resource. Keep the current HUD, audio and stream folder. Add the new variable manually to your config.js so your other settings are preserved. The complete package config also includes the new variable. No companion update or animation re-export is needed.


## Self-contained crossfade player (resource 0.3.14)

The reported 0.3.13 status identified the cause: hud/crossfade-audio.js was missing and the HUD used HTML audio, so changing the overlap could not affect playback. The engine is now bundled directly into hud.js. index.html and fxmanifest.lua no longer require the separate engine asset. Source copies remain in the package for maintenance, but only the generated hud.js is needed at runtime. tools/build-hud.mjs rebuilds it from crossfade-audio.js and hud-core.js; tests verify the shipped bundle matches both sources.

Install by merging the webcam_mocap_animlab folder from the self-contained-crossfade update into the existing resource, replacing its four supplied files: client.js, fxmanifest.lua, hud/index.html and hud/hud.js. Do not delete the existing resource folder. The patch does not contain or overwrite config.js, music or animations. Restart webcam_mocap_animlab. While background music plays, run /mocaplabcrossfade 2 and /mocaplabmusic status. Look for bundled crossfade: found, backend: decoded-crossfade and the applied overlap. Your saved overlap preference is retained.

The previous Web Audio: false field was derived through the missing helper and did not establish browser support. It now checks AudioContext directly. If fallback still occurs, it reports the actual browser limitation separately. No live in-game decode/playback was available locally; the user's sound still needs an in-game check after installing this bundle.


## Verify the applied crossfade (resource 0.3.13)

The prior status showed playback readiness but not whether the decoded crossfade player or HTML fallback was active, nor whether the configured overlap reached the player. This patch adds explicit backend and overlap diagnostics. It does not assume a cause for the reported silence.

While walking with background music active, run /mocaplabcrossfade 2 followed by /mocaplabmusic status. The command applies immediately by rebuilding/restarting the background loop, and saves a local KVP override across visits/restarts. /mocaplabcrossfade reset clears the override and restores config.js. No-argument status reports the effective setting. Allowed values are 0 to 2 seconds; very short audio still limits the applied overlap to one quarter of its duration.

Music status now prints requested overlap, config versus saved-override source, crossfade asset presence, active backend, actual applied overlap, original decoded duration, processed loop duration and audio-context state. For a 30-second file at 2 seconds overlap, decoded-crossfade should report source 30s, loop 28s, applied overlap 2s. The native GUI reports once when a changed crossfade starts. If the old HTML fallback is used, it warns about missing helper assets or unavailable Web Audio rather than silently using the original loop player.

Install client.js, fxmanifest.lua and the complete hud folder, including index.html and crossfade-audio.js, then restart webcam_mocap_animlab. Preserve config, audio and stream. If the effect is still absent, copy the status output; the user's existing 0.3.12 status alone cannot establish the active backend or configured overlap. If the decoded backend and applied value are confirmed, inspecting the actual audio file is the next step.


## Smooth background loops (resource 0.3.12)

The background player now fetches/decodes the audio once and blends 0.2 seconds of its tail into its head. It loops the resulting AudioBuffer continuously through Web Audio, avoiding an HTML media restart at each join. The crossfade uses all channels and linear blend weights. The overlap shortens each repeat by the overlap duration and rotates the background's starting phase by that amount. It does not time-stretch the audio or change animation playback. Background position is preserved when animation music interrupts it; room exit resets it. Pending decodes cannot start playback after stopping or switching to animation music. Browsers without Web Audio retain the original HTML audio fallback.

Default overlap is 0.2 seconds. To adjust it, add backgroundCrossfadeSeconds: 0.35 inside the existing music object in config.js, for example. Values are clamped to 0-2 seconds, with an additional cap of one quarter of a short clip. Zero disables the crossfade while retaining decoded-buffer looping. The default works without replacing your existing config. Long silent sections or a musical phrase mismatch in a file may require a longer overlap or an audio edit; the user's actual file was not supplied for listening.

Install client.js, fxmanifest.lua and the complete hud folder from this update, including the new hud/crossfade-audio.js file. Preserve config.js, audio and stream. Restart webcam_mocap_animlab. No website companion changes or animation re-export are required.


## Built-in nightclub music muted (resource 0.3.11)

The visit now disables the nine known GTA After Hours static radio emitters, including the main dance-floor areas, entry rooms, garage, office and club exterior. Muting is applied on entry and reapplied once per second during the visit. Custom background.ogg / animation.ogg playback through the HUD is unaffected. This does not change GTA's master/music volume or stop unrelated audio scenes.

On visit exit, failed entry or resource stop, these emitters are enabled again. The static-emitter native has no prior-state snapshot in this implementation, so cleanup restores the enabled default rather than another resource's earlier mute setting. This affects only the visiting client's GTA emitter state; no server-wide emitter changes are made. Third-party sound resources using a different playback system are not controlled by this patch.

Install client.js and fxmanifest.lua from this update into webcam_mocap_animlab and restart the resource. Preserve config.js, audio, stream and the website companion. No settings changes are required. Optional opt-out: set nightclub.muteBuiltInAudio to false in MocapLabConfig and restart the resource.

Emitter control reference: https://raw.githubusercontent.com/citizenfx/natives/master/AUDIO/SetStaticEmitterEnabled.md
After Hours emitter identifiers: https://forum.cfx.re/t/after-hours-nightclub-coordinates-and-props/224479?page=3


## Nightclub entry fix (resource 0.3.10)

Resource 0.3.9 still waited for IsInteriorReady during entry, including after furnishing RefreshInterior. A false flag could therefore end the visit before the recovery guard was reached. This version removes readiness as an entry requirement. It focuses streaming at the destination, resolves and pins a valid interior, applies furnishings, pins again after refresh, and yields a frame. After moving the frozen player it yields again before testing destination collision. It only releases the player once the interior is valid and collision is loaded; missing interior/collision still times out and restores the original location. Readiness remains visible in diagnostics.

/mocaplabclubstatus now preserves a failed visit's native-state snapshot after cleanup. Failed entry also prints that snapshot automatically, before cleanup removes the interior. A successful new visit clears the old failure.

Install client.js and fxmanifest.lua from this update, restart webcam_mocap_animlab, then retry /mocaplabvisit. Keep config.js, audio, stream and the companion unchanged. If it fails, copy the error and Last nightclub failure line from F8, or run /mocaplabclubstatus afterward. Native collision and final club appearance still need verification in the running game.


## Nightclub loading fix (resource 0.3.9)

The old runtime guard immediately ended a visit if either the placement IPL flag was false or the interior reported not ready, even with valid interior and floor collision. The guard now treats those flags as loading/retry signals rather than proof the room was removed. It waits after the initial furnishing/lighting RefreshInterior, and waits for interior readiness and player collision before releasing the player.

During an active visit, a valid interior with loaded floor collision stays active across readiness changes and lighting refreshes. If the interior becomes invalid or collision is missing, the player freezes while the script retries loading once per second. Recovery resumes controls appropriate to the current scene state; sustained loss for eight seconds returns to the saved starting position and reports the native state. /mocaplabclubstatus prints version, interior ID, validity, readiness, placement flag, collision and recovery status for troubleshooting.

Install only client.js and fxmanifest.lua from this update into the installed webcam_mocap_animlab resource. Keep your config.js, audio, stream and website companion. Restart webcam_mocap_animlab, then try /mocaplabvisit again. No separate nightclub resource is required. The change passes simulated native-state regressions; actual FiveM streaming behavior still needs confirmation in game.


## YouTube recording reference (companion 0.4.0)

The website can show a YouTube video beside the live camera preview. On narrower windows the panels stack. YouTube is optional; leaving its link blank keeps the original camera-only workflow, without loading the YouTube player API.

1. Paste a YouTube video link in the YouTube reference panel.
2. Enter Start at as seconds (90), minutes/seconds (1:30) or hours/minutes/seconds (1:02:03). Fractional seconds are accepted.
3. Click Load video, then Preview / play ads. Finish any ads using YouTube's own player controls. Videos that disallow embeds will report an error; choose another video.
4. Click Ready / cue start. The video pauses and seeks to the timestamp. This is your confirmation that the video itself is ready, not an automatic ad check.
5. Set the recording duration and click Record locally. After camera/model loading, the normal three-second countdown runs while YouTube stays paused. At the countdown boundary, the same recording-start hook requests YouTube playback and begins capturing tracking samples. The local camera video also begins recording if enabled.
6. The player pauses automatically at recording completion, early Finish recording, camera failure, leaving/hiding the page, or cancellation during the countdown. Each new take re-cues the chosen timestamp. Changing the link or timestamp requires preparing/cueing again.

YouTube controls advertising, autoplay restrictions, keyframe seeking and buffering. The supported IFrame API cannot guarantee ads have finished or that another ad will not appear, nor can it guarantee frame-perfect playback. This feature does not skip/block ads. Use the manual preview step before each take as needed. If buffering or pausing happens during a take, the page flags possible loss of synchronization; motion recording continues. Exported capture JSON stores the video ID and requested timestamp as reference metadata, not the YouTube video/audio. The optional saved video remains camera-only with no audio. No camera pixels, landmarks or pairing token are passed to YouTube; loading an embed contacts YouTube normally.

Install this website update into the ORIGINAL companion package folder where you run START-COMPANION.cmd, not only the FiveM resources folder. Stop the companion, replace companion/server.mjs and the contents of companion/public with this update, then start START-COMPANION.cmd again and refresh http://127.0.0.1:8788 (Ctrl+F5 if needed). The website header should say 0.4.0. No FiveM resource update, server restart or animation re-export is needed for this feature.

YouTube API reference: https://developers.google.com/youtube/iframe_api_reference


## After Hours nightclub (resource 0.3.8)

/mocaplabvisit now loads GTA's existing After Hours nightclub interior directly. No bob74_ipl installation, paid map or extra streamed map assets are required. The original /mocaplab preview continues using its original diagnostic room.

Walking mode uses the edgy club style, a DJ booth, speakers, bar details, restrained cyan ceiling lighting and soft fill lights. Recorded playback adds purple neons, purple droplets and a purple laser rig, plus smoothly sweeping cyan/purple spotlights. A steady front light keeps the dancers visible. Completion or stopping playback restores the calm setup automatically. Existing background/animation music switching, backup dancers, scoring delay, goal and live-camera HUD remain in place.

The main character faces across the dance floor with the DJ area behind it. Backup dancers use the same rotated stage layout and the camera stays at the main character's eye height. Walkable movement stays within the dance-floor area. Interior and collision loads have bounded timeouts; failed or canceled visits restore the original player position and delete created actors. Exit/resource stop restores the interior entity sets this resource changed; it only removes the IPL if this visit loaded it. Another script controlling this same interior can override its visual settings.

Install: replace the installed client.js and fxmanifest.lua from the updated resource, then run restart webcam_mocap_animlab in the server console. Preserve config.js, audio and stream. Enter /mocaplabvisit as usual. There are no new required settings. The game build needs After Hours assets; a load failure is reported in chat/F8.

Optional placement adjustment: add a nightclub object inside MocapLabConfig in config.js, with x, y, floor, heading, cameraDistance and/or fov. Defaults are x: -1596, y: -3013, floor: -79.99, heading: 270, cameraDistance: 4.2, fov: 55. These are a starting layout based on published interior/dance-floor coordinates; actual framing, ground contact, lighting and clearance still require in-game inspection. Changing these settings requires a resource restart. Omitting them uses the same defaults.

References for the existing GTA interior, entity-set identifiers and dance-floor area:
- https://github.com/Bob74/bob74_ipl/wiki/After-Hours:-Nightclubs
- https://github.com/Bob74/bob74_ipl/blob/master/dlc_afterhours/nightclubs.lua
- https://github.com/DevTestingPizza/NightClubs/blob/master/NightClub/IplManager.cs


## Score goal (resource 0.3.7)

The score rectangle includes a GOAL value below the current score. Each round calculates goal = max(0, floor(animation duration - starting delay)) * 50. Whole seconds match the once-per-second scoring opportunities, whose first award occurs at delay + 1 second. For example, a 30-second recording with a 5-second delay has 25 scoring opportunities and a goal of 1250, half its possible 2500 points. A clip shorter than the delay has a goal of zero. Missed tracking does not reduce the goal. The goal is captured at playback start, stays fixed if the delay setting is changed during playback, and remains visible with the final score.

Install the updated client.js, score-math.js, fxmanifest.lua and all three hud files (index.html, hud.css, hud.js), preserving your config.js, audio files and stream folder. Restart webcam_mocap_animlab. No companion change or animation re-export is required.


## Music troubleshooting (0.3.7)

This patch adds audio loading/playback diagnostics to game chat and F8, retries rejected playback after two seconds, and uses default audio filenames even when the installed config has no music section. A blank filename still intentionally disables a track. It does not assume every silent track has the same cause.

Update client.js, hud/hud.js and fxmanifest.lua from this package. Keep your own config.js and audio files. Restart the resource. Audio files belong directly at webcam_mocap_animlab/audio/background.ogg and webcam_mocap_animlab/audio/animation.ogg, beside the hud folder, not inside it. The manifest must include audio/*.ogg (plus MP3/WAV patterns if used).

Run /mocaplabmusic test background, then /mocaplabmusic status. Repeat with /mocaplabmusic test animation if needed. Tests run for ten seconds without needing to enter the room. /mocaplabmusic stop restores normal room audio.

Status prints the client and UI versions, exact configured paths, file presence, recognized container headers, volumes, UI readiness, paused state, readyState (0 to 4), playback time and media error code. Error details are relayed automatically to chat/F8. A missing file generally means an incorrect folder, filename, extension or resource manifest. A found file with decode/unsupported errors needs inspection of its actual audio format/codec. A playing track with advancing time but no audible sound calls for checking game/application/output volume. If UI status never arrives, confirm the updated HUD script was installed and the resource restarted.


## Visit music (resource 0.3.7)

Add your files to `resource/webcam_mocap_animlab/audio/`: by default `background.ogg` and `animation.ogg`. MP3 and WAV are also supported: set the actual filenames in `config.js` under `music`. Use real audio formats rather than changing a file's extension. No music files are bundled.

The background track loops while walking. When recorded playback starts, it pauses and the animation track starts from zero. When the animation finishes or stops, the animation track stops and the background resumes. Leaving the room stops both. Music plays locally through the existing NUI, independently of the live webcam connection. The animation track includes the unscored delay/countdown, does not loop, and follows the main actor's timeline. If its file is shorter than the animation, the rest is silent.

`config.js` settings: `backgroundFile`, `animationFile`, `backgroundVolume` and `animationVolume` inside `music`. Volumes range from 0 to 1. An empty filename disables a track.

Install by merging the updated resource files into your existing resource, keeping your `stream` folder and any custom settings. This update changes `client.js`, `config.js`, `fxmanifest.lua` and `hud/hud.js`, and adds the `audio` folder. Preserve your preferred `scoringDelaySeconds` when updating config.js. Add your music files and run `restart webcam_mocap_animlab` in the server console. No companion update or animation re-export is required.


## Backup dancers (resource 0.3.7)

Each visit includes two backup dancers, hidden until recorded playback starts. They appear 1.4 metres left/right and 1.2 metres behind the main character, facing the same direction. Both use the same dictionary/clip and follow the main actor's animation phase throughout playback, including the scoring delay. They disappear when playback ends or stops, reappear on replay, and are deleted when the room closes. The score still compares only against the main character.

- `/mocaplabbackup1 ig_groom` saves the left dancer's model.
- `/mocaplabbackup2 s_m_m_highsec_01` saves the right dancer's model.
- Either command without arguments displays its saved choice.
- Either command with `reset` restores cloning the main character.

Choices persist on this FiveM installation and apply on the next visit. Default dancers clone the main character's appearance. Invalid models leave the saved choice intact. If a saved model is unavailable when entering, that dancer clones the main character for this visit and retains the preference. Custom models must already be streamed by your server.

To install this update, replace only the installed resource's client.js and restart webcam_mocap_animlab. This preserves your config.js settings and stream folder. No companion changes or animation re-export are needed.


Recording belongs to the separate animation-lab package (0.3.0). The working webcam-mocap package is untouched.

## Choose the visit character (resource 0.3.7)

Update the installed lab resource with this version and restart it. Enter `/mocaplabmodel s_m_m_highsec_01` in game chat to choose a humanoid GTA ped. Use its spawn name, not a .blend, .yft or .ydd filename. A custom model must already be installed/streamed on your server. `/mocaplabmodel` displays the current saved preference; `/mocaplabmodel reset` clears it and returns to your own player's appearance.

The choice is saved once in the resource's FiveM client KVP storage (`visitCharacterModel`). It persists across visits, reconnections, resource/server restarts and game restarts on this installation. It is not synchronized to other computers or players. When no saved preference exists, the visit clones your player as before. An idle visit swaps immediately without teleporting your player or resetting camera pairing. A change during animation playback waits until your next visit, preserving the active recording and score.

Selections are loaded and checked using GTA numeric humanoid bone tags before saving, allowing up to 1.5 seconds for skeleton initialization. Resource 0.3.7 corrects the earlier name-based check that could reject standard peds such as ig_groom and s_m_m_highsec_01. Invalid models leave the previous choice intact; temporary validation actors are deleted. A previously saved custom model that is no longer available falls back to your player for that visit, while retaining the saved name for when the model becomes available again. The character is placed on the room floor and the camera uses its actual head height. The chosen ped must be compatible with GTA humanoid animations; this command does not import a model from Blender.

## Scoring delay and countdown (resource 0.3.1)

Update the complete installed `webcam_mocap_animlab` resource, preserving stream. Include the new config.js, updated fxmanifest.lua, score-math.js, client.js and HUD files. Run `refresh` and `restart webcam_mocap_animlab` in the server console. The 0.3.0 companion and existing YCD continue to work.

In your installed resource's config.js, set `scoringDelaySeconds: 5` to the desired delay (0–120 seconds, fractional values allowed). Restart the resource after editing the file. Alternatively, `/mocaplabdelay 8` changes the delay for the next replay immediately; this override resets on resource restart. Each replay captures its delay so changing the setting during playback does not alter that round.

The animation plays throughout the delay, with no points and no skipped-tracking penalties. If the configured delay is greater than three seconds, its last three seconds show 3, 2, 1 in the center of the screen. For a delay of three seconds or less, no countdown appears. At the delay's end the number disappears; there is then one additional unscored second. The first score check is at `delay + 1`, followed by one check each second. With a five-second delay, 3 appears at animation second 2, 2 at second 3, 1 at second 4, the countdown vanishes at second 5, and points can first be awarded at second 6. Timings follow the animation timeline. If the clip finishes before the first check, no points are awarded and the clip is not extended or restarted.

## Hand-position score

Version 0.3.0 adds scoring to the visit minigame. Update the complete installed `webcam_mocap_animlab` resource, including `score-math.js`, `fxmanifest.lua`, `protocol.js`, client/server scripts and hud folder. Preserve your compiled YCD files in stream. Update the companion folder as well, restart START-COMPANION.cmd and refresh the website. In the server console, run `refresh` then `restart webcam_mocap_animlab`. Enter `/mocaplabvisit`, pair the website with the new visit token, and approach the model as usual. Existing animations work unchanged.

Each scored second after the configured delay compares the live wrist positions to the model's current SKEL_L_Hand / SKEL_R_Hand positions. The reference is the actual animated model, not a copy of your camera pose. Each body's shoulder line and shoulder-to-hip direction establish local axes; the shoulder midpoint is the origin. Hand coordinates are divided by that side's upper-arm-plus-forearm length. This removes world location, facing and overall size from the comparison. Scoring follows the displayed left/right direction. With the default mirrored live HUD, the viewer copies the dancer as seen on screen: live right matches dancer left, with horizontal body-relative offsets reflected, and vice versa. Height and depth are preserved. With the HUD mirror view disabled, live left matches dancer left directly. This is independent of the recorded mirror setting; it compares the model actually playing.

Only wrist positions affect matching. Fingers, finger curl and hand rotation do not. Each hand contributes up to 50 points: `50 * max(0, 1 - normalized_position_error / 0.75)^2`; their rounded sum gives 0–100 points per valid second. Both hands plus shoulders, elbows and hips must be confidently visible. Camera data older than 250ms skips the check. Missing seconds are not backfilled using later poses. Clips under one second have no full-second checks.

The grey score rectangle is just left of the live skeleton square. It shows total points and the most recent award, or "Show both hands" when a check is skipped. Each replay starts at zero. The final total remains in the room after the camera unlocks and clears on exit. This score is local practice feedback, with single-camera 3D depth estimation; accuracy/tolerance still need in-game evaluation. It is not stored in a player database.

## Head rotation

Turning, nodding and tilting are now baked into the Head joint in both animation JSON and BVH. The website uses the existing sparse pose landmarks to estimate a rigid head orientation relative to the torso. It does not load a facial-expression tracker or animate jaw, lips or eyes. Importer 0.2.6 already supports these head rotations and retains the neutral-face and mesh-binding fixes.

For a new recording, look straight ahead with your head upright throughout the three-second countdown. This sets neutral; head angles appear beneath the recording controls. Then move your head normally. Keep your eyes and mouth area visible. Poor lighting, occlusion and large turns can reduce accuracy. Missing head tracking holds the last reliable rotation relative to the torso; the converter warns about long gaps. The playback preview includes a yellow eye line, green crown and coral nose so rotation is visible. Switch to Side view to inspect nodding.

To update an old take, choose its original .capture.json under Rebuild a saved recording, download the new .animation.json and import that into Blender again. The first reliable head sample supplies neutral when the original capture has no countdown calibration. Existing .animation.json files cannot recover discarded head observations. Single-camera head orientation is an estimate and may need cleanup.

## Update an existing recording

Importer 0.2.6 adds Object > Webcam Mocap: Repair Facial Mesh Binding. After attaching head meshes to a preview rig, run this if facial vertex groups and rig bones use different variant suffixes (for example FB_Jaw_000 versus FB_Jaw_045). It matches only unique facial names, changes only group names, preserves weights and leaves the animation/rest skeleton intact. The Neutralize Jaw and Face command also checks these bindings now. This exact mismatch affected 19 groups in the supplied HanSolo project; the correction was verified across all 301 frames with unchanged vertex weights.

Importer 0.2.5 exposes the face repair directly in the 3D Viewport's Object menu. After opening/running the updated script, select the animated preview or its bound mesh in Object Mode, then choose Object > Webcam Mocap: Neutralize Jaw and Face. F3 is Blender's Menu Search, so a command registered without a menu entry can be absent from normal search. No Developer Extras are required for the new visible entry.

Importer 0.2.4 also stabilizes facial bones. To fix an animation already attached to a mesh, open/run the updated mocap_gta_importer.py, switch to Object Mode, select the animated preview skeleton or a mesh bound to it, press F3 and search for "Webcam Mocap: Neutralize Jaw and Face". Run the command and replay the timeline. It copies the current action as a new corrected action, preserves the original, and keeps jaw/lip/facial bones neutral relative to the animated head. Your mesh's Armature modifier stays connected. No recording rebuild or mesh reattachment is needed for this repair. New imports apply the same neutral-face policy automatically. This is body tracking, not facial-expression capture.

Restart the updated lab companion and refresh http://127.0.0.1:8788. Under Rebuild a saved recording, select your original *.capture.json. Download the rebuilt animation JSON, then load and run the updated mocap_gta_importer.py in Blender. Select the original GTA skeleton and import the rebuilt animation. Point your meshes' Armature modifiers to the newly generated preview rig (its name may end in .001).

The updated importer measures the target skeleton's rest axes to establish facing, calibrates hand and foot orientation from finger/toe bones, and discards unconstrained foot roll from old animation files. New/rebuilt takes include explicit palm and sole frames. Dedicated hand data must exist in the capture to reconstruct its wrist orientation; otherwise body palm landmarks are used. Tracker gaps hold the last wrist orientation. No new camera recording is required if the original tracking download is available. Animation JSON alone cannot restore hand observations omitted by the older converter, but the new importer can still correct its facing, foot roll and finger direction.

## Record

1. Close the lab companion window if running. Update the lab package, then run its START-COMPANION.cmd again.
2. Open http://127.0.0.1:8788 in Chrome or Edge and refresh the page. Recording needs no pairing token or FiveM server.
3. Under Record an animation, choose 1–120 seconds. Leave the reference-video checkbox on to save video too. Hand refinement preserves original hand landmarks for later processing.
4. Click Record locally and allow camera access. Once the models load, a three-second countdown starts. Stand back with head, hips, knees, ankles and toes in view. Look straight ahead with your head upright during the countdown to set neutral. Start standing, then move slowly.
5. Keep the page visible. Recording finishes at the chosen duration. Finish recording ends it early. Hiding the tab ends the take early to avoid a frozen tracking gap.
6. Preview the converted skeleton and head-direction marker. Use Side view to inspect nods and knee bends; Play animation and the position slider replay the take.
7. Download animation JSON for the GTA tool. Also save original tracking JSON, BVH, and optional WebM video. Downloads stay in memory until the page closes/refreshes or another take finishes: save before leaving.

Models load from the existing public CDN locations. Camera frames, video and recordings stay in the browser. Recording mode sends no poses to FiveM. No audio is requested.

## Files and limitations

- *.capture.json: timestamps, all 33 original body landmarks and confidence, image landmarks, and detected 21-point hands. Reusable source data, not a GTA animation.
- *.animation.json: a baked 23-joint humanoid animation at 30 FPS, in metres with Y up. Includes local quaternion rotations, fixed skeleton lengths and estimated pelvis height. Torso, shoulders, arms, hips, knees and ankles can move continuously.
- *.bvh: the same motion in a skeletal interchange format. It is not directly streamable by FiveM. Blender BVH import settings: scale 1, forward -Z, up Y.
- *.webm: optional silent reference video. The capture JSON records the video start offset relative to the take. Browser encoding support is required.

Output FPS is resampling, not a guarantee of 30 distinct tracked samples per second. Original timestamps are preserved. Short gaps are interpolated; longer gaps use nearby poses and generate a warning. Inspect sparse/occluded takes. Single-camera tracking cannot reliably recover hidden joint twist. Dedicated-hand palm orientation is now baked when associated confidently, with body-palm fallback and wrist holds during gaps. Individual finger articulation is not baked. Feet use an ankle/heel/toe sole frame when reliable, with a stable level-foot fallback and bounded angular changes.

Motion stays in place; horizontal travel is not reconstructed. Estimated pelvis height follows the solved feet for crouching. Grounding is basic, not a foot-lock solver: foot sliding, head orientation, twist and model proportions may need cleanup.

## Convert to GTA

### Visit the recording room with your player

#### Optional live skeleton comparison HUD

Update the complete installed `webcam_mocap_animlab` resource, including the new `hud` folder, manifest, protocol, client and server scripts. Merge into your existing folder and keep `stream` and your compiled `.ycd`. Run `restart webcam_mocap_animlab` in the server console. Also update the lab companion, restart START-COMPANION.cmd, and refresh http://127.0.0.1:8788.

1. Enter `/mocaplabvisit` (or `/mocaplabvisit dictionary clip`). Copy the new visit token from game chat or F8.
2. On the companion website, paste that token and click **Connect to FiveM**. Allow camera access if asked. Keep the page visible beside FiveM; a minimized/background page can pause camera inference.
3. Walk up to the model. When its recording starts, a semitransparent grey square in the top-right shows your current camera landmarks as a green skeleton. Without live tracking it displays only "Connect Live Camera". The character continues to follow only the stored animation.
4. Match the character's movements using the skeleton as visual feedback. Hand-position matching awards points each full animation second (see Hand-position score above). Only skeleton landmarks and normalized wrist coordinates are relayed; webcam pixels and audio are not sent to FiveM.
5. `/mocaplabhud mirror` toggles the skeleton's mirror view (default, like the website) versus camera view. The command does not change the recorded character.
6. The HUD hides automatically at completion or exit. Walk away and approach again to repeat, or `/mocaplabvisit stop` to leave. Use the website's Stop camera button when finished. Revoking the game session also stops the browser camera on its next relay request.

An unconnected camera shows a connection hint. Missing/out-of-frame joints disappear rather than drawing invented limbs; data older than 650ms clears the skeleton and shows a paused status. A new visit generates a fresh token, so reconnect with that token. Website recording mode is separate and does not feed the HUD.

If the entire HUD is missing, first check that the installed resource has `ui_page 'hud/index.html'` and all three HUD files listed in `files`: `hud/index.html`, `hud/hud.css`, `hud/hud.js`. The hud folder must sit alongside client.js, not inside companion or another nested resource directory. After updating resource files, run `refresh` then `restart webcam_mocap_animlab` in the server console. With resource 0.2.4 installed, enter `/mocaplabhud test` in game chat. The panel should appear for ten seconds without a camera or active scene. Then `/mocaplabhud status` reports missing client files, the UI page path, page readiness, whether a panel rendered, scene/camera and incoming skeleton age. An unknown command means the updated client script is not active. Missing files or a missing ui_page indicate an installation/manifest issue. A page that never becomes ready indicates the HUD HTML/JavaScript did not load or failed; inspect F8 for errors. No camera packets affect skeleton content, not whether the waiting panel renders.

After installing the compiled YCD, update the installed lab resource's client.js and server.js from this package, then run `restart webcam_mocap_animlab` in the server console. Keep your existing stream folder. The command uses the same `webcam_mocap_animlab.use` permission as preview.

1. In game chat, enter `/mocaplabvisit`. Defaults are dictionary `webcam_recording` and clip `webcam_take`. For another file/clip, use `/mocaplabvisit your_dictionary your_clip`.
2. Your normal player moves to the After Hours nightclub with its real collision floor. Walk toward the model; within 1.8 metres the recording begins automatically.
3. The camera faces the model at eye height. Your player is temporarily hidden locally and frozen while movement/combat controls are locked. Chat, pause and F8 remain usable.
4. At the recording's end the normal camera and movement return, leaving you in the room. Walking more than 2.8 metres away rearms the trigger, so you can approach to replay.
5. Use `/mocaplabvisit stop` to leave and return to your original position and heading. `/mocaplab stop` also exits. Resource stop/restart restores your position and removes the room floor, camera and model.

Entry checks that you are alive/on foot and the recording and floor assets are available. Stored playback needs no website or camera; use the optional pairing instructions above to add the live skeleton HUD. No animation re-export or new recording is required. The floor uses the game's `stt_prop_stunt_bblock_huge_01` collision model; local in-game floor/camera behavior still needs verification. This is a local viewing scene. Existing `/mocaplab preview` remains the stationary recording/debug scene.

### Play in the original preview room

Recorded playback patch (resource 0.2.1): the client starts TaskPlayAnim at phase 0, waits for the task to become active, then sets phase 0 and actual animation speed 1 once. It clears the preview ped's prior tasks and disables ambient base/gesture animation, with full animation blending. The previous phase-1 start could immediately hold the final pose. To update an installed resource, replace client.js from this package and run `restart webcam_mocap_animlab` in the server console. Existing compiled YCD files can be tried unchanged; this patch needs no website or Blender update. If playback is still static, run `/mocaplabplayinfo` twice a second apart and compare its duration, position percentage and playing state. Advancing percentage with a static model points toward exported tracks or bindings; an unchanging percentage before 100% points toward runtime playback. A held position at 100% after the clip's duration is normal: rerun `/mocaplabplay webcam_recording webcam_take` to replay.

The website does not generate a ready-to-install binary .ycd. Conversion needs Blender, a recent Sollumz add-on, CodeWalker, and a GTA humanoid skeleton imported from your own game assets. No game assets are distributed here. Retargeting passes native Blender 5.2.2 tests on synthetic rigs facing both ways, including down-pointing finger rest poses. Actual character skin deformation and the final Sollumz/CodeWalker/GTA result still need visual verification.

1. Install Blender 4.2+ and enable official Sollumz. Import/open a GTA humanoid armature in its normal orientation (+Z up, +Y forward), with standard SKEL_* names and GTA bone tags. A generic BVH skeleton is not a GTA export target.
2. Select that armature. In Blender's Scripting workspace, open tools/mocap_gta_importer.py (also downloadable from the website) and click Run Script. This adds two menu commands for the current session.
3. Choose File > Import > Webcam Mocap Animation (.animation.json). The picker shows all JSON files; select the website's animation JSON, not capture JSON. The selected GTA skeleton is preserved while the picker is open. The tool creates a separate skeleton and webcam_take action, fitting motion to target bone lengths/rest axes and baking rotations/pelvis height. Source animation is preserved. Meshes remain attached to the original rig; the duplicate is a skeleton preview.
4. Play the timeline and inspect limb directions and feet. Clean up the action if needed and save a .blend copy.
5. Select the new armature. Choose File > Export > Webcam Mocap GTA XML (.ycd.xml). Save as webcam_recording.ycd.xml. The bridge invokes Sollumz's exporter, creating a webcam_take clip. It requires Sollumz's target_id animation API and reports an error if unsupported.
6. Use CodeWalker's XML import workflow in RPF Explorer to compile the XML to binary webcam_recording.ycd. Use a separate output folder/archive and preserve installed game archives. JSON, BVH and XML cannot be played directly by FiveM.
7. Put the compiled webcam_recording.ycd in your server resource's webcam_mocap_animlab/stream folder. Update the lab client.js and fxmanifest.lua, then run restart webcam_mocap_animlab in the server console.
8. In game: /mocaplab preview, then /mocaplabplay webcam_recording webcam_take. Recorded playback requires no webcam pairing. Live body/hand control is suspended during replay. /mocaplabplay stop restores it; /mocaplab stop closes the room.

If export fails, keep the baked action and error report. Renaming an intermediate file to .ycd will not convert it. Export compatibility and the final game appearance require verification with your actual rig and tools.

References: [Sollumz features](https://docs.sollumz.org/2.6/features), [official animation source](https://github.com/Sollumz/Sollumz/tree/main/ycd).
