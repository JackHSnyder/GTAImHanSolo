const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
function kneeAngle(hip,knee,ankle) {
  const a=['x','y','z'].map(k=>hip[k]-knee[k]),b=['x','y','z'].map(k=>ankle[k]-knee[k]);
  const length=Math.hypot(...a)*Math.hypot(...b);
  return length>0.0001?Math.acos(clamp(a.reduce((s,v,i)=>s+v*b[i],0)/length,-1,1))*180/Math.PI:null;
}
export function measureCrouch(world,image) {
  const missing={amount:0,confidence:0,leftAngle:null,rightAngle:null};
  if(!Array.isArray(world)||world.length!==33||!Array.isArray(image)||image.length!==33)return missing;
  const indexes=[23,24,25,26,27,28];
  if(indexes.some(i=>!world[i]||!image[i]||!['x','y','z'].every(k=>Number.isFinite(world[i][k]))||
    !Number.isFinite(world[i].visibility)||!Number.isFinite(image[i].visibility)||
    world[i].visibility<0.6||image[i].visibility<0.6||!Number.isFinite(image[i].x)||!Number.isFinite(image[i].y)||
    image[i].x<0||image[i].x>1||image[i].y<0||image[i].y>1))return missing;
  const leftAngle=kneeAngle(world[23],world[25],world[27]),rightAngle=kneeAngle(world[24],world[26],world[28]);
  if(leftAngle===null||rightAngle===null)return missing;
  // Both knees must bend. One raised knee does not trigger a crouch.
  const bend=Math.min(clamp((170-leftAngle)/80),clamp((170-rightAngle)/80));
  const amount=bend*bend*(3-2*bend);
  return {amount,confidence:clamp(Math.min(...indexes.flatMap(i=>[world[i].visibility,image[i].visibility]))),leftAngle,rightAngle};
}
