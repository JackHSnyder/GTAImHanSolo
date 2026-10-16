// Offline motion conversion. Positions are metres, Y up, facing -Z.
// Full original observations remain in the capture JSON; this is an estimate,
// with no claim to recover hidden joint twist or camera-relative translation.
import {createRecordingHandTracker,recordingWristPositions} from './wrists.mjs';
export const FPS=30;
export const MAX_SECONDS=120;
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const mul=(a,s)=>a.map(v=>v*s);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>{const l=Math.hypot(...a);return l>1e-7?mul(a,1/l):null;};
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const identity=[0,0,0,1];
const inverse=q=>[-q[0],-q[1],-q[2],q[3]];
export const qmul=(a,b)=>[
  a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],
  a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],
  a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],
  a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
export const rotate=(q,v)=>qmul(qmul(q,[...v,0]),inverse(q)).slice(0,3);
function slerp(a,b,t) {
  let d=dot(a,b);if(d<0){b=mul(b,-1);d=-d;}
  d=Math.min(1,d);
  if(d>0.9995)return unit(mix(a,b,t))||a;
  const angle=Math.acos(d),s=Math.sin(angle);
  return add(mul(a,Math.sin((1-t)*angle)/s),mul(b,Math.sin(t*angle)/s));
}
function swing(from,to) {
  const a=unit(from),b=unit(to);if(!a||!b)return identity;
  const d=dot(a,b);
  if(d<-0.99999) {const axis=unit(cross(a,Math.abs(a[0])<0.8?[1,0,0]:[0,0,1]));return [...axis,0];}
  return unit([...cross(a,b),1+d])||identity;
}
function basisQuaternion(x,y) {
  x=unit(x);if(!x)return null;
  const z=unit(cross(x,y));if(!z)return null;
  y=unit(cross(z,x));
  // Obtain the basis rotation with two stable swing operations.
  const a=swing([1,0,0],x),up=rotate(a,[0,1,0]);
  return qmul(swing(up,y),a);
}
export function palmRotation(wrist,middle,index,pinky) {
  if([wrist,middle,index,pinky].some(p=>!p||p.length!==3||!p.every(Number.isFinite)))return null;
  const fingers=sub(middle,wrist),side=sub(index,pinky);
  if(Math.hypot(...fingers)<.015||Math.hypot(...side)<.008)return null;
  const a=unit(fingers),b=unit(side);
  if(Math.hypot(...cross(a,b))<.15)return null;
  return basisQuaternion(side,fingers);
}
export function footRotation(ankle,heel,toe,up=[0,1,0]) {
  if(!ankle||!heel||!toe)return null;
  const forward=sub(toe,heel),lift=sub(ankle,mul(add(heel,toe),.5));
  if(Math.hypot(...forward)<.06||Math.hypot(...forward)>.45)return null;
  const f=unit(forward),normal=unit(sub(lift,mul(f,dot(lift,f))));
  // An almost-flat or inverted triangle cannot establish a reliable sole normal.
  if(!normal||dot(normal,up)<.4||Math.hypot(...lift)<.015||Math.hypot(...lift)>.25)return null;
  return basisQuaternion(cross(f,normal),normal);
}
function orientationAt(track,t,maxGap=.5,edgeHold=.5) {
  if(!track.length||t<track[0].t-edgeHold||t>track.at(-1).t+edgeHold)return null;
  let lo=0,hi=track.length;
  while(lo<hi){const m=(lo+hi)>>1;if(track[m].t<t)lo=m+1;else hi=m;}
  const a=track[Math.max(0,lo-1)],b=track[Math.min(lo,track.length-1)];
  if(b.t-a.t>maxGap)return t-a.t<edgeHold?a.q:null;
  return slerp(a.q,b.q,b.t===a.t?0:Math.max(0,Math.min(1,(t-a.t)/(b.t-a.t))));
}
function smoothOrientation(previous,next,maxStep) {
  if(!previous)return next;
  const angle=2*Math.acos(Math.min(1,Math.abs(dot(previous,next))));
  return slerp(previous,next,Math.min(.45,angle>1e-6?maxStep/angle:1));
}
const mid=(a,i,j)=>mul(add(a[i],a[j]),0.5);
function joints(a) {
  const hips=mid(a,23,24),chest=mid(a,11,12),ears=mid(a,7,8);
  return [hips,mix(hips,chest,0.45),chest,mix(chest,ears,0.65),ears,
    mix(chest,a[11],0.45),a[11],a[13],a[15],mid(a,17,19),
    mix(chest,a[12],0.45),a[12],a[14],a[16],mid(a,18,20),
    a[23],a[25],a[27],a[31],a[24],a[26],a[28],a[32]];
}
// Parent-before-child order, compatible with a conventional humanoid BVH.
const layout=[
  ['Hips',-1,1,[0,0,0]],['Spine',0,2,[0,.18,0]],['Chest',1,3,[0,.20,0]],
  ['Neck',2,4,[0,.10,0]],['Head',3,-1,[0,.12,0]],
  ['LeftShoulder',2,6,[-.09,0,0]],['LeftArm',5,7,[-.10,0,0]],
  ['LeftForeArm',6,8,[-.28,0,0]],['LeftHand',7,9,[-.25,0,0]],['LeftHandEnd',8,-1,[-.09,0,0]],
  ['RightShoulder',2,11,[.09,0,0]],['RightArm',10,12,[.10,0,0]],
  ['RightForeArm',11,13,[.28,0,0]],['RightHand',12,14,[.25,0,0]],['RightHandEnd',13,-1,[.09,0,0]],
  ['LeftUpLeg',0,16,[-.10,0,0]],['LeftLeg',15,17,[0,-.42,0]],['LeftFoot',16,18,[0,-.42,0]],['LeftToeBase',17,-1,[0,-.04,-.16]],
  ['RightUpLeg',0,20,[.10,0,0]],['RightLeg',19,21,[0,-.42,0]],['RightFoot',20,22,[0,-.42,0]],['RightToeBase',21,-1,[0,-.04,-.16]]];
const median=a=>{a=[...a].sort((x,y)=>x-y);return a[Math.floor(a.length/2)];};
export function snapshotLandmarks(items) {
  if(!Array.isArray(items))return null;
  return items.map(p=>({x:p.x,y:p.y,z:p.z,visibility:Number.isFinite(p.visibility)?p.visibility:1,
    ...(Number.isFinite(p.presence)?{presence:p.presence}:{})}));
}
export function captureFrame(t,result,hands=null) {
  return {t,world:snapshotLandmarks(result.worldLandmarks?.[0]),image:snapshotLandmarks(result.landmarks?.[0]),
    hands:hands?{world:(hands.worldLandmarks||[]).map(snapshotLandmarks),
      image:(hands.landmarks||[]).map(snapshotLandmarks),handedness:hands.handedness||[]}:null};
}
export function validateCapture(c) {
  if(c?.format!=='webcam-mocap-capture'||c.version!==1||!Array.isArray(c.frames)||c.frames.length<2||c.frames.length>8000)
    throw new Error('Recording needs at least two frames and at most 8,000 frames.');
  if(!Number.isFinite(c.duration)||c.duration<.1||c.duration>MAX_SECONDS)throw new Error('Recording was too short or has an invalid duration.');
  let prev=-1;
  for(const f of c.frames) {
    if(!Number.isFinite(f.t)||f.t<0||f.t<prev||f.t>c.duration+0.1)throw new Error('Invalid frame timestamps.');
    prev=f.t;
    if(f.world!==null&&(!Array.isArray(f.world)||f.world.length!==33||f.world.some(p=>
      !p||![p.x,p.y,p.z,p.visibility].every(Number.isFinite)||Math.max(Math.abs(p.x),Math.abs(p.y),Math.abs(p.z))>10)))
      throw new Error('Invalid body landmarks.');
  }
}
function usable(p) {return p&&p.visibility>=.6&&(!Number.isFinite(p.presence)||p.presence>=.6);}
// Pose already supplies these sparse landmarks. Only a rigid head orientation
// is estimated: no expression, lip, jaw, eye or facial-bone animation is made.
export function measureHead(world,image=null) {
  const ids=[2,5,9,10,11,12,23,24];
  if(!Array.isArray(world)||ids.some(i=>!usable(world[i])||
    ![world[i].x,world[i].y,world[i].z].every(Number.isFinite)||
    (image&&(!usable(image[i])||image[i].x<0||image[i].x>1||image[i].y<0||image[i].y>1))))return null;
  const a=world.map(p=>[-p.x,-p.y,p.z]);
  const side=sub(a[5],a[2]),up=sub(mid(a,2,5),mid(a,9,10));
  const width=Math.hypot(...side),height=Math.hypot(...up);
  if(width<.025||width>.20||height<.025||height>.20||Math.hypot(...cross(unit(side),unit(up)))<.5)return null;
  const head=basisQuaternion(side,up),chest=torsoRotation(a);
  return head&&chest?qmul(inverse(chest),head):null;
}
function torsoRotation(a) {
  return basisQuaternion(sub(a[12],a[11]),sub(mid(a,11,12),mid(a,23,24)));
}
function quatToZXY(q) {
  const [x,y,z,w]=q;
  const m11=1-2*(y*y+z*z),m12=2*(x*y-z*w),m21=2*(x*y+z*w),m22=1-2*(x*x+z*z),
    m31=2*(x*z-y*w),m32=2*(y*z+x*w),m33=1-2*(x*x+y*y);
  const X=Math.asin(Math.max(-1,Math.min(1,m32)));
  const Y=Math.abs(m32)<.9999999?Math.atan2(-m31,m33):0;
  const Z=Math.abs(m32)<.9999999?Math.atan2(-m12,m22):Math.atan2(m21,m11);
  return [Z,X,Y].map(v=>v*180/Math.PI);
}
export function buildAnimation(c) {
  validateCapture(c);
  const observations=c.frames;
  const warnings=[];
  const headTrack=observations.flatMap(f=>{
    const q=measureHead(f.world,f.image);return q?[{t:f.t,q}]:[];
  });
  const suppliedNeutral=c.headNeutral;
  const headNeutral=Array.isArray(suppliedNeutral)&&suppliedNeutral.length===4&&
    suppliedNeutral.every(Number.isFinite)&&Math.abs(Math.hypot(...suppliedNeutral)-1)<.01?
    suppliedNeutral:headTrack[0]?.q;
  if(!headTrack.length)warnings.push('Head rotation unavailable: keep both eyes and the mouth area visible. Head follows the torso.');
  else if(!suppliedNeutral)warnings.push('Head neutral was estimated from the first visible head sample. For a new take, look straight ahead during the countdown.');
  let previousHead=identity,headGaps=false;
  const palms={LeftHand:[],RightHand:[]};
  const aspect=c.videoSettings?.width&&c.videoSettings?.height?c.videoSettings.width/c.videoSettings.height:4/3;
  const trackHands=createRecordingHandTracker();
  const fused=observations.map(f=>{
    const hands={landmarks:f.hands?.image||[],worldLandmarks:f.hands?.world||[]};
    const refined=trackHands(f.t,f.world,f.image,hands,aspect),matches=refined.matches;
    for(const match of matches) {
      const points=hands.worldLandmarks?.[match.handIndex];
      if(!Array.isArray(points)||points.length!==21)continue;
      const mapped=[0,9,5,17].map(i=>points[i]&&[-points[i].x,-points[i].y,points[i].z]);
      const q=palmRotation(...mapped);
      if(q)palms[match.name==='leftHand'?'LeftHand':'RightHand'].push({t:f.t,q});
    }
    return {...f,world:refined.world?recordingWristPositions(refined.world,refined.image,matches,aspect):null,image:refined.image};
  });
  let rejectedPalms=0;
  const angle=(a,b)=>2*Math.acos(Math.min(1,Math.abs(dot(a,b))));
  for(const name of Object.keys(palms))palms[name]=palms[name].filter((sample,i,track)=>{
    const a=track[i-1],b=track[i+1];
    const spike=a&&b&&b.t-a.t<.2&&angle(a.q,b.q)<Math.PI/6&&
      angle(a.q,sample.q)>Math.PI*.45&&angle(b.q,sample.q)>Math.PI*.45;
    if(spike)rejectedPalms++;return !spike;
  });
  const tracks=Array.from({length:33},()=>[]);
  fused.forEach(f=>f.world?.forEach((p,i)=>{
    const image=f.image?.[i];
    const inView=!image||(image.x>=0&&image.x<=1&&image.y>=0&&image.y<=1&&usable(image));
    if(usable(p)&&inView)tracks[i].push({t:f.t,p:[-p.x,-p.y,p.z]});
  }));
  const core=[11,12,23,24];
  if(core.some(i=>tracks[i].length<2))throw new Error('Not enough visible shoulders and hips. Record again with your torso in view.');
  const missingLegs=[25,26,27,28,31,32].some(i=>tracks[i].length<2);
  if(missingLegs)warnings.push('Some leg/foot landmarks were missing: those joints use an estimated neutral pose. Show the entire body for full-body motion.');
  let longGaps=0;
  const sample=(i,t)=>{
    const list=tracks[i];if(!list.length)return null;
    // Only 33 tracks and <=3,600 output frames; binary search avoids quadratic scans.
    let lo=0,hi=list.length;
    while(lo<hi){const m=(lo+hi)>>1;if(list[m].t<t)lo=m+1;else hi=m;}
    const b=list[Math.min(lo,list.length-1)],a=list[Math.max(0,lo-1)];
    const maxGap=(i===15||i===16) ? .8 : .5;
    if(b.t-a.t>maxGap) {longGaps++;return t-a.t<b.t-t?a.p:b.p;}
    return mix(a.p,b.p,b.t===a.t?0:Math.max(0,Math.min(1,(t-a.t)/(b.t-a.t))));
  };
  const count=Math.floor(c.duration*FPS)+1;
  const sampled=[];
  for(let f=0;f<count;f++) {
    const t=Math.min(f/FPS,c.duration),a=tracks.map((_,i)=>sample(i,t));
    const hips=mul(add(a[23],a[24]),.5),chest=mul(add(a[11],a[12]),.5);
    // Missing points inherit an anatomical neutral approximation, never NaN.
    for(const [hip,knee,ankle,toe,sign] of [[23,25,27,31,-1],[24,26,28,32,1]]) {
      a[knee]??=add(a[hip],[0,-.42,0]);a[ankle]??=add(a[knee],[0,-.42,0]);
      a[toe]??=add(a[ankle],[0,-.04,-.16]);
    }
    for(const [shoulder,elbow,wrist,pinky,index,sign] of [[11,13,15,17,19,-1],[12,14,16,18,20,1]]) {
      a[elbow]??=add(a[shoulder],[sign*.28,0,0]);a[wrist]??=add(a[elbow],[sign*.25,0,0]);
      a[pinky]??=add(a[wrist],[sign*.09,0,0]);a[index]??=add(a[wrist],[sign*.09,0,0]);
    }
    a[7]??=add(chest,[-.07,.22,0]);a[8]??=add(chest,[.07,.22,0]);
    sampled.push({t,a,j:joints(a),hips});
  }
  const skeleton=layout.map(([name,parent,child,offset],i)=>{
    if(parent<0)return {name,parent,child,offset};
    const lengths=sampled.map(f=>Math.hypot(...sub(f.j[i],f.j[parent]))).filter(n=>n>.025&&n<1);
    return {name,parent,child,offset:mul(unit(offset),lengths.length?median(lengths):Math.hypot(...offset))};
  });
  const frames=[];let previousGlobal=null,previousEnds={},previousHandLocal={};
  for(const s of sampled) {
    const pelvis=basisQuaternion(sub(s.a[24],s.a[23]),sub(s.j[2],s.j[0]))||identity;
    const chest=torsoRotation(s.a)||pelvis;
    const observedHead=orientationAt(headTrack,s.t);
    if(!observedHead&&headTrack.length)headGaps=true;
    const headLocal=observedHead&&headNeutral?qmul(observedHead,inverse(headNeutral)):previousHead;
    previousHead=smoothOrientation(previousHead,headLocal,Math.PI/18);
    const global=[],local=[];
    const ends={};
    for(const [name,ankle,heel,toe] of [['LeftFoot',27,29,31],['RightFoot',28,30,32]]) {
      const measured=tracks[heel].length>=2?footRotation(s.a[ankle],s.a[heel],s.a[toe]):null;
      const flat=basisQuaternion(cross(sub(s.a[toe],s.a[ankle]),[0,1,0]),[0,1,0]);
      const q=measured||previousEnds[name]||flat||pelvis;
      ends[name]=smoothOrientation(previousEnds[name],q,Math.PI/18);
    }
    for(let i=0;i<skeleton.length;i++) {
      const b=skeleton[i],parent=b.parent<0?identity:global[b.parent];
      let q=parent;
      if(i===0)q=pelvis;
      else if(i===1)q=slerp(pelvis,chest,.5);
      else if(i===2)q=chest;
      else if(i===4)q=qmul(chest,previousHead);
      else if(i===17||i===21)q=ends[i===17?'LeftFoot':'RightFoot'];
      else if(i===8||i===13) {
        const left=i===8,name=left?'LeftHand':'RightHand',wrist=left?15:16,pinky=left?17:18,index=left?19:20;
        const restPalm=basisQuaternion([0,1,0],left?[-1,0,0]:[1,0,0]);
        const observed=orientationAt(palms[name],s.t,.8,.15);
        const measured=observed||(!previousHandLocal[name]?palmRotation(s.a[wrist],mid(s.a,pinky,index),s.a[index],s.a[pinky]):null);
        // Hold the joint relative to the moving forearm, not in world space.
        // Reacquisition also blends in joint space to avoid wrist flips.
        const desired=measured?qmul(qmul(inverse(parent),measured),inverse(restPalm)):previousHandLocal[name]||identity;
        const joint=smoothOrientation(previousHandLocal[name],desired,Math.PI/12);
        previousHandLocal[name]=joint;q=qmul(parent,joint);ends[name]=qmul(q,restPalm);
      }
      else if(b.child>=0) {
        // Preserve the parent's roll and use the observed limb direction.
        const rest=skeleton[b.child].offset;
        q=qmul(swing(rotate(parent,rest),sub(s.j[b.child],s.j[i])),parent);
      }
      if(previousGlobal&&![8,13,17,21].includes(i))q=slerp(previousGlobal[i],q,.65);
      global.push(q);local.push(qmul(inverse(parent),q));
    }
    previousGlobal=global;
    const positions=[];
    skeleton.forEach((b,i)=>positions.push(b.parent<0?[0,0,0]:add(positions[b.parent],rotate(global[b.parent],b.offset))));
    const floor=Math.min(...[17,18,21,22].map(i=>positions[i][1]));
    frames.push({t:s.t,root:[0,-floor,0],rotations:local,endEffectors:ends});
    previousEnds=ends;
  }
  if(longGaps)warnings.push('Tracking gaps longer than 0.5 seconds were held to nearby poses; inspect these portions before exporting to GTA.');
  if(headGaps)warnings.push('Head tracking was lost during part of this take. The last reliable head rotation was held relative to the torso.');
  if(rejectedPalms)warnings.push(`${rejectedPalms} isolated palm-rotation spikes were rejected.`);
  warnings.push('Wrist continuity: gaps up to 0.8s are interpolated between observations; longer losses hold the last wrist joint relative to the forearm. Hidden motion is not recovered.');
  warnings.push('In-place motion: horizontal travel is not reconstructed. Root height is estimated from supporting feet. Finger articulation and hidden joint twist are not reconstructed.');
  return {format:'webcam-mocap-animation',version:1,retargetVersion:2,headTracking:'rigid rotation only; no facial animation',fps:FPS,duration:(count-1)/FPS,
    coordinateSystem:'right-handed Y-up, metres, character faces -Z',skeleton,frames,warnings};
}
export function toBVH(animation) {
  const {skeleton,frames,fps}=animation,order=[],lines=['HIERARCHY'];
  const children=i=>skeleton.map((b,j)=>b.parent===i?j:-1).filter(j=>j>=0);
  function joint(i,depth) {
    const b=skeleton[i],pad='  '.repeat(depth);order.push(i);
    lines.push(`${pad}${b.parent<0?'ROOT':'JOINT'} ${b.name}`,`${pad}{`,`${pad}  OFFSET ${b.offset.join(' ')}`,
      `${pad}  CHANNELS ${b.parent<0?'6 Xposition Yposition Zposition':'3'} Zrotation Xrotation Yrotation`);
    const kids=children(i);kids.forEach(j=>joint(j,depth+1));
    if(!kids.length)lines.push(`${pad}  End Site`,`${pad}  {`,`${pad}    OFFSET 0 0.03 0`,`${pad}  }`);
    lines.push(`${pad}}`);
  }
  joint(0,0);lines.push('MOTION',`Frames: ${frames.length}`,`Frame Time: ${(1/fps).toFixed(9)}`);
  for(const f of frames)lines.push([...f.root,...order.flatMap(i=>quatToZXY(f.rotations[i]))].map(n=>n.toFixed(6)).join(' '));
  return lines.join('\n')+'\n';
}
