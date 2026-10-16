import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {refineWrists,wristOrientations,createRecordingHandTracker,recordingWristPositions} from '../companion/public/wrists.mjs';
import {retarget} from '../companion/public/retarget.mjs';
const protocol = createRequire(import.meta.url)('../resource/webcam_mocap_animlab/protocol.js');
const math = createRequire(import.meta.url)('../resource/webcam_mocap_animlab/hand-math.js');
function fixture() {
  const world = Array.from({length:33},()=>({x:0,y:0,z:0,visibility:1}));
  world[11] = {x:0.19,y:-0.5,z:0,visibility:1};
  world[12] = {x:-0.19,y:-0.5,z:0,visibility:1};
  const image = Array.from({length:33},()=>({x:0.5,y:0.5,z:0,visibility:1}));
  image[11].x=0.6; image[11].y=0.3; image[12].x=0.4; image[12].y=0.3;
  image[15].x=0.8; image[16].x=0.2;
  image[13].x=0.7; image[14].x=0.3;
  return {world,image};
}
function hand(x,y,z=0) {
  const points = Array.from({length:21},(_,i)=>({x:x+(i%4)*0.008,y:y-Math.floor(i/4)*0.008,z}));
  points[0]={x,y,z}; points[5]={x:x-0.02,y:y-0.03,z}; points[17]={x:x+0.02,y:y-0.03,z};
  return points;
}
test('dedicated wrist replaces body image wrist without corrupting global depth or inputs',()=>{
  const {world,image}=fixture(); world[15].z=-0.24;
  const refined=refineWrists(world,image,{landmarks:[hand(0.7,0.35,99)]});
  assert.equal(refined.matches[0].name,'leftHand');
  assert.equal(refined.image[15].x,0.7); assert.equal(refined.image[15].y,0.35);
  assert.equal(refined.world[15].z,-0.24, 'hand-local depth is never used as body depth');
  assert.equal(image[15].x,0.8, 'inputs stay unchanged');
  const p=retarget(refined.world,1,1,refined.image);
  assert.equal(protocol.validate(p),true);
  assert.ok(Math.abs(p.targets.leftHand.x+0.19)<0.001);
});
test('two hands associate independently, ignoring reversed handedness labels',()=>{
  const {world,image}=fixture();
  const refined=refineWrists(world,image,{landmarks:[hand(0.21,0.5),hand(0.79,0.5)],
    handedness:[[{categoryName:'Left',score:0.99}],[{categoryName:'Right',score:0.99}]]});
  assert.deepEqual(refined.matches.map(m=>[m.name,m.handIndex]),[['leftHand',1],['rightHand',0]]);
});
test('crossed hands follow anatomical wrist references rather than screen side',()=>{
  const {world,image}=fixture(); image[15].x=0.3; image[16].x=0.7;
  const refined=refineWrists(world,image,{landmarks:[hand(0.31,0.5),hand(0.69,0.5)]});
  assert.deepEqual(refined.matches.map(m=>[m.name,m.handIndex]),[['leftHand',0],['rightHand',1]]);
});
test('elbow association rescues a low-confidence body wrist',()=>{
  const {world,image}=fixture(); world[15].visibility=0.1; image[15].visibility=0.1;
  const refined=refineWrists(world,image,{landmarks:[hand(0.69,0.4)]});
  assert.equal(refined.matches[0].name,'leftHand');
  assert.ok(retarget(refined.world,1,1,refined.image).targets.leftHand.confidence>=0.6);
});
test('ambiguous or missing hands fall back immediately without stale data',()=>{
  const {world,image}=fixture(); image[15].x=0.5; image[16].x=0.5;
  assert.equal(refineWrists(world,image,{landmarks:[hand(0.5,0.5)]}).matches.length,0);
  image[15].x=0.8; image[16].x=0.2;
  assert.equal(refineWrists(world,image,{landmarks:[hand(0.8,0.5)]}).matches.length,1);
  const missing=refineWrists(world,image,{landmarks:[]});
  assert.equal(missing.matches.length,0); assert.equal(missing.image,image);
  assert.equal(refineWrists(world,image,{landmarks:[[{x:NaN}]]}).matches.length,0);
  assert.equal(refineWrists(null,null,null).matches.length,0);
});
test('unrelated hand and invalid hand geometry do not override a body wrist',()=>{
  const {world,image}=fixture();
  assert.equal(refineWrists(world,image,{landmarks:[hand(0.5,0.99)]}).matches.length,0);
  assert.equal(refineWrists(world,image,{landmarks:[Array(21).fill({x:0.8,y:0.5})]}).matches.length,0);
});
test('palm frame distinguishes fingers up, down and side rather than using only wrist position',()=>{
  const up=math.handFrame([0,0,0],[0,1,0],[1,1,0],[-1,1,0]);
  assert.deepEqual(up,{x:0,y:0,z:0,w:1});
  const tilted=math.handFrame([0,0,0],[0,0,1],[1,0,1],[-1,0,1]);
  assert.ok(Math.abs(tilted.x-Math.SQRT1_2)<1e-8);
  const identity=math.multiply(tilted,math.inverse(tilted));
  assert.ok(Math.abs(identity.w-1)<1e-8);
});
test('orientation rejects degenerate palms and blends equivalent quaternion signs without a flip',()=>{
  assert.equal(math.handFrame([0,0,0],[0,0,0],[1,0,0],[-1,0,0]),null);
  assert.equal(math.handFrame([0,0,0],[0,1,0],[0,2,0],[0,0,0]),null);
  const q=math.blend({x:0,y:0,z:0,w:1},{x:0,y:0,z:0,w:-1},0.5);
  assert.equal(q.w,1);
});
test('only associated hands produce normalized orientation data; hand motion changes that data',()=>{
  const points=Array.from({length:21},()=>({x:0,y:0,z:0}));
  points[9]={x:0,y:-0.1,z:0};points[5]={x:0.03,y:-0.08,z:0};points[17]={x:-0.03,y:-0.08,z:0};
  const matches=[{name:'leftHand',handIndex:0}];
  const a=wristOrientations({worldLandmarks:[points]},matches).leftHand;
  assert.ok(Math.abs(Math.hypot(a.x,a.y,a.z,a.w)-1)<1e-8);
  const rotated=points.map(p=>({x:-p.y,y:p.x,z:p.z}));
  const b=wristOrientations({worldLandmarks:[rotated]},matches).leftHand;
  assert.ok(Math.abs(a.x*b.x+a.y*b.y+a.z*b.z+a.w*b.w)<0.9);
  assert.deepEqual(wristOrientations({worldLandmarks:[points]},[]),{});
  assert.deepEqual(wristOrientations({worldLandmarks:[Array(21).fill({x:0,y:0,z:0})]},matches),{});
});
test('orientation schema preserves unit quaternions and rejects invalid or non-hand rotations',()=>{
  const {world,image}=fixture(),p=retarget(world,1,1,image);
  p.targets.leftHand.orientation={x:0,y:0,z:0,w:1};
  assert.equal(protocol.validate(p),true);
  assert.deepEqual(protocol.sanitize(p).targets.leftHand.orientation,{x:0,y:0,z:0,w:1});
  p.targets.leftHand.orientation.w=2;assert.equal(protocol.validate(p),false);
  delete p.targets.leftHand.orientation;
  p.targets.head.orientation={x:0,y:0,z:0,w:1};assert.equal(protocol.validate(p),false);
});

test('recording accepts clipped unused fingertips while retaining the existing live rejection rules',()=>{
  const {world,image}=fixture(),points=hand(.8,.5);points[20].x=1.2;
  const hands={landmarks:[points]};
  assert.equal(refineWrists(world,image,hands).matches.length,0);
  assert.equal(createRecordingHandTracker()(0,world,image,hands).matches[0].name,'leftHand');
});

test('recording keeps anatomical association through short body-wrist losses without using stale history indefinitely',()=>{
  const {world,image}=fixture(),track=createRecordingHandTracker();
  assert.equal(track(0,world,image,{landmarks:[hand(.8,.5),hand(.2,.5)]}).matches.length,2);
  for(const id of [13,14,15,16])image[id].visibility=.1;
  const next=track(.1,world,image,{landmarks:[hand(.2,.5),hand(.8,.5)]});
  assert.deepEqual(next.matches.map(m=>[m.name,m.handIndex]),[['leftHand',1],['rightHand',0]]);
  assert.equal(track(.6,world,image,{landmarks:[hand(.2,.5),hand(.8,.5)]}).matches.length,0);
});

test('recorded wrist position uses matched image motion while preserving body-world depth and original observations',()=>{
  const {world,image}=fixture();world[15].z=-.24;
  const refined=createRecordingHandTracker()(0,world,image,{landmarks:[hand(.75,.45)]});
  const fused=recordingWristPositions(refined.world,refined.image,refined.matches);
  assert.notEqual(fused[15].x,world[15].x);assert.equal(fused[15].z,-.24);
  assert.equal(world[15].x,0);assert.equal(image[15].x,.8);
});
