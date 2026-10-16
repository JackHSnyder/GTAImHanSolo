'use strict';
const $=id=>document.getElementById(id);
const canvas=$('skeleton'),ctx=canvas.getContext('2d');
const connections=[[7,8],[0,7],[0,8],[7,11],[8,12],[11,12],[11,13],[13,15],
  [12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28],
  [15,17],[15,19],[16,18],[16,20],[27,29],[29,31],[27,31],[28,30],[30,32],[28,32]];
let state=null,lastMessage=0;
let renderReported=false;
const musicPlayers=new Map();
let currentMusic=null,musicSession=null;
let backgroundLoop=null;
let animationAudio=null;
let sharedAudioContext=null;
const getAudioContext=()=>sharedAudioContext??=new (globalThis.AudioContext||globalThis.webkitAudioContext)();
const musicDiagnostics={messages:0,changes:0,watchdogStops:0,history:[]};
function musicEvent(text) {
  musicDiagnostics.history.push(`${(performance.now()/1000).toFixed(2)}s ${text}`);
  if(musicDiagnostics.history.length>6)musicDiagnostics.history.shift();
}
function reportMusic(kind,detail='') {
  const audio=musicPlayers.get(currentMusic);
  const loop=currentMusic?.startsWith('background:')?backgroundLoop?.snapshot():null;
  const animation=currentMusic?.startsWith('animation:')?animationAudio?.snapshot():null;
  notifyGame('mocapMusicStatus',{version:'0.3.23',kind,detail,track:currentMusic||'none',backend:audio?'html-audio':'none',
    crossfadeHelperLoaded:typeof globalThis.CrossfadeBackground==='function',
    webAudioSupported:typeof(globalThis.AudioContext||globalThis.webkitAudioContext)==='function',
    paused:audio?.paused??true,readyState:audio?.readyState??0,time:audio?.currentTime||0,
    volume:audio?.volume??0,errorCode:audio?.error?.code||0,...loop,...animation,
    diagnostics:{...musicDiagnostics,session:musicSession,messageAgeMs:Math.round(performance.now()-lastMessage)}});
}
function stopMusic(reset=false) {
  if(currentMusic)musicEvent(`stop ${currentMusic} reset=${reset}`);
  backgroundLoop?.pause(reset);
  animationAudio?.pause(true);
  for(const audio of musicPlayers.values()) {
    audio.pause();if(reset)audio.currentTime=0;
  }
  currentMusic=null;musicSession=null;
}
function updateMusic(music) {
  const mode=music?.mode,file=music?.file;
  if(!['background','animation'].includes(mode)||typeof file!=='string'||
      !/^[a-zA-Z0-9_ -]+\.(ogg|mp3|wav)$/i.test(file)) {
    stopMusic(mode==='off');return;
  }
  const key=`${mode}:${file}`,changed=key!==currentMusic||music.session!==musicSession;
  if(changed){musicDiagnostics.changes++;musicEvent(`${key} session=${music.session}`);}
  if(mode==='animation'&&globalThis.DecodedAnimation?.supported()) {
    backgroundLoop?.pause();for(const audio of musicPlayers.values())audio.pause();
    currentMusic=key;musicSession=music.session;
    animationAudio??=new globalThis.DecodedAnimation({contextFactory:getAudioContext,onError:detail=>reportMusic('error',detail),onPlaying:()=>reportMusic('playing')});
    animationAudio.setTrack(`../audio/${encodeURIComponent(file)}`,Number.isFinite(music.volume)?music.volume:.5,music.seconds,music.session);
    return;
  }
  animationAudio?.pause(true);
  if(mode==='background'&&globalThis.CrossfadeBackground?.supported()) {
    for(const audio of musicPlayers.values())audio.pause();
    currentMusic=key;musicSession=music.session;
    backgroundLoop??=new globalThis.CrossfadeBackground({contextFactory:getAudioContext,onError:detail=>reportMusic('error',detail),onPlaying:()=>reportMusic('playing')});
    backgroundLoop.setTrack(`../audio/${encodeURIComponent(file)}`,Number.isFinite(music.volume)?music.volume:.5,music.crossfadeSeconds);
    return;
  }
  backgroundLoop?.pause();
  let audio=musicPlayers.get(key);
  if(!audio) {
    audio=new Audio(`../audio/${encodeURIComponent(file)}`);audio.preload='auto';
    audio.addEventListener('error',()=>{
      const reasons={1:'loading aborted',2:'file/network loading failed',3:'audio decoding failed',4:'file missing or audio format unsupported'};
      const reason=reasons[audio.error?.code]||'audio loading failed';
      notifyGame('mocapMusicStatus',{version:'0.3.23',kind:'error',track:key,errorCode:audio.error?.code||0,
        detail:`${reason}. Check audio/${file}, its real format, and fxmanifest.lua.`});
    });
    audio.addEventListener('playing',()=>{if(currentMusic===key)reportMusic('playing');});
    // Metadata may arrive after playback starts. Seek using the latest game timeline.
    audio.addEventListener('loadedmetadata',()=>{
      if(currentMusic===key&&mode==='animation')seekMusic(audio,audio.mocapSeconds);
    });
    musicPlayers.set(key,audio);
  }
  for(const [otherKey,other] of musicPlayers)if(otherKey!==key)other.pause();
  currentMusic=key;musicSession=music.session;
  if(mode==='background'&&changed)reportMusic('warning','Background is using HTML audio fallback because Web Audio is unavailable. Crossfade is not active in this player.');
  audio.loop=mode==='background';
  audio.volume=Number.isFinite(music.volume)?Math.max(0,Math.min(1,music.volume)):.5;
  if(mode==='animation') {
    audio.mocapSeconds=Math.max(0,Number(music.seconds)||0);
    // Seek only when starting a session (or when metadata first arrives).
    // Re-seeking a slow/buffering stream on every heartbeat can prevent it
    // from ever advancing, producing repeated fragments or silence.
    if(changed)seekMusic(audio,audio.mocapSeconds);
  }
  // An ended animation track stays silent until the next replay.
  if(changed||(audio.paused&&!audio.ended&&!audio.error&&!audio.mocapPending&&performance.now()>=(audio.mocapRetryAt||0))) {
    audio.mocapPending=true;audio.mocapRetryAt=performance.now()+2000;
    audio.play().then(()=>{audio.mocapPending=false;},error=>{
      audio.mocapPending=false;
      if(currentMusic===key&&error.name!=='AbortError')reportMusic('error',`${error.name}: ${error.message}`);
    });
  }
}
function seekMusic(audio,seconds) {
  if(!Number.isFinite(audio.duration)||audio.duration<=0)return;
  audio.currentTime=Math.min(seconds,audio.duration);
}
function notifyGame(event,data={}) {
  if(typeof GetParentResourceName!=='function')return;
  fetch(`https://${GetParentResourceName()}/${event}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}).catch(()=>{});
}
function draw(data) {
  ctx.clearRect(0,0,640,640);
  const s=data.skeleton;
  if(!s||!Array.isArray(s.points)||s.points.length!==33||!Number.isFinite(s.aspect)||s.aspect<=0)return;
  const scale=Math.min(580/s.aspect,580),w=s.aspect*scale;
  const point=p=>[30+(580-w)/2+(data.mirrored?1-p[0]:p[0])*w,30+(580-scale)/2+p[1]*scale];
  const valid=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite)&&p[2]>=.6;
  ctx.lineWidth=6;ctx.lineCap='round';ctx.strokeStyle='#83e4b4';
  for(const [a,b] of connections) {
    const p=s.points[a],q=s.points[b];if(!valid(p)||!valid(q))continue;
    ctx.beginPath();ctx.moveTo(...point(p));ctx.lineTo(...point(q));ctx.stroke();
  }
  for(const i of [0,7,8,11,12,13,14,15,16,17,18,19,20,23,24,25,26,27,28,29,30,31,32]) {
    const p=s.points[i];if(!valid(p))continue;
    ctx.fillStyle=[15,16].includes(i)?'#ffd36a':'#c3ffe1';
    ctx.beginPath();ctx.arc(...point(p),[15,16].includes(i)?7:5,0,Math.PI*2);ctx.fill();
  }
}
function render(data) {
  updateMusic(data.music);
  const countdown=data.visible&&[1,2,3].includes(data.countdown)?data.countdown:null;
  $('countdown').hidden=countdown===null;
  $('countdown').textContent=countdown===null?'':String(countdown);
  const score=data.score;
  $('scorePanel').hidden=!(data.scoreVisible&&score);
  if(data.scoreVisible&&score) {
    $('scoreLabel').textContent=score.finished?'FINAL SCORE':'SCORE';
    $('scoreTotal').textContent=String(Math.max(0,Math.floor(Number(score.total)||0)));
    $('scoreGoal').textContent=String(Math.max(0,Math.floor(Number(score.goal)||0)));
    $('scoreDetail').textContent=score.finished?`${score.samples||0} scored seconds`:
      score.status==='scored'?`+${score.lastPoints} / 100`:
      ['delay','grace'].includes(score.status)?'Get ready':
      score.status==='untracked'?'Show both hands':'Checking each second';
  }
  $('panel').hidden=!data.visible;
  if(!data.visible)return;
  const live=data.status==='live'&&!!data.skeleton;
  $('empty').hidden=live;
  draw({...data,skeleton:live?data.skeleton:null});
  if(!renderReported) {renderReported=true;notifyGame('mocapHudRendered');}
}
window.addEventListener('message',event=>{
  if(event.data?.type==='mocapMusicQuery') {reportMusic('status');return;}
  if(event.data?.type!=='mocapComparison')return;
  state=event.data;lastMessage=performance.now();musicDiagnostics.messages++;render(state);
  if(!state.visible)renderReported=false;
});
// Clear an orphaned HUD if the game script stops sending updates unexpectedly.
setInterval(()=>{
  if((state?.visible||state?.scoreVisible||currentMusic)&&performance.now()-lastMessage>1500) {
    musicDiagnostics.watchdogStops++;musicEvent('heartbeat timeout');
    state={...state,visible:false,scoreVisible:false,skeleton:null,music:{mode:'off'}};render(state);
  }
},500);
window.addEventListener('pagehide',()=>stopMusic(true));
notifyGame('mocapHudReady');
