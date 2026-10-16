import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {captureFrame,buildAnimation,toBVH,rotate,MAX_SECONDS,validateCapture,measureHead,qmul} from '../companion/public/recording.mjs';
import {retarget,emptyPose} from '../companion/public/retarget.mjs';
import {refineWrists,wristOrientations,createRecordingHandTracker,recordingWristPositions} from '../companion/public/wrists.mjs';
import {measureCrouch} from '../companion/public/pose-blend.mjs';
import {packSkeleton,packHandMatch} from '../companion/public/skeleton.mjs';
function standing() {
  const p=Array.from({length:33},()=>({x:0,y:0,z:0,visibility:1}));
  for(const [i,x,y,z=0] of [[11,.2,-.5],[12,-.2,-.5],[23,.1,0],[24,-.1,0],
    [25,.1,.42],[26,-.1,.42],[27,.1,.84],[28,-.1,.84],[31,.1,.88,-.16],[32,-.1,.88,-.16],
    [13,.4,-.3],[14,-.4,-.3],[15,.5,-.1],[16,-.5,-.1],[7,.05,-.7],[8,-.05,-.7],
    [17,.5,0],[19,.51,0],[18,-.5,0],[20,-.51,0],
    [2,.035,-.73,-.07],[5,-.035,-.73,-.07],[9,.025,-.66,-.07],[10,-.025,-.66,-.07]])Object.assign(p[i],{x,y,z});
  return p;
}
async function harness({video=false,hands=false}={}) {
  const elements=new Map(),requests=[],blobs=new Map(),raf=[],intervals=new Set(),statuses=[];
  let now=0,stopped=false,blobID=0,handCalls=0;const handOptions=[];
  const context2d=new Proxy({}, {get:()=>()=>{},set:()=>true});
  const element=id=>{
    if(!elements.has(id))elements.set(id,{id,disabled:false,hidden:true,textContent:'',value:id==='duration'?'1':id==='gain'?'1':'',
      checked:id==='saveVideo'?video:id==='refineHands'?hands:false,width:640,height:480,getContext:()=>context2d,
      videoWidth:640,videoHeight:480,readyState:2,currentTime:0,play:async()=>{}});
    return elements.get(id);
  };
  const track={stop(){stopped=true;},getSettings:()=>({width:640,height:480}),addEventListener(){}};
  const stream={getTracks:()=>[track],getVideoTracks:()=>[track]};
  class FakeMedia {
    static isTypeSupported(){return true;}
    constructor(_stream,options){this.mimeType=options.mimeType;this.state='inactive';this.events={};}
    addEventListener(name,fn){this.events[name]=fn;}
    start(){this.state='recording';}
    stop(){this.state='inactive';queueMicrotask(()=>{this.ondataavailable({data:new Blob(['final-video-chunk'])});this.events.stop();});}
  }
  const world=standing(),image=world.map(p=>({x:.5+p.x*.4,y:.3+p.y*.4,z:0,visibility:1}));
  const detector={detectForVideo:()=>({worldLandmarks:[world],landmarks:[image]})};
  const sandbox={console,Blob,performance:{now:()=>now},setTimeout,clearTimeout,
    setInterval:fn=>{intervals.add(fn);return fn;},clearInterval:fn=>intervals.delete(fn),
    URL:class extends URL {static createObjectURL(blob){const id=`blob:test-${++blobID}`;blobs.set(id,blob);return id;}static revokeObjectURL(id){blobs.delete(id);}},
    document:{hidden:false,getElementById:element,addEventListener(name,fn){this[name]=fn;}},
    window:{addEventListener(){}},navigator:{mediaDevices:{getUserMedia:async options=>{assert.equal(options.audio,false);return stream;}}},
    requestAnimationFrame:fn=>raf.push(fn),
    fetch:async(url,options)=>{requests.push({url,options});return url==='/pose'?
      {ok:true,status:200,text:async()=>JSON.stringify({accepted:true,mode:'visit',game:{ageMs:0}})}:
      {json:async()=>({endpoint:'http://example.invalid/pose'})};},
    loadTrackerModule:async()=>({PoseLandmarker:{createFromOptions:async()=>detector},FilesetResolver:{forVisionTasks:async()=>({})},
      HandLandmarker:{createFromOptions:async(_files,options)=>{handOptions.push(options);return {setOptions:async value=>handOptions.push(value),
        detectForVideo:()=>{if(++handCalls===1)throw new Error('temporary tracker failure');return {landmarks:[],worldLandmarks:[]};}};}}}),
    captureFrame,buildAnimation,toBVH,rotate,MAX_SECONDS,validateCapture,measureHead,qmul,
    retarget,emptyPose,refineWrists,wristOrientations,createRecordingHandTracker,recordingWristPositions,measureCrouch,packSkeleton,packHandMatch,deliveryStatus:()=>'',AbortSignal,
    ...(video?{MediaRecorder:FakeMedia}:{})};
  const context=vm.createContext(sandbox);
  const referenceCode=(await readFile(new URL('../companion/public/youtube-reference.mjs',import.meta.url),'utf8')).replace(/^export /gm,'');
  vm.runInContext(`globalThis.YouTubeReference=(()=>{${referenceCode}\nreturn YouTubeReference;})();`,context);
  // Exercise real app/recorder logic, substituting only external imports, DOM,
  // media devices and the external ML model. No product-only test hooks.
  const ui=(await readFile(new URL('../companion/public/recorder-ui.mjs',import.meta.url),'utf8')).replace(/\r/g,'').replace(/^import .*;\n/m,'').replace('export class OfflineRecorder','class OfflineRecorder');
  vm.runInContext(`globalThis.OfflineRecorder=(()=>{${ui}\nreturn OfflineRecorder;})();`,context);
  const app=(await readFile(new URL('../companion/public/app.js',import.meta.url),'utf8')).replace(/\r/g,'').replace(/^import .*;\n/gm,'')
    .replace("import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/vision_bundle.mjs')",'loadTrackerModule()');
  vm.runInContext(app,context);
  return {element,requests,blobs,context,intervals,handOptions,get handCalls(){return handCalls;},get stopped(){return stopped;},
    step(t){now=t;element('video').currentTime=t/1000;[...intervals].forEach(fn=>fn());raf.splice(0).forEach(fn=>fn(t));},
    async flush(){await new Promise(resolve=>setTimeout(resolve,15));},statuses};
}
test('live camera sends compact skeleton landmarks and displays HUD connection acknowledgement',async()=>{
  const h=await harness();h.element('token').value='a'.repeat(48);
  await h.element('start').onclick();h.step(100);await h.flush();
  const request=h.requests.find(r=>r.url==='/pose');assert.ok(request);
  const packet=JSON.parse(request.options.body);
  assert.equal(packet.skeleton.points.length,33);assert.equal(packet.skeleton.aspect,1.3333);
  assert.equal(packet.handMatch.left.length,3);assert.equal(packet.handMatch.right.length,3);
  assert.match(h.element('status').textContent,/skeleton connected/);
  assert.equal(h.element('recordResults').hidden,true,'live comparison does not record a take');
  h.element('stop').onclick();
});
test('record button works without token, stops at duration, exports playable motion and sends no poses',async()=>{
  const h=await harness();
  await h.element('record').onclick();
  assert.equal(h.element('start').disabled,true);
  assert.equal(h.element('stop').textContent,'Finish recording');
  h.step(2000);assert.match(h.element('status').textContent,/Get ready/);
  assert.match(h.element('headStatus').textContent,/Head rotation: turn 0°/);
  for(let t=3000;t<4000;t+=50)h.step(t);
  h.step(4000);await h.flush();
  assert.equal(h.stopped,true);assert.equal(h.intervals.size,0);
  assert.equal(h.requests.filter(r=>r.url==='/pose').length,0);
  assert.equal(h.element('animationDownload').hidden,false);
  const animation=JSON.parse(await h.blobs.get(h.element('animationDownload').href).text());
  assert.equal(animation.format,'webcam-mocap-animation');assert.equal(animation.frames.length,31);
  const raw=JSON.parse(await h.blobs.get(h.element('rawDownload').href).text());
  assert.equal(raw.headNeutral.length,4,'countdown stores neutral head rotation for reproducible rebuilds');
  assert.equal(raw.frames.length,20);assert.equal(raw.frames[0].t,0);
  assert.equal(h.element('start').disabled,false);assert.equal(h.element('record').disabled,false);
  h.element('previewPlay').onclick();h.step(4100);
  assert.match(h.element('previewTime').textContent,/1.00 seconds/);
});
test('reference video includes final encoder chunk and recording can finish early',async()=>{
  const h=await harness({video:true});await h.element('record').onclick();
  for(let t=3000;t<3500;t+=50)h.step(t);
  h.element('stop').onclick();await h.flush();
  const video=h.blobs.get(h.element('videoDownload').href);
  assert.ok(video);assert.equal(await video.text(),'final-video-chunk');
  const raw=JSON.parse(await h.blobs.get(h.element('rawDownload').href).text());
  assert.ok(raw.duration<1);assert.equal(raw.videoStartOffsetSeconds,0);
  assert.equal(h.stopped,true);assert.equal(h.intervals.size,0);
});
test('invalid duration never opens camera; live mode still requires a token',async()=>{
  const h=await harness();h.element('duration').value='999';
  await h.element('record').onclick();assert.match(h.element('status').textContent,/1 to 120/);
  assert.equal(h.intervals.size,0);assert.equal(h.stopped,false);
  await h.element('start').onclick();assert.match(h.element('status').textContent,/48-character token/);
});
test('hiding the tab ends a take rather than silently recording a long frozen gap',async()=>{
  const h=await harness();await h.element('record').onclick();
  for(let t=3000;t<3500;t+=50)h.step(t);
  h.context.document.hidden=true;h.context.document.visibilitychange();await h.flush();
  assert.equal(h.stopped,true);assert.equal(h.intervals.size,0);
  assert.equal(h.element('rawDownload').hidden,false);
});
test('YouTube reference starts only at capture time, stores selected timestamp, and pauses at completion',async()=>{
  const h=await harness();
  h.element('youtubeUrl').value='https://youtu.be/M7lc1UVf-VE';h.element('youtubeStart').value='1:30';
  const calls=[];h.context.referenceCalls=calls;
  vm.runInContext(`reference.player={pauseVideo:()=>referenceCalls.push('pause'),seekTo:n=>referenceCalls.push(['seek',n]),playVideo:()=>referenceCalls.push('play'),getDuration:()=>300};reference.ready=true;reference.loadedId='M7lc1UVf-VE';`,h.context);
  h.element('youtubeCue').onclick();
  await h.element('record').onclick();
  assert.equal(h.element('youtubeStart').disabled,true);
  h.step(2900);assert.equal(calls.includes('play'),false);
  h.step(3000);assert.equal(calls.filter(c=>c==='play').length,1);
  h.step(3100);assert.equal(calls.filter(c=>c==='play').length,1);
  h.step(4000);await h.flush();assert.equal(calls.at(-1),'pause');
  const raw=JSON.parse(await h.blobs.get(h.element('rawDownload').href).text());
  assert.equal(raw.referenceVideo.startSeconds,90);assert.equal(raw.referenceVideo.videoId,'M7lc1UVf-VE');
  assert.equal(h.element('youtubeStart').disabled,false);
});

test('an unprepared reference blocks camera startup; stopping during countdown never starts YouTube',async()=>{
  const h=await harness();h.element('youtubeUrl').value='https://youtu.be/M7lc1UVf-VE';
  await h.element('record').onclick();assert.match(h.element('status').textContent,/Prepare YouTube first/);
  assert.equal(h.intervals.size,0);
  const calls=[];h.context.referenceCalls=calls;
  vm.runInContext(`reference.player={pauseVideo:()=>referenceCalls.push('pause'),seekTo(){},playVideo:()=>referenceCalls.push('play'),getDuration:()=>300};reference.ready=true;reference.loadedId='M7lc1UVf-VE';`,h.context);
  h.element('youtubeCue').onclick();await h.element('record').onclick();h.step(1000);
  h.element('stop').onclick();await h.flush();assert.equal(calls.includes('play'),false);assert.equal(calls.at(-1),'pause');
});

test('recordings use relaxed hand thresholds and recover from transient tracker errors rather than disabling hands for the whole take',async()=>{
  const h=await harness({hands:true});await h.element('record').onclick();
  assert.equal(h.handOptions[0].minHandDetectionConfidence,.5);
  h.step(3000);assert.equal(h.handCalls,1);assert.match(h.element('handStatus').textContent,/Retrying automatically/);
  h.step(3100);assert.equal(h.handCalls,1);
  h.step(3600);assert.equal(h.handCalls,2);assert.ok(!h.element('handStatus').textContent.includes('temporary tracker failure'));
  h.element('stop').onclick();await h.flush();
});

test('saved captures rebuild without camera access or FiveM requests',async()=>{
  const h=await harness();
  const take={format:'webcam-mocap-capture',version:1,duration:1,
    frames:[{t:0,world:standing(),image:null},{t:1,world:standing(),image:null}]};
  h.element('rebuildFile').files=[{size:10000,text:async()=>JSON.stringify(take)}];
  await h.element('rebuildFile').onchange();
  const animation=JSON.parse(await h.blobs.get(h.element('animationDownload').href).text());
  assert.equal(animation.retargetVersion,2);
  assert.equal(h.intervals.size,0);assert.equal(h.stopped,false);
  assert.equal(h.requests.filter(r=>r.url==='/pose').length,0);
});
