import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
async function room({smallFloor=false,missingClip=false,mirror=false,mirrorHeading=undefined,missingDictionaries=new Set(),cameraFail=false,vehicle=false,pending=false,missingHud=false,scoringBones=false,scoringHandOffsets={},worldFeet=false,synchronized=false,anchoredBones=false,sceneFailAt=0,sceneNeverStarts=false,groundFeet=true,delay=0,startDelay=0,duration=2,kvp=new Map(),missingModels=new Set(),nonHumanoid=false,boneReadyAfter=0,actualClub=false,collisionFail=false,clubInitiallyActive=true,initialProps=[],refreshDelay=0,placementFlagFalse=false}={}) {
  const net={},events={},commands={},calls=[],positions=new Map([[10,[100,200,30]]]);
  const frozen=new Map([[10,false]]),headings=new Map([[10,42]]),entities=new Set([10]);
  let tick,clock=1000,playing=false,phase=0,started=0;const timers=[];
  let nextPed=20;const models=new Map();
  let nextScene=50;const localScenes=new Map(),pedScenes=new Map(),animationAnchors=new Map();
  let clubActive=clubInitiallyActive;const clubProps=new Set(initialProps);
  let clubReadyAt=0,clubValid=true,clubReady=true;let footLift=[0,0];
  const log=name=>(...args)=>calls.push([name,...args]);
  const sandbox={console:{log:log('message')},PoseProtocol:require('../resource/webcam_mocap_animlab/protocol.js'),
    MocapScore:require('../resource/webcam_mocap_animlab/score-math.js'),
    MocapLabConfig:{mirrorRecordedAnimation:mirror,mirroredAnimationHeadingOffsetDegrees:mirrorHeading,groundRecordedFeet:groundFeet,scoringDelaySeconds:delay,animationStartDelaySeconds:startDelay,nightclub:actualClub?{}:{x:0,y:0,floor:1000,heading:0},music:{backgroundFile:'background.ogg',animationFile:'animation.mp3',backgroundVolume:.35,animationVolume:.7}},
    GetResourceKvpString:key=>kvp.get(key)||null,SetResourceKvp:(key,value)=>kvp.set(key,value),DeleteResourceKvp:key=>kvp.delete(key),
    SendNuiMessage:text=>calls.push(['hud',JSON.parse(text)]),
    RegisterNuiCallbackType() {},
    LoadResourceFile:(_resource,file)=>missingHud&&file==='hud/hud.js'?null:'present',
    GetResourceMetadata:()=> 'hud/index.html',
    onNet:(name,fn)=>net[name]=fn,on:(name,fn)=>events[name]=fn,
    RegisterCommand:(name,fn)=>commands[name]=fn,setTick:fn=>tick=fn,
    emit:log('emit'),emitNet:log('emitNet'),
    PlayerPedId:()=>10,PlayerId:()=>1,GetCurrentResourceName:()=> 'webcam_mocap_animlab',
    IsGameplayCamRendering:()=>true,IsEntityDead:()=>false,IsPedInAnyVehicle:()=>vehicle,
    DoesEntityExist:id=>entities.has(id),GetEntityCoords:id=>positions.get(id),
    GetEntityHeading:id=>headings.get(id)||0,SetEntityHeading:(id,h)=>headings.set(id,h),
    IsEntityPositionFrozen:id=>frozen.get(id)||false,
    FreezeEntityPosition:(id,value)=>{frozen.set(id,value);calls.push(['freeze',id,value]);},
    SetEntityCoordsNoOffset:(id,x,y,z,...flags)=>{positions.set(id,[x,y,z]);calls.push(['position',id,x,y,z,...flags]);},
    GetGameTimer:()=>clock,GetHashKey:name=>name,
    SetStaticEmitterEnabled:log('clubEmitter'),
    IsIplActive:()=>!placementFlagFalse&&clubActive,RequestIpl:()=>{clubActive=true;calls.push(['loadClub']);},RemoveIpl:()=>{clubActive=false;calls.push(['removeClub']);},
    GetInteriorAtCoordsWithType:()=>pending?0:271617,IsValidInterior:()=>!smallFloor&&clubValid,IsInteriorReady:()=>!smallFloor&&clubReady&&clock>=clubReadyAt,
    PinInteriorInMemory:log('pinClub'),UnpinInterior:log('unpinClub'),RefreshInterior:(id)=>{clubReadyAt=clock+refreshDelay;calls.push(['refreshClub',id]);},
    IsInteriorEntitySetActive:(_id,name)=>clubProps.has(name),
    ActivateInteriorEntitySet:(_id,name)=>{clubProps.add(name);calls.push(['clubProp',name,true]);},
    DeactivateInteriorEntitySet:(_id,name)=>{clubProps.delete(name);calls.push(['clubProp',name,false]);},
    HasCollisionLoadedAroundEntity:()=>!collisionFail,
    IsModelInCdimage:name=>name!=='invalid'&&!missingModels.has(name),IsModelValid:()=>true,IsModelAPed:name=>!name.startsWith('prop_'),
    GetEntityBoneIndexByName:()=>-1,
    GetPedBoneIndex:(_ped,id)=>{calls.push(['pedBone',id]);return nonHumanoid?-1:clock<1000+boneReadyAfter?0:id;},
    SetPedDefaultComponentVariation:log('defaultComponents'),
    RequestModel:log('requestModel'),RequestCollisionForModel:log('requestFloorCollision'),
    HasModelLoaded:()=>!pending,HasCollisionForModelLoaded:()=>true,
    RequestAnimDict:log('requestDict'),HasAnimDictLoaded:()=>true,GetAnimDuration:dict=>missingClip||missingDictionaries.has(dict)?0:duration,
    RemoveAnimDict:log('removeDict'),SetModelAsNoLongerNeeded:log('releaseModel'),
    GetModelDimensions:()=>smallFloor?[[-1,-1,-1],[1,1,1]]:[[-20,-20,-2],[20,20,2]],
    CreateObjectNoOffset:(_model,x,y,z)=>{entities.add(30);positions.set(30,[x,y,z]);return 30;},
    ClonePed:()=>{const id=nextPed++;entities.add(id);positions.set(id,[...positions.get(10)]);models.set(id,'player clone');return id;},
    CreatePed:(_type,name,x,y,z)=>{const id=nextPed++;entities.add(id);positions.set(id,[x,y,z]);models.set(id,name);return id;},
    GetPedBoneCoords:(id,bone)=>{
      const offsets={45509:[-.2,0,.5],40269:[.2,0,.5],61163:[-.45,0,.5],28252:[.45,0,.5],18905:[-.7,0,.5],57005:[.7,0,.5],58271:[-.1,0,0],51826:[.1,0,0],...scoringHandOffsets};
      const offset=scoringBones?offsets[bone]:null;
      const origin=anchoredBones&&animationAnchors.has(id)?animationAnchors.get(id):positions.get(id);
      return origin.map((n,i)=>n+(offset?offset[i]:i===2?bone===31086?.7:-.95:0)+(i===2?(bone===14201?footLift[0]:bone===52301?footLift[1]:0):0));
    },
    DeleteEntity:id=>{entities.delete(id);calls.push(['delete',id]);},
    TaskPlayAnim:(...args)=>{playing=true;phase=args[7];started=clock;animationAnchors.set(args[0],[...positions.get(args[0])]);calls.push(['play',...args]);},
    StopAnimTask:()=>{playing=false;calls.push(['stopAnim']);},
    IsEntityPlayingAnim:()=>playing&&!sceneNeverStarts?1:0,
    SetEntityAnimCurrentTime:(ped,_d,_c,n)=>{calls.push(['phase',ped,n]);if(positions.get(ped)[0]===(actualClub?-1596:0)){phase=n;started=clock;}},SetEntityAnimSpeed:log('speed'),
    GetEntityAnimCurrentTime:()=>Math.min(1,phase+(clock-started)/(duration*1000)),
    CreateCamWithParams:(...args)=>{calls.push(['camera',...args]);return cameraFail?0:40;},
    DestroyCam:log('destroyCamera'),RenderScriptCams:log('renderCamera'),
    PointCamAtCoord:log('cameraTarget'),
    ClearFocus:log('clearFocus'),SetFocusPosAndVel:log('focus'),
    SetEntityLocallyInvisible:log('hidePlayer'),DisableAllControlActions:log('lockControls'),
    ClearPedTasksImmediately:id=>{pedScenes.delete(id);animationAnchors.delete(id);calls.push(['clearTasks',id]);},RequestCollisionAtCoord:log('requestCollision'),
    SetEntityVisible:log('visibility'),SetEntityCollision:log('collision'),
    SetPedCanPlayAmbientBaseAnims:log('ambient'),SetPedCanPlayGestureAnims:log('gesture'),
    setTimeout:fn=>{if(!pending){clock+=16;queueMicrotask(fn);return 1;}timers.push(fn);return timers.length;},
  };
  if(synchronized)Object.assign(sandbox,{
    CreateSynchronizedScene:(x,y,z,roll,pitch,heading)=>{
      const id=nextScene++;if(sceneFailAt===id-49)return -1;
      localScenes.set(id,{origin:[x,y,z],heading,phase:0,at:clock,rate:1});calls.push(['createScene',id,x,y,z,heading]);return id;
    },
    TaskSynchronizedScene:(ped,id,dict,clip,...args)=>{
      pedScenes.set(ped,id);animationAnchors.set(ped,[...localScenes.get(id).origin]);playing=true;
      calls.push(['scenePlay',ped,id,dict,clip,...args]);
    },
    GetSynchronizedScenePhase:id=>{
      const s=localScenes.get(id);return Math.min(1,s.phase+(clock-s.at)*s.rate/(duration*1000));
    },
    SetSynchronizedScenePhase:(id,value)=>{const s=localScenes.get(id);s.phase=value;s.at=clock;calls.push(['scenePhase',id,value]);},
    SetSynchronizedSceneRate:(id,value)=>{
      const s=localScenes.get(id);s.phase=sandbox.GetSynchronizedScenePhase(id);s.at=clock;s.rate=value;calls.push(['sceneRate',id,value]);
    },
    SetSynchronizedSceneLooped:log('sceneLoop'),SetSynchronizedSceneHoldLastFrame:log('sceneHold'),
    SetSynchronizedSceneOrigin:(id,x,y,z,roll,pitch,heading)=>{
      localScenes.get(id).origin=[x,y,z];calls.push(['sceneOrigin',id,x,y,z,heading]);
    },
  });
  if(worldFeet)sandbox.GetWorldPositionOfEntityBone=(id,bone)=>{
    const [x,y,z]=sandbox.GetPedBoneCoords(id,bone);
    return {x,y,z};
  };
  for(const name of ['SetEntityInvincible','SetBlockingOfNonTemporaryEvents','RemoveAllPedWeapons',
    'SetPedCanPlayAmbientAnims','SetCamNearClip','SetCamFarClip','DisablePlayerFiring',
    'DisableControlAction','HideHudAndRadarThisFrame','EnableControlAction','DrawPoly','DrawLightWithRange','DrawSpotLight'])sandbox[name]=log(name);
  vm.runInContext(await readFile(new URL('../resource/webcam_mocap_animlab/client.js',import.meta.url),'utf8'),vm.createContext(sandbox));
  return {net,events,commands,calls,positions,frozen,headings,entities,models,clubProps,localScenes,pedScenes,
    footZ:(id,bone=14201)=>sandbox.GetPedBoneCoords(id,bone)[2],
    tick:()=>{
      // Native task placement/pose evaluation occurs at a frame boundary. A
      // plain entity teleport does not change the task's cached pose origin.
      for(const [ped,id] of pedScenes) {
        const origin=[...localScenes.get(id).origin];positions.set(ped,origin);animationAnchors.set(ped,origin);
      }
      tick();
    },
    setFootLift(left,right){footLift=[left,right];},
    setClubHealth({ready=clubReady,valid=clubValid,collision=!collisionFail}){clubReady=ready;clubValid=valid;collisionFail=!collision;},
    advance:ms=>clock+=ms,flush:async()=>{await Promise.resolve();await Promise.resolve();},
    resume:()=>{pending=false;timers.splice(0).forEach(fn=>fn());}};
}
test('visit walks visibly into the nightclub, triggers once on approach, unlocks after completion and rearms after leaving',async()=>{
  const h=await room();await h.net['webcam_mocap_animlab:visit']('webcam_recording','webcam_take');
  assert.equal(h.frozen.get(10),false);assert.equal(h.positions.get(10)[1],3.7);
  assert.ok(h.calls.some(c=>c[0]==='pinClub'));
  assert.equal(h.entities.has(30),false,'uses the real interior instead of a hidden platform');
  h.calls.length=0;h.tick();
  assert.ok(!h.calls.some(c=>['hidePlayer','lockControls','camera','play'].includes(c[0])),'normal player and camera remain usable before approach');
  h.positions.set(10,[0,1.5,1001]);h.tick();await h.flush();
  assert.equal(h.frozen.get(10),true);assert.equal(h.calls.filter(c=>c[0]==='play').length,3);
  const cam=h.calls.find(c=>c[0]==='camera'),target=h.calls.find(c=>c[0]==='cameraTarget');
  assert.equal(cam[4],target[4],'viewing camera faces the model at eye height');
  h.tick();assert.ok(h.calls.some(c=>c[0]==='hidePlayer'));
  h.advance(1000);h.tick();assert.equal(h.frozen.get(10),true,'camera remains locked before clip end');
  h.advance(1001);h.tick();assert.equal(h.frozen.get(10),false);
  assert.ok(h.calls.some(c=>c[0]==='destroyCamera'&&c[1]===40));
  h.tick();assert.equal(h.calls.filter(c=>c[0]==='play').length,3,'standing nearby does not immediately retrigger');
  h.positions.set(10,[0,3.5,1001]);h.tick();h.positions.set(10,[0,1.4,1001]);h.tick();await h.flush();
  assert.equal(h.calls.filter(c=>c[0]==='play').length,6);
  h.net['webcam_mocap_animlab:stop']();
  assert.deepEqual(h.positions.get(10),[100,200,30]);assert.equal(h.headings.get(10),42);
  assert.equal(h.frozen.get(10),false);assert.ok(!h.entities.has(20)&&!h.entities.has(30));
});
test('resource stop restores a visiting player; bad assets, vehicles and canceled loads leave no stranded player',async()=>{
  for(const options of [{},{smallFloor:true},{missingClip:true},{vehicle:true},{pending:true}]) {
    const h=await room(options);const entering=h.net['webcam_mocap_animlab:visit']('webcam_recording','webcam_take');
    if(options.pending) {h.net['webcam_mocap_animlab:stop']();h.resume();}
    await entering;
    if(!Object.keys(options).length)h.events.onResourceStop('webcam_mocap_animlab');
    assert.deepEqual(h.positions.get(10),[100,200,30]);assert.equal(h.frozen.get(10),false);
    assert.ok(!h.entities.has(20)&&!h.entities.has(30));
  }
});
test('camera creation failure releases the player and keeps an exit available',async()=>{
  const h=await room({cameraFail:true});await h.net['webcam_mocap_animlab:visit']('webcam_recording','webcam_take');
  h.positions.set(10,[0,1.5,1001]);h.tick();await h.flush();
  assert.equal(h.frozen.get(10),false);assert.ok(!h.calls.some(c=>c[0]==='play'));
  h.net['webcam_mocap_animlab:stop']();assert.deepEqual(h.positions.get(10),[100,200,30]);
});
test('comparison HUD receives live joints without driving the model, clears stale poses and hides at completion',async()=>{
  const h=await room();await h.net['webcam_mocap_animlab:visit']('webcam_recording','webcam_take');
  const targets=Object.fromEntries(['leftHand','rightHand','head','leftFoot','rightFoot'].map(n=>[n,{x:0,y:0,z:0,confidence:1}]));
  const packet={v:1,seq:1,tracked:true,targets,skeleton:{aspect:4/3,points:Array.from({length:33},()=>[.5,.5,1])}};
  h.net['webcam_mocap_animlab:pose'](packet);h.tick();
  assert.ok(!h.calls.some(c=>c[0]==='hud'&&c[1].visible),'HUD stays hidden while walking');
  h.positions.set(10,[0,1.5,1001]);h.tick();await h.flush();
  let hud=h.calls.filter(c=>c[0]==='hud').at(-1)[1];
  assert.equal(hud.visible,true);assert.equal(hud.status,'live');assert.equal(hud.skeleton.points.length,33);
  h.advance(700);h.tick();hud=h.calls.filter(c=>c[0]==='hud').at(-1)[1];
  assert.equal(hud.status,'stale');assert.equal(hud.skeleton,null,'stale joints are never shown as a live pose');
  h.commands.mocaplabhud(0,['mirror']);assert.equal(h.calls.filter(c=>c[0]==='hud').at(-1)[1].mirrored,false);
  h.net['webcam_mocap_animlab:pose']({...packet,seq:2});h.advance(60);h.tick();
  assert.equal(h.calls.filter(c=>c[0]==='hud').at(-1)[1].status,'live');
  h.advance(1400);h.tick();assert.equal(h.calls.filter(c=>c[0]==='hud').at(-1)[1].visible,false);
  h.net['webcam_mocap_animlab:stop']();
});
test('HUD can be tested outside a scene; status distinguishes missing files and page readiness',async()=>{
  const h=await room({missingHud:true});
  h.commands.mocaplabhud(0,['test']);
  assert.equal(h.calls.filter(c=>c[0]==='hud').at(-1)[1].visible,true);
  h.advance(100);h.tick();
  assert.equal(h.calls.filter(c=>c[0]==='hud').at(-1)[1].visible,true,'test refreshes without visit mode');
  h.commands.mocaplabhud(0,['status']);
  assert.match(h.calls.filter(c=>c[0]==='message').at(-1)[1],/missing files: hud\/hud.js.*page ready: false/);
  let acknowledged;
  h.events['__cfx_nui:mocapHudReady']({},value=>acknowledged=value);
  assert.equal(acknowledged.ok,true);
  h.events['__cfx_nui:mocapHudRendered']({},()=>{});
  h.commands.mocaplabhud(0,['status']);
  assert.match(h.calls.filter(c=>c[0]==='message').at(-1)[1],/page ready: true.*panel rendered: true/);
  h.advance(10001);h.tick();assert.equal(h.calls.filter(c=>c[0]==='hud').at(-1)[1].visible,false);
});
test('visit awards once per second, ignores stale camera data and retains the final score until exit',async()=>{
  const h=await room({scoringBones:true});await h.net['webcam_mocap_animlab:visit']('webcam_recording','webcam_take');
  const targets=Object.fromEntries(['leftHand','rightHand','head','leftFoot','rightFoot'].map(n=>[n,{x:0,y:0,z:0,confidence:1}]));
  const packet={v:1,seq:1,tracked:true,targets,handMatch:{left:[-1.4,0,0],right:[1.4,0,0]}};
  h.positions.set(10,[0,1.5,1001]);h.tick();await h.flush();
  h.advance(1000);h.net['webcam_mocap_animlab:pose'](packet);h.tick();
  let message=h.calls.filter(c=>c[0]==='hud').at(-1)[1];assert.equal(message.score.total,100);
  h.tick();assert.equal(h.calls.filter(c=>c[0]==='hud').at(-1)[1].score.total,100);
  h.advance(1000);h.tick();message=h.calls.filter(c=>c[0]==='hud').at(-1)[1];
  assert.equal(message.visible,false);assert.equal(message.scoreVisible,true);
  assert.equal(message.score.total,100);assert.equal(message.score.skipped,1);assert.equal(message.score.finished,true);
  h.net['webcam_mocap_animlab:stop']();assert.equal(h.calls.filter(c=>c[0]==='hud').at(-1)[1].scoreVisible,false);
});
test('visit scores asymmetric onscreen copying for either animation dictionary and follows the HUD mirror toggle',async()=>{
  const math=require('../resource/webcam_mocap_animlab/score-math.js');
  const handOffsets={18905:[-.65,0,1],57005:[.2,0,.25]};
  const target=math.relativeHands({leftShoulder:[-.2,0,.5],rightShoulder:[.2,0,.5],hips:[0,0,0],
    leftElbow:[-.45,0,.5],rightElbow:[.45,0,.5],leftHand:handOffsets[18905],rightHand:handOffsets[57005]});
  const onscreen={left:[-target.right[0],target.right[1],target.right[2]],right:[-target.left[0],target.left[1],target.left[2]]};
  for(const mirror of [false,true]) {
    const h=await room({mirror,scoringBones:true,scoringHandOffsets:handOffsets,duration:6});
    await h.net['webcam_mocap_animlab:visit']('webcam_recording','webcam_take');
    h.positions.set(10,[0,1.5,1001]);h.tick();await h.flush();
    const targets=Object.fromEntries(['leftHand','rightHand','head','leftFoot','rightFoot'].map(n=>[n,{x:0,y:0,z:0,confidence:1}]));
    let seq=0;
    const step=hands=>{
      h.advance(1000);h.net['webcam_mocap_animlab:pose']({v:1,seq:++seq,tracked:true,targets,handMatch:hands});h.tick();
      return h.calls.filter(c=>c[0]==='hud').at(-1)[1];
    };
    assert.equal(step(onscreen).score.total,100,'copy visible pose regardless of selected animation variant');
    const afterWrong=step(target).score.total;
    assert.ok(afterWrong<200,'copying anatomical sides is not a maximum-score pose');
    h.commands.mocaplabhud(0,['mirror']);
    assert.equal(step(target).score.total,afterWrong+100,'unmirrored live feed uses direct hand correspondence');
    h.net['webcam_mocap_animlab:stop']();
  }
});

test('warmup plays continuously, counts down only for delays above three seconds, then waits one more second to score',async()=>{
  const h=await room({scoringBones:true,delay:5,duration:8});
  await h.net['webcam_mocap_animlab:visit']('webcam_recording','webcam_take');
  const targets=Object.fromEntries(['leftHand','rightHand','head','leftFoot','rightFoot'].map(n=>[n,{x:0,y:0,z:0,confidence:1}]));
  let seq=0;
  h.positions.set(10,[0,1.5,1001]);h.tick();await h.flush();
  function step(ms) {
    h.advance(ms);h.net['webcam_mocap_animlab:pose']({v:1,seq:++seq,tracked:true,targets,handMatch:{left:[-1.4,0,0],right:[1.4,0,0]}});h.tick();
    return h.calls.filter(c=>c[0]==='hud').at(-1)[1];
  }
  let data=step(1000);assert.equal(data.countdown,null);assert.equal(data.score.total,0);
  assert.equal(data.score.goal,150,'three available scoring seconds at 50 points each');
  data=step(1000);assert.equal(data.countdown,3);assert.equal(data.score.total,0);
  data=step(1000);assert.equal(data.countdown,2);
  data=step(1000);assert.equal(data.countdown,1);
  h.commands.mocaplabdelay(0,['20']); // Must apply only to the next replay.
  data=step(1000);assert.equal(data.countdown,null);assert.equal(data.score.total,0);
  assert.equal(data.score.goal,150,'changing the delay does not change the current round goal');
  data=step(900);assert.equal(data.countdown,null);assert.equal(data.score.total,0);
  data=step(100);assert.equal(data.score.total,100,'first award exactly at delay + one second');
  data=step(1000);assert.equal(data.score.total,200);assert.equal(data.score.skipped,0,'warmup is not missing tracking');
  assert.equal(h.calls.filter(c=>c[0]==='play').length,3,'countdown never restarts the animation');
  h.net['webcam_mocap_animlab:stop']();
});
test('saved point goal survives replays, changed clip timing and fresh client runtimes',async()=>{
  const kvp=new Map(),h=await room({kvp,synchronized:true,delay:1,duration:4});
  h.commands.mocaplabgoal(0,['2500']);assert.equal(kvp.get('pointGoalOverride'),'2500');
  const hud=()=>h.calls.filter(c=>c[0]==='hud').at(-1)[1];
  await h.net['webcam_mocap_animlab:visit']('webcam_recording','webcam_take');
  h.positions.set(10,[0,1.5,1001]);h.tick();await h.flush();h.tick();
  assert.equal(hud().score.goal,2500);
  h.advance(4001);h.tick();assert.equal(hud().score.finished,true);assert.equal(hud().score.goal,2500);
  h.positions.set(10,[0,3.5,1001]);h.tick();h.positions.set(10,[0,1.5,1001]);h.tick();await h.flush();h.tick();
  assert.equal(hud().score.goal,2500,'new round must not replace saved goal with its calculated goal');
  h.net['webcam_mocap_animlab:stop']();
  const restarted=await room({kvp,synchronized:true,delay:5,duration:94});
  restarted.commands.mocaplabgoal(0,['status']);
  assert.match(restarted.calls.filter(c=>c[0]==='message').at(-1)[1],/2500 \(saved override\)/);
  await restarted.net['webcam_mocap_animlab:visit']('webcam_recording','webcam_take');
  restarted.positions.set(10,[0,1.5,1001]);restarted.tick();await restarted.flush();restarted.tick();
  assert.equal(restarted.calls.filter(c=>c[0]==='hud').at(-1)[1].score.goal,2500);
});

test('goal changes update the current and final HUD without changing points, reset restores that rounds original calculation',async()=>{
  const kvp=new Map(),h=await room({kvp,scoringBones:true,delay:5,duration:8});
  await h.net['webcam_mocap_animlab:visit']('webcam_recording','webcam_take');
  h.positions.set(10,[0,1.5,1001]);h.tick();await h.flush();
  const hud=()=>h.calls.filter(c=>c[0]==='hud').at(-1)[1];
  h.advance(6000);
  const targets=Object.fromEntries(['leftHand','rightHand','head','leftFoot','rightFoot'].map(n=>[n,{x:0,y:0,z:0,confidence:1}]));
  h.net['webcam_mocap_animlab:pose']({v:1,seq:1,tracked:true,targets,handMatch:{left:[-1.4,0,0],right:[1.4,0,0]}});h.tick();
  assert.equal(hud().score.total,100);
  h.commands.mocaplabgoal(0,['500']);assert.equal(hud().score.goal,500);assert.equal(hud().score.total,100);
  h.commands.mocaplabdelay(0,['20']);h.commands.mocaplabgoal(0,['reset']);
  assert.equal(hud().score.goal,150,'reset uses the active rounds delay, not the next rounds setting');
  assert.equal(hud().score.total,100);assert.equal(kvp.has('pointGoalOverride'),false);
  h.advance(2001);h.tick();assert.equal(hud().score.finished,true);
  h.commands.mocaplabgoal(0,['777']);assert.equal(hud().score.goal,777);assert.equal(hud().score.total,100);
  h.commands.mocaplabgoal(0,['reset']);assert.equal(hud().score.goal,150);
  h.net['webcam_mocap_animlab:stop']();
  const fresh=await room({kvp,delay:0,duration:2});await fresh.net['webcam_mocap_animlab:visit']('webcam_recording','webcam_take');
  fresh.positions.set(10,[0,1.5,1001]);fresh.tick();await fresh.flush();fresh.tick();
  assert.equal(fresh.calls.filter(c=>c[0]==='hud').at(-1)[1].score.goal,100);
});

test('point goal permits zero, rejects invalid input without overwriting preferences, and ignores corrupt saved values',async()=>{
  const kvp=new Map(),h=await room({kvp});h.commands.mocaplabgoal(0,['0']);
  assert.equal(kvp.get('pointGoalOverride'),'0');
  for(const args of [['-1'],['1.5'],['NaN'],['Infinity'],['9007199254740992'],[''],['5','extra']]) {
    h.commands.mocaplabgoal(0,args);assert.equal(kvp.get('pointGoalOverride'),'0');
  }
  const fresh=await room({kvp});await fresh.net['webcam_mocap_animlab:visit']('webcam_recording','webcam_take');
  fresh.positions.set(10,[0,1.5,1001]);fresh.tick();await fresh.flush();fresh.tick();
  assert.equal(fresh.calls.filter(c=>c[0]==='hud').at(-1)[1].score.goal,0);
  const corrupt=await room({kvp:new Map([['pointGoalOverride','NaN']])});corrupt.commands.mocaplabgoal(0,[]);
  assert.match(corrupt.calls.filter(c=>c[0]==='message').at(-1)[1],/automatic/);
});

test('visit model choice persists across visits and fresh client runtimes; reset restores the player clone',async()=>{
  const kvp=new Map(),h=await room({kvp});
  await h.commands.mocaplabmodel(0,['a_m_y_business_01']);
  assert.equal(kvp.get('visitCharacterModel'),'a_m_y_business_01');
  assert.equal(h.entities.size,1,'temporary validation ped is removed');
  await h.net['webcam_mocap_animlab:visit']('webcam_recording','webcam_take');
  let actor=[...h.entities].find(id=>h.models.has(id)&&h.positions.get(id)[0]===0);
  assert.equal(h.models.get(actor),'a_m_y_business_01');
  await h.commands.mocaplabmodel(0,['s_m_m_highsec_01']);
  const replacement=[...h.entities].find(id=>h.models.has(id)&&h.positions.get(id)[0]===0);
  assert.notEqual(replacement,actor);assert.ok(!h.entities.has(actor));
  assert.equal(h.models.get(replacement),'s_m_m_highsec_01');
  assert.deepEqual(h.positions.get(10).slice(0,2),[0,3.7],'player stays in the same visit');
  h.net['webcam_mocap_animlab:stop']();
  const restarted=await room({kvp});await restarted.net['webcam_mocap_animlab:visit']('webcam_recording','webcam_take');
  actor=[...restarted.entities].find(id=>restarted.models.has(id)&&restarted.positions.get(id)[0]===0);
  assert.equal(restarted.models.get(actor),'s_m_m_highsec_01','persisted preference restored after client reload');
  await restarted.commands.mocaplabmodel(0,['reset']);assert.equal(kvp.has('visitCharacterModel'),false);
  actor=[...restarted.entities].find(id=>restarted.models.has(id)&&restarted.positions.get(id)[0]===0);assert.equal(restarted.models.get(actor),'player clone');
  restarted.net['webcam_mocap_animlab:stop']();
});
test('invalid or incompatible models preserve the saved preference; missing saved models safely fall back',async()=>{
  const kvp=new Map([['visitCharacterModel','a_m_y_business_01']]);
  const h=await room({kvp});
  for(const name of ['invalid','prop_box','../unsafe'])await h.commands.mocaplabmodel(0,[name]);
  assert.equal(kvp.get('visitCharacterModel'),'a_m_y_business_01');assert.equal(h.entities.size,1);
  const animal=await room({kvp,nonHumanoid:true});await animal.commands.mocaplabmodel(0,['a_c_chop']);
  assert.equal(kvp.get('visitCharacterModel'),'a_m_y_business_01');assert.equal(animal.entities.size,1);
  const missing=await room({kvp,missingModels:new Set(['a_m_y_business_01'])});
  await missing.net['webcam_mocap_animlab:visit']('webcam_recording','webcam_take');
  const actor=[...missing.entities].find(id=>missing.models.has(id));assert.equal(missing.models.get(actor),'player clone');
  assert.equal(kvp.get('visitCharacterModel'),'a_m_y_business_01');assert.equal(missing.frozen.get(10),false);
  missing.net['webcam_mocap_animlab:stop']();
});
test('changing models during a recording preserves playback and uses the saved choice on the next visit',async()=>{
  const kvp=new Map(),h=await room({kvp});await h.net['webcam_mocap_animlab:visit']('webcam_recording','webcam_take');
  const original=[...h.entities].find(id=>h.models.has(id)&&h.positions.get(id)[0]===0);
  h.positions.set(10,[0,1.5,1001]);h.tick();await h.flush();
  const stops=h.calls.filter(c=>c[0]==='stopAnim').length;
  await h.commands.mocaplabmodel(0,['s_m_m_highsec_01']);
  assert.ok(h.entities.has(original));assert.equal(h.calls.filter(c=>c[0]==='stopAnim').length,stops);
  assert.equal(h.frozen.get(10),true,'active playback keeps its character and camera');
  assert.equal(kvp.get('visitCharacterModel'),'s_m_m_highsec_01');
  h.net['webcam_mocap_animlab:stop']();await h.net['webcam_mocap_animlab:visit']('webcam_recording','webcam_take');
  const current=[...h.entities].find(id=>h.models.has(id)&&h.positions.get(id)[0]===0);assert.equal(h.models.get(current),'s_m_m_highsec_01');
  h.net['webcam_mocap_animlab:stop']();
});
test('standard GTA peds use numeric skeleton tags even when entity bone names are unavailable',async()=>{
  for(const name of ['ig_groom','s_m_m_highsec_01']) {
    const kvp=new Map(),h=await room({kvp,boneReadyAfter:64});
    await h.commands.mocaplabmodel(0,[name]);
    assert.equal(kvp.get('visitCharacterModel'),name);
    assert.equal(h.entities.size,1,'temporary validation actor is cleaned up');
    assert.ok(h.calls.filter(c=>c[0]==='pedBone'&&c[1]===31086).length>1,'retries skeleton initialization');
    await h.net['webcam_mocap_animlab:visit']('webcam_recording','webcam_take');
    const actor=[...h.entities].find(id=>h.models.has(id)&&h.positions.get(id)[0]===0);
    assert.equal(h.models.get(actor),name);
    h.net['webcam_mocap_animlab:stop']();
  }
});

test('a canceled skeleton check deletes its actor without overwriting a newer choice',async()=>{
  const kvp=new Map(),h=await room({kvp,boneReadyAfter:64});
  const old=h.commands.mocaplabmodel(0,['ig_groom']);
  await h.commands.mocaplabmodel(0,['reset']);await old;
  assert.equal(kvp.has('visitCharacterModel'),false);
  assert.equal(h.entities.size,1);
});

test('backup dancers remain hidden until playback, match the main timeline and disappear at completion and exit',async()=>{
  const kvp=new Map(),h=await room({kvp});
  await h.commands.mocaplabbackup1(0,['ig_groom']);
  await h.commands.mocaplabbackup2(0,['s_m_m_highsec_01']);
  assert.equal(h.entities.size,1);
  const fresh=await room({kvp});
  await fresh.net['webcam_mocap_animlab:visit']('webcam_recording','webcam_take');
  const dancers=[...fresh.entities].filter(id=>fresh.models.has(id)&&fresh.positions.get(id)[0]!==0);
  assert.equal(dancers.length,2);
  assert.deepEqual(dancers.map(id=>fresh.models.get(id)),['ig_groom','s_m_m_highsec_01']);
  assert.deepEqual(dancers.map(id=>fresh.positions.get(id).slice(0,2)),[[-1.4,-1.2],[1.4,-1.2]]);
  const visible=id=>fresh.calls.filter(c=>c[0]==='visibility'&&c[1]===id).at(-1)[2];
  dancers.forEach(id=>assert.equal(visible(id),false));
  fresh.positions.set(10,[0,1.5,1001]);fresh.tick();await fresh.flush();
  dancers.forEach(id=>assert.equal(visible(id),true));
  assert.equal(fresh.calls.filter(c=>c[0]==='play').length,3);
  fresh.advance(500);fresh.tick();
  dancers.forEach(id=>assert.equal(fresh.calls.filter(c=>c[0]==='phase'&&c[1]===id).at(-1)[2],.25));
  fresh.advance(1501);fresh.tick();dancers.forEach(id=>assert.equal(visible(id),false));
  fresh.positions.set(10,[0,3.5,1001]);fresh.tick();
  fresh.positions.set(10,[0,1.5,1001]);fresh.tick();await fresh.flush();
  dancers.forEach(id=>assert.equal(visible(id),true,'dancers reappear on replay'));
  fresh.net['webcam_mocap_animlab:stop']();dancers.forEach(id=>assert.equal(fresh.entities.has(id),false));
  await h.commands.mocaplabbackup1(0,['invalid']);assert.equal(kvp.get('backupDancerModel1'),'ig_groom');
  await h.commands.mocaplabbackup1(0,['reset']);assert.equal(kvp.has('backupDancerModel1'),false);
});

test('unavailable saved backup models fall back without erasing preferences; resource stop deletes all three actors',async()=>{
  const kvp=new Map([['backupDancerModel1','ig_groom']]);
  const h=await room({kvp,missingModels:new Set(['ig_groom'])});
  await h.net['webcam_mocap_animlab:visit']('webcam_recording','webcam_take');
  assert.equal(kvp.get('backupDancerModel1'),'ig_groom');
  assert.equal([...h.entities].filter(id=>h.models.has(id)).length,3);
  h.events.onResourceStop('webcam_mocap_animlab');
  assert.deepEqual([...h.entities],[10]);
});

test('visit sends background audio while walking, animation audio during the whole replay, and silence on exit',async()=>{
  const h=await room({delay:5,duration:8});
  const music=()=>h.calls.filter(c=>c[0]==='hud').at(-1)[1].music;
  await h.net['webcam_mocap_animlab:visit']('webcam_recording','webcam_take');h.tick();
  assert.equal(music().mode,'background');assert.equal(music().file,'background.ogg');
  const sent=h.calls.filter(c=>c[0]==='hud').length;
  h.advance(500);h.tick();assert.equal(h.calls.filter(c=>c[0]==='hud').length,sent+1,'walking heartbeat keeps audio alive');
  h.positions.set(10,[0,1.5,1001]);h.tick();await h.flush();h.tick();
  assert.equal(music().mode,'animation');assert.equal(music().file,'animation.mp3');
  h.advance(1000);h.tick();assert.equal(music().seconds,1,'music follows animation during unscored delay');
  h.advance(7001);h.tick();assert.equal(music().mode,'background');
  h.net['webcam_mocap_animlab:stop']();assert.equal(music().mode,'off');assert.equal(music().file,null);
});

test('music diagnostics report resource files and UI status; standalone tests time out without showing HUD',async()=>{
  const h=await room();
  h.commands.mocaplabmusic(0,['status']);
  assert.ok(h.calls.some(c=>c[0]==='message'&&c[1].includes('background.ogg; file found')));
  assert.ok(h.calls.some(c=>c[0]==='hud'&&c[1].type==='mocapMusicQuery'));
  h.commands.mocaplabmusic(0,['test','animation']);
  let data=h.calls.filter(c=>c[0]==='hud'&&c[1].type==='mocapComparison').at(-1)[1];
  assert.equal(data.music.mode,'animation');assert.equal(data.visible,false);
  h.advance(11000);h.tick();data=h.calls.filter(c=>c[0]==='hud'&&c[1].type==='mocapComparison').at(-1)[1];
  assert.equal(data.music.mode,'off');
  let acknowledged=false;
  h.events['__cfx_nui:mocapMusicStatus']({kind:'error',track:'background:background.ogg',detail:'audio decoding failed'},()=>acknowledged=true);
  assert.equal(acknowledged,true);
  assert.match(h.calls.filter(c=>c[0]==='message').at(-1)[1],/audio decoding failed/);
});

test('audio diagnostic tests swap files between playback backends without changing configuration or normal visits',async()=>{
  const h=await room();await h.net['webcam_mocap_animlab:visit']('webcam_recording','webcam_take');h.tick();
  const music=()=>h.calls.filter(c=>c[0]==='hud').at(-1)[1].music;
  h.commands.mocaplabmusic(0,['test','animation-loop']);
  assert.equal(music().mode,'background');assert.equal(music().file,'animation.mp3');assert.equal(music().crossfadeSeconds,0);
  h.commands.mocaplabmusic(0,['test','background-once']);
  assert.equal(music().mode,'animation');assert.equal(music().file,'background.ogg');assert.equal(music().seconds,0);
  h.commands.mocaplabmusic(0,['stop']);assert.equal(music().mode,'background');assert.equal(music().file,'background.ogg');
  h.commands.mocaplabmusic(0,['test','animation-loop']);h.advance(10001);h.tick();
  assert.equal(music().file,'background.ogg');assert.equal(music().crossfadeSeconds,.2);
  h.events['__cfx_nui:mocapMusicStatus']({kind:'status',version:'test',backend:'decoded-animation',starts:3,stops:2,
    audioClock:5,diagnostics:{session:123,messages:10,changes:3,watchdogStops:1,messageAgeMs:10,history:['heartbeat timeout']}},()=>{});
  assert.ok(h.calls.some(c=>c[0]==='message'&&c[1].includes('source starts 3, stops 2')));
  assert.ok(h.calls.some(c=>c[0]==='message'&&c[1].includes('Music recent events: heartbeat timeout')));
});

test('After Hours visit uses world floor, oriented dancer/camera offsets and calm-to-performance lighting, then restores interior state',async()=>{
  const initialProps=['Int01_ba_Style03','DJ_02_Lights_02'];
  const h=await room({actualClub:true,initialProps,clubInitiallyActive:true});
  await h.net['webcam_mocap_animlab:visit']('webcam_recording','webcam_take');
  const actor=[...h.entities].find(id=>h.models.has(id));
  const main=h.positions.get(actor);
  assert.equal(main[0],-1596);assert.equal(main[1],-3013);
  assert.ok(Math.abs(main[2]-(-79))<.01,'feet aligned to the nightclub floor');
  assert.equal(h.headings.get(actor),270);
  assert.ok(Math.abs(h.positions.get(10)[0]-(-1592.3))<.001);
  const dancers=[...h.entities].filter(id=>h.models.has(id)&&id!==actor);
  for(const dancer of dancers)assert.ok(Math.abs(h.positions.get(dancer)[0]-(-1597.2))<.001,'backups stand behind, toward DJ booth');
  assert.ok(h.clubProps.has('DJ_04_Lights_03'));assert.ok(!h.clubProps.has('DJ_04_Lights_04'));
  h.calls.length=0;h.tick();
  assert.ok(!h.calls.some(c=>c[0]==='DrawPoly'),'no white room drawn over the real interior');
  assert.ok(!h.calls.some(c=>c[0]==='DrawSpotLight'),'calm setup has no moving spotlights');
  h.positions.set(10,[-1594.5,-3013,-79]);h.tick();await h.flush();h.tick();
  assert.ok(h.clubProps.has('DJ_04_Lights_04'),'laser rig switches on during playback');
  assert.ok(h.clubProps.has('DJ_03_Lights_02'),'purple neons enabled during playback');
  assert.ok(h.calls.some(c=>c[0]==='DrawSpotLight'));
  const cam=h.calls.find(c=>c[0]==='camera');assert.ok(Math.abs(cam[2]-(-1591.8))<.001);
  h.advance(2001);h.tick();assert.ok(!h.clubProps.has('DJ_04_Lights_04'),'returns to calm after completion');
  h.net['webcam_mocap_animlab:stop']();assert.deepEqual([...h.clubProps].sort(),initialProps.sort());
  assert.ok(!h.calls.some(c=>c[0]==='removeClub'),'does not remove an already loaded club');
  assert.deepEqual(h.positions.get(10),[100,200,30]);
});

test('nightclub collision failure returns player and releases newly loaded interior and lighting changes',async()=>{
  const h=await room({collisionFail:true,clubInitiallyActive:false});
  await h.net['webcam_mocap_animlab:visit']('webcam_recording','webcam_take');
  assert.deepEqual(h.positions.get(10),[100,200,30]);assert.equal(h.frozen.get(10),false);
  assert.deepEqual([...h.entities],[10]);assert.equal(h.clubProps.size,0);
  assert.ok(h.calls.some(c=>c[0]==='removeClub'));
  assert.ok(h.calls.some(c=>c[0]==='message'&&c[1].includes('collision did not load')));
  h.commands.mocaplabclubstatus();
  assert.match(h.calls.filter(c=>c[0]==='message').at(-1)[1],/Last nightclub failure:.*collision loaded: false/);
});

test('entry succeeds when readiness stays false after furnishing refresh, using destination focus and loaded collision',async()=>{
  const h=await room({refreshDelay:Infinity});
  await h.net['webcam_mocap_animlab:visit']('webcam_recording','webcam_take');
  assert.equal(h.positions.get(10)[1],3.7);assert.equal(h.frozen.get(10),false);
  assert.ok(h.calls.findIndex(c=>c[0]==='focus')<h.calls.findIndex(c=>c[0]==='loadClub'));
  h.commands.mocaplabclubstatus();assert.match(h.calls.filter(c=>c[0]==='message').at(-1)[1],/ready: false.*collision loaded: true/);
  h.tick();assert.equal(h.positions.get(10)[1],3.7);
  h.net['webcam_mocap_animlab:stop']();assert.deepEqual(h.positions.get(10),[100,200,30]);
});

test('readiness is diagnostic rather than an entry gate even before furnishing setup',async()=>{
  const h=await room();h.setClubHealth({ready:false});
  await h.net['webcam_mocap_animlab:visit']('webcam_recording','webcam_take');
  assert.equal(h.positions.get(10)[1],3.7);assert.equal(h.frozen.get(10),false);
  h.net['webcam_mocap_animlab:stop']();
});

test('club refresh streaming and false placement flags do not eject a visit with a valid interior and loaded floor',async()=>{
  const h=await room({refreshDelay:100,placementFlagFalse:true});
  await h.net['webcam_mocap_animlab:visit']('webcam_recording','webcam_take');
  assert.equal(h.positions.get(10)[1],3.7);assert.equal(h.frozen.get(10),false);
  h.setClubHealth({ready:false});h.tick();h.advance(9000);h.tick();
  assert.equal(h.positions.get(10)[1],3.7,'readiness/placement flags alone never prove collision loss');
  assert.equal(h.frozen.get(10),false);
  h.setClubHealth({ready:true});h.positions.set(10,[0,1.5,1001]);h.tick();await h.flush();h.tick();
  assert.ok(h.calls.some(c=>c[0]==='play'));
  assert.equal(h.frozen.get(10),true,'lighting refresh during playback keeps camera and player lock');
  h.advance(2001);h.tick();assert.equal(h.frozen.get(10),false);
  assert.ok(h.positions.get(10)[2]>900,'completion refresh does not eject either');
  h.net['webcam_mocap_animlab:stop']();
});

test('temporary missing club collision freezes and retries, then resumes; sustained loss returns player after timeout',async()=>{
  const h=await room();await h.net['webcam_mocap_animlab:visit']('webcam_recording','webcam_take');
  h.setClubHealth({collision:false});h.tick();assert.equal(h.frozen.get(10),true);
  h.advance(2000);h.tick();assert.equal(h.positions.get(10)[1],3.7);
  h.setClubHealth({collision:true});h.tick();assert.equal(h.frozen.get(10),false);
  h.setClubHealth({valid:false,collision:false});h.tick();h.advance(8001);h.tick();
  assert.deepEqual(h.positions.get(10),[100,200,30]);assert.equal(h.frozen.get(10),false);
  assert.deepEqual([...h.entities],[10]);
  assert.ok(h.calls.some(c=>c[0]==='message'&&c[1].includes('could not recover after 8 seconds')));
});

test('club built-in emitters are muted while walking and dancing, custom music still switches, and emitters restore on exit',async()=>{
  const h=await room();await h.net['webcam_mocap_animlab:visit']('webcam_recording','webcam_take');h.tick();
  const emitters=h.calls.filter(c=>c[0]==='clubEmitter');
  assert.equal(emitters.length,9);assert.ok(emitters.every(c=>c[2]===false));
  assert.ok(emitters.some(c=>c[1]==='SE_ba_dlc_int_01_main_area'));
  assert.equal(h.calls.filter(c=>c[0]==='hud').at(-1)[1].music.mode,'background');
  h.advance(1000);h.tick();assert.equal(h.calls.filter(c=>c[0]==='clubEmitter').length,18,'reapplies once per second');
  h.positions.set(10,[0,1.5,1001]);h.tick();await h.flush();h.tick();
  assert.equal(h.calls.filter(c=>c[0]==='hud').at(-1)[1].music.mode,'animation');
  assert.ok(!h.calls.some(c=>c[0]==='clubEmitter'&&c[2]===true),'game music remains muted during playback');
  h.events.onResourceStop('webcam_mocap_animlab');
  const restored=h.calls.filter(c=>c[0]==='clubEmitter'&&c[2]===true);
  assert.equal(restored.length,9);
});

test('failed club entry restores built-in emitters instead of leaving them muted',async()=>{
  const h=await room({collisionFail:true});await h.net['webcam_mocap_animlab:visit']('webcam_recording','webcam_take');
  assert.equal(h.calls.filter(c=>c[0]==='clubEmitter'&&c[2]===true).length,9);
});

test('crossfade command applies and saves an explicit runtime setting, status shows it, and reset restores config',async()=>{
  const kvp=new Map(),h=await room({kvp});await h.net['webcam_mocap_animlab:visit']('webcam_recording','webcam_take');
  h.commands.mocaplabcrossfade(0,['2']);
  assert.equal(kvp.get('backgroundCrossfadeSeconds'),'2');
  assert.equal(h.calls.filter(c=>c[0]==='hud'&&c[1].music).at(-1)[1].music.crossfadeSeconds,2);
  h.commands.mocaplabmusic(0,['status']);
  assert.ok(h.calls.some(c=>c[0]==='message'&&c[1].includes('requested crossfade: 2s (saved override)')));
  const fresh=await room({kvp});fresh.commands.mocaplabcrossfade(0,[]);
  assert.match(fresh.calls.filter(c=>c[0]==='message').at(-1)[1],/2s \(saved override\)/);
  h.commands.mocaplabcrossfade(0,['reset']);assert.equal(kvp.has('backgroundCrossfadeSeconds'),false);
  assert.equal(h.calls.filter(c=>c[0]==='hud'&&c[1].music).at(-1)[1].music.crossfadeSeconds,.2);
  h.net['webcam_mocap_animlab:stop']();
});

test('fractional animation delay starts music immediately and preserves its timeline when dancers start',async()=>{
  const h=await room({startDelay:.25,delay:5,duration:8});
  await h.net['webcam_mocap_animlab:visit']('webcam_recording','webcam_take');
  const hud=()=>h.calls.filter(c=>c[0]==='hud'&&c[1].type==='mocapComparison').at(-1)[1];
  h.positions.set(10,[0,1.5,1001]);h.tick();await h.flush();
  assert.equal(h.frozen.get(10),true);assert.ok(h.calls.some(c=>c[0]==='camera'));
  assert.equal(h.calls.filter(c=>c[0]==='play').length,0);
  assert.equal(hud().music.mode,'animation');assert.equal(hud().music.seconds,0);assert.equal(hud().scoreVisible,false);
  const musicSession=hud().music.session;
  assert.ok(!h.clubProps.has('DJ_04_Lights_04'));
  h.advance(249);h.tick();await h.flush();assert.equal(h.calls.filter(c=>c[0]==='play').length,0);
  h.advance(1);h.tick();await h.flush();h.tick();
  assert.equal(h.calls.filter(c=>c[0]==='play').length,3);
  assert.equal(hud().music.mode,'animation');assert.equal(hud().score.goal,150);
  assert.equal(hud().music.session,musicSession);assert.equal(hud().music.seconds,.25);
  assert.equal(hud().countdown,null);assert.ok(h.clubProps.has('DJ_04_Lights_04'));
  h.advance(2000);h.tick();assert.equal(hud().countdown,3,'scoring countdown follows clip time, not approach time');
  assert.equal(h.calls.filter(c=>c[0]==='play').length,3,'delayed playback starts once');
  h.advance(6001);h.tick();assert.equal(h.frozen.get(10),false);assert.equal(hud().music.mode,'background');
  h.net['webcam_mocap_animlab:stop']();
});

test('stopping during start delay cancels pending dancers and immediately returns to background music',async()=>{
  const h=await room({startDelay:1.5});await h.net['webcam_mocap_animlab:visit']('webcam_recording','webcam_take');
  h.positions.set(10,[0,1.5,1001]);h.tick();
  h.commands.mocaplabplay(0,['stop']);
  assert.equal(h.frozen.get(10),false);
  assert.equal(h.calls.filter(c=>c[0]==='hud').at(-1)[1].music.mode,'background');
  h.advance(3000);h.tick();await h.flush();assert.equal(h.calls.filter(c=>c[0]==='play').length,0);
});

test('exiting or stopping the resource during animation start delay cancels playback and restores the player',async()=>{
  for(const resourceStop of [false,true]) {
    const h=await room({startDelay:1.5});await h.net['webcam_mocap_animlab:visit']('webcam_recording','webcam_take');
    h.positions.set(10,[0,1.5,1001]);h.tick();assert.equal(h.frozen.get(10),true);
    if(resourceStop)h.events.onResourceStop('webcam_mocap_animlab');else h.net['webcam_mocap_animlab:stop']();
    h.advance(10000);h.tick();await h.flush();
    assert.equal(h.calls.filter(c=>c[0]==='play').length,0);assert.deepEqual([...h.entities],[10]);
    assert.deepEqual(h.positions.get(10),[100,200,30]);assert.equal(h.frozen.get(10),false);
  }
});

test('recorded crouch lowers all three actors to keep support feet planted, without accumulating vertical drift',async()=>{
  const h=await room();await h.net['webcam_mocap_animlab:visit']('webcam_recording','webcam_take');
  const actors=[...h.entities].filter(id=>h.models.has(id)),base=new Map(actors.map(id=>[id,[...h.positions.get(id)]]));
  h.positions.set(10,[0,1.5,1001]);h.tick();await h.flush();
  for(const call of h.calls.filter(c=>c[0]==='play'))assert.equal(call[7]&1024,0,'animation mover must not override scripted stage placement');
  h.setFootLift(.4,.4);h.advance(500);h.tick();
  assert.ok(h.calls.filter(c=>c[0]==='position').slice(-3).every(c=>c[5]===true&&c[6]===true),'height correction preserves animation tasks and IK');
  for(const id of actors) {
    assert.ok(Math.abs(h.positions.get(id)[2]-(base.get(id)[2]-.4))<1e-6);
    assert.deepEqual(h.positions.get(id).slice(0,2),base.get(id).slice(0,2));
  }
  h.tick();for(const id of actors)assert.ok(Math.abs(h.positions.get(id)[2]-(base.get(id)[2]-.4))<1e-6);
  h.setFootLift(0,0);h.tick();for(const id of actors)assert.ok(Math.abs(h.positions.get(id)[2]-base.get(id)[2])<1e-6);
  h.setFootLift(.3,.3);h.tick();h.advance(1501);h.tick();
  for(const id of actors)assert.deepEqual(h.positions.get(id),base.get(id),'completion restores stage height');
  h.net['webcam_mocap_animlab:stop']();assert.deepEqual(h.positions.get(10),[100,200,30]);
});

test('grounding preserves one-foot lifts and can be disabled for airborne clips',async()=>{
  for(const groundFeet of [true,false]) {
    const h=await room({groundFeet});await h.net['webcam_mocap_animlab:visit']('webcam_recording','webcam_take');
    const actor=[...h.entities].find(id=>h.models.has(id)),z=h.positions.get(actor)[2];
    h.positions.set(10,[0,1.5,1001]);h.tick();await h.flush();
    h.setFootLift(.5,groundFeet?0:.5);h.advance(500);h.tick();
    assert.ok(Math.abs(h.positions.get(actor)[2]-z)<1e-6);
    h.net['webcam_mocap_animlab:stop']();
  }
});

test('animated entity-bone coordinates support vector objects and grounding reports actual movement and toggles safely',async()=>{
  const h=await room({worldFeet:true});await h.net['webcam_mocap_animlab:visit']('webcam_recording','webcam_take');
  const actor=[...h.entities].find(id=>h.models.has(id)),z=h.positions.get(actor)[2];
  h.positions.set(10,[0,1.5,1001]);h.tick();await h.flush();
  h.setFootLift(.4,.4);h.advance(500);h.tick();
  assert.ok(Math.abs(h.positions.get(actor)[2]-(z-.4))<1e-6);
  h.commands.mocaplabground(0,['status']);
  assert.match(h.calls.filter(c=>c[0]==='message').at(-1)[1],/active: true; feet source: entity-bone;.*actual shift: -0.400m/);
  h.commands.mocaplabground(0,['off']);assert.equal(h.positions.get(actor)[2],z);
  h.tick();assert.equal(h.positions.get(actor)[2],z);
  h.commands.mocaplabground(0,['on']);h.tick();
  assert.ok(Math.abs(h.positions.get(actor)[2]-(z-.4))<1e-6);
  h.net['webcam_mocap_animlab:stop']();
});

test('scene-origin grounding corrects a task-anchored pose that entity teleports fail to move',async()=>{
  const old=await room({anchoredBones:true,duration:8});
  await old.net['webcam_mocap_animlab:visit']('webcam_recording','webcam_take');
  old.positions.set(10,[0,1.5,1001]);old.tick();await old.flush();
  const oldActor=[...old.models.keys()][0];old.setFootLift(.125,.125);old.tick();
  assert.ok(old.footZ(oldActor)>1000.16,'fixture reproduces floating pose even though the entity coordinate moved');
  old.net['webcam_mocap_animlab:stop']();

  const h=await room({synchronized:true,anchoredBones:true,worldFeet:true,duration:8});
  await h.net['webcam_mocap_animlab:visit']('webcam_recording','webcam_take');
  const actors=[...h.models.keys()],base=new Map(actors.map(id=>[id,[...h.positions.get(id)]]));
  h.positions.set(10,[0,1.5,1001]);h.tick();await h.flush();
  assert.equal(h.calls.filter(c=>c[0]==='scenePlay').length,3);assert.equal(h.calls.filter(c=>c[0]==='play').length,0);
  const teleports=h.calls.filter(c=>c[0]==='position').length;
  h.setFootLift(.214,.125);h.advance(500);h.tick();h.tick();
  for(const id of actors) {
    assert.ok(Math.abs(h.footZ(id,52301)-1000.04)<1e-6,'support foot reaches floor after pose evaluation');
    assert.ok(Math.abs(h.footZ(id)-h.footZ(id,52301)-.089)<1e-6,'raised foot stays raised');
    assert.deepEqual(h.positions.get(id).slice(0,2),base.get(id).slice(0,2));
  }
  for(let i=0;i<20;i++){h.advance(16);h.tick();}
  assert.equal(h.calls.filter(c=>c[0]==='position').length,teleports,'grounding changes task origins, never teleports actors');
  for(const id of actors)assert.ok(Math.abs(h.footZ(id,52301)-1000.04)<1e-6,'no origin accumulation');
  h.commands.mocaplabground(0,['status']);
  assert.match(h.calls.filter(c=>c[0]==='message').at(-1)[1],/backend: synchronized-scene;.*foot error before correction: 0.000m/);
  h.setFootLift(0,0);h.tick();h.tick();for(const id of actors)assert.ok(Math.abs(h.positions.get(id)[2]-base.get(id)[2])<1e-6);
  h.advance(8001);h.tick();assert.equal(h.pedScenes.size,0);
  for(const id of actors) {assert.deepEqual(h.positions.get(id),base.get(id));assert.equal(h.frozen.get(id),true);}
});

test('scene playback preserves delayed actor start, uninterrupted music, scoring time, backup phase and grounding toggle',async()=>{
  const h=await room({synchronized:true,anchoredBones:true,startDelay:.25,delay:5,duration:8});
  await h.net['webcam_mocap_animlab:visit']('webcam_recording','webcam_take');
  const hud=()=>h.calls.filter(c=>c[0]==='hud').at(-1)[1];
  h.positions.set(10,[0,1.5,1001]);h.tick();const session=hud().music.session;
  assert.equal(hud().music.mode,'animation');assert.equal(h.pedScenes.size,0);
  h.advance(250);h.tick();await h.flush();h.tick();
  assert.equal(h.pedScenes.size,3);assert.equal(hud().music.session,session);assert.equal(hud().music.seconds,.25);
  assert.equal(hud().score.goal,150);
  h.advance(2000);h.tick();assert.equal(hud().countdown,3);
  const ids=[...h.pedScenes.values()];for(const id of ids.slice(1))assert.equal(h.localScenes.get(id).phase,.25);
  h.setFootLift(.4,.4);h.tick();h.tick();
  const actor=[...h.pedScenes.keys()][0];assert.ok(Math.abs(h.footZ(actor)-1000.04)<1e-6);
  h.commands.mocaplabground(0,['off']);h.tick();assert.ok(Math.abs(h.footZ(actor)-1000.44)<1e-6);
  h.commands.mocaplabground(0,['on']);h.tick();h.tick();assert.ok(Math.abs(h.footZ(actor)-1000.04)<1e-6);
  h.commands.mocaplabplayinfo();assert.match(h.calls.filter(c=>c[0]==='message').at(-1)[1],/position 25.0%/);
  h.commands.mocaplabplay(0,['stop']);assert.equal(h.pedScenes.size,0);assert.equal(hud().music.mode,'background');
});

test('failed, timed-out and interrupted scene startup releases actors and restores their frozen stage state',async()=>{
  for(const options of [{sceneFailAt:2},{sceneNeverStarts:true},{}]) {
    const h=await room({synchronized:true,...options});await h.net['webcam_mocap_animlab:visit']('webcam_recording','webcam_take');
    h.positions.set(10,[0,1.5,1001]);h.tick();await new Promise(setImmediate);
    if(!Object.keys(options).length)h.events.onResourceStop('webcam_mocap_animlab');
    assert.equal(h.pedScenes.size,0);assert.equal(h.frozen.get(10),false);
    for(const id of h.models.keys())assert.equal(h.frozen.get(id),true);
    assert.ok(h.calls.some(c=>c[0]==='sceneHold'&&c[2]===false),'release last-frame hold on exit');
  }
});

test('negative fractional offsets delay only music, starting it at zero on its own timeline',async()=>{
  for(const synchronized of [false,true]) {
    const h=await room({synchronized,startDelay:-.25,duration:8,delay:5});
    await h.net['webcam_mocap_animlab:visit']('webcam_recording','webcam_take');
    const hud=()=>h.calls.filter(c=>c[0]==='hud').at(-1)[1];
    h.positions.set(10,[0,1.5,1001]);h.tick();await h.flush();h.tick();
    const played=()=>h.calls.filter(c=>c[0]===(synchronized?'scenePlay':'play')).length;
    assert.equal(played(),3);assert.equal(hud().music.mode,'waiting');assert.equal(hud().music.file,null);
    h.advance(249);h.tick();assert.equal(hud().music.mode,'waiting');
    h.advance(1);h.tick();assert.equal(hud().music.mode,'animation');assert.equal(hud().music.seconds,0);
    const session=hud().music.session;
    h.advance(250);h.tick();assert.equal(hud().music.seconds,.25);assert.equal(hud().music.session,session);
    assert.equal(played(),3,'music deadline does not restart actors');
    h.advance(1500);h.tick();assert.equal(hud().countdown,3,'scoring follows animation time, not music');
    assert.equal(hud().score.goal,150);
    h.advance(6001);h.tick();assert.equal(hud().music.mode,'background');assert.equal(h.frozen.get(10),false);
  }
});

test('ending or cancelling before a delayed music start never plays the track later',async()=>{
  for(const action of ['complete','cancel','exit','resource']) {
    const h=await room({synchronized:true,startDelay:-2,duration:1});
    await h.net['webcam_mocap_animlab:visit']('webcam_recording','webcam_take');
    h.positions.set(10,[0,1.5,1001]);h.tick();await h.flush();h.tick();
    if(action==='complete'){h.advance(1001);h.tick();}
    if(action==='cancel')h.commands.mocaplabplay(0,['stop']);
    if(action==='exit')h.net['webcam_mocap_animlab:stop']();
    if(action==='resource')h.events.onResourceStop('webcam_mocap_animlab');
    h.advance(3000);h.tick();
    assert.ok(!h.calls.some(c=>c[0]==='hud'&&c[1].music?.mode==='animation'));
    assert.equal(h.pedScenes.size,0);
  }
});

test('mirroring selects the alternate dictionary once for all dancers while retaining clip names and synchronization',async()=>{
  for(const dict of ['webcam_recording','webcam_recording_mirrored']) {
    const h=await room({synchronized:true,mirror:true});await h.net['webcam_mocap_animlab:visit'](dict,'webcam_take');
    h.positions.set(10,[0,1.5,1001]);h.tick();await h.flush();h.tick();
    const tasks=h.calls.filter(c=>c[0]==='scenePlay');assert.equal(tasks.length,3);
    assert.ok(tasks.every(c=>c[3]==='webcam_recording_mirrored'&&c[4]==='webcam_take'));
    assert.ok(h.calls.filter(c=>c[0]==='requestDict').every(c=>c[1]==='webcam_recording_mirrored'));
    h.commands.mocaplabplayinfo();assert.match(h.calls.filter(c=>c[0]==='message').at(-1)[1],/webcam_recording_mirrored \/ webcam_take/);
    h.net['webcam_mocap_animlab:stop']();assert.equal(h.pedScenes.size,0);
  }
});

test('mirrored facing correction rotates all playback actors, survives grounding, and restores stage headings',async()=>{
  for(const synchronized of [false,true])for(const groundFeet of [false,true]) {
    for(const [mirror,mirrorHeading,expected] of [[true,undefined,180],[false,undefined,0],[true,0,0],[true,-90,270],[true,NaN,180]]) {
      const h=await room({synchronized,groundFeet,mirror,mirrorHeading});
      await h.net['webcam_mocap_animlab:visit']('webcam_recording','webcam_take');
      const base=new Map([...h.headings].filter(([id])=>id!==10));
      h.positions.set(10,[0,1.5,1001]);h.tick();await h.flush();h.tick();
      if(synchronized) {
        const scenes=h.calls.filter(c=>c[0]==='createScene');
        assert.equal(scenes.length,3);
        assert.ok(scenes.every(c=>c[5]===expected));
        assert.ok(h.calls.filter(c=>c[0]==='sceneOrigin').every(c=>c[5]===expected),'grounding keeps corrected scene heading');
      } else {
        assert.equal(base.size,3);
        for(const [id,heading] of base)assert.equal(h.headings.get(id),(heading+expected)%360);
      }
      h.commands.mocaplabplayinfo();
      assert.ok(h.calls.some(c=>c[0]==='message'&&c[1].includes(`facing correction: ${expected===270?-90:expected}°`)));
      h.advance(2100);h.tick();
      for(const [id,heading] of base)assert.equal(h.headings.get(id),heading,'return to stage heading after round');
      h.positions.set(10,[0,3.5,1001]);h.tick();h.positions.set(10,[0,1.4,1001]);h.tick();await h.flush();
      if(synchronized)assert.ok(h.calls.filter(c=>c[0]==='createScene').every(c=>c[5]===expected),'replay must not accumulate rotations');
      else for(const [id,heading] of base)assert.equal(h.headings.get(id),(heading+expected)%360);
      h.net['webcam_mocap_animlab:stop']();
    }
  }
});

test('missing mirrored dictionary explains the export requirement and restores the player safely',async()=>{
  const h=await room({mirror:true,missingDictionaries:new Set(['webcam_recording_mirrored'])});
  await h.net['webcam_mocap_animlab:visit']('webcam_recording','webcam_take');
  assert.deepEqual(h.positions.get(10),[100,200,30]);assert.equal(h.frozen.get(10),false);
  assert.ok(h.calls.some(c=>c[0]==='message'&&c[1].includes('mirrorRecordedAnimation: false')));
  assert.equal(h.calls.filter(c=>c[0]==='play'||c[0]==='scenePlay').length,0);
});

test('mirror command reveals incorrectly typed config and forces the next visit without changing an existing round',async()=>{
  const h=await room({synchronized:true,mirror:'true'});
  h.commands.mocaplabmirror(0,['status']);
  assert.ok(h.calls.some(c=>c[0]==='message'&&c[1].includes('"true" (string); effective: OFF')));
  assert.ok(h.calls.some(c=>c[0]==='message'&&c[1].includes('without quotation marks')));
  h.commands.mocaplabmirror(0,['on']);
  await h.net['webcam_mocap_animlab:visit']('webcam_recording','webcam_take');
  h.commands.mocaplabmirror(0,['off']);
  h.positions.set(10,[0,1.5,1001]);h.tick();await h.flush();h.tick();
  assert.ok(h.calls.filter(c=>c[0]==='scenePlay').every(c=>c[3]==='webcam_recording_mirrored'),'visit retains dictionary chosen on entry');
  h.net['webcam_mocap_animlab:stop']();
  h.calls.length=0;await h.net['webcam_mocap_animlab:visit']('webcam_recording','webcam_take');
  h.positions.set(10,[0,1.5,1001]);h.tick();await h.flush();h.tick();
  assert.ok(h.calls.filter(c=>c[0]==='scenePlay').every(c=>c[3]==='webcam_recording'));
  h.net['webcam_mocap_animlab:stop']();
});

test('mirror temporary overrides reset to boolean config and never silently use a misspelled asset',async()=>{
  const h=await room({mirror:true,missingDictionaries:new Set(['webcam_recording_mirrored'])});
  h.commands.mocaplabmirror(0,['off']);h.commands.mocaplabmirror(0,['config']);
  assert.ok(h.calls.some(c=>c[0]==='message'&&c[1].includes('true (boolean); effective: ON (config)')));
  await h.net['webcam_mocap_animlab:visit']('webcam_recording','webcam_take');
  assert.ok(h.calls.some(c=>c[0]==='message'&&c[1].includes('webcam_recording_mirrored.ycd')&&c[1].includes('_mirrord.ycd')));
  const fresh=await room({mirror:false});fresh.commands.mocaplabmirror(0,['status']);
  assert.ok(fresh.calls.some(c=>c[0]==='message'&&c[1].includes('effective: OFF (config)')));
});

test('visit server command checks ACE, validates clip names and requires no webcam pairing',async()=>{
  const commands={},messages=[];let allowed=false;
  const context=vm.createContext({require,PoseProtocol:{},RegisterCommand:(n,fn)=>commands[n]=fn,
    IsPlayerAceAllowed:()=>allowed,emitNet:(...a)=>messages.push(a),on(){},onNet(){},setInterval(){},SetHttpHandler(){}});
  vm.runInContext(await readFile(new URL('../resource/webcam_mocap_animlab/server.js',import.meta.url),'utf8'),context);
  commands.mocaplabvisit(1,[]);assert.match(messages.at(-1)[2],/permission/);
  allowed=true;commands.mocaplabvisit(1,[]);
  assert.deepEqual(messages.at(-1).slice(0,4),['webcam_mocap_animlab:visit',1,'webcam_recording','webcam_take']);
  assert.match(messages.at(-1)[4],/^[a-f0-9]{48}$/);
  commands.mocaplabvisit(1,['custom_dict','custom_clip']);assert.equal(messages.at(-1)[2],'custom_dict');
  commands.mocaplabvisit(1,['../bad','clip']);assert.match(messages.at(-1)[2],/Use/);
  commands.mocaplabvisit(1,['stop']);assert.deepEqual(messages.at(-1),['webcam_mocap_animlab:stop',1]);
});
