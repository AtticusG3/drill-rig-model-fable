// Headless checks of the live-telemetry path: validation of out-of-spec data, and the
// live driver mirroring a simulated rig (clean feed, then a feed with injected faults).
// Exit code 1 on any failure.
import { TelemetryValidator } from '../src/telemetry/validator.js';
import { LiveDriver } from '../src/telemetry/liveDriver.js';
import { createState, deriveState } from '../src/sim/rigState.js';
import { tickRotation } from '../src/sim/sequencer.js';
import { LAYOUT as L } from '../src/layout.js';
import { RigFeed, toImperial } from './lib/rig-feed.mjs';

const results = [];
const check = (name, pass, detail = '') => results.push({ name, pass: !!pass, detail });
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const hasFlag = (snap, code) => snap.flags.some((f) => f.code === code);
const T0 = 1.7e12;      // epoch ms base for message timestamps

/* ---------------- validator unit checks ---------------- */
{
  const v = new TelemetryValidator();
  v.ingest({ ts: T0 + 1000, blockHeight: 50, hookload: 200, spp: 2000, flow: 500, unitSystem: 'imperial' }, 0);
  const s = v.snapshot(10);
  check('Units: imperial message converted to SI', near(s.channels.blockHeight.value, 15.24, 1e-3) && near(s.channels.hookload.value, 889.6, 0.1) && near(s.channels.spp.value, 13789.5, 1) && near(s.channels.flow.value, 1892.7, 0.1),
    `block ${s.channels.blockHeight.value.toFixed(2)} m, hookload ${s.channels.hookload.value.toFixed(0)} kN`);
  v.ingest({ ts: T0 + 1200, BPOS: 52, units: { BPOS: 'ft' } }, 200);
  check('Aliases and per-channel units', near(v.snapshot(210).channels.blockHeight.value, 52 * 0.3048, 1e-3));
}
{
  const v = new TelemetryValidator();
  v.ingest({ ts: T0 + 1, blockHeight: 12, rpm: 80 }, 0);
  v.ingest({ ts: T0 + 200, blockHeight: 'abc', rpm: null }, 200);
  let s = v.snapshot(210);
  check('Non-numeric values are rejected and the last good value is held', s.channels.blockHeight.value === 12 && s.channels.rpm.value === 80 && s.channels.blockHeight.quality === 'held' && hasFlag(s, 'blockHeight.invalid'));
  v.ingest({ ts: T0 + 400, blockHeight: 500 }, 400);
  s = v.snapshot(410);
  check('Implausible value (block 500 m) is rejected as a sensor fault', s.channels.blockHeight.value === 12 && hasFlag(s, 'blockHeight.range'));
  v.ingest('{not json', 500);
  check('Malformed frame is ignored', v.stats.malformed === 1 && hasFlag(v.snapshot(510), 'frame.malformed'));
}
{
  const v = new TelemetryValidator();
  let t = 0;
  const send = (bh) => { t += 200; v.ingest({ ts: T0 + t, blockHeight: bh }, t); return v.snapshot(t + 1); };
  send(10); send(10.2);
  let s = send(28);                       // single-sample spike
  const held = s.channels.blockHeight.value === 10.2 && hasFlag(s, 'blockHeight.spike');
  s = send(10.4);
  check('Single-sample spike is rejected, normal data resumes', held && s.channels.blockHeight.value === 10.4, `after spike ${s.channels.blockHeight.value}`);
  send(25); send(25.1);
  s = send(25.2);                         // third agreeing sample
  check('A jump that persists for 3 samples is accepted as a step change', near(s.channels.blockHeight.value, 25.2) && hasFlag(s, 'blockHeight.step'));
  s = send(25.3); send(25.4);
  t += 200; v.ingest({ ts: T0 + t, blockHeight: 26.0, rpm: -3 }, t);
  check('Small negative RPM noise snaps to zero', v.snapshot(t + 1).channels.rpm.value === 0);
}
{
  const v = new TelemetryValidator();
  let t = 0;
  let s;
  for (const bh of [28, 29.5, 31, 32.5, 33]) { t += 500; v.ingest({ ts: T0 + t, blockHeight: bh }, t); s = v.snapshot(t + 1); }
  check('Value beyond model travel is clamped to the crown-saver limit and flagged', near(s.channels.blockHeight.value, L.hoistMax - L.rotaryTopY) && s.channels.blockHeight.quality === 'clamped' && hasFlag(s, 'blockHeight.clamp'), `shown ${s.channels.blockHeight.value.toFixed(2)} m`);
  v.ingest({ ts: T0 + t - 2000, blockHeight: 5 }, t + 100);
  check('Out-of-order sample is dropped', v.stats.dropped === 1 && near(v.snapshot(t + 110).channels.blockHeight.value, L.hoistMax - L.rotaryTopY));
  check('Link goes stale after 3 s and lost after 10 s without data', v.snapshot(t + 2000).link === 'live' && v.snapshot(t + 4000).link === 'stale' && v.snapshot(t + 11000).link === 'lost');
}
{
  const v = new TelemetryValidator();
  v.ingest({ ts: T0 + 1, blockHeight: 10, hookload: 255, rpm: 0 }, 0);
  let s = v.snapshot(10);
  const inferredIn = s.slips === true && s.slipsSource === 'inferred';
  v.ingest({ ts: T0 + 500, blockHeight: 10, hookload: 720, rpm: 0 }, 500);
  s = v.snapshot(510);
  check('Slips inferred from hookload when no slips signal is sent', inferredIn && s.slips === false && s.slipsSource === 'inferred');
  v.ingest({ ts: T0 + 1000, blockHeight: 10, hookload: 720, rpm: 90, slips: 'SET' }, 1000);
  s = v.snapshot(1010);
  check('Slips sensor contradicted by hookload and rotation is overridden', s.slips === false && s.slipsSource === 'overridden' && s.rpm === 90 && hasFlag(s, 'slips.override'));
  v.ingest({ ts: T0 + 1500, blockHeight: 10, hookload: 255, rpm: 90, slips: true }, 1500);
  s = v.snapshot(1510);
  check('RPM reported with slips set is not applied to the string', s.slips === true && s.rpm === 0 && s.rpmReported === 90 && hasFlag(s, 'rpm.slips'));
  v.ingest({ ts: T0 + 2000, slips: 'maybe' }, 2000);
  s = v.snapshot(2010);
  check('Unreadable slips status holds the last state', s.slips === true && hasFlag(s, 'slips.invalid'));
}

/* ---------------- live driver mirroring a simulated rig ---------------- */
function mirror({ program, seconds, hz = 5, imperial = false, faults = null, until }) {
  const feed = new RigFeed({ program });
  const v = new TelemetryValidator();
  const d = new LiveDriver(v);
  const s = createState();
  deriveState(s);
  d.attach(s);
  const startSetback = s.setback.filter(Boolean).length;
  const out = { maxErr: 0, bad: [], flags: new Set(), s, feed, startSetback, t: 0 };
  const dt = 1 / 60;
  let now = 0;
  let nextSample = 0;
  let k = 0;
  for (let i = 0; i < seconds * 60; i++) {
    feed.step(dt);
    now += dt * 1000;
    if (now >= nextSample) {
      nextSample += 1000 / hz;
      k++;
      let m = feed.sample();
      m.ts = T0 + Math.round(now);
      if (imperial) m = toImperial(m);
      const send = faults ? faults(m, now / 1000, k) : m;
      if (send !== null) v.ingest(typeof send === 'string' ? send : JSON.stringify(send), now);
    }
    const snap = d.update(s, dt, now);
    tickRotation(s, dt);
    deriveState(s);
    for (const f of snap.flags) out.flags.add(f.code);
    for (const f of d.activeFlags(now)) out.flags.add(f.code);
    // invariants the model must keep whatever the feed says
    if (![s.q, s.rpm, s.slips, s.stringTopY, s.linkTilt].every(Number.isFinite)) out.bad.push('non-finite state');
    if (s.q < L.hoistMin - 1e-6 || s.q > L.hoistMax + 1e-6) out.bad.push('hoist outside limits');
    if (!s.connected && s.slips < 0.99 && !(s.stringInElevator && s.elevator >= 0.99)) out.bad.push('string unsupported');
    if (s.rpm > 0.5 && (!s.connected || s.slips > 0.01)) out.bad.push('rotating in slips / broken out');
    if (!s.connected && !s.stringInElevator && s.q - 0.5 < s.stringTopY - 1e-3) out.bad.push('top drive inside the string');
    if (snap.link === 'live') out.maxErr = Math.max(out.maxErr, Math.abs(s.q - feed.state.q));
    out.t = now / 1000;
    if (until && until(feed, s)) break;
  }
  out.bad = [...new Set(out.bad)];
  return out;
}

{
  const r = mirror({ program: 'drilling', seconds: 200, until: (feed) => feed.state.connections >= 1 && feed.onBottom });
  const delta = r.s.setback.filter(Boolean).length - r.startSetback;
  check('Live driver mirrors a drilling connection (clean 5 Hz feed)', r.bad.length === 0 && delta === -1 && r.s.connected && !r.s.stand && r.maxErr < 1.0 && r.s.rpm > 60 && r.s.pumpsOn,
    `${r.t.toFixed(0)} s, setback change ${delta}, max block tracking error ${r.maxErr.toFixed(2)} m, violations: ${r.bad.join(', ') || 'none'}`);
}
{
  const r = mirror({ program: 'drilling', seconds: 200, hz: 1, imperial: true, until: (feed) => feed.state.connections >= 1 && feed.onBottom });
  const delta = r.s.setback.filter(Boolean).length - r.startSetback;
  check('Same connection from a 1 Hz feed in imperial units', r.bad.length === 0 && delta === -1 && r.s.connected && !r.s.stand,
    `setback change ${delta}, max tracking error ${r.maxErr.toFixed(2)} m, violations: ${r.bad.join(', ') || 'none'}`);
}
{
  const r = mirror({ program: 'trip', seconds: 200, until: (feed) => feed.state.standsRacked >= 1 && feed.state.q < 12 });
  const delta = r.s.setback.filter(Boolean).length - r.startSetback;
  check('Live driver mirrors pulling and racking a stand (trip out)', r.bad.length === 0 && delta === 1 && !r.s.connected && r.s.slips > 0.99 && Math.abs(r.s.stringTopY - (L.rotaryTopY + L.stickup)) < 0.3 && r.flags.size === 0,
    `setback change ${delta}, stump at ${r.s.stringTopY.toFixed(2)} m, flags raised: ${[...r.flags].join(', ') || 'none'}, violations: ${r.bad.join(', ') || 'none'}`);
}
{
  // faulty feed: spike, bad values, 5 s dropout, stuck slips sensor while drilling, corrupt frame, missing slips channel
  const faults = (m, t, k) => {
    if (k === 40) m.blockHeight += 18;
    if (t > 12 && t < 15) m.rpm = k % 2 ? null : 'NaN';
    if (t > 20 && t < 25) return null;
    if (k === 150) return '<<corrupt>>';
    if (t > 4 && t < 9) m.slips = true;
    if (t > 60 && t < 70) delete m.slips;
    if (k === 200) m.hookload = -9999;
    return m;
  };
  const r = mirror({ program: 'drilling', seconds: 240, faults, until: (feed) => feed.state.connections >= 1 && feed.onBottom });
  const delta = r.s.setback.filter(Boolean).length - r.startSetback;
  const expected = ['blockHeight.spike', 'rpm.invalid', 'link.stale', 'frame.malformed', 'slips.override', 'slips.inferred', 'hookload.range'];
  const missing = expected.filter((c) => !r.flags.has(c));
  check('Faulty feed: model stays consistent, every fault is flagged, the spike is not followed', r.bad.length === 0 && delta === -1 && r.s.connected && missing.length === 0 && r.maxErr < 6,
    `setback change ${delta}, max tracking error ${r.maxErr.toFixed(2)} m (5 s dropout while drilling), unflagged: ${missing.join(', ') || 'none'}, violations: ${r.bad.join(', ') || 'none'}`);
}

let failed = 0;
for (const r of results) {
  if (!r.pass) failed++;
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `\n      ${r.detail}` : ''}`);
}
console.log(`\n${results.length - failed}/${results.length} telemetry checks passed`);
process.exit(failed ? 1 : 0);
