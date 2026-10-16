import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { createCompanion } from '../companion/server.mjs';
import { retarget, emptyPose } from '../companion/public/retarget.mjs';
import { deliveryStatus } from '../companion/public/delivery.mjs';
const require = createRequire(import.meta.url);
const protocol = require('../resource/webcam_mocap_animlab/protocol.js');
const pose = () => ({ ...emptyPose(1), tracked: true });

test('reject malformed, nonfinite, oversized and incomplete targets', () => {
  assert.equal(protocol.validate(pose()), true);
  for (const value of [NaN, Infinity, '1', 10]) {
    const p = pose(); p.targets.leftHand.x = value;
    assert.equal(protocol.validate(p), false);
  }
  const p = pose(); delete p.targets.head;
  assert.equal(protocol.validate(p), false);
  assert.equal(protocol.validate({}), false);
  const anchored = pose(); anchored.targets.leftHand.anchor = 'leftShoulder';
  assert.equal(protocol.validate(anchored), true);
  assert.equal(protocol.sanitize(anchored).targets.leftHand.anchor, 'leftShoulder');
  anchored.targets.leftHand.anchor = 'rightShoulder';
  assert.equal(protocol.validate(anchored), false);
  anchored.targets.leftHand.anchor = undefined; anchored.targets.head.anchor = 'leftShoulder';
  assert.equal(protocol.validate(anchored), false);
});

function armFixture() {
  const w = Array.from({length:33}, () => ({x:0,y:0,z:0,visibility:1}));
  w[11] = {x:0.19,y:-0.5,z:0,visibility:1};
  w[12] = {x:-0.19,y:-0.5,z:0,visibility:1};
  const image = Array.from({length:33}, () => ({x:0.5,y:0.5,visibility:1}));
  image[11] = {x:0.6,y:0.35,visibility:1};
  image[12] = {x:0.4,y:0.35,visibility:1};
  return { w, image };
}
test('hand at shoulder stays folded despite hallucinated extended 3D wrist', () => {
  const { w, image } = armFixture();
  w[15] = {x:0.85,y:-0.8,z:-0.75,visibility:1};
  image[15] = {x:0.61,y:0.34,visibility:1};
  const p = retarget(w, 1, 1, image, 4/3);
  const h = p.targets.leftHand;
  assert.equal(h.anchor, 'leftShoulder');
  assert.ok(Math.abs(h.x) < 0.03);
  assert.ok(Math.abs(h.z) < 0.03);
  assert.ok(h.y >= 0.08 && h.y <= 0.18);
  assert.ok(Math.hypot(h.x,h.y,h.z) < 0.2, 'target remains close to actual rig shoulder');
  assert.equal(protocol.validate(p), true);
});
test('arm extends and retracts continuously; left/right hands stay independent', () => {
  const { w, image } = armFixture();
  w[15] = {x:0.75,y:-0.5,z:-0.1,visibility:1};
  image[15] = {x:0.9,y:0.35,visibility:1};
  image[16] = {x:0.39,y:0.34,visibility:1};
  w[16] = {x:-0.2,y:-0.5,z:-0.5,visibility:1};
  const extended = retarget(w, 1, 1, image);
  assert.ok(extended.targets.leftHand.x < -0.5);
  assert.ok(Math.abs(extended.targets.rightHand.x) < 0.03);
  image[15] = {x:0.61,y:0.35,visibility:1};
  const folded = retarget(w, 2, 1, image);
  assert.ok(Math.abs(folded.targets.leftHand.x) < 0.03);
  image[15].visibility = 0.1;
  const hidden = retarget(w, 3, 1, image);
  assert.equal(hidden.targets.leftHand.confidence, 0);
  assert.ok(hidden.targets.rightHand.confidence >= 0.6);
});
test('projected arm mapping corrects image aspect ratio and preserves backward input', () => {
  const { w, image } = armFixture();
  image[15] = {x:0.6,y:0.25,visibility:1};
  const landscape = retarget(w,1,1,image,4/3).targets.leftHand;
  const wide = retarget(w,2,1,image,16/9).targets.leftHand;
  assert.ok(landscape.z > wide.z);
  assert.ok(Math.abs(landscape.z - 0.1425) < 0.001);
  assert.equal(protocol.validate(retarget(w,3)), true);
});

test('retarget metric landmarks to anatomical sides; reject occluded core', () => {
  const w = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 1 }));
  w[11] = { x: 0.19, y: -0.5, z: 0, visibility: 1 };
  w[12] = { x: -0.19, y: -0.5, z: 0, visibility: 1 };
  w[15] = { x: 0.6, y: -0.4, z: -0.2, visibility: 1 };
  const p = retarget(w, 7);
  assert.equal(p.tracked, true); assert.equal(p.seq, 7);
  assert.ok(p.targets.leftHand.x < 0); assert.ok(p.targets.leftHand.y > 0);
  assert.equal(p.targets.head.y, 1);
  assert.equal(protocol.validate(p), true);
  w[23].visibility = 0.1;
  assert.equal(retarget(w, 8).tracked, false);
  assert.equal(retarget([], 8).tracked, false);
});

test('relay checks origin and token, sanitizes, and propagates pairing failure', async t => {
  let captured;
  const server = createCompanion({ relay: async (_url, options) => {
    captured = options;
    return { status: 401, ok: false, text: async () => 'Pair again with /mocaplab' };
  }});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(origin)).status, 200);
  assert.equal((await fetch(`${origin}/hand-math.js`)).status,200,'shared wrist math is served to browser');
  assert.equal((await fetch(`${origin}/pose`, { method: 'POST', body: '{}' })).status, 403);
  assert.equal((await fetch(`${origin}/pose`, { method: 'POST', headers: { Origin: origin }, body: '{}' })).status, 400);
  const p = pose(); p.secret = 'discard';
  p.targets.leftHand.anchor = 'leftShoulder';
  p.targets.leftHand.orientation = {x:0,y:0,z:0,w:1};
  const r = await fetch(`${origin}/pose`, { method: 'POST', headers: { Origin: origin, 'X-Pair-Token': 'a'.repeat(48) }, body: JSON.stringify(p) });
  assert.equal(r.status, 401);
  assert.equal(captured.headers.Authorization, `Bearer ${'a'.repeat(48)}`);
  assert.equal(JSON.parse(captured.body).secret, undefined);
  assert.equal(JSON.parse(captured.body).targets.leftHand.anchor, 'leftShoulder');
  assert.deepEqual(JSON.parse(captured.body).targets.leftHand.orientation,{x:0,y:0,z:0,w:1});
  assert.equal((await fetch(`${origin}/../server.mjs`)).status, 404);
});

test('FiveM bridge pairs only permitted users and revokes stale in-flight poses', async () => {
  let command, handler, ackHandler, allowed = false, clock = 10000;
  const messages = [];
  const context = vm.createContext({
    require, PoseProtocol: protocol,
    Date: { now: () => clock },
    RegisterCommand: (name, fn) => { if(name==='mocaplab')command = fn; },
    IsPlayerAceAllowed: () => allowed,
    emitNet: (...args) => messages.push(args),
    on: () => {}, setInterval: () => {},
    global: { source: 1 },
    onNet: (_n, fn) => { ackHandler = fn; },
    SetHttpHandler: fn => { handler = fn; }
  });
  vm.runInContext(await readFile(new URL('../resource/webcam_mocap_animlab/server.js', import.meta.url), 'utf8'), context);
  command(1, ['preview']);
  assert.equal(messages[0][0], 'webcam_mocap_animlab:notice');
  allowed = true; command(1, ['preview']);
  const token = messages.find(m => m[0] === 'webcam_mocap_animlab:start')[3];
  assert.match(token, /^[a-f0-9]{48}$/);
  function request(bearer) {
    let status, callback, body;
    handler({ method: 'POST', path: '/pose', headers: { authorization: `Bearer ${bearer}` }, setDataHandler: fn => { callback = fn; } },
      { writeHead: s => { status = s; }, send: text => { body = text; } });
    return { data: body => callback(body), status: () => status, body: () => body };
  }
  assert.equal(request('wrong').status(), 401);
  const r = request(token); r.data(JSON.stringify(pose()));
  assert.equal(r.status(), 200);
  assert.equal(JSON.parse(r.body()).game, null, 'HTTP acceptance alone is not game confirmation');
  ackHandler(1, 'applied', ['leftHand','rightHand','head'],[],{active:true,manual:false,amount:0.6,phase:0.59});
  assert.equal(messages.filter(m => m[0] === 'webcam_mocap_animlab:pose').length, 1);
  assert.equal(request(token).status(), 429);
  clock += 100;
  const duplicate = request(token); duplicate.data(JSON.stringify(pose()));
  assert.equal(duplicate.status(), 400);
  clock += 100;
  const confirmed = request(token); confirmed.data(JSON.stringify({...pose(), seq: 2}));
  assert.equal(JSON.parse(confirmed.body()).game.state, 'applied');
  assert.equal(JSON.parse(confirmed.body()).game.parts.length, 3);
  assert.equal(JSON.parse(confirmed.body()).game.animation.amount,0.6);
  clock += 100;
  const inFlight = request(token);
  command(1, ['stop']); inFlight.data(JSON.stringify({ ...pose(), seq: 3 }));
  assert.equal(inFlight.status(), 401);
  assert.equal(request(token).status(), 401);
});

test('minigame camera and room persist through tracking loss; stop restores player and camera', async () => {
  const net = {}, events = {}, calls = [];
  let tick, clock = 1000, animationPlaying=false;
  let recordedClock=null;
  const recordedPhase=()=>recordedClock?Math.min(1,recordedClock.phase+(clock-recordedClock.at)/1600*recordedClock.speed):0;
  const commands={};
  let frozen = false, failCamera = false, nextObject = 31;
  const positions = new Map([[10, [12,34,56]], [20, [12,34,56]]]);
  const context = vm.createContext({
    // Deliberately do not inject HandMath: client must work without a shared global.
    console: { log() {} }, PoseProtocol: protocol,
    MocapScore:require('../resource/webcam_mocap_animlab/score-math.js'),
    RegisterNuiCallbackType() {},SendNuiMessage() {},
    GetResourceKvpString:()=>null,
    onNet: (n, fn) => { net[n] = fn; }, on: (n, fn) => { events[n] = fn; },
    emit: () => {}, emitNet: (...args) => calls.push(['ack',...args]), setTick: fn => { tick = fn; },
    PlayerPedId: () => 10, PlayerId: () => 1,
    RegisterCommand: (name,fn) => {commands[name]=fn;},
    IsGameplayCamRendering: () => true,
    RequestAnimDict() {},HasAnimDictLoaded: () => true,GetAnimDuration: () => 1.6,RemoveAnimDict() {},
    TaskPlayAnim: (...args) => {
      animationPlaying=true;calls.push(['playClip',...args]);
      if(args[1]==='webcam_recording')recordedClock={phase:args[7],at:clock,speed:1};
    },
    StopAnimTask: (...args) => {animationPlaying=false;calls.push(['stopClip',...args]);},
    IsEntityPlayingAnim: () => animationPlaying ? 1 : 0,
    RequestAnimSet() {}, HasAnimSetLoaded: () => 1, RemoveAnimSet() {},
    SetPedMovementClipset: (...a) => calls.push(['crouchSet',...a]),
    ResetPedMovementClipset: (...a) => calls.push(['resetCrouch',...a]),
    ResetPedStrafeClipset() {}, SetPedStealthMovement() {},
    SetEntityAnimSpeed: (...args) => {
      calls.push(['clipSpeed',...args]);
      if(args[1]==='webcam_recording')recordedClock={phase:recordedPhase(),at:clock,speed:args[3]};
    },
    SetEntityAnimCurrentTime: (...args) => {
      calls.push(['clipPhase',...args]);
      if(args[1]==='webcam_recording')recordedClock={phase:args[3],at:clock,speed:recordedClock.speed};
    },
    GetEntityAnimCurrentTime: recordedPhase,
    ClonePed: () => 20, DoesEntityExist: () => true,
    GetEntityHeading: () => 0,
    GetOffsetFromEntityInWorldCoords: (ped, x,y,z) => {
      const origin = positions.get(ped); return [x+origin[0],y+origin[1],z+origin[2]];
    },
    GetOffsetFromEntityGivenWorldCoords: (ped, x,y,z) => {
      const origin = positions.get(ped); return [x-origin[0],y-origin[1],z-origin[2]];
    },
    GetEntityCoords: ped => positions.get(ped),
    GetPedBoneCoords: (ped, bone, ox=0,oy=0,oz=0) => {
      const p = positions.get(ped);
      const leftHandBones=[18905,26612,26611,26614],rightHandBones=[57005,58868,58867,58870];
      const left=leftHandBones.includes(bone),right=rightHandBones.includes(bone);
      if(left||right) {
        const finger=!(bone===18905||bone===57005);
        const lateral=[26611,58867].includes(bone)?0.03:[26614,58870].includes(bone)?-0.03:0;
        return [p[0]+(left?-0.6:0.6)+lateral+ox,p[1]+oy,p[2]+0.45-(finger?0.1:0)+oz];
      }
      const shoulder = [45509,40269].includes(bone);
      return [p[0] + (shoulder ? (bone === 45509 ? -0.21 : 0.21) : 0), p[1],
        p[2] + (shoulder ? 0.48 : bone === 31086 ? 0.7 : [14201,52301].includes(bone) ? -0.95 : 0)];
    },
    SetEntityCoordsNoOffset: (ped, x, y, z) => { positions.set(ped, [x,y,z]); calls.push(['position',ped,x,y,z]); },
    SetEntityHeading: (...args) => calls.push(['heading', ...args]), SetEntityCollision() {},
    GetHashKey: () => 123, RequestModel() {}, HasModelLoaded: () => true, SetModelAsNoLongerNeeded() {},
    CreateObjectNoOffset: () => {const id=nextObject++;positions.set(id,[0,0,0]);return id;},
    SetEntityAlpha() {}, GetEntityQuaternion: () => [0,0,0,1],
    SetEntityQuaternion: (...args) => calls.push(['quaternion',...args]),
    SetEntityInvincible() {},
    FreezeEntityPosition: (ped, state) => { if (ped === 10) frozen = state; calls.push(['freeze',ped,state]); },
    IsEntityPositionFrozen: () => frozen,
    SetBlockingOfNonTemporaryEvents() {},
    CreateCamWithParams: (...args) => { calls.push(['camera', ...args]); return failCamera ? 0 : 30; },
    PointCamAtCoord: (...args) => calls.push(['look', ...args]),
    SetCamNearClip() {}, SetCamFarClip() {},
    SetFocusPosAndVel: (...args) => calls.push(['focus', ...args]),
    RenderScriptCams: (...args) => calls.push(['render', ...args]),
    DestroyCam: (...args) => calls.push(['destroyCamera', ...args]),
    ClearFocus: () => calls.push(['clearFocus']),
    SetEntityLocallyInvisible: ped => calls.push(['hidden', ped]),
    HideHudAndRadarThisFrame() {},
    DisableAllControlActions: () => calls.push(['disableControls']), EnableControlAction() {},
    DrawPoly: (...args) => calls.push(['poly', ...args]), DrawLightWithRange() {},
    RemoveAllPedWeapons() {}, ClearPedTasksImmediately: ped=>calls.push(['clearTasks',ped]), SetPedCanPlayAmbientAnims() {},
    SetPedCanPlayAmbientBaseAnims: (...a)=>calls.push(['ambientBase',...a]),
    SetPedCanPlayGestureAnims: (...a)=>calls.push(['gestures',...a]),
    SetPedCanLegIk() {}, SetPedLegIkMode() {},
    DeleteEntity: p => calls.push(['delete', p]),
    GetGameTimer: () => clock, GetFrameTime: () => 1 / 60,
    IsEntityDead: () => false, IsPedInAnyVehicle: () => false, IsPedRagdoll: () => false,
    SetIkTarget: (...a) => calls.push(['ik', ...a]),
    DisableControlAction: (...a) => calls.push(['control', ...a]),
    DisablePlayerFiring: (...a) => calls.push(['firing', ...a]),
    GetCurrentResourceName: () => 'webcam_mocap_animlab'
  });
  vm.runInContext(await readFile(new URL('../resource/webcam_mocap_animlab/client.js', import.meta.url), 'utf8'), context);
  await net['webcam_mocap_animlab:start']('preview', 'a'.repeat(48));
  assert.equal(frozen, true);
  assert.deepEqual(positions.get(10), [12,34,56], 'real player never teleports');
  const camera = calls.find(c => c[0] === 'camera');
  const look = calls.find(c => c[0] === 'look');
  assert.equal(camera[4], look[4], 'camera and look-at point share eye height');
  assert.equal(camera[3], 4.2, 'camera sits in front of ped facing +Y');
  assert.ok(calls.some(c => c[0] === 'heading' && c[1] === 20 && c[2] === 0));
  commands.mocaplabpose(0,['1']);
  const manualPacket=pose();Object.values(manualPacket.targets).forEach(t=>t.confidence=1);
  net['webcam_mocap_animlab:pose'](manualPacket);
  calls.length=0;for(let i=0;i<50;i++)tick();
  assert.ok(calls.some(c=>c[0]==='crouchSet'&&c[1]===20&&c[2]==='move_ped_crouched'));
  assert.ok(!calls.some(c=>c[0]==='ik'),'manual pose isolates body from every IK target');
  assert.ok(!calls.some(c=>c[0]==='playClip'),'default crouch does not play prototype clip');
  assert.equal(typeof calls.find(c=>c[0]==='ack')[6].active,'boolean');
  commands.mocaplabpose(0,['0']);calls.length=0;
  for(let i=0;i<50;i++)tick();
  assert.ok(calls.some(c=>c[0]==='resetCrouch'&&c[1]===20));
  commands.mocaplabpose(0,['auto']);
  const cameraPacket=structuredClone(manualPacket);cameraPacket.seq=2;
  cameraPacket.bodyBlend={amount:1,confidence:1};
  net['webcam_mocap_animlab:pose'](cameraPacket);calls.length=0;
  for(let i=0;i<50;i++)tick();
  assert.ok(calls.some(c=>c[0]==='crouchSet'),'camera drives the default crouch graph');
  assert.ok(calls.some(c=>c[0]==='ik'&&c[2]===3),'automatic mode keeps wrist tracking');
  assert.ok(!calls.some(c=>c[0]==='ik'&&c[2]===1),'automatic mode excludes head targeting by default');
  cameraPacket.seq=3;cameraPacket.bodyBlend.amount=0.45;
  net['webcam_mocap_animlab:pose'](cameraPacket);calls.length=0;
  for(let i=0;i<50;i++)tick();
  assert.ok(!calls.some(c=>c[0]==='resetCrouch'),'threshold hysteresis holds a crouch near the boundary');
  clock=3000;calls.length=0;for(let i=0;i<50;i++)tick();
  assert.ok(calls.some(c=>c[0]==='resetCrouch'),'camera loss releases the crouch graph');
  assert.ok(!calls.some(c=>c[0]==='position'&&c[1]===20),'crouch graph controller never moves the clone root');
  clock=1000;
  commands.mocaplabbackend(0,['clip']);
  commands.mocaplabpose(0,['1']);
  tick();
  calls.length=0;
  for(let i=0;i<50;i++)tick();
  const crouchPhase=calls.filter(c=>c[0]==='clipPhase').at(-1)[4];
  assert.ok(crouchPhase>0.9,'manual deep crouch moves through the animation, without camera input');
  assert.ok(!calls.some(c=>c[0]==='position'&&c[1]===20),'body animation does not translate the entity root');
  commands.mocaplabpose(0,['0']);calls.length=0;
  for(let i=0;i<50;i++)tick();
  assert.ok(calls.filter(c=>c[0]==='clipPhase').at(-1)[4]<0.05,'manual standing reverses the same clip smoothly');
  commands.mocaplabpose(0,['off']);
  assert.ok(calls.some(c=>c[0]==='stopClip'),'body track can be disabled without ending hand tracking');
  commands.mocaplabpose(0,['auto']);
  calls.length = 0; tick();
  assert.equal(calls.filter(c => c[0] === 'poly').length, 24, 'room draws before tracking starts');
  assert.ok(calls.some(c => c[0] === 'hidden' && c[1] === 10));
  calls.length = 0;
  const p = pose();
  Object.values(p.targets).forEach(t => { t.confidence = 1; });
  net['webcam_mocap_animlab:pose'](p); tick();
  assert.deepEqual(calls.filter(c => c[0] === 'ik').map(c => c[2]), [3, 4]);
  calls.length = 0;
  const anchored = {...pose(), seq: 3}; Object.values(anchored.targets).forEach(t => { t.confidence = 1; });
  anchored.targets.leftHand = { x:0,y:0.1,z:0,confidence:1,anchor:'leftShoulder' };
  // A brief untracked packet must preserve smoothing rather than resetting it.
  net['webcam_mocap_animlab:pose'](emptyPose(2));
  net['webcam_mocap_animlab:pose'](anchored); tick();
  const hand = calls.find(c => c[0] === 'ik' && c[2] === 3);
  const stepAlpha=1-Math.exp(-(1/60)/0.09);
  assert.ok(Math.abs(hand[5] + 0.21*stepAlpha) < 0.001, 'shoulder target blends from the last position');
  assert.ok(Math.abs(hand[7] - (positions.get(20)[2]+0.48*stepAlpha)) < 0.001);
  assert.equal(hand[8], 0, 'retain the original working arm IK flags');
  assert.ok(calls.some(c => c[0] === 'ack' && c[3] === 'applied'));
  calls.length=0;
  const oriented=structuredClone(anchored);oriented.seq=4;
  oriented.targets.leftHand.orientation={x:0,y:0,z:0,w:1};
  net['webcam_mocap_animlab:pose'](oriented);tick();
  const orientedHand=calls.find(c=>c[0]==='ik'&&c[2]===3);
  assert.equal(orientedHand[3],31,'orientation uses the left local target entity');
  assert.equal(orientedHand[8],65,'request hand-bone position plus orientation, not tag ALLOW');
  assert.ok(calls.some(c=>c[0]==='quaternion'&&c[1]===31));
  assert.ok(calls.some(c=>c[0]==='ack'&&c[5].includes('leftHand')));
  assert.equal(typeof calls.find(c=>c[0]==='ack')[6].active,'boolean','numeric native animation result is normalized');
  const firstRotation=calls.find(c=>c[0]==='quaternion').slice(2);
  const quatDistance=(a,b)=>1-Math.abs(a.reduce((sum,v,i)=>sum+v*b[i],0));
  let seq=5;
  const missing=structuredClone(oriented);delete missing.targets.leftHand.orientation;
  const sendMissing=at=>{clock=at;calls.length=0;net['webcam_mocap_animlab:pose']({...missing,seq:seq++});tick();};
  sendMissing(1150);
  assert.equal(calls.find(c=>c[0]==='ik'&&c[2]===3)[8],65,'brief missing orientation retains oriented IK');
  assert.ok(quatDistance(firstRotation,calls.find(c=>c[0]==='quaternion').slice(2))<1e-8,
    'brief dropout holds the last wrist angle, not the resting pose');
  clock=1200;calls.length=0;
  const recovered=structuredClone(oriented);recovered.seq=seq++;
  recovered.targets.leftHand.orientation={x:1,y:0,z:0,w:0};
  net['webcam_mocap_animlab:pose'](recovered);tick();
  const recoveryRotation=calls.find(c=>c[0]==='quaternion').slice(2);
  assert.ok(quatDistance(firstRotation,recoveryRotation)>0.001,'recovery starts moving toward the new angle');
  assert.ok(quatDistance(firstRotation,recoveryRotation)<0.1,'recovery blends instead of jumping straight to a 180-degree change');
  sendMissing(1950);
  assert.equal(calls.find(c=>c[0]==='ik'&&c[2]===3)[8],65,'longer loss eases through orientation IK during fade');
  sendMissing(2250);
  assert.equal(calls.find(c=>c[0]==='ik'&&c[2]===3)[8],0,'orientation releases only after hold and fade');
  clock=2300;calls.length=0;recovered.seq=seq++;
  net['webcam_mocap_animlab:pose'](recovered);tick();
  const weak=structuredClone(missing);weak.targets.leftHand.confidence=0;
  clock=2400;calls.length=0;weak.seq=seq++;net['webcam_mocap_animlab:pose'](weak);tick();
  assert.equal(calls.find(c=>c[0]==='ik'&&c[2]===3)[8],65,'low-confidence hand retains its last valid pose during grace');
  assert.ok(calls.some(c=>c[0]==='ik'&&c[2]===4),'other hand keeps updating independently');
  clock=3050;calls.length=0;weak.seq=seq++;net['webcam_mocap_animlab:pose'](weak);tick();
  assert.ok(calls.some(c=>c[0]==='ik'&&c[2]===3),'hand position remains driven during gentle return');
  clock=3350;calls.length=0;weak.seq=seq++;net['webcam_mocap_animlab:pose'](weak);tick();
  assert.ok(!calls.some(c=>c[0]==='ik'&&c[2]===3),'sustained low confidence eventually releases the hand');
  assert.ok(calls.some(c=>c[0]==='ik'&&c[2]===4));
  clock=3400;calls.length=0;
  const body=structuredClone(weak);body.seq=seq++;
  body.targets.spine={x:0.1,y:1,z:0.5,confidence:1};
  body.targets.leftFoot={x:0,y:0,z:-0.9,confidence:1,anchor:'leftHip',limbLength:0.9};
  body.targets.rightFoot={x:0,y:0,z:-0.9,confidence:1,anchor:'rightHip',limbLength:0.9};
  body.pelvis={heightRatio:1,confidence:1};
  net['webcam_mocap_animlab:pose'](body);tick();
  assert.ok(!calls.some(c=>c[0]==='ik'&&[2,5,6].includes(c[2])), 'withdrawn spine and leg targets are ignored even from an old companion');
  const standingZ=positions.get(20)[2];
  clock=3450;calls.length=0;body.seq=seq++;body.pelvis.heightRatio=0.6;
  net['webcam_mocap_animlab:pose'](body);tick();
  assert.equal(positions.get(20)[2],standingZ,'crouch data must not translate the character into the floor');
  assert.ok(!calls.some(c=>c[0]==='position'&&c[1]===20),'tracking cannot move the preview root after placement');
  assert.deepEqual(positions.get(10),[12,34,56],'full-body staging never teleports the actual player');
  body.seq=seq++;body.bodyBlend={amount:1,confidence:1};
  net['webcam_mocap_animlab:pose'](body);calls.length=0;
  for(let i=0;i<50;i++)tick();
  assert.ok(calls.filter(c=>c[0]==='clipPhase').at(-1)[4]>0.9,'camera crouch input advances the real animation track');
  clock=3550;body.seq=seq++;body.bodyBlend.confidence=0;
  net['webcam_mocap_animlab:pose'](body);calls.length=0;tick();
  assert.ok(calls.filter(c=>c[0]==='clipPhase').at(-1)[4]>0.9,'brief loss holds the body pose');
  clock=4550;body.seq=seq++;net['webcam_mocap_animlab:pose'](body);calls.length=0;
  for(let i=0;i<50;i++)tick();
  assert.ok(calls.filter(c=>c[0]==='clipPhase').at(-1)[4]<0.05,'sustained loss returns the animation to standing');
  assert.equal(positions.get(20)[2],standingZ,'no entity-height workaround is used');
  await commands.mocaplabplay(0,['webcam_recording','webcam_take']);
  assert.ok(calls.some(c=>c[0]==='playClip'&&c[2]==='webcam_recording'));
  const recordingTask=calls.find(c=>c[0]==='playClip'&&c[2]==='webcam_recording');
  assert.equal(recordingTask[8],0,'native starts at the beginning, not the end');
  assert.ok(recordingTask[7]&1073741824,'recording owns the full animation blend');
  assert.ok(calls.some(c=>c[0]==='ambientBase'&&c[1]===20&&c[2]===false));
  assert.ok(calls.some(c=>c[0]==='gestures'&&c[1]===20&&c[2]===false));
  assert.ok(calls.some(c=>c[0]==='clipSpeed'&&c[2]==='webcam_recording'&&c[4]===1));
  assert.equal(recordedPhase(),0);
  clock+=400;
  body.seq=seq++;net['webcam_mocap_animlab:pose'](body);calls.length=0;tick();
  assert.equal(recordedPhase(),.25,'playback clock advances instead of holding one pose');
  assert.ok(!calls.some(c=>c[0]==='clipSpeed'),'tick never freezes or restarts the recording clock');
  commands.mocaplabplayinfo();
  assert.ok(!calls.some(c=>['ik','clipPhase','crouchSet'].includes(c[0])),'recorded replay owns the skeleton without live overrides');
  await commands.mocaplabplay(0,['stop']);calls.length=0;body.seq=seq++;
  net['webcam_mocap_animlab:pose'](body);tick();
  assert.ok(calls.some(c=>c[0]==='ik'),'stopping replay restores live hands');
  calls.length = 0; clock += 700; tick();
  assert.equal(calls.filter(c => c[0] === 'ik').length, 0);
  assert.equal(calls.filter(c => c[0] === 'poly').length, 24, 'room survives lost packets');
  assert.ok(calls.some(c => c[0] === 'hidden'));
  await net['webcam_mocap_animlab:start']('player', 'b'.repeat(48));
  assert.ok(calls.some(c => c[0] === 'delete' && c[1] === 20));
  assert.ok(calls.some(c => c[0] === 'destroyCamera' && c[1] === 30));
  assert.ok(calls.some(c => c[0] === 'render' && c[1] === false));
  assert.ok(calls.some(c => c[0] === 'clearFocus'));
  assert.equal(frozen, false);
  calls.length = 0;
  net['webcam_mocap_animlab:pose'](p); tick();
  assert.ok(calls.some(c => c[0] === 'control'));
  calls.length = 0; net['webcam_mocap_animlab:stop'](); tick();
  assert.equal(calls.filter(c=>c[0]==='delete').length,2,'stop removes both invisible wrist targets');
  calls.length=0;tick();assert.equal(calls.length,0);
  frozen = true;
  await net['webcam_mocap_animlab:start']('preview', 'c'.repeat(48));
  events.onResourceStop('webcam_mocap_animlab');
  assert.equal(frozen, true, 'cleanup preserves pre-existing freeze state');
  calls.length = 0; tick();
  assert.equal(calls.length, 0, 'resource cleanup leaves no room, visibility or controls loop');
  frozen = false; failCamera = true;
  await net['webcam_mocap_animlab:start']('preview', 'd'.repeat(48));
  assert.equal(frozen, false, 'camera startup failure restores player');
  assert.ok(calls.some(c => c[0] === 'delete'));
  failCamera=false;context.HasAnimSetLoaded=()=>true;context.GetAnimDuration=()=>0;calls.length=0;
  const notices=[];context.emit=(_name,message)=>notices.push(message.args[1]);
  await net['webcam_mocap_animlab:start']('preview','e'.repeat(48));
  net['webcam_mocap_animlab:pose'](p);tick();
  assert.ok(!calls.some(c=>c[0]==='clipPhase'),'unavailable prototype clip is never scrubbed');
  assert.ok(!calls.some(c=>c[0]==='playClip'),'missing clip never starts a task');
  assert.ok(calls.some(c=>c[0]==='ik'),'hand IK still works if body clip is missing');
  net['webcam_mocap_animlab:stop']();
});

test('delivery status distinguishes server acceptance, game processing, low confidence and old versions', () => {
  const p = pose();
  assert.match(deliveryStatus(p, null), /needs updating/);
  assert.match(deliveryStatus(p, {accepted:true,game:null}), /waiting for the FiveM character/);
  assert.match(deliveryStatus(p, {accepted:true,game:{ageMs:3000,state:'applied',parts:['leftHand']}}), /waiting/);
  assert.match(deliveryStatus(p, {accepted:true,game:{ageMs:10,state:'applied',parts:['head']}}), /hands below confidence/);
  assert.match(deliveryStatus(p, {accepted:true,game:{ageMs:10,state:'applied',parts:['leftHand','rightHand']}}), /both hands driven/);
  assert.match(deliveryStatus(emptyPose(2), {accepted:true}), /body confidence too low/);
  assert.match(deliveryStatus(p, {accepted:true,game:{ageMs:10,state:'unavailable',parts:[]}}), /character unavailable/);
  p.targets.leftHand.orientation={x:0,y:0,z:0,w:1};
  assert.match(deliveryStatus(p,{accepted:true,game:{ageMs:10,state:'applied',parts:['leftHand'],wrists:[]}}),/rotation pending/);
  assert.match(deliveryStatus(p,{accepted:true,game:{ageMs:10,state:'applied',parts:['leftHand'],wrists:['leftHand']}}),/rotation driven/);
});

test('relay preserves game acknowledgements instead of replacing them with generic success', async t => {
  const receipt = {accepted:true,seq:1,game:{seq:0,state:'applied',parts:['leftHand'],ageMs:30}};
  const server = createCompanion({relay: async () => ({status:200,ok:true,text:async () => JSON.stringify(receipt)})});
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  t.after(() => {server.closeAllConnections();server.close();});
  const origin = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${origin}/pose`, {method:'POST',headers:{Origin:origin,'X-Pair-Token':'a'.repeat(48)},body:JSON.stringify(pose())});
  assert.deepEqual(await response.json(), receipt);
});
