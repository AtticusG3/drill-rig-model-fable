import * as THREE from 'three';
import { LAYOUT as L } from '../layout.js';
import { createState, getElevatorPoint, tubularBottom, troughFrame, slotPos, STUMP_Y, SAVER, STAND, MOUSE_Z, MOUSE_TOP_Y } from './rigState.js';
import { simulate } from './sequencer.js';
import { drillingProgram, tripOutProgram, buildStandsProgram } from './sequences.js';

const fmt = (n) => (Math.round(n * 1000) / 1000).toString();

const _d1 = new THREE.Vector3();
const _d2 = new THREE.Vector3();
const _r = new THREE.Vector3();
/** Closest distance between segments p1-q1 and p2-q2. */
export function segmentDistance(p1, q1, p2, q2) {
  _d1.subVectors(q1, p1);
  _d2.subVectors(q2, p2);
  _r.subVectors(p1, p2);
  const a = _d1.dot(_d1);
  const e = _d2.dot(_d2);
  const f = _d2.dot(_r);
  let s;
  let t;
  const c = _d1.dot(_r);
  const b = _d1.dot(_d2);
  const denom = a * e - b * b;
  s = denom > 1e-12 ? Math.min(1, Math.max(0, (b * f - c * e) / denom)) : 0;
  t = (b * s + f) / e;
  if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
  else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / a)); }
  const cx = p1.x + _d1.x * s - (p2.x + _d2.x * t);
  const cy = p1.y + _d1.y * s - (p2.y + _d2.y * t);
  const cz = p1.z + _d1.z * s - (p2.z + _d2.z * t);
  return Math.sqrt(cx * cx + cy * cy + cz * cz);
}

/**
 * Per-tick mechanical rules of a top-drive rig. Returns a list of violation
 * strings for the current state (empty when everything is consistent).
 */
function tickRules(s, prev, ctx) {
  const v = [];
  const E = getElevatorPoint(s, ctx.E);
  if (s.q < L.hoistMin - 1e-6 || s.q > L.hoistMax + 1e-6) v.push(`hoist ${fmt(s.q)} outside travel limits`);
  if (s.q + L.blockTopLocal > L.crownUndersideY - 0.05) v.push('travelling block reached the crown');
  const supported = s.connected || s.slips >= 0.999 || (s.stringInElevator && s.elevator >= 0.999);
  if (!supported) v.push('drill string unsupported (not made up, not in slips, not latched)');
  if (s.pumpsOn && !s.connected) v.push('pumps running with the top drive broken out');
  if (s.rpm > 0.5 && !(s.connected && s.slips < 0.01)) v.push('rotating while in the slips or broken out');
  if ((s.single || s.build) && s.rpm > 0.5) v.push('rotating during pipe transfer');
  if (E.y < L.elevatorMinY - 1e-3) v.push(`elevator at ${fmt(E.y)} m below rotary clearance`);
  if (!s.connected && !s.stringInElevator && s.q - SAVER < s.stringTopY - 1e-3) v.push('saver sub driven into the string');
  // trough must clear the drill floor
  if (s.catwalk > 0) {
    const f = troughFrame(s.catwalk, ctx.f);
    const end = ctx.p.copy(f.T).addScaledVector(f.u, L.troughLength);
    if (Math.abs(end.z) < L.floorZ / 2 && end.y < L.floorY + 0.1) v.push('catwalk trough end below deck level inside the floor footprint');
  }
  for (const key of ['stand', 'single', 'build']) {
    const t = s[key];
    if (!t) { ctx[key] = null; continue; }
    if (Math.abs(t.axis.length() - 1) > 1e-6) v.push(`${key} axis not unit length`);
    const bottom = tubularBottom(t, ctx.b);
    if (t.latched) {
      const seat = ctx.p.copy(t.top).addScaledVector(t.axis, L.elevatorSeat);
      const err = seat.distanceTo(E);
      ctx.maxSeatErr = Math.max(ctx.maxSeatErr, err);
      if (err > 0.03) v.push(`${key} not seated in the elevator (${fmt(err)} m)`);
    }
    for (let i = 0; i <= 10; i++) {
      const p = ctx.p.copy(t.top).addScaledVector(t.axis, (t.len * i) / 10);
      const inMousehole = Math.hypot(p.x, p.z - MOUSE_Z) < 0.12;
      if (!inMousehole && Math.abs(p.x) < L.floorX / 2 && Math.abs(p.z) < L.floorZ / 2 && p.y < L.floorY + 0.04) { v.push(`${key} penetrates the drill floor`); break; }
    }
    if (Math.hypot(bottom.x, bottom.z) < 0.25 && bottom.y < STUMP_Y - 1e-3) v.push(`${key} pin driven into the stump`);
    // a joint over the mousehole must not be driven into the pipe already standing in it
    if (key === 'single' && s.build && Math.hypot(bottom.x, bottom.z - MOUSE_Z) < 0.25 && bottom.y < s.build.top.y - 1e-3) v.push('joint pin driven into the pipe in the mousehole');
    if (key === 'build' && t.attach === 'mousehole' && Math.abs(t.top.y - MOUSE_TOP_Y) > 1e-6) v.push('pipe in the mousehole is not on its landing');
    // a handled stand must not pass through stands still racked in the setback
    for (let i = 0; i < s.setback.length; i++) {
      if (!s.setback[i] || i === t.slot) continue;
      const sp = slotPos(i);
      const d = segmentDistance(t.top, bottom, ctx.p.set(sp.x, L.setbackY, sp.z), ctx.q.set(sp.x, L.setbackY + STAND, sp.z));
      ctx.minRackGap = Math.min(ctx.minRackGap, d);
      if (d < L.toolJointOD) { v.push(`${key} collides with the racked stand in slot ${i}`); break; }
    }
    if (t.attach === 'none' && Math.hypot(t.top.x, t.top.z) < 0.01 && Math.abs(t.axis.y + 1) < 1e-6 && s.q - SAVER < t.top.y - 1e-3) v.push(`saver sub driven into the ${key}`);
    const last = ctx[key];
    if (last && last.len === t.len) {
      const step = Math.max(last.top.distanceTo(t.top), last.bottom.distanceTo(bottom));
      ctx.maxStep = Math.max(ctx.maxStep, step);
      if (step > 0.6) v.push(`${key} jumped ${fmt(step)} m in one tick`);
    }
    ctx[key] = { top: t.top.clone(), bottom: bottom.clone(), len: t.len };
  }
  return v;
}

function runProgram(name, program, { until, maxTime = 400, prep, state, dt = 1 / 30 } = {}) {
  const s = state || createState();
  if (prep) prep(s);
  const startSetback = s.setback.filter(Boolean).length;
  const ctx = { E: new THREE.Vector3(), b: new THREE.Vector3(), p: new THREE.Vector3(), q: new THREE.Vector3(), f: undefined, stand: null, single: null, build: null, maxStep: 0, maxSeatErr: 0, minRackGap: Infinity };
  ctx.f = troughFrame(0);
  const violations = [];
  let steps = 0;
  const labels = [];
  const result = simulate(s, program(s), {
    dt,
    maxTime,
    until,
    onTick: (st, seq) => {
      steps++;
      if (labels[labels.length - 1] !== seq.label && seq.label) labels.push(seq.label);
      for (const msg of tickRules(st, null, ctx)) if (violations.length < 8 && !violations.includes(`${seq.label}: ${msg}`)) violations.push(`${seq.label}: ${msg}`);
    },
  });
  return { name, s, startSetback, violations, ctx, result, labels, steps };
}

/** Dry-run every procedure from the initial state and evaluate it. */
export function runProcedureChecks() {
  const out = [];

  const drill = runProgram('drilling', drillingProgram, {
    until: (st, seq) => st.connections >= 1 && seq.step && seq.step.interruptible,
  });
  {
    const s = drill.s;
    const setbackDelta = s.setback.filter(Boolean).length - drill.startSetback;
    const pass = drill.violations.length === 0 && s.connections === 1 && setbackDelta === -1 && s.connected && s.pumpsOn && s.slips === 0 && !s.stand;
    out.push({
      name: 'Drilling connection procedure (drill down, slips, break out, pick stand, make up, resume)',
      pass,
      detail: pass
        ? `${drill.labels.length} steps in ${fmt(drill.result.time)} s, closest racked stand ${fmt(drill.ctx.minRackGap)} m, stand moved ${fmt(drill.ctx.maxStep)} m/tick max, elevator seat error ${fmt(drill.ctx.maxSeatErr)} m`
        : `violations: ${drill.violations.join(' | ') || 'none'}; connections ${s.connections}, setback change ${setbackDelta}`,
    });
  }

  const trip = runProgram('trip', tripOutProgram, {
    until: (st, seq) => st.standsRacked >= 1 && seq.step && seq.step.safePoint,
  });
  {
    const s = trip.s;
    const setbackDelta = s.setback.filter(Boolean).length - trip.startSetback;
    const pass = trip.violations.length === 0 && s.standsRacked === 1 && setbackDelta === 1 && s.slips === 1 && Math.abs(s.stringTopY - STUMP_Y) < 1e-6 && !s.stand;
    out.push({
      name: 'Trip-out procedure (latch, pull stand, slips, break out, rack back)',
      pass,
      detail: pass
        ? `${trip.labels.length} steps in ${fmt(trip.result.time)} s, elevator seat error ${fmt(trip.ctx.maxSeatErr)} m`
        : `violations: ${trip.violations.join(' | ') || 'none'}; racked ${s.standsRacked}, setback change ${setbackDelta}`,
    });
  }

  const pipe = runProgram('pipe', buildStandsProgram, {
    maxTime: 900,
    until: (st, seq) => st.standsBuilt >= 1 && seq.step && seq.step.safePoint,
  });
  {
    const s = pipe.s;
    const setbackDelta = s.setback.filter(Boolean).length - pipe.startSetback;
    const pass = pipe.violations.length === 0 && pipe.result.reason === 'until' && s.standsBuilt === 1 && setbackDelta === 1 && s.rackPicked === 4
      && s.slips === 1 && !s.connected && s.roughneck === 0 && !s.build && !s.stand;
    out.push({
      name: 'Stand building: rack -> catwalk -> elevator -> mousehole (3 joints) -> fingerboard, continuous & collision-free',
      pass,
      detail: pass
        ? `${pipe.labels.length} steps in ${fmt(pipe.result.time)} s, max pipe step ${fmt(pipe.ctx.maxStep)} m/tick, elevator seat error ${fmt(pipe.ctx.maxSeatErr)} m, closest racked stand ${fmt(pipe.ctx.minRackGap)} m`
        : `violations: ${pipe.violations.join(' | ') || 'none'}; result ${pipe.result.reason}, built ${s.standsBuilt}, setback change ${setbackDelta}, joints taken ${s.rackPicked}`,
    });
  }
  return { results: out, runs: { drill, trip, pipe } };
}

/**
 * Full-cycle soak: drill until the setback is empty (every slot, both rows),
 * then trip out until it is full again, applying the per-tick rules throughout.
 */
export function runFullCycleCheck() {
  const drill = runProgram('drill-all', drillingProgram, { maxTime: 5000, dt: 1 / 20 });
  const afterDrill = drill.s.setback.filter(Boolean).length;
  const trip = runProgram('trip-all', tripOutProgram, { maxTime: 5000, dt: 1 / 20, state: drill.s });
  const s = trip.s;
  const full = s.setback.every(Boolean);
  const pass = drill.violations.length === 0 && trip.violations.length === 0 && afterDrill === 0 && full
    && drill.result.reason === 'halted' && trip.result.reason === 'halted';
  return {
    name: 'Full cycle: drill until setback empty, trip out until full',
    pass,
    detail: pass
      ? `${s.connections} connections then ${s.standsRacked} stands racked; closest pass to a racked stand ${fmt(Math.min(drill.ctx.minRackGap, trip.ctx.minRackGap))} m`
      : `violations: ${[...drill.violations, ...trip.violations].join(' | ') || 'none'}; setback after drilling ${afterDrill}, full after trip ${full}`,
  };
}
