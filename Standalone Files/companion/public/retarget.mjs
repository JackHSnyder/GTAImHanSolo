const names = { leftHand: 15, rightHand: 16, head: 0, leftFoot: 27, rightFoot: 28 };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export function emptyPose(seq) {
  return { v: 1, seq, tracked: false, targets: Object.fromEntries(Object.keys(names).map(n =>
    [n, { x: 0, y: 0, z: 0, confidence: 0 }])) };
}
export function retarget(world, seq, gain = 1, image = null, aspect = 4 / 3) {
  const p = emptyPose(seq);
  if (!Array.isArray(world) || world.length !== 33 || world.some(t =>
    !t || !['x', 'y', 'z'].every(k => Number.isFinite(t[k])))) return p;
  const confidence = t => Number.isFinite(t.visibility) ? Math.min(clamp(t.visibility, 0, 1),
    Number.isFinite(t.presence) ? clamp(t.presence, 0, 1) : 1) : 0;
  const core = Math.min(...[11, 12, 23, 24].map(i => confidence(world[i])));
  if (core < 0.6) return p;
  const a = world[11], b = world[12];
  const shoulderWidth = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  if (shoulderWidth < 0.15 || shoulderWidth > 0.8) return p;
  const scale = clamp(0.38 / shoulderWidth, 0.6, 1.8) * clamp(gain, 0.6, 1.4);
  const hip = Object.fromEntries(['x', 'y', 'z'].map(k => [k, (world[23][k] + world[24][k]) / 2]));
  for (const [name, index] of Object.entries(names)) {
    const t = world[index];
    // Camera image right -> ped left; camera down -> ped down; toward camera -> ped forward.
    p.targets[name] = {
      x: clamp(-(t.x - hip.x) * scale, -1.2, 1.2),
      y: clamp(-(t.z - hip.z) * scale, -0.8, 0.8),
      z: clamp(-(t.y - hip.y) * scale, -1.2, 1.2),
      confidence: Math.min(core, confidence(t))
    };
  }
  // Anchor arms to the ped's shoulders, not a generic hip-to-wrist distance.
  // Image-space wrist positions are more useful than estimated 3D X/Y when a
  // folded arm overlaps the torso. Preserve world-space depth except near a
  // shoulder, where monocular depth hallucinations can otherwise extend an arm.
  const visible = t => t && ['x','y'].every(k => Number.isFinite(t[k])) &&
    t.x >= 0 && t.x <= 1 && t.y >= 0 && t.y <= 1 && confidence(t) >= 0.6;
  const screenValid = Array.isArray(image) && image.length === 33 &&
    Number.isFinite(aspect) && aspect > 0 && aspect < 4 && visible(image[11]) && visible(image[12]);
  const screenWidth = screenValid ? Math.hypot(
    (image[11].x - image[12].x) * aspect, image[11].y - image[12].y) : 0;
  const useScreen = screenWidth > 0.04;
  for (const [name, wrist, shoulder, anchor] of [
    ['leftHand',15,11,'leftShoulder'], ['rightHand',16,12,'rightShoulder']
  ]) {
    const w = world[wrist], s = world[shoulder];
    const t = {
      x: -(w.x-s.x)*scale, y: -(w.z-s.z)*scale, z: -(w.y-s.y)*scale,
      confidence: Math.min(core, confidence(w)), anchor
    };
    if (image !== null && !useScreen) t.confidence = 0;
    if (useScreen) {
      if (!visible(image[wrist])) {
        t.confidence = 0; // Release this wrist rather than driving an inferred extended arm.
      } else {
        const dx = (image[wrist].x-image[shoulder].x)*aspect;
        const dy = image[wrist].y-image[shoulder].y;
        const screenScale = 0.38 / screenWidth * clamp(gain, 0.6, 1.4);
        t.x = -dx*screenScale;
        t.z = -dy*screenScale;
        t.confidence = Math.min(t.confidence, confidence(image[wrist]));
        // Blend continuously: a hand overlapping the shoulder gets at most
        // 18 cm of forward depth; a visibly extended hand keeps up to 70 cm.
        // This is a front-facing heuristic, not a measurement of hidden depth.
        const separation = Math.hypot(dx,dy) / screenWidth;
        const blend = clamp((separation-0.25)/0.65, 0, 1);
        const depthLimit = 0.18 + 0.52*blend;
        t.y = clamp(t.y, -depthLimit, depthLimit);
        if (separation < 0.35) t.y = Math.max(t.y, 0.08);
      }
    }
    for (const k of ['x','y','z']) t[k] = clamp(t[k], -1.2, 1.2);
    p.targets[name] = t;
  }
  // Head IK takes a look-at point rather than a head-joint position.
  p.targets.head.y = 1.0;
  const midShoulder=Object.fromEntries(['x','y','z'].map(k=>[k,(a[k]+b[k])/2]));
  p.targets.spine={
    x:clamp(-(midShoulder.x-hip.x)*scale*2,-0.7,0.7),
    y:clamp(1-(midShoulder.z-hip.z)*scale*2,0.35,1.45),
    z:clamp(-(midShoulder.y-hip.y)*scale,0.15,1),
    confidence:image===null || [11,12,23,24].every(i=>Array.isArray(image)&&visible(image[i]))?core:0
  };
  // Hip-relative ankle endpoints preserve knee flexion through their distance
  // from the hip. The engine chooses knee direction; no knee rotation is sent.
  const legs=[];
  for(const [name,hipIndex,knee,ankle,anchor] of [
    ['leftFoot',23,25,27,'leftHip'],['rightFoot',24,26,28,'rightHip']
  ]) {
    const h=world[hipIndex],k=world[knee],f=world[ankle];
    const length=(Math.hypot(k.x-h.x,k.y-h.y,k.z-h.z)+Math.hypot(f.x-k.x,f.y-k.y,f.z-k.z))*scale;
    const visibleLeg=[hipIndex,knee,ankle].every(i=>confidence(world[i])>=0.6 &&
      (image===null || (Array.isArray(image) && visible(image[i]))));
    p.targets[name]={x:clamp(-(f.x-h.x)*scale,-1.2,1.2),y:clamp(-(f.z-h.z)*scale,-0.8,0.8),
      z:clamp(-(f.y-h.y)*scale,-1.2,1.2),confidence:visibleLeg && length>=0.2 && length<=1.5 ?
        Math.min(core,confidence(k),confidence(f)):0,anchor,limbLength:clamp(length,0.2,1.5)};
    legs.push({length,height:(f.y-h.y)*scale,visible:visibleLeg});
  }
  // Use the supporting leg so lifting only one knee does not lower the waist.
  p.pelvis={heightRatio:clamp(Math.max(...legs.map(l=>l.height/Math.max(l.length,0.2))),0,1.2),
    confidence:legs.every(l=>l.visible) && p.targets.leftFoot.confidence>=0.6 && p.targets.rightFoot.confidence>=0.6 ? core:0};
  p.tracked = true;
  return p;
}
