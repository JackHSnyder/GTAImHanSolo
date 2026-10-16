import { OfflineRecorder } from './recorder-ui.mjs';
import { YouTubeReference } from './youtube-reference.mjs';
import { retarget, emptyPose } from './retarget.mjs';
import { deliveryStatus } from './delivery.mjs';
import { refineWrists, wristOrientations, createRecordingHandTracker, recordingWristPositions } from './wrists.mjs';
import { measureCrouch } from './pose-blend.mjs';
import { packSkeleton, packHandMatch } from './skeleton.mjs';
const $ = id => document.getElementById(id);
const video = $('video'), canvas = $('overlay'), ctx = canvas.getContext('2d');
let tracker, stream, running = false, seq = Date.now(), lastFrame = -1, lastSent = 0, pending = false;
let token = '', epoch = 0, sessionMode='live', finishing=false;
const reference=new YouTubeReference();
const recorder=new OfflineRecorder({status:text=>status(text),onFinish:()=>stop(),onStart:()=>reference.start(),onStop:()=>reference.stop()});
let handTracker = null, handError = '',handRetryAt=0;
let recordingHands=createRecordingHandTracker();
const status = text => {
  $('status').textContent = text;
  if(sessionMode==='record'||!running)$('recordStatus').textContent=text;
};
const connections = [[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28]];
const handConnections = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];
$('gain').oninput = () => { $('gainValue').value = Number($('gain').value).toFixed(2); };
fetch('/config').then(r => r.json()).then(c => { $('endpoint').textContent = `Pose destination: ${c.endpoint}`; }).catch(() => status('Local companion is unavailable.'));
async function send(p, sessionEpoch) {
  if (pending) return;
  pending = true;
  try {
    const response = await fetch('/pose', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Pair-Token': token }, body: JSON.stringify(p), signal: AbortSignal.timeout(2200) });
    if (sessionEpoch !== epoch) return;
    if (response.status === 401) { stop(); status('Pairing expired. Run /mocaplabvisit or /mocaplab preview again and paste the new token.'); }
    else if (response.status === 429) status('Pose relay is busy · retrying.');
    else if (!response.ok) status(await response.text());
    else {
      const text = await response.text();
      let receipt;
      try { receipt = JSON.parse(text); } catch { receipt = null; }
      if (sessionEpoch === epoch) {
        if(receipt?.mode==='visit') {
          const ready=receipt.game&&receipt.game.ageMs<=2000;
          const visible=p.skeleton?.points.some(point=>point&&point[2]>=.6);
          status(ready?(visible?'Live skeleton connected to the comparison HUD. Approach the model in the viewing room to begin.':
            'Skeleton HUD connected · step into camera view to track your body.'):
            'Server received skeleton · waiting for the game HUD.');
          $('bodyStatus').textContent='Your live joints feed the skeleton HUD. The character follows the stored recording.';
          return;
        }
        const animation=receipt?.game?.animation;
        const bodyState=animation?` Body clip ${animation.active?'active':'not playing'} · ${Math.round(animation.amount*100)}% crouch.`:' Waiting for body-clip acknowledgement.';
        status(deliveryStatus(p, receipt)+bodyState);
      }
    }
  } catch { if (sessionEpoch === epoch && running) status('Connection lost. Check the companion and FiveM server.'); }
  finally { pending = false; }
}
function stop() {
  if(finishing)return;
  reference.stop();
  if(recorder.take) {
    finishing=true;
    // finish synchronously requests the final video chunk before stopping tracks.
    const done=recorder.finish();
    done.catch(error=>status(`Recording export failed: ${error.message}`)).finally(()=>{finishing=false;setButtons(false);});
  }
  running = false; epoch++;
  if (stream) stream.getTracks().forEach(t => t.stop());
  stream = null; video.srcObject = null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  setButtons(false);
  $('refineHands').disabled = false;
  $('handStatus').textContent = 'Camera stopped.';
  if(!finishing)status('Camera stopped. Character releases after the tracking timeout.');
}
$('stop').onclick = stop;
$('recordStop').onclick = stop;
function setButtons(active) {
  reference.setBusy(active||finishing);
  $('start').disabled=active||finishing;$('record').disabled=active||finishing;
  $('stop').disabled=!active||finishing;
  $('recordStop').disabled=!active||finishing||sessionMode!=='record';
  $('duration').disabled=active||finishing;$('saveVideo').disabled=active||finishing;
  $('rebuildFile').disabled=active||finishing;
  $('stop').textContent=sessionMode==='record'?'Finish recording':'Stop camera';
}
$('start').onclick=()=>startSession('live');
$('record').onclick=()=>startSession('record');
$('rebuildFile').onchange=async()=>{
  const file=$('rebuildFile').files?.[0];
  if(!file||running||finishing)return;
  sessionMode='record';finishing=true;setButtons(false);
  status('Rebuilding your saved capture locally…');
  try {await recorder.rebuild(file);}
  catch(error) {status(`Could not rebuild: ${error.message} Choose original tracking (.capture.json), not animation JSON.`);}
  finally {finishing=false;setButtons(false);$('rebuildFile').value='';}
};
async function startSession(nextMode) {
  if(running||finishing||$('start').disabled)return;
  if(nextMode==='record') {
    try {recorder.duration();reference.validate();}catch(error){return status(error.message);}
  }
  sessionMode=nextMode;
  recordingHands=createRecordingHandTracker();
  token = nextMode==='live'?$('token').value.trim():'';
  if (nextMode==='live'&&!/^[a-f0-9]{48}$/.test(token)) return status('Paste the 48-character token from /mocaplab preview first.');
  const sessionEpoch = ++epoch;
  setButtons(true);
  $('refineHands').disabled = true; handError = '';handRetryAt=0;
  status('Loading pose model and requesting camera access…');
  try {
    if (!tracker || ($('refineHands').checked && !handTracker)) {
      const { PoseLandmarker, HandLandmarker, FilesetResolver } = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/vision_bundle.mjs');
      const files = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm');
      if (!tracker) tracker = await PoseLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task', delegate: 'CPU' },
        runningMode: 'VIDEO', numPoses: 1, minPoseDetectionConfidence: 0.6, minPosePresenceConfidence: 0.6, minTrackingConfidence: 0.6
      });
      if ($('refineHands').checked && !handTracker && sessionEpoch === epoch) {
        $('handStatus').textContent = 'Loading dedicated hand and wrist tracker…';
        try {
          handTracker = await HandLandmarker.createFromOptions(files, {
            baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task', delegate: 'CPU' },
            runningMode: 'VIDEO', numHands: 2, minHandDetectionConfidence: nextMode==='record' ? .5 : .6,
            minHandPresenceConfidence: nextMode==='record' ? .5 : .6, minTrackingConfidence: nextMode==='record' ? .5 : .6
          });
        } catch (error) { handError = `Hand model unavailable; using body wrists. ${error.message}`; }
      }
    }
    if (sessionEpoch !== epoch) return;
    if(handTracker?.setOptions)await handTracker.setOptions({minHandDetectionConfidence:nextMode==='record' ? .5 : .6,
      minHandPresenceConfidence:nextMode==='record' ? .5 : .6,minTrackingConfidence:nextMode==='record' ? .5 : .6});
    if (sessionEpoch !== epoch) return;
    const camera = await navigator.mediaDevices.getUserMedia({ audio: false, video: { width: {ideal:nextMode==='record'?1280:640}, height: {ideal:nextMode==='record'?720:480}, frameRate: { ideal: sessionMode==='record'?30:20, max: 30 } } });
    if (sessionEpoch !== epoch) { camera.getTracks().forEach(t => t.stop()); return; }
    stream = camera; video.srcObject = stream; await video.play();
    if (sessionEpoch !== epoch) return;
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    running = true; lastFrame = -1; lastSent = 0;
    if(sessionMode==='record') {
      const referenceVideo=reference.arm();
      recorder.begin(stream);
      if(referenceVideo)recorder.take.referenceVideo=referenceVideo;
    }
    stream.getVideoTracks()[0]?.addEventListener('ended',()=>{if(sessionEpoch===epoch)stop();},{once:true});
    frame(sessionEpoch);
  } catch (error) { if (sessionEpoch === epoch) { stop(); status(`Unable to start: ${error.message}`); } }
}
function frame(sessionEpoch) {
  if (!running || sessionEpoch !== epoch) return;
  const now = performance.now();
  if (now - lastSent >= (sessionMode==='record'?32:65) && video.readyState >= 2 && lastFrame !== video.currentTime && (sessionMode==='record'||!pending)) {
    lastFrame = video.currentTime; lastSent = now;
    try {
      const result = tracker.detectForVideo(video, now);
      const aspect = video.videoWidth/video.videoHeight;
      let hands = null;
      if ($('refineHands').checked && handTracker && (!handError||(sessionMode==='record'&&now>=handRetryAt))) {
        try { hands = handTracker.detectForVideo(video, now);handError=''; }
        catch (error) { handRetryAt=now+500;handError = `Hand tracking paused; using body wrists. ${sessionMode==='record'?'Retrying automatically. ':''}${error.message}`; }
      }
      if(sessionMode==='record')recorder.sample(now,result,hands);
      const refined = sessionMode==='record'?recordingHands(now/1000,result.worldLandmarks?.[0],result.landmarks?.[0],hands,aspect):
        refineWrists(result.worldLandmarks?.[0], result.landmarks?.[0], hands, aspect);
      if(sessionMode==='record'&&refined.world)refined.world=recordingWristPositions(refined.world,refined.image,refined.matches,aspect);
      const p = refined.world ? retarget(refined.world, ++seq, Number($('gain').value),
        refined.image, aspect) : emptyPose(++seq);
      const skeleton=packSkeleton(refined.image||result.landmarks?.[0],aspect);
      if(skeleton)p.skeleton=skeleton;
      p.handMatch=packHandMatch(refined.world,refined.image);
      if ($('rotateWrists').checked) {
        for(const [name,q] of Object.entries(wristOrientations(hands,refined.matches))) p.targets[name].orientation=q;
      }
      // Body landmarks remain visible in the overlay. Do not advertise or send
      // the withdrawn spine/leg/root targets as supported game motion.
      delete p.targets.spine; delete p.pelvis;
      p.targets.leftFoot.confidence=0;p.targets.rightFoot.confidence=0;
      const crouch=measureCrouch(result.worldLandmarks?.[0],result.landmarks?.[0]);
      p.bodyBlend={amount:crouch.amount,confidence:crouch.confidence};
      $('bodyStatus').textContent=crouch.confidence>=0.6?
        `Camera crouch: ${Math.round(crouch.amount*100)}% · knees ${Math.round(crouch.leftAngle)}° / ${Math.round(crouch.rightAngle)}°.`:
        'Crouch input unavailable · show both hips, knees and ankles. The body clip will ease back to standing.';
      $('handStatus').textContent = !$('refineHands').checked ? 'Hand refinement off · using body wrists.' :
        handError || (refined.matches.length ? `Dedicated wrist tracking: ${refined.matches.map(m => m.name === 'leftHand' ? 'left' : 'right').join(' + ')}. Yellow dots mark refined wrists.` :
        'Using body wrists · no hand matched confidently. Show your palms and keep hands in frame.');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const points = refined.image;
      if (points) {
        ctx.strokeStyle = '#79d5b0'; ctx.lineWidth = 3;
        for (const [a,b] of connections) {
          if (points[a].visibility < 0.6 || points[b].visibility < 0.6) continue;
          ctx.beginPath(); ctx.moveTo(points[a].x * canvas.width, points[a].y * canvas.height);
          ctx.lineTo(points[b].x * canvas.width, points[b].y * canvas.height); ctx.stroke();
        }
      }
      for (const match of refined.matches) {
        const hand = hands.landmarks[match.handIndex];
        ctx.strokeStyle = '#ffd36a'; ctx.fillStyle = '#ffd36a'; ctx.lineWidth = 2;
        for (const [a,b] of handConnections) {
          ctx.beginPath(); ctx.moveTo(hand[a].x*canvas.width, hand[a].y*canvas.height);
          ctx.lineTo(hand[b].x*canvas.width, hand[b].y*canvas.height); ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(hand[0].x*canvas.width,hand[0].y*canvas.height,6,0,Math.PI*2); ctx.fill();
      }
      if(sessionMode==='live')void send(p, sessionEpoch);
    } catch (error) { stop(); status(`Tracking failed: ${error.message}`); return; }
  }
  requestAnimationFrame(() => frame(sessionEpoch));
}
document.addEventListener('visibilitychange',()=>{
  if(document.hidden&&sessionMode==='record'&&recorder.take)stop();
});
window.addEventListener('pagehide', stop);
