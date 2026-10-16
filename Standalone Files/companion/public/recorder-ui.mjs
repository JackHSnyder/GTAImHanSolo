import {captureFrame,buildAnimation,toBVH,rotate,MAX_SECONDS,validateCapture,measureHead,qmul} from './recording.mjs';
const $=id=>document.getElementById(id);
const links=[];
let previewFrame=0,previewAnimation=null,playing=false,lastPreview=0;
function download(id,blob,name) {
  const a=$(id),url=URL.createObjectURL(blob);links.push(url);
  a.href=url;a.download=name;a.hidden=false;
}
function clearDownloads() {
  links.splice(0).forEach(url=>URL.revokeObjectURL(url));
  ['rawDownload','animationDownload','bvhDownload','videoDownload'].forEach(id=>$(id).hidden=true);
}
const jsonBlob=value=>new Blob([JSON.stringify(value)],{type:'application/json'});
function drawPreview() {
  const a=previewAnimation;if(!a)return;
  const canvas=$('animationPreview'),ctx=canvas.getContext('2d'),frame=a.frames[previewFrame];
  const add=(p,q)=>p.map((v,i)=>v+q[i]);
  const multiply=(p,q)=>[
    p[3]*q[0]+p[0]*q[3]+p[1]*q[2]-p[2]*q[1],p[3]*q[1]-p[0]*q[2]+p[1]*q[3]+p[2]*q[0],
    p[3]*q[2]+p[0]*q[1]-p[1]*q[0]+p[2]*q[3],p[3]*q[3]-p[0]*q[0]-p[1]*q[1]-p[2]*q[2]];
  const global=[],positions=[];
  a.skeleton.forEach((b,i)=>{
    global[i]=b.parent<0?frame.rotations[i]:multiply(global[b.parent],frame.rotations[i]);
    positions[i]=b.parent<0?frame.root:add(positions[b.parent],rotate(global[b.parent],b.offset));
  });
  ctx.fillStyle='#101916';ctx.fillRect(0,0,canvas.width,canvas.height);
  const side=$('previewSide').checked,scale=canvas.height/2.2;
  const project=p=>[canvas.width/2+(side?p[2]:p[0])*scale,canvas.height-24-p[1]*scale];
  ctx.strokeStyle='#344b3e';ctx.beginPath();ctx.moveTo(0,canvas.height-24);ctx.lineTo(canvas.width,canvas.height-24);ctx.stroke();
  ctx.strokeStyle='#79d5b0';ctx.lineWidth=5;ctx.lineCap='round';
  a.skeleton.forEach((b,i)=>{
    if(b.parent<0)return;
    const p=project(positions[i]),parent=project(positions[b.parent]);
    ctx.beginPath();ctx.moveTo(...parent);ctx.lineTo(...p);ctx.stroke();
    ctx.fillStyle='#ffd36a';ctx.beginPath();ctx.arc(...p,3,0,Math.PI*2);ctx.fill();
  });
  // A terminal head joint alone cannot show rotation. Draw rigid eyes, crown
  // and nose in the head's coordinate frame, including depth in side view.
  const head=a.skeleton.findIndex(b=>b.name==='Head');
  if(head>=0) {
    const point=p=>project(add(positions[head],rotate(global[head],p)));
    for(const [color,from,to] of [['#ffd36a',[-.065,.025,-.065],[.065,.025,-.065]],
      ['#79d5b0',[0,0,0],[0,.13,0]],['#ff917b',[0,.015,-.06],[0,.015,-.16]]]) {
      ctx.strokeStyle=color;ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(...point(from));ctx.lineTo(...point(to));ctx.stroke();
    }
  }
  $('previewSeek').value=previewFrame;
  $('previewTime').textContent=`${(previewFrame/a.fps).toFixed(2)} / ${a.duration.toFixed(2)} seconds`;
}
$('previewSeek').oninput=()=>{previewFrame=Number($('previewSeek').value);drawPreview();};
$('previewSide').onchange=drawPreview;
$('previewPlay').onclick=()=>{playing=!playing;$('previewPlay').textContent=playing?'Pause animation':'Play animation';};
function previewLoop(now) {
  if(playing&&previewAnimation&&now-lastPreview>=1000/previewAnimation.fps) {
    const steps=Math.floor((now-lastPreview)/(1000/previewAnimation.fps));lastPreview=now;
    previewFrame=(previewFrame+Math.min(steps,5))%previewAnimation.frames.length;drawPreview();
  } else if(!playing)lastPreview=now;
  requestAnimationFrame(previewLoop);
}
requestAnimationFrame(previewLoop);
export class OfflineRecorder {
  constructor({status,onFinish,onStart=()=>{},onStop=()=>{}}) {this.status=status;this.onFinish=onFinish;this.onStart=onStart;this.onStop=onStop;this.take=null;this.timer=null;this.media=null;}
  duration() {
    const value=Number($('duration').value);
    if(!Number.isFinite(value)||value<1||value>MAX_SECONDS)throw new Error(`Choose a duration from 1 to ${MAX_SECONDS} seconds.`);
    return value;
  }
  begin(stream,now=performance.now()) {
    const duration=this.duration();
    this.take={format:'webcam-mocap-capture',version:1,createdAt:new Date().toISOString(),
      duration,requestedDuration:duration,frames:[],coordinateSystem:'Original MediaPipe world landmarks in metres; unmirrored image coordinates',
      model:'MediaPipe pose_landmarker_full / tasks-vision 0.10.21',
      videoSettings:stream.getVideoTracks()[0]?.getSettings()||{},startedAt:now+3000};
    const take=this.take;
    this.captureStarted=false;
    const chunks=[];this.chunks=chunks;this.media=null;this.videoStarted=false;this.videoStopped=Promise.resolve();
    if($('saveVideo').checked&&typeof MediaRecorder!=='undefined') {
      const mime=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(t=>MediaRecorder.isTypeSupported(t));
      if(mime) {
        try {
          this.media=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:1800000});
          this.videoStopped=new Promise(resolve=>this.media.addEventListener('stop',resolve,{once:true}));
          this.media.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
          this.media.onerror=()=>{
            take.videoError='Video recording failed; the motion recording is preserved.';
            if(this.take===take)this.status(take.videoError);
          };
        } catch {this.media=null;this.videoStopped=Promise.resolve();}
      }
    }
    this.timer=setInterval(()=>this.update(performance.now()),100);
    this.countdownTimer=setTimeout(()=>this.update(performance.now()),3000);
    this.endTimer=setTimeout(()=>{if(this.take===take)this.onFinish();},3000+duration*1000);
    this.update(now);
  }
  update(now) {
    const take=this.take;if(!take)return;
    const elapsed=(now-take.startedAt)/1000;
    if(elapsed<0) {this.status(`Get ready: ${Math.ceil(-elapsed)}… Stand in view and look straight ahead to set neutral head rotation.`);return;}
    if(!this.captureStarted&&elapsed<take.requestedDuration){this.captureStarted=true;this.onStart();}
    if(this.media?.state==='inactive'&&!this.videoStarted) {
      try {
        this.media.start(1000);this.videoStarted=true;take.videoStartOffsetSeconds=elapsed;
      } catch(error) {
        take.videoError=error.message;this.media=null;this.videoStopped=Promise.resolve();
      }
    }
    $('recordProgress').max=take.requestedDuration;$('recordProgress').value=Math.min(elapsed,take.requestedDuration);
    this.status(`Recording locally: ${Math.max(0,take.requestedDuration-elapsed).toFixed(1)} seconds remaining · ${take.frames.length} camera samples${$('saveVideo').checked&&!this.media?' · video unavailable; motion only':''}.`);
    if(elapsed>=take.requestedDuration)this.onFinish();
  }
  sample(now,result,hands) {
    const take=this.take;if(!take)return;
    const t=(now-take.startedAt)/1000;
    if(t>=0&&!this.captureStarted)this.update(now);
    const measured=measureHead(result.worldLandmarks?.[0],result.landmarks?.[0]);
    if(measured&&(t<0||!take.headNeutral))take.headNeutral=measured;
    if(measured) {
      const n=take.headNeutral||measured;
      const relative=qmul(measured,[-n[0],-n[1],-n[2],n[3]]);
      const forward=rotate(relative,[0,0,-1]),up=rotate(relative,[0,1,0]);
      const deg=v=>Math.round(v*180/Math.PI);
      $('headStatus').textContent=`Head rotation: turn ${deg(Math.atan2(-forward[0],-forward[2]))}° · nod ${deg(Math.asin(Math.max(-1,Math.min(1,forward[1]))))}° · tilt ${deg(Math.atan2(-up[0],up[1]))}° · no facial animation`;
    } else $('headStatus').textContent='Head landmarks unclear · animation holds the last reliable rotation.';
    if(t>=0&&t<=take.requestedDuration&&take.frames.length<8000)take.frames.push(captureFrame(t,result,hands));
  }
  async finish(now=performance.now()) {
    const take=this.take;if(!take)return;
    this.take=null;clearInterval(this.timer);clearTimeout(this.countdownTimer);clearTimeout(this.endTimer);this.timer=null;
    this.onStop();
    take.duration=Math.min(take.requestedDuration,Math.max(0,(now-take.startedAt)/1000));
    delete take.startedAt;
    if(this.media?.state==='recording'||this.media?.state==='paused')this.media.stop();
    // Camera may already have ended, which also stops MediaRecorder.
    if(!this.videoStarted)this.videoStopped=Promise.resolve();
    let encoderTimeout;
    await Promise.race([this.videoStopped,new Promise(resolve=>{
      encoderTimeout=setTimeout(()=>{take.videoError='Video encoder did not finish; video may be incomplete.';resolve();},3000);
    })]);
    clearTimeout(encoderTimeout);
    const video=this.chunks.length?new Blob(this.chunks,{type:this.media.mimeType}):null;
    await this.publish(take,video);
    this.media=null;this.chunks=[];
  }
  async rebuild(file) {
    if(!file||file.size>50_000_000)throw new Error('Choose a capture JSON smaller than 50 MB.');
    const take=JSON.parse(await file.text());
    validateCapture(take);
    await this.publish(take);
  }
  async publish(take,video=null) {
    clearDownloads();playing=false;previewAnimation=null;$('previewSection').hidden=true;
    const basename=`mocap-${(typeof take.createdAt==='string'?take.createdAt:new Date().toISOString()).replace(/[^a-zA-Z0-9_-]/g,'-')}`;
    download('rawDownload',jsonBlob(take),`${basename}.capture.json`);
    if(video)download('videoDownload',video,`${basename}.webm`);
    $('recordResults').hidden=false;
    this.status('Recording finished. Building the animation…');
    await new Promise(resolve=>setTimeout(resolve,0));
    try {
      const animation=buildAnimation(take);
      if(take.videoError)animation.warnings.push(take.videoError);
      download('animationDownload',jsonBlob(animation),`${basename}.animation.json`);
      download('bvhDownload',new Blob([toBVH(animation)],{type:'text/plain'}),`${basename}.bvh`);
      previewAnimation=animation;previewFrame=0;$('previewSeek').max=animation.frames.length-1;
      $('previewSection').hidden=false;drawPreview();$('previewPlay').textContent='Play animation';
      $('recordWarnings').textContent=animation.warnings.join(' ');
      this.status(`Animation ready: ${animation.frames.length} frames at ${animation.fps} FPS. Download the animation and use the GTA conversion tool below.`);
    } catch(error) {
      $('recordWarnings').textContent=`Animation could not be built: ${error.message} The original recording is still downloadable.`;
      this.status('Recording saved, but animation conversion needs a better capture.');
    }
  }
}
