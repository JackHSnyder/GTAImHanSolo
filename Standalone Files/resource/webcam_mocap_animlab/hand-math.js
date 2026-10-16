(function(root) {
  'use strict';
  const sub=(a,b)=>a.map((v,i)=>v-b[i]);
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const unit=v=>{const n=Math.hypot(...v);return Number.isFinite(n)&&n>1e-6?v.map(x=>x/n):null;};
  const normalize=q=>{const v=unit([q.x,q.y,q.z,q.w]);return v?{x:v[0],y:v[1],z:v[2],w:v[3]}:null;};
  const inverse=q=>({x:-q.x,y:-q.y,z:-q.z,w:q.w});
  const multiply=(a,b)=>normalize({
    x:a.w*b.x+a.x*b.w+a.y*b.z-a.z*b.y,
    y:a.w*b.y-a.x*b.z+a.y*b.w+a.z*b.x,
    z:a.w*b.z+a.x*b.y-a.y*b.x+a.z*b.w,
    w:a.w*b.w-a.x*b.x-a.y*b.y-a.z*b.z});
  function fromBasis(x,y,z) {
    const m00=x[0],m01=y[0],m02=z[0],m10=x[1],m11=y[1],m12=z[1],m20=x[2],m21=y[2],m22=z[2];
    const trace=m00+m11+m22; let q,s;
    if(trace>0){s=Math.sqrt(trace+1)*2;q={w:s/4,x:(m21-m12)/s,y:(m02-m20)/s,z:(m10-m01)/s};}
    else if(m00>m11&&m00>m22){s=Math.sqrt(1+m00-m11-m22)*2;q={w:(m21-m12)/s,x:s/4,y:(m01+m10)/s,z:(m02+m20)/s};}
    else if(m11>m22){s=Math.sqrt(1+m11-m00-m22)*2;q={w:(m02-m20)/s,x:(m01+m10)/s,y:s/4,z:(m12+m21)/s};}
    else{s=Math.sqrt(1+m22-m00-m11)*2;q={w:(m10-m01)/s,x:(m02+m20)/s,y:(m12+m21)/s,z:s/4};}
    return normalize(q);
  }
  function handFrame(wrist,middle,index,pinky) {
    if([wrist,middle,index,pinky].some(p=>!Array.isArray(p)||p.length!==3||!p.every(Number.isFinite)))return null;
    const y=unit(sub(middle,wrist)), side=unit(sub(index,pinky));
    if(!y||!side)return null;
    const perpendicular=cross(side,y);
    if(Math.hypot(...perpendicular)<0.15)return null;
    const z=unit(perpendicular),x=unit(cross(y,z));
    return fromBasis(x,y,z);
  }
  function blend(a,b,t) {
    if(!a)return b;
    const dot=a.x*b.x+a.y*b.y+a.z*b.z+a.w*b.w, sign=dot<0?-1:1;
    return normalize(Object.fromEntries(['x','y','z','w'].map(k=>[k,a[k]*(1-t)+b[k]*t*sign])));
  }
  const api={sub,cross,unit,normalize,inverse,multiply,fromBasis,handFrame,blend};
  root.HandMath=api;
  if(typeof module!=='undefined')module.exports=api;
})(globalThis);
