import test from 'node:test';
import assert from 'node:assert/strict';
import {captureFrame,buildAnimation,toBVH,qmul,rotate,validateCapture,footRotation} from '../companion/public/recording.mjs';
export function body(bend=0) {
  const points=Array.from({length:33},()=>({x:0,y:0,z:0,visibility:1,presence:1}));
  const set=(i,p)=>Object.assign(points[i],{x:-p[0],y:-p[1],z:p[2]});
  set(23,[-.1,0,0]);set(24,[.1,0,0]);set(11,[-.2,.5,0]);set(12,[.2,.5,0]);
  set(7,[-.07,.75,0]);set(8,[.07,.75,0]);
  for(const [h,k,a,t,s] of [[23,25,27,31,-1],[24,26,28,32,1]]) {
    const theta=bend*Math.PI/180;
    set(k,[s*.1,-.42*Math.cos(theta),-.42*Math.sin(theta)]);
    set(a,[s*.1,-.84*Math.cos(theta),0]);set(t,[s*.1,-.84*Math.cos(theta)-.04,-.16]);
  }
  for(const [e,w,p,i,s] of [[13,15,17,19,-1],[14,16,18,20,1]]) {
    set(e,[s*.48,.5,0]);set(w,[s*.73,.5,0]);set(p,[s*.82,.49,0]);set(i,[s*.82,.51,0]);
  }
  return points;
}
export function capture(bends=[0,30,60]) {
  return {format:'webcam-mocap-capture',version:1,duration:1,
    frames:bends.map((b,i)=>({t:i/(bends.length-1),world:body(b),image:null,hands:null}))};
}
const norm=q=>Math.hypot(...q);
function fk(a,f) {
  const q=[],p=[];
  a.skeleton.forEach((b,i)=>{
    q[i]=b.parent<0?f.rotations[i]:qmul(q[b.parent],f.rotations[i]);
    p[i]=b.parent<0?f.root:rotate(q[b.parent],b.offset).map((v,j)=>v+p[b.parent][j]);
  });return p;
}
test('offline conversion creates continuous knee articulation with supporting feet on the floor',()=>{
  const a=buildAnimation(capture());
  assert.equal(a.frames.length,31);assert.equal(a.fps,30);
  const heights=[a.frames[0],a.frames[15],a.frames[30]].map(f=>f.root[1]);
  assert.ok(heights[0]>heights[1]+.03&&heights[1]>heights[2]+.05,'partial crouch has its own height');
  const knee=a.skeleton.findIndex(b=>b.name==='LeftLeg');
  assert.notDeepEqual(a.frames[0].rotations[knee],a.frames[15].rotations[knee]);
  assert.notDeepEqual(a.frames[15].rotations[knee],a.frames[30].rotations[knee]);
  for(const f of a.frames) {
    f.rotations.forEach(q=>assert.ok(Math.abs(norm(q)-1)<1e-8));
    const positions=fk(a,f);
    assert.ok(Math.abs(Math.min(...[17,18,21,22].map(i=>positions[i][1])))<1e-8);
    assert.equal(f.root[0],0);assert.equal(f.root[2],0);
  }
});
test('shoulders and arms articulate independently; skeleton lengths stay constant',()=>{
  const c=capture([0,0]);
  c.frames[1].world[13]={x:.2,y:-.8,z:-.2,visibility:1};
  c.frames[1].world[15]={x:.2,y:-1,z:-.2,visibility:1};
  c.frames[1].world[11].y=-.6;
  const a=buildAnimation(c),arm=a.skeleton.findIndex(b=>b.name==='LeftArm');
  assert.notDeepEqual(a.frames[0].rotations[arm],a.frames.at(-1).rotations[arm]);
  for(const f of a.frames) {
    const p=fk(a,f);
    a.skeleton.forEach((b,i)=>{if(b.parent>=0)assert.ok(Math.abs(Math.hypot(...p[i].map((v,j)=>v-p[b.parent][j]))-Math.hypot(...b.offset))<1e-8);});
  }
});
test('BVH frames have correct channel counts and reproduce quaternion rotations',()=>{
  const a=buildAnimation(capture()),bvh=toBVH(a);
  const rows=bvh.split('Frame Time: ')[1].trim().split('\n').slice(1);
  assert.equal(rows.length,a.frames.length);
  const hierarchy=bvh.split('MOTION')[0];
  assert.equal((hierarchy.match(/CHANNELS/g)||[]).length,a.skeleton.length);
  rows.forEach((row,index)=>{
    const values=row.split(' ').map(Number);assert.equal(values.length,3+a.skeleton.length*3);
    assert.ok(values.every(Number.isFinite));
    const [z,x,y]=values.slice(3,6).map(n=>n*Math.PI/180);
    const q=qmul(qmul([0,0,Math.sin(z/2),Math.cos(z/2)],[Math.sin(x/2),0,0,Math.cos(x/2)]),[0,Math.sin(y/2),0,Math.cos(y/2)]);
    assert.ok(Math.abs(Math.abs(q.reduce((v,n,i)=>v+n*a.frames[index].rotations[0][i],0))-1)<1e-6);
  });
});
test('gaps and absent legs stay finite and warn instead of inventing confident tracking',()=>{
  const c=capture([0,60]);c.frames.forEach(f=>{for(const i of [25,26,27,28,31,32])f.world[i].visibility=0;});
  const a=buildAnimation(c);
  assert.ok(a.warnings.some(w=>w.includes('leg/foot')));
  assert.ok(a.warnings.some(w=>w.includes('gaps')));
  assert.ok(!toBVH(a).includes('NaN'));
});
test('empty, corrupted and out-of-order recordings never produce a success animation',()=>{
  const c=capture();c.frames.forEach(f=>f.world=null);
  assert.throws(()=>buildAnimation(c),/shoulders and hips/);
  assert.throws(()=>validateCapture({...capture(),duration:121}),/duration/);
  const unordered=capture();unordered.frames[1].t=2;
  assert.throws(()=>validateCapture(unordered),/timestamps/);
  const corrupt=capture();corrupt.frames[0].world[0].x=NaN;
  assert.throws(()=>buildAnimation(corrupt),/landmarks/);
});
test('raw recording retains timestamps, unmodified body, face, hands and confidence',()=>{
  const world=body(),image=body();
  const result={worldLandmarks:[world],landmarks:[image]};
  const hand={worldLandmarks:[body().slice(0,21)],landmarks:[body().slice(0,21)],handedness:[[{categoryName:'Left',score:.9}]]};
  const saved=captureFrame(.12,result,hand);
  world[0].x=99;
  assert.equal(saved.t,.12);assert.equal(saved.world.length,33);assert.notEqual(saved.world[0].x,99);
  assert.equal(saved.hands.world[0].length,21);assert.equal(saved.hands.handedness[0][0].score,.9);
});
test('dedicated hand frames are baked and held during tracker dropout',()=>{
  const c=capture([0,0,0]);
  c.frames.forEach((f,i)=>{
    f.image=f.world.map(p=>({x:.5+p.x*.5,y:.4+p.y*.4,z:0,visibility:1}));
    const wrist=f.image[15],handImage=Array.from({length:21},()=>({...wrist}));
    handImage[5]={...wrist,x:wrist.x-.02,y:wrist.y-.03};
    handImage[17]={...wrist,x:wrist.x+.02,y:wrist.y-.03};
    const q=[Math.sin(i*.6/2),0,0,Math.cos(i*.6/2)];
    const handWorld=Array.from({length:21},()=>({x:0,y:0,z:0}));
    for(const [index,p] of [[0,[0,0,0]],[9,[0,.09,0]],[5,[.025,.07,0]],[17,[-.025,.07,0]]]) {
      const v=rotate(q,p);handWorld[index]={x:-v[0],y:-v[1],z:v[2]};
    }
    f.hands={image:[handImage],world:[handWorld]};
  });
  const a=buildAnimation(c),start=a.frames[0].endEffectors.LeftHand,end=a.frames.at(-1).endEffectors.LeftHand;
  assert.ok(Math.abs(start[3]-1)<1e-8,'dedicated palm overrides the body-model hand estimate');
  assert.ok(Math.abs(end.reduce((v,n,i)=>v+n*start[i],0))<.95,'wrist orientation changes in the saved animation');
  c.duration=2;c.frames.push({t:2,world:body(),image:c.frames[0].image,hands:null});
  const lost=buildAnimation(c),held=lost.frames.at(-1).endEffectors.LeftHand;
  assert.ok(Math.abs(held.reduce((v,n,i)=>v+n*end[i],0))>.99,'lost hand model does not snap to a downwards body-model palm');
});
function handObservation(t,angle=0,world=body()) {
  const image=world.map(p=>({x:.5+p.x*.5,y:.4+p.y*.4,z:0,visibility:1}));
  const wrist=image[15],screen=Array.from({length:21},()=>({...wrist}));
  screen[5]={...wrist,x:wrist.x-.02,y:wrist.y-.03};screen[17]={...wrist,x:wrist.x+.02,y:wrist.y-.03};
  const q=[Math.sin(angle/2),0,0,Math.cos(angle/2)],palm=Array.from({length:21},()=>({x:0,y:0,z:0}));
  for(const [index,p] of [[0,[0,0,0]],[9,[0,.09,0]],[5,[.025,.07,0]],[17,[-.025,.07,0]]]) {
    const v=rotate(q,p);palm[index]={x:-v[0],y:-v[1],z:v[2]};
  }
  return {t,world,image,hands:{image:[screen],world:[palm]}};
}

test('missing palm observations hold the wrist joint relative to an arm that keeps moving',()=>{
  const frames=[0,.1,.2,.5,1,2].map(t=>{
    const world=body();world[13].x=.48-t*.1;world[13].y=-.5-t*.12;
    world[15].x=.73-t*.2;world[15].y=-.5-t*.2;
    const frame=handObservation(t,0,world);if(t>0)frame.hands=null;return frame;
  });
  const a=buildAnimation({format:'webcam-mocap-capture',version:1,duration:2,frames});
  const joint=a.skeleton.findIndex(b=>b.name==='LeftHand'),early=a.frames[10],late=a.frames.at(-1);
  const alignment=Math.abs(early.rotations[joint].reduce((n,v,i)=>n+v*late.rotations[joint][i],0));
  assert.ok(alignment>.999999,'loss holds local wrist angle instead of a fixed world orientation');
  assert.ok(Math.abs(early.endEffectors.LeftHand.reduce((n,v,i)=>n+v*late.endEffectors.LeftHand[i],0))<.99,'the held palm moves with its forearm');
});

test('offline wrist conversion bridges 700ms gaps and rejects isolated 180-degree palm flips',()=>{
  const c={format:'webcam-mocap-capture',version:1,duration:.7,frames:[handObservation(0),handObservation(.35),handObservation(.7,1)]};
  c.frames[1].hands=null;
  const a=buildAnimation(c),first=a.frames[0].endEffectors.LeftHand,middle=a.frames[10].endEffectors.LeftHand;
  assert.ok(Math.abs(first.reduce((n,v,i)=>n+v*middle[i],0))<.995,'rotation progresses during the gap rather than staying frozen until reacquisition');
  const spike={...c,duration:.2,frames:[0,.033,.066,.1,.2].map((t,i)=>handObservation(t,i===2?Math.PI:0))};
  const filtered=buildAnimation(spike);
  assert.ok(filtered.warnings.some(w=>w.includes('1 isolated palm-rotation')));
  for(const frame of filtered.frames)assert.ok(Math.abs(frame.endEffectors.LeftHand[3]-1)<1e-6);
});

test('sole frame rejects degenerate/inverted feet and suppresses inherited calf roll',()=>{
  assert.equal(footRotation([0,0,0],[0,0,0],[0,0,0]),null);
  assert.equal(footRotation([0,-.1,0],[0,0,.05],[0,0,-.15]),null);
  const q=footRotation([0,.1,0],[0,0,.05],[0,0,-.15]);
  assert.ok(q);assert.ok(rotate(q,[0,1,0])[1]>.99);
  const c=capture([0,45,0]);
  c.frames.forEach(f=>{
    f.world[29]={...f.world[27],y:f.world[27].y+.04,z:.05,visibility:1};
    f.world[30]={...f.world[28],y:f.world[28].y+.04,z:.05,visibility:1};
  });
  const a=buildAnimation(c);
  for(let i=1;i<a.frames.length;i++) {
    const p=a.frames[i-1].endEffectors.LeftFoot,q=a.frames[i].endEffectors.LeftFoot;
    const angle=2*Math.acos(Math.min(1,Math.abs(p.reduce((sum,v,j)=>sum+v*q[j],0))));
    assert.ok(angle<Math.PI/18+1e-8,'foot rotation speed is bounded');
  }
});
