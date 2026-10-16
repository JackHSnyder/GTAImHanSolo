import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {retarget,emptyPose} from '../companion/public/retarget.mjs';
const protocol=createRequire(import.meta.url)('../resource/webcam_mocap_animlab/protocol.js');
function standing() {
  const world=Array.from({length:33},()=>({x:0,y:0,z:0,visibility:1}));
  Object.assign(world[11],{x:0.19,y:-0.5});Object.assign(world[12],{x:-0.19,y:-0.5});
  for(const [hip,knee,ankle,x] of [[23,25,27,0.11],[24,26,28,-0.11]]) {
    Object.assign(world[hip],{x});Object.assign(world[knee],{x,y:0.45});Object.assign(world[ankle],{x,y:0.9});
  }
  const image=Array.from({length:33},()=>({x:0.5,y:0.5,visibility:1}));
  Object.assign(image[11],{x:0.6,y:0.25});Object.assign(image[12],{x:0.4,y:0.25});
  for(const [hip,knee,ankle,x] of [[23,25,27,0.55],[24,26,28,0.45]]) {
    Object.assign(image[hip],{x,y:0.5});Object.assign(image[knee],{x,y:0.7});Object.assign(image[ankle],{x,y:0.95});
  }
  return {world,image};
}
test('visible standing body supplies spine, hip-anchored leg lengths and pelvis height',()=>{
  const {world,image}=standing(),p=retarget(world,1,1,image);
  assert.equal(protocol.validate(p),true);
  assert.equal(p.targets.leftFoot.anchor,'leftHip');assert.equal(p.targets.rightFoot.anchor,'rightHip');
  assert.ok(Math.abs(p.targets.leftFoot.limbLength-0.9)<1e-8);
  assert.ok(Math.abs(p.targets.leftFoot.z+0.9)<1e-8);
  assert.equal(p.targets.spine.confidence,1);assert.equal(p.pelvis.heightRatio,1);
});
test('one lifted knee preserves supporting-leg waist height; a two-leg crouch reduces it',()=>{
  const {world,image}=standing();
  Object.assign(world[25],{y:0.225,z:-0.2});world[27].y=0.45;
  assert.equal(retarget(world,1,1,image).pelvis.heightRatio,1);
  Object.assign(world[26],{y:0.225,z:-0.2});world[28].y=0.45;
  assert.ok(retarget(world,2,1,image).pelvis.heightRatio<0.8);
});
test('hidden knee or offscreen ankle disables only that leg and pelvis height',()=>{
  const {world,image}=standing();image[25].visibility=0.1;
  let p=retarget(world,1,1,image);
  assert.equal(p.targets.leftFoot.confidence,0);assert.ok(p.targets.rightFoot.confidence>=0.6);
  assert.equal(p.pelvis.confidence,0);assert.ok(p.targets.spine.confidence>=0.6);
  image[25].visibility=1;image[27].y=1.1;p=retarget(world,2,1,image);
  assert.equal(p.targets.leftFoot.confidence,0);assert.ok(p.targets.rightFoot.confidence>=0.6);
});
test('torso lean changes spine target and body additions survive sanitization',()=>{
  const {world,image}=standing();world[11].x+=0.1;world[12].x+=0.1;
  const p=retarget(world,1,1,image),clean=protocol.sanitize(p);
  assert.ok(p.targets.spine.x< -0.15);
  assert.deepEqual(clean.targets.spine,p.targets.spine);assert.deepEqual(clean.pelvis,p.pelvis);
  assert.equal(clean.targets.leftFoot.limbLength,p.targets.leftFoot.limbLength);
});
test('body protocol rejects malformed lengths and root motion while accepting old hand-only packets',()=>{
  const {world,image}=standing(),p=retarget(world,1,1,image);
  p.targets.leftFoot.limbLength=4;assert.equal(protocol.validate(p),false);
  p.targets.leftFoot.limbLength=0.9;p.pelvis.heightRatio=Infinity;assert.equal(protocol.validate(p),false);
  assert.equal(protocol.validate(emptyPose(2)),true);
});
