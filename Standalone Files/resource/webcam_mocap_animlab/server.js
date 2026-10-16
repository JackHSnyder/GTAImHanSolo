'use strict';
const { randomBytes } = require('crypto');
const sessions = new Map();
const lifetime = 30 * 60 * 1000;
const protocol = globalThis.PoseProtocol;
const say = (id, text) => emitNet('webcam_mocap_animlab:notice', id, text);

RegisterCommand('mocaplab', (source, args) => {
  const id = Number(source);
  if (!id) return;
  const mode = args[0] || 'preview';
  if (mode === 'stop') {
    sessions.delete(id);
    emitNet('webcam_mocap_animlab:stop', id);
    return;
  }
  if (mode !== 'preview') return say(id, 'Animation lab supports /mocaplab preview or /mocaplab stop.');
  if (!IsPlayerAceAllowed(String(id), 'webcam_mocap_animlab.use')) return say(id, 'Missing webcam_mocap_animlab.use permission.');
  const token = randomBytes(24).toString('hex');
  sessions.set(id, { token, mode:'preview', expires: Date.now() + lifetime, last: 0, seq: -1 });
  emitNet('webcam_mocap_animlab:start', id, mode, token);
}, false);

RegisterCommand('mocaplabvisit', (source, args) => {
  const id=Number(source);if(!id)return;
  if(args[0]==='stop') {
    sessions.delete(id);emitNet('webcam_mocap_animlab:stop',id);return;
  }
  if(!IsPlayerAceAllowed(String(id),'webcam_mocap_animlab.use'))return say(id,'Missing webcam_mocap_animlab.use permission.');
  const dict=args[0]||'webcam_recording',clip=args[1]||'webcam_take';
  if(args.length>2||![dict,clip].every(n=>/^[a-zA-Z0-9_@.-]{1,80}$/.test(n)))
    return say(id,'Use /mocaplabvisit [dictionary clip], or /mocaplabvisit stop.');
  // A fresh pairing only supplies the comparison HUD; it never drives the model.
  const token=randomBytes(24).toString('hex');
  sessions.set(id,{token,mode:'visit',expires:Date.now()+lifetime,last:0,seq:-1});
  emitNet('webcam_mocap_animlab:visit',id,dict,clip,token);
},false);

on('playerDropped', () => sessions.delete(Number(global.source)));
onNet('webcam_mocap_animlab:ack', (seq, state, parts, wrists = [], animation = null) => {
  const s = sessions.get(Number(global.source));
  if (!s || s.expires <= Date.now() || !Number.isSafeInteger(seq) || seq < 0 || seq > s.seq ||
      (s.ack && seq <= s.ack.seq) || !['applied','untracked','unavailable'].includes(state) ||
      !Array.isArray(parts) || parts.length > protocol.names.length || parts.some(n => !protocol.names.includes(n)) ||
      !Array.isArray(wrists) || wrists.length>2 || wrists.some(n=>!['leftHand','rightHand'].includes(n))) return;
  if(animation!==null && (!animation || typeof animation.active!=='boolean' || typeof animation.manual!=='boolean' ||
    !Number.isFinite(animation.amount)||animation.amount<0||animation.amount>1||
    !Number.isFinite(animation.phase)||animation.phase<0||animation.phase>1))return;
  const body=animation?{active:animation.active,manual:animation.manual,amount:animation.amount,phase:animation.phase}:null;
  s.ack = { seq, state, parts: [...new Set(parts)], wrists: [...new Set(wrists)], animation:body, time: Date.now() };
});
setInterval(() => {
  for (const [id, s] of sessions) {
    if (Date.now() > s.expires) {
      sessions.delete(id);
      emitNet('webcam_mocap_animlab:stop', id);
    }
  }
}, 1000);

SetHttpHandler((req, res) => {
  const finish = (status, text, type = 'text/plain') => {
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.send(text);
  };
  if (req.path !== '/pose' || req.method !== 'POST') return finish(404, 'Not found');
  const auth = req.headers.authorization || req.headers.Authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const entry = [...sessions.entries()].find(([, s]) => s.token === token && s.expires > Date.now());
  if (!entry) return finish(401, 'Pair again with /mocaplab');
  const [id, session] = entry;
  if (Date.now() - session.last < 40) return finish(429, 'Rate limited');
  session.last = Date.now();
  req.setDataHandler(body => {
    if (typeof body !== 'string' || body.length > 4096) return finish(413, 'Pose too large');
    let p;
    try { p = JSON.parse(body); } catch { return finish(400, 'Invalid JSON'); }
    if (!protocol.validate(p) || p.seq <= session.seq) return finish(400, 'Invalid or out-of-order pose');
    // Recheck after receiving the body: stop, re-pair and expiry revoke in-flight requests.
    if (sessions.get(id) !== session || session.expires <= Date.now()) return finish(401, 'Session ended');
    session.seq = p.seq;
    emitNet('webcam_mocap_animlab:pose', id, protocol.sanitize(p));
    const ack = session.ack;
    finish(200, JSON.stringify({ accepted: true, seq: p.seq, mode:session.mode,
      game: ack ? { seq: ack.seq, state: ack.state, parts: ack.parts, wrists: ack.wrists, animation:ack.animation, ageMs: Date.now()-ack.time } : null
    }), 'application/json');
  });
});
