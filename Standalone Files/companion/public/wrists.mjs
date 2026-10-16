// Hand landmark 0 is the wrist. Hand-model depth is relative to the hand, so
// only image X/Y can be fused with the body's global wrist position safely.
await import(typeof window === 'undefined' ? '../../resource/webcam_mocap_animlab/hand-math.js' : './hand-math.js');
const HandMath = globalThis.HandMath;
export function wristOrientations(result, matches) {
  const orientations = {};
  for (const match of matches) {
    const points = result?.worldLandmarks?.[match.handIndex];
    if (!Array.isArray(points) || points.length!==21) continue;
    const mapped = [0,9,5,17].map(i=>points[i]&&[-points[i].x,-points[i].z,-points[i].y]);
    const q = HandMath.handFrame(...mapped);
    if(q) orientations[match.name]=q;
  }
  return orientations;
}
export function refineWrists(world, image, result, aspect = 4/3, options={}) {
  const unchanged = { world, image, matches: [] };
  if (!Array.isArray(world) || world.length !== 33 || !Array.isArray(image) || image.length !== 33 ||
      !Number.isFinite(aspect) || aspect <= 0 || aspect >= 4) return unchanged;
  const valid = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) &&
    p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
  const seen = p => valid(p) && p.visibility >= (options.recording ? .45 : .6);
  const dist = (a,b) => Math.hypot((a.x-b.x)*aspect, a.y-b.y);
  if (!seen(image[11]) || !seen(image[12])) return unchanged;
  const width = dist(image[11],image[12]);
  if (width < 0.04) return unchanged;
  const candidates = (Array.isArray(result?.landmarks) ? result.landmarks : []).slice(0,2).map((points, index) => ({points,index}))
    .filter(h => Array.isArray(h.points) && h.points.length === 21 &&
      (options.recording?[0,5,9,17].every(i=>h.points[i]&&Number.isFinite(h.points[i].x)&&Number.isFinite(h.points[i].y)&&h.points[i].x>=-.08&&h.points[i].x<=1.08&&h.points[i].y>=-.08&&h.points[i].y<=1.08)&&valid(h.points[0]):h.points.every(valid))&&
      dist(h.points[5],h.points[17]) > 0.004);
  if (!candidates.length) return unchanged;
  // Match to anatomical body wrist/elbow references, never just image side or
  // handedness labels (mirroring can reverse those labels).
  const sides = [{name:'leftHand',wrist:15,elbow:13}, {name:'rightHand',wrist:16,elbow:14}];
  const costs = sides.map(side => candidates.map(hand => {
    const previous=options.history?.[side.name];
    const ref = seen(image[side.wrist]) ? image[side.wrist] : seen(image[side.elbow]) ? image[side.elbow] : previous;
    if (!ref) return Infinity;
    const distance = dist(ref,hand.points[0])/width;
    if(distance>1.75)return Infinity;
    return previous?.x!==undefined?distance*.65+dist(previous,hand.points[0])/width*.35:distance;
  }));
  const possibilities = [];
  for (let left=-1;left<candidates.length;left++) for (let right=-1;right<candidates.length;right++) {
    if (left >= 0 && left === right) continue;
    const chosen = [left,right];
    const cost = chosen.reduce((total,n,side) => total + (n < 0 ? 0 : costs[side][n]),0);
    if (Number.isFinite(cost)) possibilities.push({chosen,cost,count:chosen.filter(n=>n>=0).length});
  }
  possibilities.sort((a,b) => b.count-a.count || a.cost-b.cost);
  const best = possibilities[0];
  if (!best?.count) return unchanged;
  const rival = possibilities[1];
  // Close/crossed wrists can be indistinguishable: retain body wrists rather
  // than risk swapping the two hands. No previous-frame result is held.
  if (rival && rival.count === best.count && rival.cost-best.cost < 0.12) return unchanged;
  const refinedImage = image.map(p=>({...p})), refinedWorld = world.map(p=>({...p})), matches = [];
  best.chosen.forEach((n,side) => {
    if (n < 0) return;
    const hand = candidates[n], {wrist,name} = sides[side];
    refinedImage[wrist] = {...refinedImage[wrist],x:hand.points[0].x,y:hand.points[0].y,visibility:0.8,presence:1};
    // The hand detector has its own detection/presence thresholds. An accepted
    // association can rescue a low-confidence body wrist without inventing depth.
    refinedWorld[wrist] = {...refinedWorld[wrist],visibility:0.8,presence:1};
    matches.push({name,handIndex:hand.index});
  });
  return {world:refinedWorld,image:refinedImage,matches};
}
// Recording-only continuity. History helps association for 350ms, but never
// fabricates landmarks or keeps a hand alive indefinitely after it disappears.
export function createRecordingHandTracker() {
  const history={};let lastTime=-Infinity;
  return (t,world,image,hands,aspect=4/3)=>{
    if(t<lastTime)for(const key of Object.keys(history))delete history[key];
    lastTime=t;
    for(const [key,value] of Object.entries(history))if(t-value.t>.35)delete history[key];
    const refined=refineWrists(world,image,hands,aspect,{recording:true,history});
    for(const match of refined.matches) {
      const p=hands.landmarks[match.handIndex][0];history[match.name]={x:p.x,y:p.y,t};
    }
    return refined;
  };
}
export function recordingWristPositions(world,image,matches,aspect=4/3) {
  if(!matches.length)return world;
  const seen=p=>p&&[p.x,p.y,p.z].every(Number.isFinite)&&p.visibility>=.45;
  if(![11,12].every(i=>seen(world[i])&&seen(image[i])))return world;
  const width=Math.hypot(...['x','y','z'].map(k=>world[11][k]-world[12][k]));
  const screen=Math.hypot((image[11].x-image[12].x)*aspect,image[11].y-image[12].y);
  if(width<.15||width>.8||screen<.04)return world;
  const output=world.map(p=>({...p})),scale=width/screen;
  for(const match of matches) {
    const wrist=match.name==='leftHand'?15:16,elbow=wrist-2;
    if(!seen(world[elbow])||!seen(image[elbow]))continue;
    const x=world[elbow].x+(image[wrist].x-image[elbow].x)*aspect*scale;
    const y=world[elbow].y+(image[wrist].y-image[elbow].y)*scale;
    if(Math.hypot(x-world[elbow].x,y-world[elbow].y)>.7)continue;
    // Preserve body-world depth; hand-model depth is local to the hand.
    output[wrist]={...output[wrist],x,y,visibility:.8,presence:1};
  }
  return output;
}
