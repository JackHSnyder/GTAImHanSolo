import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {measureCrouch} from '../companion/public/pose-blend.mjs';
import {emptyPose} from '../companion/public/retarget.mjs';
const protocol=createRequire(import.meta.url)('../resource/webcam_mocap_animlab/protocol.js');
function legs(leftAngle=180,rightAngle=180) {
  const world=Array.from({length:33},()=>({x:0,y:0,z:0,visibility:1}));
  const image=Array.from({length:33},()=>({x:0.5,y:0.5,visibility:1}));
  for(const [h,k,a,x,angle] of [[23,25,27,-0.1,leftAngle],[24,26,28,0.1,rightAngle]]) {
    const bend=(180-angle)*Math.PI/180;
    Object.assign(world[h],{x,y:0,z:0});Object.assign(world[k],{x,y:0.4,z:0});
    Object.assign(world[a],{x,y:0.4+0.4*Math.cos(bend),z:0.4*Math.sin(bend)});
  }
  return {world,image};
}
test('standing, partial crouch and deep crouch map continuously to clip input',()=>{
  for(const [angle,expected] of [[180,0],[130,0.5],[90,1]]) {
    const {world,image}=legs(angle,angle),p=measureCrouch(world,image);
    assert.ok(Math.abs(p.amount-expected)<1e-8);assert.equal(p.confidence,1);
  }
});
test('one bent leg cannot trigger a full crouch; hidden legs invalidate camera input',()=>{
  const {world,image}=legs(90,180);
  assert.equal(measureCrouch(world,image).amount,0);
  image[27].y=1.2;assert.equal(measureCrouch(world,image).confidence,0);
  image[27].y=0.5;world[25].visibility=undefined;
  assert.equal(measureCrouch(world,image).confidence,0);
  assert.equal(measureCrouch(null,null).confidence,0);
});
test('lab protocol carries only bounded crouch amount and confidence',()=>{
  const p=emptyPose(1);p.bodyBlend={amount:0.6,confidence:1,clip:'untrusted'};
  assert.equal(protocol.validate(p),true);
  assert.deepEqual(protocol.sanitize(p).bodyBlend,{amount:0.6,confidence:1});
  p.bodyBlend.amount=1.1;assert.equal(protocol.validate(p),false);
  p.bodyBlend.amount=0.5;p.bodyBlend.confidence=NaN;assert.equal(protocol.validate(p),false);
});
