'use strict';
// Keep wrist math in this script: FiveM must not depend on another script's global scope.
const HandMath = (() => {
  const sub=(a,b)=>a.map((v,i)=>v-b[i]);
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const unit=v=>{const n=Math.hypot(...v);return Number.isFinite(n)&&n>1e-6?v.map(x=>x/n):null;};
  const normalize=q=>{const v=unit([q.x,q.y,q.z,q.w]);return v?{x:v[0],y:v[1],z:v[2],w:v[3]}:null;};
  const inverse=q=>({x:-q.x,y:-q.y,z:-q.z,w:q.w});
  const multiply=(a,b)=>normalize({
    x:a.w*b.x+a.x*b.w+a.y*b.z-a.z*b.y,
    y:a.w*b.y-a.x*b.z+a.y*b.w+a.z*b.x,
    z:a.w*b.z+a.x*b.y-a.y*b.x+a.z*b.w,
    w:a.w*b.w-a.x*b.x-a.y*b.y-a.z*b.z});
  function fromBasis(x,y,z) {
    const m00=x[0],m01=y[0],m02=z[0],m10=x[1],m11=y[1],m12=z[1],m20=x[2],m21=y[2],m22=z[2];
    const trace=m00+m11+m22; let q,s;
    if(trace>0){s=Math.sqrt(trace+1)*2;q={w:s/4,x:(m21-m12)/s,y:(m02-m20)/s,z:(m10-m01)/s};}
    else if(m00>m11&&m00>m22){s=Math.sqrt(1+m00-m11-m22)*2;q={w:(m21-m12)/s,x:s/4,y:(m01+m10)/s,z:(m02+m20)/s};}
    else if(m11>m22){s=Math.sqrt(1+m11-m00-m22)*2;q={w:(m02-m20)/s,x:(m01+m10)/s,y:s/4,z:(m12+m21)/s};}
    else{s=Math.sqrt(1+m22-m00-m11)*2;q={w:(m10-m01)/s,x:(m02+m20)/s,y:(m12+m21)/s,z:s/4};}
    return normalize(q);
  }
  function handFrame(wrist,middle,index,pinky) {
    if([wrist,middle,index,pinky].some(p=>!Array.isArray(p)||p.length!==3||!p.every(Number.isFinite)))return null;
    const y=unit(sub(middle,wrist)), side=unit(sub(index,pinky));
    if(!y||!side)return null;
    const perpendicular=cross(side,y);
    if(Math.hypot(...perpendicular)<0.15)return null;
    const z=unit(perpendicular),x=unit(cross(y,z));
    return fromBasis(x,y,z);
  }
  function blend(a,b,t) {
    if(!a)return b;
    const dot=a.x*b.x+a.y*b.y+a.z*b.z+a.w*b.w, sign=dot<0?-1:1;
    return normalize(Object.fromEntries(['x','y','z','w'].map(k=>[k,a[k]*(1-t)+b[k]*t*sign])));
  }
  const api={sub,cross,unit,normalize,inverse,multiply,fromBasis,handFrame,blend};
  return api;
})();

// Keep hand/wrist IK. Head look-at is opt-in because it can fight body animation.
// Spine/leg target calls did not produce usable
// articulation in game; moving the whole ped down is not a crouch substitute.
const CONFIG = { timeoutMs: 650, smoothingSeconds: 0.09,
  handHoldMs: 500, handFadeMs: 500 };
// A client-only stage above the map; no map assets or player teleport required.
const ROOM = { x: 0, y: 0, floor: 1000, halfWidth: 5, halfDepth: 6, height: 4,
  cameraDistance: 4.2, fov: 50 };
const CLUB={x:-1596,y:-3013,floor:-79.99,heading:270,halfWidth:3.5,halfDepth:4.5,height:6,cameraDistance:4.2,fov:55};
const clubIpl='ba_int_placement_ba_interior_0_dlc_int_01_ba_milo_';
// GTA's static nightclub radios are separate from the custom NUI music.
const clubAudioEmitters=['SE_ba_dlc_club_exterior','SE_ba_dlc_int_01_Bogs','SE_ba_dlc_int_01_Entry_Hall',
  'SE_ba_dlc_int_01_Entry_Stairs','SE_ba_dlc_int_01_garage','SE_ba_dlc_int_01_main_area',
  'SE_ba_dlc_int_01_main_area_2','SE_ba_dlc_int_01_office','SE_ba_dlc_int_01_rear_L_corridor'];
function muteVisitClubAudio(s) {
  if(globalThis.MocapLabConfig?.nightclub?.muteBuiltInAudio===false)return;
  const now=GetGameTimer();
  if(s.clubAudioMuted&&now-s.clubAudioMutedAt<1000)return;
  for(const emitter of clubAudioEmitters)SetStaticEmitterEnabled(emitter,false);
  s.clubAudioMuted=true;s.clubAudioMutedAt=now;
}
const clubLightSets=Array.from({length:4},(_,dj)=>Array.from({length:4},(_,rig)=>`DJ_0${dj+1}_Lights_0${rig+1}`)).flat();
const clubBaseSets={Int01_ba_clubname_01:true,Int01_ba_clubname_02:false,Int01_ba_clubname_03:false,
  Int01_ba_clubname_04:false,Int01_ba_clubname_05:false,Int01_ba_clubname_06:false,Int01_ba_clubname_07:false,
  Int01_ba_clubname_08:false,Int01_ba_clubname_09:false,
  Int01_ba_Style01:false,Int01_ba_Style02:true,Int01_ba_Style03:false,
  Int01_ba_style01_podium:false,Int01_ba_style02_podium:true,Int01_ba_style03_podium:false,
  Int01_ba_equipment_setup:true,Int01_ba_equipment_upgrade:true,
  Int01_ba_dj01:true,Int01_ba_dj02:false,Int01_ba_dj03:false,Int01_ba_dj04:false,
  Int01_ba_bar_content:true,Int01_ba_booze_01:true,Int01_ba_booze_02:true,Int01_ba_booze_03:true,
  Int01_ba_Clutter:false,Int01_ba_Worklamps:false,light_rigs_off:false,Int01_ba_lightgrid_01:false,Int01_ba_trad_lights:false};
function visitStage() {
  const settings=globalThis.MocapLabConfig?.nightclub||{},stage={...CLUB};
  for(const key of ['x','y','floor','heading','cameraDistance','fov'])if(Number.isFinite(settings[key]))stage[key]=settings[key];
  stage.cameraDistance=Math.max(2,Math.min(7,stage.cameraDistance));stage.fov=Math.max(35,Math.min(80,stage.fov));
  return stage;
}
function stagePoint(stage,side=0,forward=0,z=stage.floor) {
  const angle=(stage.heading||0)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
  return [stage.x+c*side-s*forward,stage.y+s*side+c*forward,z];
}
function setClubProp(s,name,enabled) {
  (enabled?ActivateInteriorEntitySet:DeactivateInteriorEntitySet)(s.interior,name);
}
function setClubLighting(s,playing) {
  if(!s?.interior||s.clubPlaying===playing)return;
  s.clubPlaying=playing;
  const enabled=new Set(playing?['DJ_04_Lights_01','DJ_03_Lights_02','DJ_04_Lights_03','DJ_04_Lights_04']:['DJ_04_Lights_03']);
  for(const name of clubLightSets)setClubProp(s,name,enabled.has(name));
  RefreshInterior(s.interior);
}
async function loadVisitClub(s) {
  muteVisitClubAudio(s);
  // Stream the destination while the player is still at their original location.
  SetFocusPosAndVel(s.stage.x,s.stage.y,s.stage.floor+1.5,0,0,0);
  s.clubWasActive=IsIplActive(clubIpl);
  RequestIpl(clubIpl);
  const began=GetGameTimer();
  while(scene===s&&GetGameTimer()-began<8000) {
    const interior=GetInteriorAtCoordsWithType(-1604.664,-3012.583,-79.99,'ba_dlc_int_01_ba');
    if(interior&&IsValidInterior(interior)) {
      if(!s.interior){s.interior=interior;PinInteriorInMemory(interior);}
      break;
    }
    await new Promise(resolve=>setTimeout(resolve,0));
  }
  if(scene!==s)return false;
  if(!s.interior||!IsValidInterior(s.interior))throw new Error('The After Hours nightclub interior did not load. Check that your server uses a GTA build with After Hours assets.');
  s.clubOriginal=new Map([...Object.keys(clubBaseSets),...clubLightSets].map(name=>[name,IsInteriorEntitySetActive(s.interior,name)]));
  for(const [name,enabled] of Object.entries(clubBaseSets))setClubProp(s,name,enabled);
  setClubLighting(s,false);
  RequestCollisionAtCoord(s.stage.x,s.stage.y,s.stage.floor);
  // Readiness can remain false after refreshing this interior's entity sets.
  // Keep streaming it; entry is gated on real player collision after teleport.
  PinInteriorInMemory(s.interior);
  await new Promise(resolve=>setTimeout(resolve,0));
  if(scene!==s)return false;
  return true;
}
let lastClubFailure='';
function clubStatus(s) {
  return `Nightclub client 0.3.23: interior ${s.interior||0}; valid: ${!!s.interior&&IsValidInterior(s.interior)}; ready: ${!!s.interior&&IsInteriorReady(s.interior)}; IPL active: ${IsIplActive(clubIpl)}; collision loaded: ${HasCollisionLoadedAroundEntity(s.player)}; loading: ${s.loading}; recovering: ${s.clubMissingSince!==undefined}.`;
}
function saveClubFailure(s,reason) {
  lastClubFailure=`Last nightclub failure: ${reason}. ${clubStatus(s)}`;
}
function maintainVisitClub(s) {
  if(s.loading)return true;
  const now=GetGameTimer(),valid=!!s.interior&&IsValidInterior(s.interior);
  const ready=valid&&IsInteriorReady(s.interior),collision=HasCollisionLoadedAroundEntity(s.player);
  // Placement-IPL flags and readiness alone are not proof that a loaded
  // interior was removed. Lighting refreshes can temporarily change readiness.
  if((!IsIplActive(clubIpl)||!ready||!collision)&&now-(s.clubRetryAt??-Infinity)>=1000) {
    s.clubRetryAt=now;RequestIpl(clubIpl);
    if(valid)PinInteriorInMemory(s.interior);
    RequestCollisionAtCoord(s.stage.x,s.stage.y,s.stage.floor);
  }
  if(valid&&collision) {
    if(s.clubMissingSince!==undefined) {
      delete s.clubMissingSince;
      FreezeEntityPosition(s.player,['waiting','starting','playing'].includes(s.state));
    }
    return true;
  }
  if(s.clubMissingSince===undefined) {
    s.clubMissingSince=now;FreezeEntityPosition(s.player,true);
  }
  if(now-s.clubMissingSince>=8000) {
    const detail=`interior valid: ${valid}, ready: ${ready}, collision loaded: ${collision}, IPL active: ${IsIplActive(clubIpl)}`;
    saveClubFailure(s,'Interior/collision recovery timed out');
    stop();notice(`Nightclub could not recover after 8 seconds (${detail}). Returned to your starting location.`);
  }
  return false;
}
RegisterCommand('mocaplabclubstatus',()=>{
  const s=scene;
  if(s?.kind!=='visit')return notice(lastClubFailure||'No nightclub visit active; no failure recorded since this resource started.');
  notice(clubStatus(s));
},false);
function releaseVisitClub(s) {
  if(s.clubAudioMuted)for(const emitter of clubAudioEmitters)SetStaticEmitterEnabled(emitter,true);
  if(s.clubOriginal) {
    for(const [name,enabled] of s.clubOriginal)setClubProp(s,name,enabled);
    RefreshInterior(s.interior);
  }
  if(s.interior)UnpinInterior(s.interior);
  if(s.clubWasActive===false)RemoveIpl(clubIpl);
}
function drawClubLights(s) {
  if(!s.interior||s.loading)return;
  const stage=s.stage,playing=s.clubPlaying;
  const front=stagePoint(stage,0,2.4,stage.floor+2.1);
  DrawLightWithRange(...front,235,230,255,7,playing?2.2:1.1);
  const seconds=recordedPlayback?.startedAt!==undefined?(GetGameTimer()-recordedPlayback.startedAt)/1000:0;
  for(const side of [-1,1]) {
    const pos=stagePoint(stage,side*2.8,-1.6,stage.floor+4.3);
    if(!playing){DrawLightWithRange(...pos,55,140,200,7,.7);continue;}
    const target=stagePoint(stage,side*Math.sin(seconds*.9)*1.8,Math.cos(seconds*.7)*1.3,stage.floor+.5);
    const direction=target.map((v,i)=>v-pos[i]),length=Math.hypot(...direction);
    DrawSpotLight(...pos,...direction.map(v=>v/length),...(side<0?[60,190,255]:[210,65,255]),14,4+.7*Math.sin(seconds*2),.5,32,1);
  }
}
let mode = null, preview = 0, pose = null, received = 0, filtered = {}, creating = 0;
let scene = null;
let armRig = null;
let acknowledgedSeq = -1;
let handTargets = {}, handRotations = {};
let handHistory = {};
const visitModelKey='visitCharacterModel';
const validModelName=name=>typeof name==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(name);
const storedVisitModel=GetResourceKvpString(visitModelKey);
let visitModel=validModelName(storedVisitModel)?storedVisitModel.toLowerCase():'';
let modelChoiceRequest=0;
// Ped skeletons are addressed by GTA bone tags, not entity bone-name lookups.
// All required bones are non-root: index 0 is not a valid match here.
const visitBones={head:31086,leftUpperArm:45509,rightUpperArm:40269,leftForearm:61163,rightForearm:28252,
  leftHand:18905,rightHand:57005,leftThigh:58271,rightThigh:51826,leftFoot:14201,rightFoot:52301};
async function createVisitCharacter(name,player,cancelled=()=>false) {
  if(!name)return ClonePed(player,0,false,false);
  const hash=GetHashKey(name);
  if(!IsModelInCdimage(hash)||!IsModelValid(hash)||!IsModelAPed(hash))
    throw new Error(`Unknown ped model: ${name}. Use its in-game spawn name; custom models must be streamed by the server.`);
  RequestModel(hash);
  let ped=0;
  try {
    const began=GetGameTimer();
    while(!cancelled()&&!HasModelLoaded(hash)&&GetGameTimer()-began<5000)
      await new Promise(resolve=>setTimeout(resolve,0));
    if(cancelled())return 0;
    if(!HasModelLoaded(hash))throw new Error(`Ped model ${name} did not load.`);
    ped=CreatePed(4,hash,...GetEntityCoords(player,false),0,false,false);
    if(!ped)throw new Error('Could not create that character.');
    SetEntityVisible(ped,false,false);SetEntityCollision(ped,false,false);FreezeEntityPosition(ped,true);
    SetPedDefaultComponentVariation(ped);
    const skeletonBegan=GetGameTimer();
    let missing;
    do {
      if(cancelled()) {DeleteEntity(ped);ped=0;return 0;}
      missing=Object.entries(visitBones).filter(([,id])=>{
        const index=GetPedBoneIndex(ped,id);
        return !Number.isInteger(index)||index<=0;
      }).map(([label])=>label);
      if(!missing.length)break;
      if(GetGameTimer()-skeletonBegan>=1500)
        throw new Error(`Ped ${name} skeleton unavailable or incompatible (missing: ${missing.join(', ')}).`);
      // A newly created ped can need several game frames to initialize its skeleton.
      await new Promise(resolve=>setTimeout(resolve,0));
    } while(true);
    return ped;
  } catch(error) {
    if(ped&&DoesEntityExist(ped))DeleteEntity(ped);
    throw error;
  } finally {SetModelAsNoLongerNeeded(hash);}
}
const backupModels=[1,2].map(slot=>{
  const saved=GetResourceKvpString(`backupDancerModel${slot}`);
  return validModelName(saved)?saved.toLowerCase():'';
});
const backupRequests=[0,0];
for(const slot of [0,1])RegisterCommand(`mocaplabbackup${slot+1}`,async (_source,args)=>{
  const command=`/mocaplabbackup${slot+1}`;
  if(!args.length)return notice(`Backup dancer ${slot+1}: ${backupModels[slot]||'same as main character'}. Use ${command} spawn_name, or ${command} reset. Changes apply on the next visit.`);
  if(args.length!==1||!validModelName(args[0]))return notice(`Use ${command} spawn_name, or ${command} reset.`);
  const request=++backupRequests[slot],name=args[0].toLowerCase()==='reset'?'':args[0].toLowerCase();
  let candidate=0;
  try {
    if(name)candidate=await createVisitCharacter(name,PlayerPedId(),()=>backupRequests[slot]!==request);
    if(backupRequests[slot]!==request)return;
    if(name&&!candidate)throw new Error('Could not create that character.');
    const key=`backupDancerModel${slot+1}`;
    if(name)SetResourceKvp(key,name);else DeleteResourceKvp(key);
    backupModels[slot]=name;
    notice(`Backup dancer ${slot+1} saved: ${name||'same as main character'}. Applies on your next visit.`);
  } catch(error) {if(backupRequests[slot]===request)notice(`Backup dancer unchanged: ${error.message}`);}
  finally {if(candidate&&DoesEntityExist(candidate))DeleteEntity(candidate);}
},false);
function prepareVisitCharacter(ped,x=(scene?.stage||ROOM).x,y=(scene?.stage||ROOM).y,visible=true) {
  const stage=scene?.stage||ROOM;
  SetEntityCollision(ped,false,false);SetEntityInvincible(ped,true);
  FreezeEntityPosition(ped,true);SetBlockingOfNonTemporaryEvents(ped,true);
  RemoveAllPedWeapons(ped,true);ClearPedTasksImmediately(ped);
  SetPedCanPlayAmbientAnims(ped,false);SetPedCanPlayAmbientBaseAnims(ped,false);SetPedCanPlayGestureAnims(ped,false);
  const p=GetEntityCoords(ped,false);
  const z=p[2]+stage.floor+.04-Math.min(GetPedBoneCoords(ped,14201,0,0,0)[2],GetPedBoneCoords(ped,52301,0,0,0)[2]);
  SetEntityCoordsNoOffset(ped,x,y,z,false,false,false);SetEntityHeading(ped,stage.heading||0);
  SetEntityVisible(ped,visible,false);
}
function hideBackupDancers(s) {
  for(const ped of s?.backups||[])if(DoesEntityExist(ped)) {
    SetEntityVisible(ped,false,false);ClearPedTasksImmediately(ped);
  }
}
function syncBackupDancers(s,r) {
  const phase=recordedPhase(r);
  for(const actor of r.stageActors||[])if(actor.ped!==r.ped&&DoesEntityExist(actor.ped)) {
    if(actor.syncId!==undefined)SetSynchronizedScenePhase(actor.syncId,phase);
    else SetEntityAnimCurrentTime(actor.ped,r.dict,r.clip,phase);
  }
}
RegisterCommand('mocaplabmodel',async (_source,args)=>{
  if(!args.length)return notice(`Visit character: ${visitModel||'your current player model'}. Use /mocaplabmodel spawn_name, or /mocaplabmodel reset.`);
  if(args.length!==1||(!validModelName(args[0])))return notice('Use /mocaplabmodel spawn_name, or /mocaplabmodel reset.');
  const request=++modelChoiceRequest,name=args[0].toLowerCase()==='reset'?'':args[0].toLowerCase();
  const currentScene=scene;
  let candidate=0;
  try {
    candidate=await createVisitCharacter(name,PlayerPedId(),()=>request!==modelChoiceRequest);
    if(request!==modelChoiceRequest)return;
    if(!candidate)throw new Error('Could not create that character.');
    const applyNow=scene===currentScene&&scene?.kind==='visit'&&!scene.loading&&scene.state==='walking';
    if(applyNow)prepareVisitCharacter(candidate);
    if(name)SetResourceKvp(visitModelKey,name);else DeleteResourceKvp(visitModelKey);
    visitModel=name;
    if(applyNow) {
      const old=preview;preview=candidate;candidate=0;
      if(old&&DoesEntityExist(old))DeleteEntity(old);
      delete scene.lastScore;updateComparisonHud(true);
    }
    notice(`Visit character saved: ${name||'your current player model'}. ${applyNow?'Updated in this room.':'Applies on your next visit.'} This choice is remembered on this FiveM installation.`);
  } catch(error) {if(request===modelChoiceRequest)notice(`Character unchanged: ${error.message}`);}
  finally {if(candidate&&DoesEntityExist(candidate))DeleteEntity(candidate);}
},false);
const ScoreMath=globalThis.MocapScore;
const configuredDelay=globalThis.MocapLabConfig?.scoringDelaySeconds;
let scoringDelaySeconds=Number.isFinite(configuredDelay)&&configuredDelay>=0&&configuredDelay<=120?configuredDelay:5;
RegisterCommand('mocaplabdelay',(_source,args)=>{
  const value=Number(args[0]);
  if(args.length!==1||!Number.isFinite(value)||value<0||value>120)
    return notice(`Use /mocaplabdelay seconds (0–120). Current delay: ${scoringDelaySeconds}s; first score check at ${scoringDelaySeconds+1}s.`);
  scoringDelaySeconds=value;
  notice(`Next replay: ${value}s delay, first score check at ${value+1}s. The current replay keeps its original delay.`);
},false);
const pointGoalPreferenceKey='pointGoalOverride';
function parsePointGoal(value) {
  if(typeof value!=='string'||!/^\d+$/.test(value.trim()))return null;
  const goal=Number(value);
  return Number.isSafeInteger(goal)&&goal>=0?goal:null;
}
let pointGoalOverride=parsePointGoal(GetResourceKvpString(pointGoalPreferenceKey));
RegisterCommand('mocaplabgoal',(_source,args)=>{
  if(!args.length||(args.length===1&&args[0]==='status'))
    return notice(`Point goal: ${pointGoalOverride===null?'automatic (50 points per available scoring second)':pointGoalOverride+' (saved override)'}. Use /mocaplabgoal points, or /mocaplabgoal reset.`);
  const reset=args.length===1&&args[0]==='reset',value=args.length===1?parsePointGoal(args[0]):null;
  if(!reset&&value===null)return notice('Use /mocaplabgoal whole_points (zero or greater), /mocaplabgoal status, or /mocaplabgoal reset.');
  if(reset)DeleteResourceKvp(pointGoalPreferenceKey);
  else SetResourceKvp(pointGoalPreferenceKey,String(value));
  pointGoalOverride=reset?null:value;
  for(const round of new Set([recordedPlayback?.score,scene?.lastScore].filter(Boolean)))
    round.goal=pointGoalOverride??round.calculatedGoal;
  updateComparisonHud(true);
  notice(reset?'Automatic point goals restored. The saved override was removed.':
    `Point goal set to ${value}. Saved on this FiveM installation across replays, reconnects and restarts. /mocaplabgoal reset restores automatic goals.`);
},false);
let hudVisible=false,hudScoreVisible=false,hudLastSent=-Infinity,hudMirrored=true,hudMusicMode='off';
let hudReady=false,hudRendered=false,hudTestUntil=0,hudLastDelivery=null;
let musicTest=null,lastMusicError='';
let lastLoopInfo='';
const crossfadePreferenceKey='backgroundCrossfadeSeconds';
const savedCrossfade=GetResourceKvpString(crossfadePreferenceKey);
let crossfadeOverride=savedCrossfade!==null&&savedCrossfade!==''&&Number.isFinite(Number(savedCrossfade))?Math.max(0,Math.min(2,Number(savedCrossfade))):null;
const musicDefaults={backgroundFile:'background.ogg',animationFile:'animation.ogg',backgroundVolume:.35,animationVolume:.7,backgroundCrossfadeSeconds:.2};
function getMusicConfig() {
  const config={...musicDefaults,...globalThis.MocapLabConfig?.music};
  const seconds=crossfadeOverride??config.backgroundCrossfadeSeconds;
  config.backgroundCrossfadeSeconds=Number.isFinite(seconds)?Math.max(0,Math.min(2,seconds)):.2;
  return config;
}
RegisterCommand('mocaplabcrossfade',(_source,args)=>{
  if(!args.length)return notice(`Background crossfade: ${getMusicConfig().backgroundCrossfadeSeconds}s (${crossfadeOverride===null?'config':'saved override'}). Use /mocaplabcrossfade 2, or /mocaplabcrossfade reset.`);
  if(args.length===1&&args[0]==='reset'){crossfadeOverride=null;DeleteResourceKvp(crossfadePreferenceKey);}
  else {
    const value=Number(args[0]);
    if(args.length!==1||args[0].trim()===''||!Number.isFinite(value)||value<0||value>2)return notice('Use /mocaplabcrossfade seconds (0–2), or /mocaplabcrossfade reset.');
    crossfadeOverride=value;SetResourceKvp(crossfadePreferenceKey,String(value));
  }
  lastLoopInfo='';lastMusicError='';updateComparisonHud(true);
  notice(`Background crossfade set to ${getMusicConfig().backgroundCrossfadeSeconds}s. This rebuilds/restarts the background loop. Use /mocaplabmusic status to verify the applied overlap. ${crossfadeOverride===null?'Config restored.':'Saved on this FiveM installation.'}`);
},false);
RegisterNuiCallbackType('mocapMusicStatus');
on('__cfx_nui:mocapMusicStatus',(data,cb)=>{
  cb({ok:true});
  if(data.kind==='error'||data.kind==='warning') {
    const text=`Music ${data.track}: ${data.detail}`;
    if(text!==lastMusicError){lastMusicError=text;notice(text);}
  } else if(data.kind==='status'||(data.kind==='playing'&&['decoded-crossfade','decoded-animation'].includes(data.backend))) {
    const loop=data.backend==='decoded-crossfade'?`requested overlap: ${Number(data.requestedCrossfadeSeconds||0).toFixed(3)}s; applied overlap: ${Number(data.crossfadeSeconds||0).toFixed(3)}s; source: ${Number(data.sourceSeconds||0).toFixed(3)}s; loop: ${Number(data.loopSeconds||0).toFixed(3)}s; context: ${data.contextState}`:
      data.backend==='decoded-animation'?`continuous animation audio; source: ${Number(data.sourceSeconds||0).toFixed(3)}s; context: ${data.contextState}`:
      `crossfade helper: ${!!data.crossfadeHelperLoaded}; Web Audio: ${!!data.webAudioSupported}`;
    if(data.kind==='playing'&&loop===lastLoopInfo)return;
    lastLoopInfo=loop;
    notice(`Music UI ${data.version}: ${data.track}; backend: ${data.backend||'older UI'}; ${loop}; paused: ${data.paused}; ready: ${data.readyState}/4; time: ${Number(data.time||0).toFixed(1)}s; volume: ${data.volume}; media error: ${data.errorCode||'none'}. ${data.detail||''}`);
    if(data.kind==='status'&&data.diagnostics) {
      const d=data.diagnostics;
      notice(`Music lifecycle: session ${d.session??'none'}; source starts ${data.starts??'n/a'}, stops ${data.stops??'n/a'}, session changes ${data.sessionChanges??'n/a'}; audio clock ${Number(data.audioClock||0).toFixed(3)}s; last start offset ${Number(data.lastStartOffset||0).toFixed(3)}s; last stop ${data.lastStopReason||'none'}; messages ${d.messages}; mode/session changes ${d.changes}; heartbeat stops ${d.watchdogStops}; message age ${d.messageAgeMs}ms.`);
      notice(`Music recent events: ${Array.isArray(d.history)?d.history.join(' | '):'none'}`);
    }
  }
});
RegisterCommand('mocaplabmusic',(_source,args)=>{
  const action=args[0]||'status';
  if(action==='stop') {musicTest=null;updateComparisonHud(true);return notice('Music test stopped; room music restored.');}
  if(action==='test'&&['background','animation','animation-loop','background-once'].includes(args[1])) {
    const kind=args[1],mode=kind==='animation-loop'?'background':kind==='background-once'?'animation':kind;
    const fileKind=kind==='animation-loop'?'animation':kind==='background-once'?'background':kind;
    musicTest={mode,fileKind,zeroOverlap:kind==='animation-loop',startedAt:GetGameTimer(),until:GetGameTimer()+10000};
    lastMusicError='';updateComparisonHud(true);
    return notice(`Testing ${args[1]} music for 10 seconds. /mocaplabmusic status shows file and playback details.`);
  }
  if(action!=='status')return notice('Use /mocaplabmusic status, /mocaplabmusic test background|animation|animation-loop|background-once, or /mocaplabmusic stop.');
  const config=getMusicConfig(),resource=GetCurrentResourceName();
  for(const track of ['background','animation']) {
    const file=config[`${track}File`],content=typeof file==='string'&&file?LoadResourceFile(resource,`audio/${file}`):null;
    const format=content?.startsWith('OggS')?'OGG':content?.startsWith('ID3')?'MP3':content?.startsWith('RIFF')?'WAV':'unknown';
    notice(`Music ${track}: audio/${file||'(disabled)'}; ${content?'file found':'FILE MISSING or disabled'}; header: ${format}; volume: ${config[`${track}Volume`]}.`);
  }
  const hudSource=LoadResourceFile(resource,'hud/hud.js')||'';
  notice(`Music client 0.3.23; HUD ready: ${hudReady}; mode: ${hudMusicMode}; requested crossfade: ${config.backgroundCrossfadeSeconds}s (${crossfadeOverride===null?'config':'saved override'}); bundled crossfade: ${hudSource.includes('MOCAP_CROSSFADE_BUNDLED')?'found':'MISSING / older HUD'}. Waiting for audio UI status…`);
  SendNuiMessage(JSON.stringify({type:'mocapMusicQuery'}));
},false);
RegisterNuiCallbackType('mocapHudReady');
on('__cfx_nui:mocapHudReady',(_data,cb)=>{
  hudReady=true;cb({ok:true});updateComparisonHud(true);
});
RegisterNuiCallbackType('mocapHudRendered');
on('__cfx_nui:mocapHudRendered',(_data,cb)=>{hudRendered=true;cb({ok:true});});
function updateComparisonHud(force=false) {
  const now=GetGameTimer();
  const visible=(scene?.kind==='visit'&&!!scene.camera)||now<hudTestUntil;
  const score=recordedPlayback?.score||scene?.lastScore;
  const scoreVisible=scene?.kind==='visit'&&!!score;
  const visiting=scene?.kind==='visit'&&!scene.loading;
  const visitMusicScheduled=visiting&&scene.musicStartedAt!==undefined;
  const visitMusicStarted=visitMusicScheduled&&now>=scene.musicStartedAt;
  if(musicTest&&now>=musicTest.until)musicTest=null;
  // Waiting pauses both tracks without resetting the background loop position.
  const musicMode=musicTest?.mode||(visiting?(visitMusicScheduled?(visitMusicStarted?'animation':'waiting'):
    recordedPlayback?.startedAt!==undefined?'animation':'background'):'off');
  if(!force&&musicMode===hudMusicMode&&visible===hudVisible&&scoreVisible===hudScoreVisible&&
    ((!visible&&!scoreVisible&&musicMode==='off')||now-hudLastSent<(visible||scoreVisible?50:500)))return;
  hudMusicMode=musicMode;
  hudVisible=visible;hudScoreVisible=scoreVisible;hudLastSent=now;
  const fresh=now-received<=CONFIG.timeoutMs;
  const skeleton=fresh?pose?.skeleton:null;
  const r=recordedPlayback;
  const progressSeconds=r?.startedAt!==undefined?Math.max(0,Math.min(r.duration,recordedPhase(r)*r.duration)):0;
  const countdown=visible&&r?.score?ScoreMath.timing(r.score.delaySeconds,progressSeconds).countdown:null;
  const hasJoints=skeleton?.points.some(p=>p&&p[2]>=.6);
  const musicConfig=getMusicConfig();
  const fileKind=musicTest?.fileKind||musicMode;
  const file=musicConfig[`${fileKind}File`];
  const musicFile=typeof file==='string'&&/^[a-zA-Z0-9_ -]+\.(ogg|mp3|wav)$/i.test(file)?file:null;
  const volume=musicConfig[`${fileKind}Volume`];
  hudLastDelivery=SendNuiMessage(JSON.stringify({type:'mocapComparison',visible,mirrored:hudMirrored,countdown,
    music:{mode:musicMode,file:musicFile,volume:Number.isFinite(volume)?Math.max(0,Math.min(1,volume)):.5,
      crossfadeSeconds:musicTest?.zeroOverlap?0:musicConfig.backgroundCrossfadeSeconds,
      seconds:musicMode==='animation'?(musicTest?(now-musicTest.startedAt)/1000:visitMusicStarted?(now-scene.musicStartedAt)/1000:progressSeconds):0,
      session:musicTest?.startedAt??(musicMode==='animation'?(visitMusicStarted?scene.musicStartedAt:r?.startedAt):null)},
    scoreVisible,score:score?{total:score.total,goal:score.goal,lastPoints:score.lastPoints,samples:score.samples,
      skipped:score.skipped,status:score.status,finished:!recordedPlayback}:null,
    skeleton:hasJoints?skeleton:null,
    status:hasJoints?'live':fresh&&pose?'untracked':pose?'stale':'disconnected',
    elapsed:r?.startedAt!==undefined?Math.min(r.duration,(now-r.startedAt)/1000):0,
    duration:r?.duration||0}));
}
RegisterCommand('mocaplabhud',(_source,args)=>{
  if(args[0]==='test') {
    hudTestUntil=GetGameTimer()+10000;updateComparisonHud(true);
    return notice('Showing the skeleton HUD for 10 seconds, even without a camera. Then use /mocaplabhud status.');
  }
  if(args[0]==='status') {
    const resource=GetCurrentResourceName();
    const missing=['hud/index.html','hud/hud.css','hud/hud.js'].filter(file=>!LoadResourceFile(resource,file));
    const uiPage=GetResourceMetadata(resource,'ui_page',0)||'MISSING';
    return notice(`HUD client 0.3.23 | ui_page: ${uiPage} | missing files: ${missing.join(', ')||'none'} | page ready: ${hudReady} | panel rendered: ${hudRendered} | message accepted: ${hudLastDelivery} | scene: ${scene?.kind||mode||'none'} | camera: ${!!scene?.camera} | skeleton age: ${pose?GetGameTimer()-received+'ms':'no camera packets'}.`);
  }
  if(args[0]!=='mirror')return notice('Use /mocaplabhud test, /mocaplabhud status, or /mocaplabhud mirror.');
  hudMirrored=!hudMirrored;updateComparisonHud(true);
  notice(`Skeleton HUD: ${hudMirrored?'mirrored':'camera'} view.`);
},false);
const notice = text => {
  console.log(`[webcam_mocap_animlab] ${text}`);
  emit('chat:addMessage', { color: [90, 210, 180], args: ['Mocap', text] });
};
// Prototype clip retained only for explicit diagnostic comparisons.
// The default backend uses the GTA crouched movement graph.
const BODY_CLIP={dict:'move_crouch_proto',clip:'idle_intro',phaseStart:0.03,phaseEnd:0.97,
  smoothingSeconds:0.14,holdMs:350,fadeMs:650};
let bodyAnimation=null;
let recordedPlayback=null,recordedLoad=0;
let groundingOverride=null,lastGroundingReport='No recorded grounding samples yet.';
function recordedPhase(r) {
  const actor=r.stageActors?.find(actor=>actor.ped===r.ped);
  return actor?.syncId!==undefined?GetSynchronizedScenePhase(actor.syncId):GetEntityAnimCurrentTime(r.ped,r.dict,r.clip);
}
function setRecordedOrigin(actor,z) {
  if(actor.syncId!==undefined) {
    SetSynchronizedSceneOrigin(actor.syncId,actor.base[0],actor.base[1],z,0,0,actor.heading,false);
    actor.originZ=z;
  } else {
    const p=groundingVector(GetEntityCoords(actor.ped,false));
    if(p)SetEntityCoordsNoOffset(actor.ped,p[0],p[1],z,true,true,false);
  }
}
function groundingVector(v) {
  if(!v)return null;
  const result=v[0]!==undefined?[v[0],v[1],v[2]]:[v.x,v.y,v.z];
  return result.every(Number.isFinite)?result:null;
}
function animatedFoot(ped,bone) {
  if(typeof GetWorldPositionOfEntityBone==='function'&&typeof GetPedBoneIndex==='function') {
    const index=GetPedBoneIndex(ped,bone);
    if(Number.isInteger(index)&&index>0) {
      const p=groundingVector(GetWorldPositionOfEntityBone(ped,index));
      if(p)return {p,source:'entity-bone'};
    }
  }
  return {p:groundingVector(GetPedBoneCoords(ped,bone,0,0,0)),source:'ped-bone'};
}
function configureGrounding(r,enabled) {
  if(!enabled) {
    for(const actor of r.grounding||[])if(DoesEntityExist(actor.ped))setRecordedOrigin(actor,actor.base[2]);
    delete r.grounding;return;
  }
  r.grounding=r.stageActors;
}
RegisterCommand('mocaplabground',(_source,args)=>{
  const r=recordedPlayback;
  if(['on','off'].includes(args[0])&&args.length===1) {
    groundingOverride=args[0]==='on';
    if(r?.stageActors)configureGrounding(r,groundingOverride);
    notice(`Recorded foot grounding ${groundingOverride?'enabled':'disabled'} until resource restart.`);
  } else if(args.length&&args[0]!=='status')return notice('Use /mocaplabground on, off, or status.');
  notice(`Grounding client 0.3.23; active: ${!!r?.grounding}; ${lastGroundingReport}`);
},false);
function stopRecordedPlayback() {
  recordedLoad++;
  hideBackupDancers(scene);
  if(scene?.kind==='visit')setClubLighting(scene,false);
  const old=recordedPlayback;recordedPlayback=null;
  if(!old)return;
  if(DoesEntityExist(old.ped))StopAnimTask(old.ped,old.dict,old.clip,4);
  for(const actor of old.stageActors||[]) {
    if(actor.syncId!==undefined) {
      // Release the non-looping local scene once its actor leaves it. There is
      // no disposal native for local scenes; the engine owns their lifetime.
      SetSynchronizedSceneHoldLastFrame(actor.syncId,false);
      SetSynchronizedScenePhase(actor.syncId,1);SetSynchronizedSceneRate(actor.syncId,1);
    }
    if(DoesEntityExist(actor.ped)&&(actor.syncId!==undefined||old.grounding)) {
      ClearPedTasksImmediately(actor.ped);
      SetEntityCoordsNoOffset(actor.ped,...actor.base,false,false,false);
      SetEntityHeading(actor.ped,actor.heading);
      FreezeEntityPosition(actor.ped,actor.wasFrozen);
    }
  }
  RemoveAnimDict(old.dict);
}
function updateRecordedGrounding() {
  const r=recordedPlayback;
  if(r?.startedAt===undefined)return;
  for(const actor of r.grounding||[]) {
    if(!DoesEntityExist(actor.ped))continue;
    const p=groundingVector(GetEntityCoords(actor.ped,false));
    const l=animatedFoot(actor.ped,14201),right=animatedFoot(actor.ped,52301),left=l.p;
    if(!p||!left||!right.p) {
      if(actor.ped===r.ped)lastGroundingReport='Invalid position/foot coordinates; correction skipped.';
      continue;
    }
    // A raised single foot stays free. If both legs bend upwards, lower the
    // actor by the missing height to keep the support foot on the stage.
    // Scene tasks own their playback origin; teleporting just the ped can be
    // overwritten at the next animation evaluation. Move that origin instead.
    const origin=actor.syncId!==undefined?actor.originZ:p[2];
    const footError=actor.floor-Math.min(left[2],right.p[2]);
    const desired=origin+footError;
    const z=Math.max(actor.base[2]-1.5,Math.min(actor.base[2]+1.5,desired));
    if(Math.abs(z-origin)>.0005)setRecordedOrigin(actor,z);
    if(actor.ped===r.ped) {
      const after=groundingVector(GetEntityCoords(actor.ped,false));
      const movement=actor.syncId!==undefined?`origin Z: ${actor.originZ.toFixed(3)}`:`actual shift: ${after?(after[2]-p[2]).toFixed(3):'unknown'}m`;
      lastGroundingReport=`feet source: ${l.source}; backend: ${actor.syncId!==undefined?'synchronized-scene':'entity fallback'}; left Z: ${left[2].toFixed(3)}, right Z: ${right.p[2].toFixed(3)}, target Z: ${actor.floor.toFixed(3)}; foot error before correction: ${(-footError).toFixed(3)}m; requested shift: ${(z-origin).toFixed(3)}m; ${movement}; total height offset: ${(actor.syncId!==undefined?actor.originZ-actor.base[2]:after?after[2]-actor.base[2]:0).toFixed(3)}m. Contact is measured on the next animation evaluation.`;
    }
  }
}
RegisterCommand('mocaplabplay',async (_source,args)=>{
  if(args[0]==='stop') {
    if(scene?.kind==='visit'&&['waiting','starting','playing'].includes(scene.state))endVisitPlayback(scene);
    else stopRecordedPlayback();
    return notice('Recorded animation stopped.');
  }
  if(mode!=='preview'||!preview)return notice('Start /mocaplab preview first.');
  const [dict,clip]=args;
  if(!dict||!clip||![dict,clip].every(n=>/^[a-zA-Z0-9_@.-]{1,80}$/.test(n)))
    return notice('Use /mocaplabplay dictionary clip, e.g. /mocaplabplay webcam_recording webcam_take.');
  await playRecording(dict,clip);
},false);
async function playRecording(dict,clip) {
  dict=recordedDictionary(dict);
  stopRecordedPlayback();
  const request=recordedLoad,ped=preview;
  recordedPlayback={dict,clip,ped};
  RequestAnimDict(dict);const began=GetGameTimer();
  while(!HasAnimDictLoaded(dict)&&recordedLoad===request&&GetGameTimer()-began<5000)
    await new Promise(resolve=>setTimeout(resolve,0));
  if(recordedLoad!==request)return;
  if(!HasAnimDictLoaded(dict)||GetAnimDuration(dict,clip)<=0) {
    stopRecordedPlayback();return notice(recordedClipMissing(dict));
  }
  if(bodyAnimation) {
    resetCrouch(bodyAnimation);
    if(bodyAnimation.started)StopAnimTask(ped,BODY_CLIP.dict,BODY_CLIP.clip,4);
  }
  // Own the full body during replay: live crouch and IK cannot overwrite it.
  // The native's misleadingly named playbackRate argument is the initial
  // phase here: 1 can start at the end and immediately hold the final pose.
  // Start at zero; set actual speed separately once the task is active.
  ClearPedTasksImmediately(ped);
  SetPedCanPlayAmbientAnims(ped,false);
  SetPedCanPlayAmbientBaseAnims(ped,false);
  SetPedCanPlayGestureAnims(ped,false);
  // Stage actors are already frozen and collision-free. Override-physics mode
  // can let the animation mover compete with our scripted height correction.
  const flags=2|8|512|2048|1073741824; // hold end, uninterrupted, full blending
  const dancers=mode==='visit'?(scene?.backups||[]):[];
  const useScenes=typeof CreateSynchronizedScene==='function'&&typeof TaskSynchronizedScene==='function'&&
    typeof SetSynchronizedSceneOrigin==='function'&&typeof SetSynchronizedScenePhase==='function'&&
    typeof GetSynchronizedScenePhase==='function'&&typeof SetSynchronizedSceneRate==='function'&&
    typeof SetSynchronizedSceneLooped==='function'&&typeof SetSynchronizedSceneHoldLastFrame==='function';
  const floor=(scene?.stage||ROOM).floor+.04;
  const actors=recordedPlayback.stageActors=[ped,...dancers].filter(actor=>DoesEntityExist(actor)).map(actor=>({
    ped:actor,base:[...GetEntityCoords(actor,false)],heading:GetEntityHeading(actor),
    wasFrozen:!!IsEntityPositionFrozen(actor),floor}));
  try {
    for(const actor of actors) {
      if(useScenes) {
        const id=CreateSynchronizedScene(...actor.base,0,0,actor.heading,2);
        if(!Number.isInteger(id)||id<0)throw new Error('Could not allocate a local playback scene.');
        actor.syncId=id;actor.originZ=actor.base[2];
        SetSynchronizedSceneLooped(id,false);SetSynchronizedSceneHoldLastFrame(id,true);
        FreezeEntityPosition(actor.ped,false);
        TaskSynchronizedScene(actor.ped,id,dict,clip,8,-8,0,0,1000,0);
      } else TaskPlayAnim(actor.ped,dict,clip,8,-8,-1,flags,0,false,false,false);
    }
  } catch(error) {
    stopRecordedPlayback();notice(`Recorded playback failed: ${error.message}`);return;
  }
  const started=GetGameTimer();
  while(recordedLoad===request&&!IsEntityPlayingAnim(ped,dict,clip,3)&&GetGameTimer()-started<1500)
    await new Promise(resolve=>setTimeout(resolve,0));
  if(recordedLoad!==request)return;
  if(!IsEntityPlayingAnim(ped,dict,clip,3)) {
    stopRecordedPlayback();return notice('Recorded animation did not start. Check F8 for errors and confirm the exported clip contains animation frames.');
  }
  for(const actor of actors)if(DoesEntityExist(actor.ped)) {
    if(actor.syncId!==undefined) {
      SetSynchronizedScenePhase(actor.syncId,0);SetSynchronizedSceneRate(actor.syncId,1);
    } else {
      SetEntityAnimCurrentTime(actor.ped,dict,clip,0);SetEntityAnimSpeed(actor.ped,dict,clip,1);
    }
    if(actor.ped!==ped)SetEntityVisible(actor.ped,true,false);
  }
  recordedPlayback.startedAt=GetGameTimer();
  recordedPlayback.duration=GetAnimDuration(dict,clip);
  configureGrounding(recordedPlayback,groundingOverride ?? (globalThis.MocapLabConfig?.groundRecordedFeet!==false));
  if(mode==='visit') {
    recordedPlayback.score=ScoreMath.newRound(scoringDelaySeconds,recordedPlayback.duration);
    recordedPlayback.score.calculatedGoal=recordedPlayback.score.goal;
    recordedPlayback.score.goal=pointGoalOverride??recordedPlayback.score.calculatedGoal;
    if(scene){delete scene.lastScore;setClubLighting(scene,true);}
  }
  notice('Playing recorded animation; camera-driven body and hand targets are suspended. /mocaplabplay stop resumes them.');
  return true;
}
RegisterCommand('mocaplabplayinfo',()=>{
  const r=recordedPlayback;
  if(!r)return notice('No recorded animation is active.');
  const duration=GetAnimDuration(r.dict,r.clip),phase=recordedPhase(r);
  notice(`Recorded playback: ${r.dict} / ${r.clip} · duration ${duration.toFixed(3)}s · position ${(phase*100).toFixed(1)}% · playing ${!!IsEntityPlayingAnim(r.ped,r.dict,r.clip,3)} · grounded feet: ${!!r.grounding}.`);
},false);
function recordedDictionary(dict) {
  return globalThis.MocapLabConfig?.mirrorRecordedAnimation===true&&!dict.endsWith('_mirrored')?dict+'_mirrored':dict;
}
function recordedClipMissing(dict) {
  return `Recorded clip unavailable in ${dict}. ${globalThis.MocapLabConfig?.mirrorRecordedAnimation===true?'Export and compile the mirrored dictionary, install it in stream, or set mirrorRecordedAnimation: false.':'Compile the .ycd.xml to .ycd and put it in stream.'} Restart the resource after installing it.`;
}
function animatedHandPositions(ped) {
  const point=bone=>GetPedBoneCoords(ped,bone,0,0,0);
  const a=point(58271),b=point(51826);
  return ScoreMath.relativeHands({leftShoulder:point(45509),rightShoulder:point(40269),
    hips:a.map((n,i)=>(n+b[i])/2),leftElbow:point(61163),rightElbow:point(28252),
    leftHand:point(18905),rightHand:point(57005)});
}
function updateRecordingScore() {
  const r=recordedPlayback;
  if(mode!=='visit'||!r?.score||r.startedAt===undefined||!DoesEntityExist(r.ped))return;
  const seconds=Math.max(0,Math.min(r.duration,recordedPhase(r)*r.duration));
  const timing=ScoreMath.timing(r.score.delaySeconds,seconds);
  if(timing.phase!=='scoring') {r.score.status=timing.phase;return;}
  if(Math.floor(timing.scoreSeconds+1e-5)<r.score.nextSecond)return;
  const live=GetGameTimer()-received<=250?pose?.handMatch:null;
  ScoreMath.sample(r.score,timing.scoreSeconds,live,animatedHandPositions(r.ped));
}
let bodyBackend='crouch', ikMode='hands';
const CROUCH_SET='move_ped_crouched';
function resetCrouch(d) {
  if(!d||!DoesEntityExist(d.ped))return;
  ResetPedMovementClipset(d.ped,0.35);
  ResetPedStrafeClipset(d.ped);
  d.crouched=false;d.active=false;
}
function stopBodyAnimation() {
  const previous=bodyAnimation;bodyAnimation=null;
  if(!previous)return;
  resetCrouch(previous);
  if(previous.crouchLoaded)RemoveAnimSet(CROUCH_SET);
  if(previous.started && DoesEntityExist(previous.ped))StopAnimTask(previous.ped,BODY_CLIP.dict,BODY_CLIP.clip,4);
  if(previous.loaded)RemoveAnimDict(BODY_CLIP.dict);
}
async function prepareBodyAnimation(ped,generation) {
  const driver={ped,ready:false,started:false,enabled:true,manual:null,current:0,lastValue:0,lastGood:null,
    lastPoseSeq:-1,attempts:0,lastRetry:0,active:false,phase:BODY_CLIP.phaseStart,error:null};
  bodyAnimation=driver;
  RequestAnimSet(CROUCH_SET);
  const crouchBegan=GetGameTimer();
  while(!HasAnimSetLoaded(CROUCH_SET)&&generation===creating&&GetGameTimer()-crouchBegan<5000) {
    await new Promise(resolve=>setTimeout(resolve,0));
  }
  if(generation!==creating||bodyAnimation!==driver)return;
  driver.crouchLoaded=!!HasAnimSetLoaded(CROUCH_SET);
  RequestAnimDict(BODY_CLIP.dict);
  const began=GetGameTimer();
  while(!HasAnimDictLoaded(BODY_CLIP.dict)&&generation===creating&&GetGameTimer()-began<5000) {
    await new Promise(resolve=>setTimeout(resolve,0));
  }
  if(generation!==creating||bodyAnimation!==driver)return;
  driver.loaded=HasAnimDictLoaded(BODY_CLIP.dict);
  driver.clipReady=!!driver.loaded&&GetAnimDuration(BODY_CLIP.dict,BODY_CLIP.clip)>0;
  if(!driver.crouchLoaded) {
    driver.error='Crouch movement set is unavailable on this game build.';
    notice(driver.error+' Hand tracking remains available.');return;
  }
  driver.ready=true;
  notice('Animation lab ready. Test /mocaplabpose 0 then /mocaplabpose 1; /mocaplabpose auto uses the camera.');
}
function bodyAnimationSnapshot() {
  const d=bodyAnimation;
  return d?{active:!!(d.ready&&d.enabled&&d.active),amount:d.current,phase:d.phase,manual:d.manual!==null}:null;
}
function updateBodyAnimation() {
  if(recordedPlayback)return;
  const d=bodyAnimation;
  if(!d||!d.ready||!d.enabled||mode!=='preview'||!DoesEntityExist(d.ped))return;
  const now=GetGameTimer();
  const input=pose?.tracked&&now-received<=CONFIG.timeoutMs?pose.bodyBlend:null;
  if(input?.confidence>=0.6&&pose.seq!==d.lastPoseSeq) {
    d.lastPoseSeq=pose.seq;d.lastValue=input.amount;d.lastGood=received;
  }
  const age=d.lastGood===null?Infinity:now-d.lastGood;
  const release=Math.max(0,Math.min(1,(age-BODY_CLIP.holdMs)/BODY_CLIP.fadeMs));
  const cameraTarget=age===Infinity?0:d.lastValue*(1-release*release*(3-2*release));
  const desired=d.manual===null?cameraTarget:d.manual;
  const alpha=1-Math.exp(-Math.min(GetFrameTime(),0.1)/BODY_CLIP.smoothingSeconds);
  d.current+=(desired-d.current)*alpha;
  d.phase=BODY_CLIP.phaseStart+(BODY_CLIP.phaseEnd-BODY_CLIP.phaseStart)*d.current;
  if(bodyBackend==='crouch') {
    // Use GTA's actual crouched idle/movement graph, not an unverified prototype
    // intro clip. Hysteresis prevents noisy knee measurements toggling the task.
    const crouched=d.crouched?d.current>0.35:d.current>=0.55;
    if(crouched!==!!d.crouched) {
      if(crouched) {
        SetPedStealthMovement(d.ped,false,'DEFAULT_ACTION');
        SetPedMovementClipset(d.ped,CROUCH_SET,0.35);
        d.crouched=true;
      } else resetCrouch(d);
    }
    SetPedCanPlayAmbientAnims(d.ped,false);
    d.active=true;
    return;
  }
  if(!d.clipReady)return;
  d.active=!!IsEntityPlayingAnim(d.ped,BODY_CLIP.dict,BODY_CLIP.clip,3);
  if(!d.active) {
    if(d.attempts===0||now-d.lastRetry>=1000) {
      if(d.attempts>=3) {
        d.ready=false;d.error='Animation task did not stay active; inspect /mocaplabstatus.';
        notice(d.error);return;
      }
      // Hold last frame; override physics; ignore gravity. No root-offset or
      // mover-extraction flags and no entity-position writes during posing.
      TaskPlayAnim(d.ped,BODY_CLIP.dict,BODY_CLIP.clip,8,-8,-1,3074,1,false,false,false);
      d.started=true;d.attempts++;d.lastRetry=now;
    }
    return;
  }
  SetEntityAnimCurrentTime(d.ped,BODY_CLIP.dict,BODY_CLIP.clip,d.phase);
  SetEntityAnimSpeed(d.ped,BODY_CLIP.dict,BODY_CLIP.clip,0);
}
RegisterCommand('mocaplabpose',(_source,args)=>{
  const d=bodyAnimation;
  if(!d)return notice('Start /mocaplab preview first.');
  const action=args[0]||'auto';
  if(action==='off') {
    d.enabled=false;d.active=false;
    resetCrouch(d);
    if(d.started)StopAnimTask(d.ped,BODY_CLIP.dict,BODY_CLIP.clip,4);
    return notice('Body backend off; hand/wrist tracking remains active.');
  }
  const value=Number(action);
  if(action!=='auto'&&(!Number.isFinite(value)||value<0||value>1))return notice('Use /mocaplabpose 0..1, auto, or off.');
  d.enabled=true;d.manual=action==='auto'?null:value;d.attempts=0;
  filtered={};handRotations={};
  notice(d.manual===null?'Body animation follows camera knee bend. Head IK is off by default.':`Manual crouch: ${Math.round(value*100)}%.`);
},false);
RegisterCommand('mocaplabbackend',(_source,args)=>{
  const choice=args[0];
  if(!['crouch','clip'].includes(choice))return notice('Use /mocaplabbackend crouch or clip (experimental).');
  const d=bodyAnimation;
  if(d) {
    resetCrouch(d);
    if(d.started)StopAnimTask(d.ped,BODY_CLIP.dict,BODY_CLIP.clip,4);
    d.started=false;d.attempts=0;
  }
  bodyBackend=choice;
  notice(`Body backend: ${choice}. Crouch blends standing/crouched states; clip is an unverified diagnostic.`);
},false);
RegisterCommand('mocaplabik',(_source,args)=>{
  if(!['off','hands','all'].includes(args[0]))return notice('Use /mocaplabik off, hands, or all. Head targeting is experimental.');
  ikMode=args[0];filtered={};handRotations={};
  notice(`IK: ${ikMode}. Manual body tests always suspend IK.`);
},false);
RegisterCommand('mocaplabclip',(_source,args)=>{
  const a=Number(args[0]),b=Number(args[1]);
  if(!Number.isFinite(a)||!Number.isFinite(b)||a<0||a>1||b<0||b>1||Math.abs(a-b)<0.05) {
    return notice('Use /mocaplabclip start end (0..1), e.g. /mocaplabclip 0.03 0.97.');
  }
  BODY_CLIP.phaseStart=a;BODY_CLIP.phaseEnd=b;
  notice(`Clip phase range ${a} → ${b}. Reverse the values if crouch direction is inverted.`);
},false);
RegisterCommand('mocaplabstatus',()=>{
  const d=bodyAnimation;
  notice(d?JSON.stringify({backend:bodyBackend,ik:ikMode,crouched:!!d.crouched,dictionary:BODY_CLIP.dict,clip:BODY_CLIP.clip,ready:d.ready,enabled:d.enabled,
    playing:d.active,crouch:d.current,phase:d.phase,error:d.error}):'No animation-lab scene active.');
},false);
function stop() {
  musicTest=null;
  hudTestUntil=0;
  creating++;
  stopRecordedPlayback();
  stopBodyAnimation();
  for (const entity of Object.values(handTargets)) if (DoesEntityExist(entity)) DeleteEntity(entity);
  handTargets = {}; handRotations = {}; handHistory = {};
  if (scene) {
    const previous = scene;
    scene = null;
    if (previous.camera) {
      RenderScriptCams(false, false, 0, true, false);
      DestroyCam(previous.camera, false);
    }
    ClearFocus();
    if (DoesEntityExist(previous.player)) {
      if(previous.returnPosition) {
        RequestCollisionAtCoord(...previous.returnPosition);
        SetEntityCoordsNoOffset(previous.player,...previous.returnPosition,false,false,false);
        SetEntityHeading(previous.player,previous.returnHeading);
      }
      FreezeEntityPosition(previous.player, previous.wasFrozen);
    }
    if(previous.platform&&DoesEntityExist(previous.platform))DeleteEntity(previous.platform);
    for(const dancer of previous.backups||[])if(DoesEntityExist(dancer))DeleteEntity(dancer);
    releaseVisitClub(previous);
    if(previous.kind==='visit')RemoveAnimDict(previous.dict);
    // Visibility and HUD hiding only apply for one frame, so automatically restore.
  }
  if (preview && DoesEntityExist(preview)) DeleteEntity(preview);
  preview = 0; mode = null; pose = null; filtered = {}; armRig = null; acknowledgedSeq = -1;
  updateComparisonHud(true);
  // IK targets expire each update. Visits restore their saved return position.
}
function quad(a, b, c, d, color) {
  // Both windings ensure room surfaces are visible from the inside.
  for (const [p, q, r] of [[a,b,c], [a,c,d], [c,b,a], [d,c,a]]) {
    DrawPoly(...p, ...q, ...r, ...color, 255);
  }
}
function drawRoom() {
  if(scene?.kind==='visit'){drawClubLights(scene);return;}
  const { x, y, floor: z, halfWidth: w, halfDepth: d, height: h } = ROOM;
  const a = [x-w,y-d,z], b = [x+w,y-d,z], c = [x+w,y+d,z], e = [x-w,y+d,z];
  const A = [x-w,y-d,z+h], B = [x+w,y-d,z+h], C = [x+w,y+d,z+h], E = [x-w,y+d,z+h];
  quad(a,b,c,e,[180,184,190]);
  quad(A,E,C,B,[225,228,232]);
  quad(a,A,B,b,[210,214,220]);
  quad(e,c,C,E,[210,214,220]);
  quad(a,e,E,A,[200,205,212]);
  quad(b,B,C,c,[200,205,212]);
  DrawLightWithRange(x, y+2, z+2.8, 255, 245, 235, 10, 3);
  DrawLightWithRange(x-2, y, z+2, 225, 235, 255, 8, 1.5);
}
function startScene(player) {
  if (IsPedInAnyVehicle(player, false) || IsEntityDead(player)) throw new Error('Start mocap while alive and on foot.');
  scene = { player, wasFrozen: IsEntityPositionFrozen(player), camera: 0 };
  FreezeEntityPosition(player, true);
  SetEntityCoordsNoOffset(preview, ROOM.x, ROOM.y, ROOM.floor+1, false, false, false);
  SetEntityHeading(preview, 0); // Ped faces +Y; the camera is directly in front on +Y.
  // Measure the cloned model, so taller/shorter peds stand on the same floor.
  const left = GetPedBoneCoords(preview, 14201, 0, 0, 0); // SKEL_L_Foot
  const right = GetPedBoneCoords(preview, 52301, 0, 0, 0); // SKEL_R_Foot
  const feet = Math.min(left[2], right[2]);
  const position = GetEntityCoords(preview, false);
  const adjustedZ = position[2] + ROOM.floor + 0.04 - feet;
  SetEntityCoordsNoOffset(preview, ROOM.x, ROOM.y, adjustedZ, false, false, false);
  createSceneCamera();
}
function createSceneCamera() {
  const stage=scene?.stage||ROOM;
  const head = GetPedBoneCoords(preview, 31086, 0, 0, 0);
  const eyeZ = head[2] + 0.07;
  const point=stagePoint(stage,0,stage.cameraDistance,eyeZ);
  scene.camera = CreateCamWithParams('DEFAULT_SCRIPTED_CAMERA', ...point,
    0, 0, (stage.heading||0)+180, stage.fov, true, 2);
  if (!scene.camera) throw new Error('Could not create the minigame camera.');
  // Horizontal sightline at the character's eye height, rather than a downward tilt.
  PointCamAtCoord(scene.camera, stage.x, stage.y, eyeZ);
  SetCamNearClip(scene.camera, 0.05);
  SetCamFarClip(scene.camera, 30);
  SetFocusPosAndVel(stage.x, stage.y, stage.floor+1.5, 0, 0, 0);
  RenderScriptCams(true, false, 0, true, false);
}
function updateScene() {
  if (!scene) return true;
  if (PlayerPedId() !== scene.player || !DoesEntityExist(scene.player) || IsEntityDead(scene.player) ||
      (!scene.loading&&(!preview || !DoesEntityExist(preview)))) { stop(); return false; }
  if(scene.kind==='visit') {
    muteVisitClubAudio(scene);
    if(maintainVisitClub(scene))updateVisit();
    if(!scene||!scene.camera) {if(scene)drawRoom();return !!scene;}
  }
  SetEntityLocallyInvisible(scene.player);
  HideHudAndRadarThisFrame();
  DisableAllControlActions(0);
  // Keep chat (/mocaplab stop), pause, and the F8 console usable.
  [245, 199, 200].forEach(control => EnableControlAction(0, control, true));
  DisablePlayerFiring(PlayerId(), true);
  drawRoom();
  return true;
}
function endVisitPlayback(s) {
  if(scene!==s)return;
  delete s.musicStartedAt;
  if(recordedPlayback?.score)s.lastScore=recordedPlayback.score;
  stopRecordedPlayback();
  if(s.camera) {
    RenderScriptCams(false,false,0,true,false);
    DestroyCam(s.camera,false);s.camera=0;
  }
  ClearFocus();
  FreezeEntityPosition(s.player,false);
  ClearPedTasksImmediately(preview);
  s.state='walking';s.armed=false;
  updateComparisonHud(true);
  notice('Animation finished. Walk away, then approach again to replay. /mocaplabvisit stop returns you to your starting location.');
}
function triggerVisit(s) {
  s.state='waiting';s.armed=false;
  const configured=globalThis.MocapLabConfig?.animationStartDelaySeconds;
  const offset=Number.isFinite(configured)&&Math.abs(configured)<=120?configured:0;
  s.startDelaySeconds=Math.max(0,offset);
  s.animationStartAt=GetGameTimer()+s.startDelaySeconds*1000;
  delete s.lastScore;
  FreezeEntityPosition(s.player,true);
  try {
    createSceneCamera();
    s.musicStartedAt=GetGameTimer()+Math.max(0,-offset)*1000;
    updateComparisonHud(true);
    if(s.startDelaySeconds===0)void startVisitAnimation(s);
  } catch(error) {
    if(scene===s) {endVisitPlayback(s);notice(`Could not start the viewing camera: ${error.message}`);}
  }
}
async function startVisitAnimation(s) {
  if(scene!==s||s.state!=='waiting')return;
  s.state='starting';
  try {
    const ok=await playRecording(s.dict,s.clip);
    if(scene!==s)return;
    if(!ok) {endVisitPlayback(s);return;}
    s.state='playing';
  } catch(error) {
    if(scene===s) {endVisitPlayback(s);notice(`Could not start the animation: ${error.message}`);}
  }
}
function updateVisit() {
  const s=scene;
  if(s.loading)return;
  if(s.state==='waiting') {
    if(GetGameTimer()>=s.animationStartAt)void startVisitAnimation(s);
    return;
  }
  if(s.state==='playing') {
    const r=recordedPlayback;
    if(r)syncBackupDancers(s,r);
    if(!r||GetGameTimer()-r.startedAt>=r.duration*1000||
      (GetGameTimer()-r.startedAt>100&&recordedPhase(r)>=.99999))endVisitPlayback(s);
    return;
  }
  if(s.state!=='walking')return;
  const p=GetEntityCoords(s.player,false);
  // Keep the player in a small dance-floor area, away from stairs and the DJ booth.
  const stage=s.stage,angle=stage.heading*Math.PI/180,c=Math.cos(angle),sin=Math.sin(angle);
  const dx=p[0]-stage.x,dy=p[1]-stage.y,side=dx*c+dy*sin,forward=-dx*sin+dy*c;
  const boundedSide=Math.max(-stage.halfWidth,Math.min(stage.halfWidth,side));
  const boundedForward=Math.max(-stage.halfDepth,Math.min(stage.halfDepth,forward));
  const [x,y]=stagePoint(stage,boundedSide,boundedForward);
  if(Math.abs(x-p[0])>.001||Math.abs(y-p[1])>.001||p[2]<stage.floor-.3||p[2]>stage.floor+stage.height)
    SetEntityCoordsNoOffset(s.player,x,y,s.walkZ,false,false,false);
  DisablePlayerFiring(PlayerId(),true);
  [24,25,37,140,141,142].forEach(c=>DisableControlAction(0,c,true));
  const model=GetEntityCoords(preview,false);
  const distance=Math.hypot(x-model[0],y-model[1]);
  if(distance>2.8)s.armed=true;
  if(s.armed&&distance<1.8)void triggerVisit(s);
}
onNet('webcam_mocap_animlab:visit',async (dict,clip,token)=>{
  stop();
  const player=PlayerPedId();
  if(!IsGameplayCamRendering())return notice('Another scripted camera is active. End it before visiting the animation room.');
  if(IsEntityDead(player)||IsPedInAnyVehicle(player,false))return notice('Visit the room while alive and on foot.');
  if(![dict,clip].every(n=>typeof n==='string'&&/^[a-zA-Z0-9_@.-]{1,80}$/.test(n)))return;
  dict=recordedDictionary(dict);
  const s={kind:'visit',player,wasFrozen:IsEntityPositionFrozen(player),camera:0,stage:visitStage(),
    returnPosition:[...GetEntityCoords(player,false)],returnHeading:GetEntityHeading(player),
    dict,clip,loading:true,state:'loading',armed:true,backups:[]};
  scene=s;mode='visit';
  const generation=creating;
  FreezeEntityPosition(player,true);
  notice('Loading After Hours nightclub…');
  RequestAnimDict(dict);
  try {
    if(!await loadVisitClub(s))return;
    const began=GetGameTimer();
    while(generation===creating&&!HasAnimDictLoaded(dict)&&GetGameTimer()-began<5000)
      await new Promise(resolve=>setTimeout(resolve,0));
    if(scene!==s)return;
    if(!HasAnimDictLoaded(dict)||GetAnimDuration(dict,clip)<=0)throw new Error(recordedClipMissing(dict));
    let character=0;
    try {character=await createVisitCharacter(visitModel,player,()=>scene!==s);}
    catch(error) {
      if(scene!==s)return;
      notice(`${error.message} Using your player model for this visit; the saved choice is retained.`);
      character=ClonePed(player,0,false,false);
    }
    if(scene!==s) {if(character&&DoesEntityExist(character))DeleteEntity(character);return;}
    preview=character;
    if(!preview)throw new Error('The animation model could not be created.');
    prepareVisitCharacter(preview);
    // Preload hidden actors so approaching the main character starts all three together.
    const chosenBackups=[...backupModels];
    for(let slot=0;slot<2;slot++) {
      let dancer=0;
      try {dancer=await createVisitCharacter(chosenBackups[slot],preview,()=>scene!==s);}
      catch(error) {
        if(scene!==s)return;
        notice(`Backup dancer ${slot+1}: ${error.message} Using the main character model for this visit.`);
        dancer=ClonePed(preview,0,false,false);
      }
      if(scene!==s) {if(dancer&&DoesEntityExist(dancer))DeleteEntity(dancer);return;}
      if(!dancer)throw new Error(`Could not create backup dancer ${slot+1}.`);
      s.backups.push(dancer);
      const [x,y]=stagePoint(s.stage,slot===0?-1.4:1.4,-1.2);
      prepareVisitCharacter(dancer,x,y,false);
    }
    const standingZ=ped=>GetEntityCoords(ped,false)[2]+s.stage.floor+.04-
      Math.min(GetPedBoneCoords(ped,14201,0,0,0)[2],GetPedBoneCoords(ped,52301,0,0,0)[2]);
    s.walkZ=standingZ(player);
    const spawn=stagePoint(s.stage,0,3.7,s.walkZ);
    RequestCollisionAtCoord(...spawn);
    SetEntityCoordsNoOffset(player,...spawn,false,false,false);SetEntityHeading(player,(s.stage.heading+180)%360);
    // Do not accept a collision result cached at the previous player location.
    await new Promise(resolve=>setTimeout(resolve,0));
    if(scene!==s)return;
    const collisionBegan=GetGameTimer();
    while(scene===s&&(!IsValidInterior(s.interior)||!HasCollisionLoadedAroundEntity(player))&&GetGameTimer()-collisionBegan<8000) {
      RequestCollisionAtCoord(...spawn);
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    if(scene!==s)return;
    if(!HasCollisionLoadedAroundEntity(player))throw new Error('Nightclub collision did not load. Returned to your starting position.');
    if(!IsValidInterior(s.interior))throw new Error('Nightclub interior became unavailable while entering.');
    ClearFocus();lastClubFailure='';
    s.loading=false;s.state='walking';FreezeEntityPosition(player,false);
    notice('Walk up to the model to watch your recording. /mocaplabvisit stop returns to your starting location.');
    if(typeof token==='string'&&/^[a-f0-9]{48}$/.test(token))
      notice(`Live skeleton HUD: paste this pairing token into http://127.0.0.1:8788 and click Connect to FiveM (also in F8): ${token}`);
  } catch(error) {
    if(scene===s) {saveClubFailure(s,error.message);stop();notice(`Viewing room unavailable: ${error.message}`);notice(lastClubFailure);}
  } finally {
    // playRecording will request the dictionary again when needed.
    if(scene!==s&&scene?.dict!==dict&&recordedPlayback?.dict!==dict)RemoveAnimDict(dict);
  }
});
onNet('webcam_mocap_animlab:notice', notice);
onNet('webcam_mocap_animlab:stop', stop);
async function prepareHandTargets(generation) {
  const model = GetHashKey('w_ex_snowball');
  RequestModel(model);
  const started = GetGameTimer();
  while (!HasModelLoaded(model) && generation === creating && GetGameTimer()-started < 3000) {
    await new Promise(resolve => setTimeout(resolve,0));
  }
  if (generation !== creating || !HasModelLoaded(model)) {
    SetModelAsNoLongerNeeded(model); return;
  }
  const p = GetEntityCoords(mode === 'preview' ? preview : PlayerPedId(),false);
  for (const name of ['leftHand','rightHand']) {
    const entity = CreateObjectNoOffset(model,...p,false,false,false);
    if (!entity) continue;
    handTargets[name] = entity;
    SetEntityAlpha(entity,0,false);
    SetEntityCollision(entity,false,false);
    FreezeEntityPosition(entity,true);
  }
  SetModelAsNoLongerNeeded(model);
}
onNet('webcam_mocap_animlab:start', async (nextMode, token) => {
  stop();
  if(!IsGameplayCamRendering())return notice('Another scripted camera is active. Use /mocap stop before starting the lab.');
  const generation = creating;
  mode = nextMode;
  if (mode === 'preview') {
    const player = PlayerPedId();
    preview = ClonePed(player, GetEntityHeading(player) + 180, false, false);
    if (!preview || !DoesEntityExist(preview)) { stop(); return notice('Could not create preview ped.'); }
    SetEntityCollision(preview, false, false);
    SetEntityInvincible(preview, true);
    FreezeEntityPosition(preview, true);
    SetBlockingOfNonTemporaryEvents(preview, true);
    RemoveAllPedWeapons(preview, true);
    ClearPedTasksImmediately(preview);
    SetPedCanPlayAmbientAnims(preview, false);
    try { startScene(player); }
    catch (error) { stop(); return notice(error.message); }
  }
  if (generation !== creating) return;
  if(mode==='preview') {
    // Bind wrist axes from the neutral rig before the body animation starts.
    armRig=measureArmRig(preview);
    void prepareBodyAnimation(preview,generation).catch(error=>notice(`Body clip failed: ${error.message}`));
  }
  void prepareHandTargets(generation).catch(error => notice(`Wrist rotation unavailable; position tracking continues. ${error.message}`));
  notice(`Mode: ${mode}. Paste this pairing token into http://127.0.0.1:8788 (also in F8): ${token}`);
  notice('Session lasts 30 minutes. /mocaplab stop removes it. Keep the companion tab visible.');
  if (mode === 'preview') notice('Minigame room ready. Your player is hidden locally. /mocaplab stop returns to normal play.');
});
onNet('webcam_mocap_animlab:pose', p => {
  if (!mode || !PoseProtocol.validate(p)) return;
  pose = p; received = GetGameTimer();
  if(mode==='visit') {
    acknowledge(p.skeleton?.points.some(point=>point&&point[2]>=.6)?'applied':'untracked',[],[]);
    return;
  }
  if (p.tracked) for (const name of ['leftHand','rightHand']) {
    const t=p.targets[name];
    if(t.confidence<0.6) continue;
    const memory=handHistory[name] || {};
    memory.target={...t}; memory.positionAt=received;
    if(t.orientation) {memory.orientation={...t.orientation};memory.orientationAt=received;}
    handHistory[name]=memory;
  }
});
on('onResourceStop', name => { if (name === GetCurrentResourceName()) stop(); });
function measureArmRig(ped) {
  const pelvis = GetPedBoneCoords(ped, 11816, 0, 0, 0);
  const localPelvis = GetOffsetFromEntityGivenWorldCoords(ped, ...pelvis);
  const shoulders = {};
  for (const [name, bone] of [['leftShoulder',45509], ['rightShoulder',40269]]) {
    const world = GetPedBoneCoords(ped, bone, 0, 0, 0);
    const local = GetOffsetFromEntityGivenWorldCoords(ped, ...world);
    shoulders[name] = { x: local[0]-localPelvis[0], y: local[1]-localPelvis[1], z: local[2]-localPelvis[2] };
  }
  const handOffsets = {}, handRest = {};
  const hips={},legLengths={};
  const localPoint = (bone,x=0,y=0,z=0) => GetOffsetFromEntityGivenWorldCoords(ped,
    ...GetPedBoneCoords(ped,bone,x,y,z));
  for(const [name,hip,knee,foot] of [['leftHip',58271,63931,14201],['rightHip',51826,36864,52301]]) {
    const h=localPoint(hip),k=localPoint(knee),f=localPoint(foot);
    hips[name]={x:h[0]-localPelvis[0],y:h[1]-localPelvis[1],z:h[2]-localPelvis[2]};
    legLengths[name]=Math.hypot(...HandMath.sub(k,h))+Math.hypot(...HandMath.sub(f,k));
  }
  for (const [name,hand,middle,index,pinky] of [
    ['leftHand',18905,26612,26611,26614], ['rightHand',57005,58868,58867,58870]
  ]) {
    const wrist=localPoint(hand);
    handRest[name]={position:{x:wrist[0]-localPelvis[0],y:wrist[1]-localPelvis[1],z:wrist[2]-localPelvis[2]}};
    const canonical=HandMath.handFrame(wrist,localPoint(middle),localPoint(index),localPoint(pinky));
    const axes=[[0.1,0,0],[0,0.1,0],[0,0,0.1]].map(offset=>HandMath.unit(HandMath.sub(localPoint(hand,...offset),wrist)));
    if(!canonical || axes.some(a=>!a)) continue;
    const boneRotation=HandMath.fromBasis(...axes);
    if(boneRotation) {
      handOffsets[name]=HandMath.multiply(HandMath.inverse(canonical),boneRotation);
      handRest[name].rotation=boneRotation;
    }
  }
  return { ped, shoulders, handOffsets, handRest, hips, legLengths };
}
function handFade(age) {
  const t=Math.max(0,Math.min(1,(age-CONFIG.handHoldMs)/CONFIG.handFadeMs));
  return t*t*(3-2*t);
}
function acknowledge(state, parts = [], wrists = []) {
  if (!pose || pose.seq === acknowledgedSeq) return;
  acknowledgedSeq = pose.seq;
  emitNet('webcam_mocap_animlab:ack', pose.seq, state, parts, wrists, bodyAnimationSnapshot());
}
setTick(() => {
  updateRecordedGrounding();
  updateRecordingScore();
  // Keep the room and camera active even before pairing or when tracking is lost.
  if (!updateScene()) return;
  updateComparisonHud();
  if(mode==='visit')return;
  updateBodyAnimation();
  if (!mode || !pose || GetGameTimer() - received > CONFIG.timeoutMs) {
    if (mode && pose && !pose.tracked) acknowledge('untracked');
    filtered = {}; handRotations = {}; handHistory = {}; return;
  }
  const ped = mode === 'preview' ? preview : PlayerPedId();
  if (!ped || !DoesEntityExist(ped) || IsEntityDead(ped) || IsPedInAnyVehicle(ped, false) || IsPedRagdoll(ped)) {
    acknowledge('unavailable'); return;
  }
  if (mode === 'player' && pose.tracked) {
    // Only suppress conflicting controls while valid pose data is arriving.
    [21, 22, 24, 25, 30, 31, 37, 44, 45, 140, 141, 142].forEach(c => DisableControlAction(0, c, true));
    DisablePlayerFiring(PlayerId(), true);
  }
  const root = GetPedBoneCoords(ped, 11816, 0, 0, 0); // SKEL_Pelvis
  if (!armRig || armRig.ped !== ped) armRig = measureArmRig(ped);
  const origin = GetEntityCoords(ped, false);
  const alpha = 1 - Math.exp(-Math.min(GetFrameTime(), 0.1) / CONFIG.smoothingSeconds);
  // Head look-at competes with body playback. Keep it opt-in; manual tests
  // must exercise body playback alone even while camera packets are arriving.
  const parts = recordedPlayback || (bodyAnimation?.manual!==null && bodyAnimation?.enabled) || ikMode==='off' ? {} :
    ikMode==='all'?{leftHand:3,rightHand:4,head:1}:{leftHand:3,rightHand:4};
  const driven = [];
  const rotated = [];
  const now=GetGameTimer(), releaseAfter=CONFIG.handHoldMs+CONFIG.handFadeMs;
  for (const [name, index] of Object.entries(parts)) {
    const isHand=name==='leftHand'||name==='rightHand', memory=isHand?handHistory[name]:null;
    let t=pose.tracked?pose.targets[name]:null, positionFade=0;
    if(!t || t.confidence<0.6) {
      if(!memory || now-memory.positionAt>=releaseAfter) {delete filtered[name];continue;}
      t=memory.target;positionFade=handFade(now-memory.positionAt);
    }
    let anchor = t.anchor ? armRig.shoulders[t.anchor] || armRig.hips[t.anchor] : null;
    if(t.anchor==='leftShoulder'||t.anchor==='rightShoulder') {
      // Follow the shoulder after spine solving rather than pinning it to its
      // original neutral offset. Upper-arm roots remain stable during arm IK.
      const shoulder=GetPedBoneCoords(ped,t.anchor==='leftShoulder'?45509:40269,0,0,0);
      const local=GetOffsetFromEntityGivenWorldCoords(ped,...shoulder);
      const pelvis=GetOffsetFromEntityGivenWorldCoords(ped,...root);
      anchor={x:local[0]-pelvis[0],y:local[1]-pelvis[1],z:local[2]-pelvis[2]};
    }
    const limbScale=t.limbLength && armRig.legLengths[t.anchor] ?
      Math.max(0.5,Math.min(2,armRig.legLengths[t.anchor]/t.limbLength)):1;
    const target = Object.fromEntries(['x','y','z'].map(k => [k, t[k]*limbScale + (anchor ? anchor[k] : 0)]));
    const rest=isHand?armRig.handRest[name]:null;
    if(positionFade && rest) for(const k of ['x','y','z']) target[k]+=(rest.position[k]-target[k])*positionFade;
    const f = filtered[name] || { ...target };
    for (const k of ['x', 'y', 'z']) f[k] += (target[k] - f[k]) * alpha;
    filtered[name] = f;
    const offset = GetOffsetFromEntityInWorldCoords(ped, f.x, f.y, f.z);
    const position=[0,1,2].map(i=>root[i]+offset[i]-origin[i]);
    const proxy=handTargets[name], bind=armRig.handOffsets[name];
    const rotationAge=memory?.orientation?now-memory.orientationAt:Infinity;
    if (rotationAge<releaseAfter && bind && proxy && DoesEntityExist(proxy)) {
      let localRotation=HandMath.multiply(memory.orientation,bind);
      if(rest?.rotation) localRotation=HandMath.blend(localRotation,rest.rotation,handFade(rotationAge));
      handRotations[name]=HandMath.blend(handRotations[name],localRotation,alpha);
      const q=GetEntityQuaternion(ped);
      const worldRotation=HandMath.multiply({x:q[0],y:q[1],z:q[2],w:q[3]},handRotations[name]);
      SetEntityCoordsNoOffset(proxy,...position,false,false,false);
      SetEntityQuaternion(proxy,worldRotation.x,worldRotation.y,worldRotation.z,worldRotation.w);
      // Explicit hand-bone target + orientation solve. Position-only frames keep
      // the working default flags below; animation-tag ALLOW is not used.
      SetIkTarget(ped,index,proxy,-1,0,0,0,65,40,100);
      rotated.push(name);
    } else {
      if(rest?.rotation && memory?.orientation) handRotations[name]=rest.rotation;
      else delete handRotations[name];
      SetIkTarget(ped,index,0,-1,...position,0,40,100);
    }
    driven.push(name);
  }
  acknowledge(pose.tracked?'applied':'untracked', driven, rotated);
});
