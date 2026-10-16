import test from 'node:test';
import assert from 'node:assert/strict';
import {measureHead,buildAnimation,qmul,rotate,toBVH} from '../companion/public/recording.mjs';
const identity=[0,0,0,1];
const axis=(i,angle)=>[0,1,2].map(j=>i===j?Math.sin(angle/2):0).concat(Math.cos(angle/2));
function pose(head=identity,torso=identity) {
  const p=Array.from({length:33},()=>({x:0,y:0,z:0,visibility:0}));
  const set=(i,v)=>{const r=rotate(torso,v);p[i]={x:-r[0],y:-r[1],z:r[2],visibility:1};};
  for(const [i,v] of [[23,[-.1,0,0]],[24,[.1,0,0]],[11,[-.2,.5,0]],[12,[.2,.5,0]]])set(i,v);
  for(const [i,v] of [[2,[-.035,.03,-.07]],[5,[.035,.03,-.07]],
    [9,[-.025,-.04,-.07]],[10,[.025,-.04,-.07]],[7,[-.07,0,0]],[8,[.07,0,0]]])
    set(i,rotate(head,v).map((n,j)=>n+(j===1?.75:0)));
  return p;
}
const error=(a,b)=>2*Math.acos(Math.min(1,Math.abs(a.reduce((n,v,i)=>n+v*b[i],0))));
const capture=frames=>({format:'webcam-mocap-capture',version:1,duration:frames.at(-1).t,frames});
function headGlobal(a,f) {
  const qs=[];a.skeleton.forEach((b,i)=>qs[i]=b.parent<0?f.rotations[i]:qmul(qs[b.parent],f.rotations[i]));
  return qs[4];
}
test('rigid head estimate recovers independent yaw, pitch and roll relative to torso',()=>{
  for(let i=0;i<3;i++)for(const angle of [-.65,.65]) {
    const q=axis(i,angle);
    assert.ok(error(measureHead(pose(q)),q)<1e-6);
    assert.ok(error(measureHead(pose(q,axis(1,.8))),q)<1e-6);
  }
  assert.equal(measureHead(null),null);
  const bad=pose();bad[2].visibility=.1;assert.equal(measureHead(bad),null);
  const flat=pose();flat[9]={...flat[2]};flat[10]={...flat[5]};assert.equal(measureHead(flat),null);
});
test('head motion reaches exported skeleton and BVH without facial joints or chest rotation',()=>{
  for(let i=0;i<3;i++) {
    const target=axis(i,.65);
    const frames=Array.from({length:61},(_,n)=>({t:n/30,world:pose(n<10?identity:target),image:null}));
    const a=buildAnimation(capture(frames)),q=headGlobal(a,a.frames.at(-1));
    assert.ok(error(q,target)<.005,`axis ${i}`);
    assert.ok(error(a.frames.at(-1).rotations[2],identity)<1e-6,'head does not rotate the chest');
    assert.equal(a.skeleton.length,23);
    assert.ok(!a.skeleton.some(b=>/jaw|lip|eye/i.test(b.name)));
    assert.match(toBVH(a),/JOINT Head/);
  }
});
test('head loss holds the last rotation; a supplied countdown neutral removes starting offset',()=>{
  const baseline=axis(0,.25),target=qmul(axis(1,.6),baseline);
  const frames=Array.from({length:91},(_,n)=>({t:n/30,world:pose(n<10?baseline:target),image:null}));
  for(let n=45;n<frames.length;n++)for(const i of [2,5,9,10])frames[n].world[i].visibility=0;
  const c=capture(frames);c.headNeutral=baseline;
  const a=buildAnimation(c);
  assert.ok(error(headGlobal(a,a.frames[0]),identity)<1e-6);
  assert.ok(error(headGlobal(a,a.frames.at(-1)),axis(1,.6))<.005);
  assert.ok(a.warnings.some(w=>/last reliable head rotation/.test(w)));
});
