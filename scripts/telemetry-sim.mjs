// Rig telemetry simulator: a small WebSocket server that streams a realistic live feed
// (block height, RPM, slips, hookload, WOB, torque, pressure, flow, depths) so the
// model's Live telemetry mode can be tried without a real rig.
//
//   npm run telemetry                      drill / trip cycle on ws://localhost:8787
//   npm run telemetry -- --faults          also inject out-of-spec data every ~15 s
//   npm run telemetry -- --imperial        send ft / klbf / psi / gpm
//   options: --port 8787  --hz 5  --program cycle|drilling|trip  --speed 1
import http from 'node:http';
import crypto from 'node:crypto';
import { RigFeed, toImperial } from './lib/rig-feed.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def;
};
const PORT = Number(opt('port', 8787));
const HZ = Math.max(0.2, Number(opt('hz', 5)));
const SPEED = Number(opt('speed', 1));
const FAULTS = args.includes('--faults');
const IMPERIAL = args.includes('--imperial');
const feed = new RigFeed({ program: opt('program', 'cycle') });

/* ---------------- minimal RFC 6455 server (text frames out; close / ping in) ---------------- */
const clients = new Set();
function frame(text, opcode = 0x1) {
  const p = Buffer.from(text);
  const n = p.length;
  let h;
  if (n < 126) h = Buffer.from([0x80 | opcode, n]);
  else if (n < 65536) { h = Buffer.alloc(4); h[0] = 0x80 | opcode; h[1] = 126; h.writeUInt16BE(n, 2); } else { h = Buffer.alloc(10); h[0] = 0x80 | opcode; h[1] = 127; h.writeBigUInt64BE(BigInt(n), 2); }
  return Buffer.concat([h, p]);
}
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end('Rig telemetry simulator. Connect with a WebSocket client.\n');
});
server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return; }
  const accept = crypto.createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  clients.add(socket);
  console.log(`client connected (${clients.size} total)`);
  const drop = () => { if (clients.delete(socket)) console.log(`client disconnected (${clients.size} left)`); };
  socket.on('data', (buf) => {
    const op = buf[0] & 0x0f;
    if (op === 0x8) { try { socket.end(Buffer.from([0x88, 0])); } catch { /* gone */ } drop(); } else if (op === 0x9) socket.write(Buffer.from([0x8a, 0]));
  });
  socket.on('close', drop);
  socket.on('error', drop);
});
function broadcast(text) {
  const f = frame(text);
  for (const c of clients) { try { c.write(f); } catch { clients.delete(c); } }
}

/* ---------------- fault injection ---------------- */
const FAULT_LIST = [
  { name: 'spike: block height +18 m for one sample', dur: 0, apply: (m) => { m.blockHeight += IMPERIAL ? 59 : 18; } },
  { name: 'bad value: rpm is null / "NaN" for 3 s', dur: 3, apply: (m, k) => { m.rpm = k % 2 ? null : 'NaN'; } },
  { name: 'dropout: no data for 5 s (link goes stale)', dur: 5, silent: true },
  { name: 'corrupt frame: not JSON', dur: 0, raw: '<<corrupt frame 0x7f 0x00>>' },
  { name: 'slips sensor stuck SET for 6 s', dur: 6, apply: (m) => { m.slips = true; } },
  { name: 'impossible value: hookload -9999', dur: 2, apply: (m) => { m.hookload = -9999; } },
  { name: 'slips channel missing for 10 s (inferred from hookload)', dur: 10, apply: (m) => { delete m.slips; } },
  { name: 'out-of-order sample (timestamp 3 s in the past)', dur: 0, apply: (m) => { m.ts -= 3000; } },
  { name: 'unit glitch: block height scaled x3.28 (feet sent as metres) for 4 s', dur: 4, apply: (m) => { m.blockHeight = +(m.blockHeight * 3.28084).toFixed(2); } },
  { name: 'rpm out of range: 900 rpm for 2 s', dur: 2, apply: (m) => { m.rpm = 900; } },
  { name: 'outage: no data for 13 s (link lost)', dur: 13, silent: true },
  { name: 'slips status garbage ("maybe") for 3 s', dur: 3, apply: (m) => { m.slips = 'maybe'; } },
];
let faultIndex = 0;
let nextFaultAt = 12;
let active = null;
let tick = 0;

/* ---------------- main loop ---------------- */
let last = performance.now();
let simTime = 0;
setInterval(() => {
  const now = performance.now();
  const dt = Math.min(0.5, (now - last) / 1000) * SPEED;
  last = now;
  feed.step(dt);
  simTime += dt / SPEED;
}, 33);

setInterval(() => {
  tick++;
  let m = feed.sample();
  if (IMPERIAL) m = toImperial(m);
  if (FAULTS) {
    if (!active && simTime >= nextFaultAt) {
      const f = FAULT_LIST[faultIndex++ % FAULT_LIST.length];
      active = { f, until: simTime + f.dur, fired: false };
      console.log(`[${simTime.toFixed(0).padStart(4)} s] FAULT  ${f.name}`);
    }
    if (active) {
      const { f } = active;
      if (f.raw && !active.fired) broadcast(f.raw);
      if (f.apply) f.apply(m, tick);
      const silent = !!f.silent;
      active.fired = true;
      if (simTime >= active.until) { active = null; nextFaultAt = simTime + 12 + Math.random() * 6; }
      if (silent) return;
    }
  }
  broadcast(JSON.stringify(m));
}, 1000 / HZ);

setInterval(() => {
  const s = feed.state;
  console.log(`[${simTime.toFixed(0).padStart(4)} s] ${feed.current.padEnd(8)} block ${(s.q - 8.45).toFixed(1).padStart(5)} m  rpm ${s.rpm.toFixed(0).padStart(3)}  slips ${s.slips > 0.5 ? 'SET' : 'out'}  ${feed.seq.label.slice(0, 60)}`);
}, 5000);

server.listen(PORT, () => {
  console.log(`Rig telemetry simulator on ws://localhost:${PORT}  (${HZ} Hz, ${IMPERIAL ? 'imperial' : 'SI'} units${FAULTS ? ', fault injection ON' : ''})`);
  console.log('In the model: Live Telemetry -> Connect.');
});
