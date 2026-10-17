(function(root){
  'use strict';
  const sub=(a,b)=>a.map((v,i)=>v-b[i]);
  const dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0);
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const vec=a=>Array.isArray(a)&&a.length===3&&Array.from(a).every(Number.isFinite);
  const unit=a=>{const n=Math.hypot(...a);return n>1e-6?a.map(v=>v/n):null;};
  const mid=(a,b)=>a.map((v,i)=>(v+b[i])/2);
  // Only upper-arm roots, elbows and wrist positions are used. No finger or
  // hand orientation data enters the body frame or the comparison.
  function relativeHands(body) {
    const empty={left:null,right:null};
    if(!body||!['leftShoulder','rightShoulder','hips'].every(k=>vec(body[k])))return empty;
    const chest=mid(body.leftShoulder,body.rightShoulder);
    const side=sub(body.rightShoulder,body.leftShoulder),up=sub(chest,body.hips);
    if(Math.hypot(...side)<.12||Math.hypot(...up)<.15)return empty;
    const x=unit(side),z=unit(cross(x,up));if(!z)return empty;
    const y=unit(cross(z,x)),result={...empty};
    for(const name of ['left','right']) {
      const shoulder=body[name+'Shoulder'],elbow=body[name+'Elbow'],hand=body[name+'Hand'];
      if(!vec(elbow)||!vec(hand))continue;
      const reach=Math.hypot(...sub(elbow,shoulder))+Math.hypot(...sub(hand,elbow));
      if(reach<.2||reach>1.7)continue;
      const offset=sub(hand,chest),p=[x,y,z].map(axis=>dot(offset,axis)/reach);
      if(p.every(n=>Math.abs(n)<=4))result[name]=p;
    }
    return result;
  }
  // The dancer faces the viewer. A mirrored camera shows the viewer's right
  // hand on screen-right, opposite the dancer's anatomical right. Reflect
  // horizontal offsets AND exchange hand identities to match the visible
  // pose. Height and depth stay body-relative; tracking packets are immutable.
  function handsForView(live,mirrored=true) {
    if(!live)return null;
    if(!mirrored)return live;
    const reflect=p=>vec(p)?[-p[0],p[1],p[2]]:null;
    return {left:reflect(live.right),right:reflect(live.left)};
  }
  function compare(live,target) {
    if(!live||!target||!['left','right'].every(k=>vec(live[k])&&vec(target[k])))return null;
    const errors=['left','right'].map(k=>Math.hypot(...sub(live[k],target[k])));
    // 0.75 arm lengths of error gives zero for that hand; exact match is 50.
    const points=Math.round(errors.reduce((n,e)=>n+50*Math.max(0,1-e/.75)**2,0));
    return {points,errors};
  }
  // The first scoring opportunity is delay + 1; count whole scored seconds.
  const newRound=(delaySeconds=0,durationSeconds=0)=>({total:0,samples:0,skipped:0,nextSecond:1,lastPoints:null,status:'waiting',delaySeconds,
    goal:Number.isFinite(durationSeconds)&&Number.isFinite(delaySeconds)?Math.max(0,Math.floor(durationSeconds-delaySeconds+1e-5))*50:0});
  function timing(delaySeconds,seconds) {
    const remaining=delaySeconds-seconds;
    return {countdown:delaySeconds>3&&remaining>1e-5&&remaining<=3?Math.ceil(remaining-1e-5):null,
      phase:seconds<delaySeconds?'delay':seconds<delaySeconds+1?'grace':'scoring',
      scoreSeconds:seconds-delaySeconds};
  }
  function sample(round,seconds,live,target) {
    if(!Number.isFinite(seconds)||seconds<0)return false;
    const due=Math.floor(seconds+1e-5);
    if(due<round.nextSecond)return false;
    // Never backfill missed seconds with the current pose after a frame hitch.
    round.skipped+=Math.max(0,due-round.nextSecond);round.nextSecond=due+1;
    const match=seconds-due<=.2?compare(live,target):null;
    if(!match) {round.skipped++;round.lastPoints=null;round.status='untracked';return true;}
    round.total+=match.points;round.samples++;round.lastPoints=match.points;round.status='scored';
    return true;
  }
  const api={relativeHands,handsForView,compare,newRound,sample,timing};
  root.MocapScore=api;
  if(typeof module!=='undefined')module.exports=api;
})(globalThis);
