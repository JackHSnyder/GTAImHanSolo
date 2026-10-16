// Compact screen-space skeleton and body-relative wrists. No pixels or audio.
import '../../resource/webcam_mocap_animlab/score-math.js';
export function packHandMatch(world,image) {
  const point=i=>{
    const p=world?.[i],v=image?.[i];
    if(!p||![p.x,p.y,p.z,p.visibility].every(Number.isFinite)||p.visibility<.6||
      (Number.isFinite(p.presence)&&p.presence<.6)||!v||!Number.isFinite(v.visibility)||v.visibility<.6||
      ![v.x,v.y].every(Number.isFinite)||v.x<0||v.x>1||v.y<0||v.y>1)return null;
    return [-p.x,-p.y,p.z];
  };
  const l=point(23),r=point(24);
  const body={leftShoulder:point(11),rightShoulder:point(12),hips:l&&r?l.map((n,i)=>(n+r[i])/2):null,
    leftElbow:point(13),rightElbow:point(14),leftHand:point(15),rightHand:point(16)};
  const hands=globalThis.MocapScore.relativeHands(body);
  return Object.fromEntries(Object.entries(hands).map(([k,p])=>[k,p&&p.map(n=>Math.round(n*10000)/10000)]));
}
export function packSkeleton(points,aspect) {
  if(!Array.isArray(points)||points.length!==33||!Number.isFinite(aspect)||aspect<.2||aspect>5)return null;
  const rounded=n=>Math.round(n*10000)/10000;
  return {aspect:rounded(aspect),points:Array.from(points,p=>{
    if(!p||![p.x,p.y,p.visibility].every(Number.isFinite)||p.visibility<.6||
      p.x<0||p.x>1||p.y<0||p.y>1)return null;
    return [rounded(p.x),rounded(p.y),rounded(Math.min(1,p.visibility))];
  })};
}
