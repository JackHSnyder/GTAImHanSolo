(function (root) {
  'use strict';
  const names = ['leftHand', 'rightHand', 'head', 'leftFoot', 'rightFoot', 'spine'];
  function validSkeleton(s) {
    return s&&Number.isFinite(s.aspect)&&s.aspect>=.2&&s.aspect<=5&&
      Array.isArray(s.points)&&s.points.length===33&&Array.from(s.points).every(p=>p===null||
        (Array.isArray(p)&&p.length===3&&Array.from(p).every(n=>Number.isFinite(n)&&n>=0&&n<=1)));
  }
  function validate(p) {
    if (!p || p.v !== 1 || !Number.isSafeInteger(p.seq) || p.seq < 0 ||
        typeof p.tracked !== 'boolean' || !p.targets || Array.isArray(p.targets)) return false;
    if(p.skeleton!==undefined&&!validSkeleton(p.skeleton))return false;
    if(p.handMatch!==undefined&&(!p.handMatch||!['left','right'].every(k=>p.handMatch[k]===null||
      (Array.isArray(p.handMatch[k])&&p.handMatch[k].length===3&&Array.from(p.handMatch[k]).every(n=>Number.isFinite(n)&&Math.abs(n)<=4)))))return false;
    if(p.bodyBlend!==undefined && (!p.bodyBlend || !Number.isFinite(p.bodyBlend.amount) || p.bodyBlend.amount<0 ||
      p.bodyBlend.amount>1 || !Number.isFinite(p.bodyBlend.confidence) || p.bodyBlend.confidence<0 || p.bodyBlend.confidence>1))return false;
    if(p.pelvis!==undefined && (!p.pelvis || !Number.isFinite(p.pelvis.heightRatio) || p.pelvis.heightRatio<0 ||
      p.pelvis.heightRatio>1.2 || !Number.isFinite(p.pelvis.confidence) || p.pelvis.confidence<0 || p.pelvis.confidence>1)) return false;
    return names.every(name => {
      const t = p.targets[name];
      if(name==='spine' && t===undefined) return true;
      const expectedAnchor = { leftHand: 'leftShoulder', rightHand: 'rightShoulder',leftFoot:'leftHip',rightFoot:'rightHip' }[name];
      const isHand=name==='leftHand'||name==='rightHand';
      const q = t && t.orientation;
      const orientationValid = q === undefined || (isHand && q &&
        ['x','y','z','w'].every(k=>Number.isFinite(q[k]) && Math.abs(q[k])<=1) &&
        Math.abs(Math.hypot(q.x,q.y,q.z,q.w)-1)<0.02);
      return t && (t.anchor === undefined || (expectedAnchor !== undefined && t.anchor === expectedAnchor)) &&
        (t.limbLength===undefined || (['leftFoot','rightFoot'].includes(name) && Number.isFinite(t.limbLength) && t.limbLength>=0.2 && t.limbLength<=1.5)) &&
        orientationValid &&
        ['x', 'y', 'z', 'confidence'].every(k => Number.isFinite(t[k])) &&
        Math.abs(t.x) <= 1.5 && Math.abs(t.y) <= 1.5 && Math.abs(t.z) <= 1.5 &&
        t.confidence >= 0 && t.confidence <= 1;
    });
  }
  function sanitize(p) {
    const result={ v: 1, seq: p.seq, tracked: p.tracked, targets: Object.fromEntries(
      names.filter(n=>p.targets[n]!==undefined).map(n => {
        const t = Object.fromEntries(['x', 'y', 'z', 'confidence'].map(k => [k, p.targets[n][k]]));
        if (p.targets[n].anchor !== undefined) t.anchor = p.targets[n].anchor;
        if (p.targets[n].limbLength !== undefined) t.limbLength = p.targets[n].limbLength;
        if (p.targets[n].orientation !== undefined) t.orientation = Object.fromEntries(
          ['x','y','z','w'].map(k=>[k,p.targets[n].orientation[k]]));
        return [n, t];
      })) };
    if(p.pelvis!==undefined) result.pelvis={heightRatio:p.pelvis.heightRatio,confidence:p.pelvis.confidence};
    if(p.bodyBlend!==undefined) result.bodyBlend={amount:p.bodyBlend.amount,confidence:p.bodyBlend.confidence};
    if(p.skeleton!==undefined)result.skeleton={aspect:p.skeleton.aspect,points:p.skeleton.points.map(p=>p===null?null:p.slice(0,3))};
    if(p.handMatch!==undefined)result.handMatch=Object.fromEntries(['left','right'].map(k=>[k,p.handMatch[k]?.slice(0,3)||null]));
    return result;
  }
  const api = { names, validate, sanitize, validSkeleton };
  root.PoseProtocol = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
