import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {packHandMatch,packSkeleton} from '../companion/public/skeleton.mjs';
import {emptyPose} from '../companion/public/retarget.mjs';
const require=createRequire(import.meta.url),score=require('../resource/webcam_mocap_animlab/score-math.js');
const protocol=require('../resource/webcam_mocap_animlab/protocol.js');
const body={leftShoulder:[-.2,.5,0],rightShoulder:[.2,.5,0],hips:[0,0,0],
  leftElbow:[-.45,.5,0],rightElbow:[.45,.5,0],leftHand:[-.7,.5,0],rightHand:[.7,.5,0]};
test('countdown appears only for delays above three seconds, clears at zero, and supports fractional delays',()=>{
  for(const d of [0,1,2,3])for(const t of [0,1,2,3,4])assert.equal(score.timing(d,t).countdown,null);
  assert.equal(score.timing(5,1.99).countdown,null);
  assert.equal(score.timing(5,2).countdown,3);
  assert.equal(score.timing(5,3).countdown,2);
  assert.equal(score.timing(5,4).countdown,1);
  assert.equal(score.timing(5,5).countdown,null);assert.equal(score.timing(5,5).phase,'grace');
  assert.equal(score.timing(5,5.99).phase,'grace');assert.equal(score.timing(5,6).phase,'scoring');
  assert.equal(score.timing(4.5,1.5).countdown,3);assert.equal(score.timing(4.5,5.5).scoreSeconds,1);
});
test('round goal is half the available points after the initial delay, counting only whole scoring seconds',()=>{
  assert.equal(score.newRound(5,30).goal,1250);
  assert.equal(score.newRound(0,30).goal,1500);
  assert.equal(score.newRound(5,12.8).goal,350);
  assert.equal(score.newRound(4.5,12.5).goal,400);
  assert.equal(score.newRound(5,5).goal,0);
  assert.equal(score.newRound(5,2).goal,0);
});

test('whole-hand comparison ignores body position, rotation and scale, with independent left/right positions',()=>{
  const target=score.relativeHands(body);
  const transformed=Object.fromEntries(Object.entries(body).map(([k,[x,y,z]])=>[k,[100+z*2,200+x*2,300+y*2]]));
  assert.equal(score.compare(score.relativeHands(transformed),target).points,100);
  const slightly={left:target.left.map(n=>n+.1),right:target.right};
  const far={left:target.left.map(n=>n+.5),right:target.right};
  assert.ok(score.compare(slightly,target).points>score.compare(far,target).points);
  assert.equal(score.compare({left:target.right,right:target.left},target).points,0,'anatomical sides are not swapped');
  assert.equal(score.compare({left:null,right:target.right},target),null,'both hands required');
});
test('screen matching exchanges hands and horizontal direction while preserving wrist height and depth',()=>{
  const target={left:[-.2,.7,.3],right:[1.1,-.3,-.2]};
  // The live right hand copies the dancer's left hand on screen-right;
  // the live left copies the dancer's right hand on screen-left.
  const live={left:[-1.1,-.3,-.2],right:[.2,.7,.3]};
  const snapshot=JSON.stringify(live);
  assert.deepEqual(score.handsForView(live,true),target);
  assert.equal(score.compare(score.handsForView(live,true),target).points,100);
  assert.ok(score.compare(score.handsForView(target,true),target).points<100,'anatomical copying does not score as an onscreen match');
  assert.equal(score.compare(score.handsForView(target,false),target).points,100,'unmirrored camera matches the dancer directly');
  assert.equal(JSON.stringify(live),snapshot,'do not mutate tracking data');
  assert.equal(score.handsForView(null),null);
  assert.equal(score.compare(score.handsForView({left:null,right:live.right}),target),null);
});

test('camera scoring uses wrists only; arbitrary finger positions have no influence',()=>{
  const world=Array.from({length:33},()=>({x:0,y:0,z:0,visibility:1}));
  for(const [id,key] of [[11,'leftShoulder'],[12,'rightShoulder'],[13,'leftElbow'],[14,'rightElbow'],[15,'leftHand'],[16,'rightHand']]) {
    const [x,y,z]=body[key];world[id]={x:-x,y:-y,z,visibility:1};
  }
  world[23]={x:.1,y:0,z:0,visibility:1};world[24]={x:-.1,y:0,z:0,visibility:1};
  const image=world.map(()=>({x:.5,y:.5,visibility:1}));
  const first=packHandMatch(world,image);
  for(const i of [17,18,19,20,21,22]) {world[i]={x:999,y:-999,z:999,visibility:0};image[i]={x:-1,y:-1,visibility:0};}
  assert.deepEqual(packHandMatch(world,image),first);
  world[15].visibility=.1;assert.equal(packHandMatch(world,image).left,null);
  world[11].visibility=.1;assert.deepEqual(packHandMatch(world,image),{left:null,right:null});
  assert.deepEqual(packHandMatch(null,null),{left:null,right:null});
});
test('one-second scoring never duplicates, skips absent tracking and does not backfill hitches',()=>{
  const hands=score.relativeHands(body),round=score.newRound();
  assert.equal(score.sample(round,.99,hands,hands),false);
  score.sample(round,1,hands,hands);assert.equal(round.total,100);
  score.sample(round,1.5,hands,hands);assert.equal(round.total,100);
  score.sample(round,2,null,hands);assert.equal(round.total,100);assert.equal(round.skipped,1);
  score.sample(round,5.05,hands,hands);assert.equal(round.total,200);assert.equal(round.skipped,3);
  score.sample(round,6.4,hands,hands);assert.equal(round.total,200);assert.equal(round.skipped,4);
  assert.equal(score.newRound().total,0);
});
test('hand-match metadata survives sanitization, rejects invalid coordinates and fits the relay limit',()=>{
  const packet={...emptyPose(1),handMatch:score.relativeHands(body),skeleton:packSkeleton(Array.from({length:33},()=>({x:.5,y:.5,visibility:1})),4/3)};
  assert.ok(protocol.validate(packet));
  const clean=protocol.sanitize(packet);packet.handMatch.left[0]=0;
  assert.notEqual(clean.handMatch.left[0],0);
  assert.ok(JSON.stringify(clean).length<4096);
  for(const left of [[Infinity,0,0],[5,0,0],[0,0],{}])assert.equal(protocol.validate({...packet,handMatch:{left,right:null}}),false);
});
