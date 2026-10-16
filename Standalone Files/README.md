# Webcam Mocap Animation Lab — 0.4.1 (companion) / 0.3.21 (resource)

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


Backup dancers: /mocaplabbackup1 spawn_name and /mocaplabbackup2 spawn_name save the two supporting models for your next visit. Both remain hidden until playback, dance behind the main actor on the same timeline, and vanish at completion. Defaults clone the main character. See RECORDING.md for details.

Persistent visit character: `/mocaplabmodel s_m_m_highsec_01` selects and saves a humanoid ped by spawn name. Idle visits update immediately; selections during playback apply on the next visit. `/mocaplabmodel` reports the saved choice, and `/mocaplabmodel reset` returns to cloning your player. The preference is saved in this resource's local FiveM KVP storage across visits, reconnections and resource/game restarts. Custom peds must already be streamed by the server. Invalid/non-humanoid models are rejected without replacing the saved choice. If a saved model later becomes unavailable, that visit falls back to your player while retaining the preference. Update installed client.js (or the complete resource); no companion change or animation re-export required.

Scoring delay: edit `scoringDelaySeconds` in the installed resource's config.js (default 5), or enter `/mocaplabdelay 8` to change the next replay without restarting. Animation continues without points during the delay. Delays over 3 seconds show 3 / 2 / 1 during their last three seconds; the number then disappears and one more second passes before scoring starts. Default 5 means first check at second 6. Update the complete installed resource including config.js, manifest and HUD; no companion change or animation re-export is required.

Hand-position scoring: each full animation second in `/mocaplabvisit` compares the current left/right wrist positions to the animated ped's actual hand bones in body-relative 3D coordinates, scaled by arm length. Up to 100 points per check; closer hands earn more. Fingers and hand orientation are excluded. Missing/stale tracking skips the check. A separate grey score rectangle sits left of the top-right skeleton square. Replays reset the score; the final result stays visible in the room until the next replay or exit. Update the full installed resource, including the new score-math.js and fxmanifest.lua, and the companion. Restart both and refresh the website. Keep your existing stream folder/YCD; no animation re-export is needed.

Simplified HUD: a semitransparent grey square in the top-right corner, displaying only "Connect Live Camera" or your live skeleton. No headings, grid, badges or playback progress. Replace all three files in the installed hud folder and restart the resource. Camera pairing, mirror toggle and playback visibility remain as before.

HUD transparency hotfix: removed the root `color-scheme: dark`, which caused Chromium to paint an opaque full-screen canvas even with the panel hidden. The HTML/body stay transparent; only the right-hand panel has a background. To patch the current diagnostic version, replace `hud/hud.css` and restart the resource. Before/after embedded-frame rendering verified in Chromium.

HUD diagnostics (resource 0.2.4): `/mocaplabhud test` forces the panel on for ten seconds even outside the room and without a camera. `/mocaplabhud status` reports the manifest UI page, missing packaged HUD files, page-ready/render acknowledgements, scene/camera and packet age. The UI now acknowledges readiness so the game resends its current state after the page loads. Update the installed resource including its manifest and hud folder, then `refresh` and `restart webcam_mocap_animlab` in the server console.

New live skeleton HUD (resource 0.2.3): `/mocaplabvisit` now issues a pairing token for the companion website. Paste it at http://127.0.0.1:8788 and click **Connect to FiveM**, then approach the model. A green skeleton of your current camera pose appears beside the animated character, with recording progress and tracking-loss status. The live data only drives this overlay during visits. `/mocaplabhud mirror` switches mirror/camera view. The HUD disappears when playback ends or the room closes. Update the installed resource including protocol.js, server.js, client.js, fxmanifest.lua and the new hud folder; retain your stream folder. Update/restart the companion and refresh the page too.

Viewing-room command: `/mocaplabvisit` takes your normal player into the After Hours nightclub dance-floor area. Approach within 1.8 metres of the model to start `webcam_recording / webcam_take`. The camera locks on the model at eye height and hides/freezes your player for the recording, then restores normal camera/control when it finishes. Walk at least 2.8 metres away and approach again to replay. `/mocaplabvisit stop` returns to your saved position and heading. Custom recording: `/mocaplabvisit dictionary clip`. Uses the existing `webcam_mocap_animlab.use` ACE permission. Stored playback works without a camera; connecting the companion adds the comparison HUD. Existing `/mocaplab preview` stays available.

Recordings now include head turning, nodding and tilting. Look straight ahead during the three-second countdown to set neutral. The website displays head angles during recording and a rotating head-direction marker during playback. Head tracking holds its last reliable rotation through missing landmarks. Facial expressions, jaw and lips remain neutral; importer 0.2.6 and its facial binding repairs are included unchanged. Existing capture JSON can be rebuilt to add estimated head rotation, using its first visible head sample as neutral.

Recording fixes: rest-skeleton facing calibration, stable foot orientation and baked palm orientation. Rebuild existing original tracking downloads using **Rebuild a saved recording**; load the updated Blender importer before importing the new animation. Retarget your preview meshes to the newly created rig. Native Blender tests use synthetic rigs; final game appearance remains unverified.

New: **Record locally** captures timed takes without a token or FiveM connection, converts them to a 23-joint animation and BVH, and offers skeleton replay. See [RECORDING.md](RECORDING.md) for recording, Blender retarget/export and recorded GTA playback. GTA binary export requires a separate tool step.

A separate experimental package. The original `webcam-mocap` package is unchanged.

This revision replaces the default prototype animation scrubbing with GTA's `move_ped_crouched` movement graph. The previous clip reported playing but did not visibly bend the body in the user's game. The new backend transitions between standing and crouching with hysteresis (enter at 55%, leave below 35%); it does **not** provide continuous anatomical knee depth. Its appearance on the preview clone still needs an in-game check.

Head look-at is disabled by default. Automatic mode retains hand/wrist IK; manual body tests suspend all IK, even with the webcam connected. Numeric native return values are normalized so game acknowledgements reach the browser.

**Update:** replace the lab package including companion/public files and tools. Restart the lab companion and refresh the page. For recorded in-game playback, also update the installed lab resource's client.js and fxmanifest.lua, then run `restart webcam_mocap_animlab` in the server console. Local recording works without FiveM running.

## Separate identities

| Item | Stable package | Animation lab |
|---|---|---|
| Resource folder | `webcam_mocap` | `webcam_mocap_animlab` |
| Main command | `/mocap` | `/mocaplab` |
| Permission | `webcam_mocap.use` | `webcam_mocap_animlab.use` |
| Companion port | 8787 | 8788 |
| Remote-server setting | `MOCAP_SERVER_URL` | `MOCAP_LAB_SERVER_URL` |

Tokens and event names are separate. Both resources may be installed, but only use one active scene at a time. The lab refuses to take over an existing scripted camera. Run `/mocap stop` before starting the lab.

## Install without replacing the stable resource

1. Copy this package's `resource/webcam_mocap_animlab` folder into your server's `resources` folder. Do not overwrite or rename `webcam_mocap`.
2. Add these lines to `server.cfg`, using the same actual player license identifier that you used for the stable mod:

```cfg
add_ace identifier.license:YOUR_ACTUAL_LICENSE webcam_mocap_animlab.use allow
ensure webcam_mocap_animlab
```

3. Restart the server to apply the config. For testing without a server restart, run `refresh`, then the two lines above in the txAdmin Live Console as well.

## First test: no webcam needed

1. Join, stand on level ground, and enter `/mocap stop` to close the stable scene.
2. Enter `/mocaplab preview`. The lab uses a local preview clone only.
3. Wait for **Animation lab ready**. Then enter:

```text
/mocaplabpose 0
/mocaplabpose 1
/mocaplabpose 0
```

Allow a second between commands. Zero requests standing; one requests crouching. Manual mode suspends all hand/head IK so you can assess body motion alone.

`/mocaplabpose auto` restores camera control and hand/wrist tracking. `/mocaplabpose off` resets the body backend while keeping hands available. Head tracking stays off unless explicitly enabled.

- `/mocaplabik off` isolates body playback during camera-driven tests.
- `/mocaplabik hands` restores hands/wrists (default).
- `/mocaplabik all` enables experimental head look-at as well; avoid this if it causes twitching.
- `/mocaplabstatus` reports backend, IK setting, requested crouch state and errors. This reports controller state, not a visual verification of the bones.
- `/mocaplabbackend clip` restores the old, unverified clip-scrubbing diagnostic. `/mocaplabclip start end` only affects this diagnostic. `/mocaplabbackend crouch` returns to the new default.

If manual zero/one still fails, capture `/mocaplabstatus`; the new test runs without head or arm targets, making the result useful for diagnosing the body backend.

## Then connect the camera

1. Run `START-COMPANION.cmd` from **this animation-lab folder**, leaving its window open. It requires Node.js 20+.
2. Open **http://127.0.0.1:8788** in Chrome or Edge. This is separate from the stable page on 8787.
3. Paste the token from `/mocaplab preview` into the lab page and click Start camera.
4. Enter `/mocaplabpose auto` in game if you used a manual value.
5. Stand with both hips, knees and ankles fully visible. Bend both knees. The page shows the measured knee angles and camera crouch percentage. One bent/lifted knee alone should not trigger a crouch.
6. Keep the companion visible beside the windowed game or on a second monitor. Body input holds briefly on detection loss, then eases to standing. Hand/wrist grace periods are retained independently.

For a remote FiveM server, start the lab companion with its own setting:

```powershell
cd companion
$env:MOCAP_LAB_SERVER_URL = 'https://YOUR_SERVER/webcam_mocap_animlab/pose'
node server.mjs
```

Use the server's real HTTP endpoint and port. The lab deliberately does not inherit the stable companion's `MOCAP_SERVER_URL` setting.

## Stop or return to the working version

Run `/mocaplab stop`, stop the lab camera/companion, then use the original `/mocap preview` and original companion on 8787. The stable files and commands remain available. To remove the lab later, remove its own `ensure`/permission lines and its resource folder only.

## Backend details and limitations

- The crouch backend loads `move_ped_crouched`, applies it to the local clone with a 0.35-second blend, and resets the movement clipset when standing/off/stopping. It disables ambient idle animations that can override crouch.
- Camera input is smoothed, held for 350 ms on loss, then eased toward standing over 650 ms. Existing wrist dropout smoothing remains.
- No body-controller entity-position writes are used. Grounding, frozen-clone idle behavior and compatibility with each ped need actual FiveM verification.
- The earlier `move_crouch_proto` / `idle_intro` scrubber remains an explicit diagnostic only. Loading/playing a clip does not establish that the animation is visually suitable.
- This is a crouch experiment, with no arbitrary bone rotation, separate leg lifts, torso mirroring or synchronized multiplayer replication.
- Webcam frames remain local; only pose measurements go to the configured server.

## Verification

Run `npm test` from `companion` using Node.js 20+. Automated tests cover the native calls, manual IK isolation, boolean acknowledgements, camera measurements, dropout, relay and cleanup. They cannot prove visible crouching inside GTA.

Implementation reference for GTA's crouch graph: [crouch_crawl source](https://github.com/MadsLeander/crouch_crawl/blob/main/client.lua). The preview clone's behavior is still an experiment.
