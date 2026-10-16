import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const protocol = require('../resource/webcam_mocap_animlab/protocol.js');
const publicRoot = new URL('./public/', import.meta.url);

export function createCompanion({ endpoint = 'http://127.0.0.1:30120/webcam_mocap_animlab/pose', relay = fetch } = {}) {
  const destination = new URL(endpoint);
  if (!['http:', 'https:'].includes(destination.protocol) || destination.username || destination.password) {
    throw new Error('MOCAP_LAB_SERVER_URL must be an HTTP(S) pose endpoint without credentials.');
  }
  let busy = false;
  return http.createServer(async (req, res) => {
    const host = req.headers.host;
    const expectedHost = `127.0.0.1:${res.socket.localPort}`;
    const send = (status, body, type = 'text/plain') => {
      res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(body);
    };
    // Resist DNS rebinding and cross-origin requests to the local relay.
    if (host !== expectedHost) return send(403, 'Open the companion using 127.0.0.1.');
    if (req.method === 'POST' && req.headers.origin !== `http://${expectedHost}`) return send(403, 'Invalid origin');
    if (req.method === 'GET' && req.url === '/config') return send(200, JSON.stringify({ endpoint: destination.href }), 'application/json');
    if (req.method === 'POST' && req.url === '/pose') {
      if (busy) { req.resume(); return send(429, 'Relay busy'); }
      const token = req.headers['x-pair-token'];
      if (typeof token !== 'string' || !/^[a-f0-9]{48}$/.test(token)) { req.resume(); return send(400, 'Paste the pairing token from FiveM.'); }
      busy = true;
      try {
        let body = '';
        for await (const chunk of req) {
          body += chunk.toString();
          if (Buffer.byteLength(body) > 4096) { send(413, 'Pose too large'); return; }
        }
        let p;
        try { p = JSON.parse(body); } catch { return send(400, 'Invalid JSON'); }
        if (!protocol.validate(p)) return send(400, 'Invalid pose');
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 1500);
        try {
          const upstream = await relay(destination, {
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(protocol.sanitize(p)), signal: controller.signal, redirect: 'error'
          });
          const text = await upstream.text();
          send(upstream.status, upstream.ok ? text : `FiveM returned ${upstream.status}: ${text.slice(0,300)}`,
            upstream.ok ? 'application/json' : 'text/plain');
        } finally { clearTimeout(timer); }
      } catch {
        if (!res.writableEnded) send(502, 'Cannot reach FiveM. Check MOCAP_LAB_SERVER_URL and the server resource.');
      } finally { busy = false; }
      return;
    }
    const routes = {
      '/': ['index.html', 'text/html; charset=utf-8'],
      '/app.js': ['app.js', 'text/javascript'],
      '/retarget.mjs': ['retarget.mjs', 'text/javascript'],
      '/delivery.mjs': ['delivery.mjs', 'text/javascript'],
      '/wrists.mjs': ['wrists.mjs', 'text/javascript'],
      '/recording.mjs': ['recording.mjs', 'text/javascript'],
      '/recorder-ui.mjs': ['recorder-ui.mjs', 'text/javascript'],
      '/youtube-reference.mjs': ['youtube-reference.mjs', 'text/javascript'],
      '/gta-importer.py': ['../../tools/mocap_gta_importer.py', 'text/plain; charset=utf-8'],
      '/recording-guide': ['../../RECORDING.md', 'text/plain; charset=utf-8'],
      '/pose-blend.mjs': ['pose-blend.mjs', 'text/javascript'],
      '/skeleton.mjs': ['skeleton.mjs', 'text/javascript'],
      '/resource/webcam_mocap_animlab/score-math.js': ['../../resource/webcam_mocap_animlab/score-math.js', 'text/javascript'],
      '/hand-math.js': ['../../resource/webcam_mocap_animlab/hand-math.js', 'text/javascript'],
      '/style.css': ['style.css', 'text/css']
    };
    if (req.method !== 'GET' || !routes[req.url]) return send(404, 'Not found');
    const [file, type] = routes[req.url];
    try { send(200, await readFile(new URL(file, publicRoot)), type); }
    catch { send(500, 'Missing companion file'); }
  });
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const server = createCompanion({ endpoint: process.env.MOCAP_LAB_SERVER_URL });
  server.listen(8788, '127.0.0.1', () => console.log('Open http://127.0.0.1:8788 in Chrome or Edge. Keep the tab visible.'));
}
