import * as THREE from 'three';
import { LAYOUT as L } from '../layout.js';
import {
  TAU, JOINT, STAND, STUMP_Y, SAVER, Q_SLIPS, Q_TRIP_LATCH, DRILL_TILT, PICK_TILT, BACK_TILT,
  smooth, lerp, clamp01, elevatorPoint, linkTiltMin, qForElevatorY, slotPos, nextFullSlot, nextEmptySlot,
  RACK_PICK_LIST, troughFrame, troughPoint, PICK, makeTubularState, poseBottomFixed,
} from './rigState.js';

/*
 * Operating procedures for a top-drive triple land rig, written as generator
 * programs of animation steps. Each program starts from a "safe" state:
 *   (a) string made up to the top drive, nothing in the elevator, or
 *   (b) string in the slips, top drive free with an empty elevator.
 */

const V3 = THREE.Vector3;
const DOWN = new V3(0, -1, 0);
const H = L.hoistSpeed;
const noop = () => {};

function step(label, duration, update = noop, extra = {}) {
  return { label, duration, update, ...extra };
}

/** Tween numeric state fields to targets (numbers or functions of state resolved at step start). */
function tween(label, duration, targets, opts = {}) {
  const from = {};
  const to = {};
  return {
    label,
    duration,
    safePoint: !!opts.safePoint,
    begin(s) {
      for (const key in targets) {
        from[key] = s[key];
        to[key] = typeof targets[key] === 'function' ? targets[key](s) : targets[key];
      }
      if (opts.speed && 'q' in to) this.duration = Math.max(opts.minDur ?? 1, Math.abs(to.q - from.q) / opts.speed);
      if (opts.begin) opts.begin(s, from, to);
    },
    update(s, k) {
      const e = smooth(k);
      for (const key in to) s[key] = lerp(from[key], to[key], e);
      if (opts.during) opts.during(s, k, e);
    },
    end(s) {
      if (opts.end) opts.end(s);
    },
  };
}

/** Rotate something through a number of turns over the step. */
function spin(label, duration, turns, apply, opts = {}) {
  let prev = 0;
  return {
    label,
    duration,
    begin(s) { prev = 0; if (opts.begin) opts.begin(s); },
    update(s, k) {
      const a = turns * TAU * smooth(k);
      apply(s, a - prev);
      prev = a;
      if (opts.during) opts.during(s, k);
    },
    end(s) { if (opts.end) opts.end(s); },
  };
}

function haltStep(message) {
  return step(message, 0.5, noop, { begin: (s) => { s.halt = message; } });
}

/** Piecewise-linear path through three plan points, parameterised by arc length. */
function path3(x0, z0, x1, z1, x2, z2, e) {
  const d1 = Math.hypot(x1 - x0, z1 - z0);
  const d2 = Math.hypot(x2 - x1, z2 - z1);
  const d = e * (d1 + d2 || 1);
  if (d <= d1) { const f = d1 > 0 ? d / d1 : 1; return [lerp(x0, x1, f), lerp(z0, z1, f)]; }
  const f = d2 > 0 ? (d - d1) / d2 : 1;
  return [lerp(x1, x2, f), lerp(z1, z2, f)];
}

/**
 * Pose a stand whose pin rests at B so its elevator seat sits at plan point
 * (ex, ez); returns the seat height.
 */
function poseForSeat(t, B, ex, ez) {
  let hx = ex;
  let hz = ez;
  for (let i = 0; i < 4; i++) {
    poseBottomFixed(t, B, hx, hz);
    hx = ex - L.elevatorSeat * t.axis.x;
    hz = ez - L.elevatorSeat * t.axis.z;
  }
  poseBottomFixed(t, B, hx, hz);
  return t.top.y + L.elevatorSeat * t.axis.y;
}

const _E = new V3();
/** Stand pin on the setback, top in the elevator: link tilt drives the stand, hoist follows. */
function followLinksBottomFixed(s, t, B) {
  elevatorPoint(s.q, s.linkTilt, _E);
  const seatY = poseForSeat(t, B, 0, _E.z);
  s.q = qForElevatorY(seatY, s.linkTilt);
}

/** Link-tilt schedule while hoisting the empty elevator up to the racking board. */
function tiltProfileUp(q, t0, qTop) {
  if (q < 12.5) return t0;
  if (q < 16) return lerp(t0, 0, smooth((q - 12.5) / 3.5));
  if (q < qTop - 4) return 0;
  return lerp(0, BACK_TILT, smooth(clamp01((q - (qTop - 4)) / 4)));
}

/* ------------------------------------------------------------------ */
/*  Building blocks                                                    */
/* ------------------------------------------------------------------ */
function* stopRotation(s) {
  s.manualRotation = false;
  if (s.rpm > 0.5) yield tween('Stop top-drive rotation', 2, { rpm: 0 });
  else s.rpm = 0;
}
function* stopPumps(s) {
  if (s.pumpsOn) yield step('Stop mud pumps', 1.5, noop, { begin: (st) => { st.pumpsOn = false; } });
}
function* startPumps(s) {
  if (!s.pumpsOn) yield step('Start mud pumps — break circulation', 2, noop, { begin: (st) => { st.pumpsOn = true; } });
}
function* startRotation() {
  yield tween('Start top-drive rotation', 2, { rpm: (st) => st.rpmSet });
}
const setSlips = () => tween('Set power slips — string weight on slips', 1.5, { slips: 1 });
const pullSlips = () => tween('Pick up string weight, pull slips', 1.5, { q: (st) => st.q + 0.3, slips: 0 });

function breakOutTopDrive() {
  let q0 = 0;
  return spin('Break out saver sub — pipe-handler backup grips, quill turns left', 2.5, -3, (s, d) => { s.quillAngle += d; }, {
    begin: (s) => { s.connected = false; q0 = s.q; },
    during: (s, k) => { s.q = q0 + 0.1 * smooth(k); },
  });
}

/** From a connected string anywhere: string into slips at connection height, top drive broken out. */
function* toSlipsAndBreakOut(s) {
  if (!s.connected) return;
  yield* stopRotation(s);
  if (s.slips < 1) {
    if (Math.abs(s.q - Q_SLIPS) > 0.01) {
      yield tween(s.q > Q_SLIPS ? 'Run string down to connection height' : 'Pick up off bottom to connection height', 0, { q: Q_SLIPS }, { speed: 2.0, minDur: 1.5 });
    }
    yield* stopPumps(s);
    yield setSlips();
  } else {
    yield* stopPumps(s);
  }
  yield breakOutTopDrive();
}

/** Free top drive onto the string held in the slips. */
function* makeUpToString() {
  yield tween('Lower top drive — stab saver sub into the string box', 0, { q: (st) => st.stringTopY + SAVER, linkTilt: DRILL_TILT, elevator: 0 }, { speed: H, minDur: 1.5 });
  yield spin('Top drive spins in and torques the saver sub', 2.5, 4, (st, d) => { st.quillAngle += d; }, { end: (st) => { st.connected = true; } });
}

/** Stab a hanging tubular onto the stump and make it up with the iron roughneck. */
function* stabAndSpinIn(key, spinLabel) {
  yield tween('Stab pin into the box of the string in the slips', 0, { q: (st) => qForElevatorY(STUMP_Y + st[key].len - L.elevatorSeat, st.linkTilt) }, {
    speed: 1, minDur: 1.5,
    end: (st) => {
      const t = st[key];
      t.attach = 'none';
      t.latched = false;      // weight now on the stump; the elevator only guides the pipe
      t.top.set(0, STUMP_Y + t.len, 0);
      t.axis.copy(DOWN);
    },
  });
  yield tween('Iron roughneck travels to well centre', 1.5, { roughneck: 1 });
  yield spin(spinLabel, 2.5, 5, (st, d) => { st[key].spin += d; st.roughneckSpin += d * 4; });
  yield spin('Torque wrench makes up the connection to torque', 1, 0.08, (st, d) => { st[key].spin += d; });
  yield tween('Iron roughneck retracts to its park position', 1.5, { roughneck: 0 });
}

/** Top drive comes down onto a made-up tubular and spins the saver sub in. */
function* makeUpTopDriveTo(key) {
  yield tween('Lower top drive — elevator slides down the pipe, saver sub stabs into the box', 0, { q: (st) => st[key].top.y + SAVER }, { speed: 1.2, minDur: 1.5 });
  yield spin('Top drive spins in and torques the saver sub', 2.5, 4, (st, d) => { st.quillAngle += d; }, {
    end: (st) => {
      const t = st[key];
      st.connected = true;
      st.stringTopY = t.top.y;
      st.stringSpin = t.spin;
      st[key] = null;
      if (key === 'single') st.singlesAdded++;
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Stand handling (setback <-> well centre)                           */
/* ------------------------------------------------------------------ */
function* pickStandFromSetback(slot) {
  const P = slotPos(slot);
  const B = new V3(P.x, L.setbackY, P.z);
  const eBack = elevatorPoint(0, BACK_TILT);
  const probe = makeTubularState(STAND, new V3(), DOWN);
  const seatY = poseForSeat(probe, B, 0, eBack.z);
  const qLatch = qForElevatorY(seatY, BACK_TILT);
  const latchTop = { x: probe.top.x, z: probe.top.z };

  let tilt0 = 0;
  yield tween('Hoist the empty elevator to the racking board', 0, { q: qLatch, elevator: 0 }, {
    speed: H, minDur: 3,
    begin: (st) => { tilt0 = st.linkTilt; },
    during: (st) => { st.linkTilt = tiltProfileUp(st.q, tilt0, qLatch); },
  });
  yield step('Derrickman unlatches a stand from the fingerboard and pulls it into the elevator', 3.5, (st, k) => {
    const [hx, hz] = path3(P.x, P.z, P.x, L.fingerPullZ, latchTop.x, latchTop.z, smooth(k));
    poseBottomFixed(st.stand, B, hx, hz);
  }, {
    begin: (st) => {
      st.setback[slot] = false;
      st.stand = makeTubularState(STAND, new V3(P.x, B.y + STAND, P.z), DOWN);
      st.stand.slot = slot;
    },
  });
  yield tween('Close and latch the elevator below the box tool joint', 1, { elevator: 1 }, { end: (st) => { st.stand.latched = true; } });
  yield step('Link tilt swings the stand top to well centre', 2.5, (st, k) => {
    st.linkTilt = lerp(BACK_TILT, 0, smooth(k));
    followLinksBottomFixed(st, st.stand, B);
  });
  yield tween('Pick the stand up off the setback', 0, { q: (st) => st.q + 1.4 }, { speed: 0.8, minDur: 2, begin: (st) => { st.stand.attach = 'elevator'; } });
  let a0 = null;
  yield step('Floor crew guides the stand pin over the stump', 3, (st, k) => {
    st.stand.axis.copy(a0).lerp(DOWN, smooth(k)).normalize();
  }, { begin: (st) => { a0 = st.stand.axis.clone(); } });
}

function* rackStandBack(slot) {
  const P = slotPos(slot);
  const B = new V3(P.x, L.setbackY, P.z);
  const R = STAND - L.elevatorSeat;
  yield tween('Lift the stand clear of the stump', 1.2, { q: (st) => st.q + 0.3 });
  yield step('Floor crew walks the stand pin over to the setback', 3, (st, k) => {
    const e = smooth(k);
    const ax = (P.x / R) * e;
    const az = (P.z / R) * e;
    st.stand.axis.set(ax, -Math.sqrt(1 - ax * ax - az * az), az);
  });
  yield tween('Set the stand down on the setback', 0, {
    q: (st) => qForElevatorY(L.setbackY - R * st.stand.axis.y, 0),
  }, { speed: 0.8, minDur: 2 });
  yield step('Link tilt swings the stand top back toward the fingerboard', 2.5, (st, k) => {
    st.linkTilt = lerp(0, BACK_TILT, smooth(k));
    followLinksBottomFixed(st, st.stand, B);
  }, { begin: (st) => { st.stand.attach = 'none'; } });
  yield tween('Derrickman opens the elevator', 1, { elevator: 0 }, { begin: (st) => { st.stand.latched = false; } });
  let h0 = null;
  yield step('Derrickman racks the stand into the fingerboard', 3.5, (st, k) => {
    const [hx, hz] = path3(h0.x, h0.z, P.x, L.fingerPullZ, P.x, P.z, smooth(k));
    poseBottomFixed(st.stand, B, hx, hz);
  }, {
    begin: (st) => { h0 = { x: st.stand.top.x, z: st.stand.top.z }; },
    end: (st) => { st.setback[slot] = true; st.stand = null; st.standsRacked++; },
  });
}

/* ------------------------------------------------------------------ */
/*  Programs                                                           */
/* ------------------------------------------------------------------ */
export function* idleProgram(s) {
  yield* stopRotation(s);
  yield* stopPumps(s);
}

function drillAhead() {
  return {
    label: 'Drilling ahead — on bottom, rotating and circulating',
    duration: Infinity,
    interruptible: true,
    update(s, k, dt) {
      const d = Math.min(L.rop * dt, s.q - L.hoistMin);
      s.q -= d;
      s.drilled += d;
      const target = s.rpmSet;
      s.rpm += Math.sign(target - s.rpm) * Math.min(Math.abs(target - s.rpm), 80 * dt);
    },
    done(s) {
      return s.q <= L.hoistMin + 1e-6;
    },
  };
}

/** Making a connection when the stand has been drilled down. */
function* drillingConnection(s) {
  yield tween('Drilled down — stop rotation', 2, { rpm: 0 });
  yield tween('Pick up off bottom to connection height', 1.5, { q: Q_SLIPS });
  yield* stopPumps(s);
  yield setSlips();
  yield breakOutTopDrive();
  const slot = nextFullSlot(s);
  if (slot < 0) {
    yield haltStep('Setback empty — switch to Hoisting to trip out and rack stands back');
    return;
  }
  yield* pickStandFromSetback(slot);
  yield* stabAndSpinIn('stand', 'Iron roughneck spins in the stand connection');
  yield* makeUpTopDriveTo('stand');
  yield tween('Open elevator, tilt links to drill-down position', 1.5, { elevator: 0, linkTilt: DRILL_TILT });
  yield pullSlips();
  yield* startPumps(s);
  yield* startRotation();
  yield tween('Ease back to bottom and resume drilling', 1.5, { q: (st) => st.q - 0.6 }, { end: (st) => { st.connections++; } });
}

/**
 * Drilling mode: drill a stand down, make a connection with the next stand
 * from the setback, repeat.
 */
export function* drillingProgram(s) {
  if (!s.connected) yield* makeUpToString();
  if (s.linkTilt < DRILL_TILT - 0.01 || s.elevator > 0) {
    yield tween('Open elevator, tilt links to drill-down position', 1.5, { elevator: 0, linkTilt: DRILL_TILT });
  }
  if (s.slips > 0) yield pullSlips();
  yield* startPumps(s);
  if (Math.abs(s.rpm - s.rpmSet) > 1) yield* startRotation();
  while (true) {
    yield drillAhead();
    yield* drillingConnection(s);
  }
}

/**
 * Hoisting mode: trip out of the hole on elevators, racking each stand back
 * in the fingerboard, until the setback is full.
 */
export function* tripOutProgram(s) {
  yield* toSlipsAndBreakOut(s);
  while (true) {
    const slot = nextEmptySlot(s);
    if (slot < 0) {
      yield haltStep('Setback full — trip paused. Switch to Drilling to run back to bottom');
      return;
    }
    yield tween('Lower the empty elevator to the rotary table', 0, { q: Q_TRIP_LATCH, elevator: 0, linkTilt: 0 }, { speed: H, minDur: 1.5, safePoint: true });
    yield tween('Latch the elevator below the stump tool joint', 1, { elevator: 1 }, { end: (st) => { st.stringInElevator = true; } });
    yield tween('Pick up string weight, pull slips', 1.5, { q: (st) => st.q + 0.2, slips: 0 });
    yield tween('Pull one stand out of the hole', 0, { q: (st) => st.q + STAND }, { speed: H, minDur: 4 });
    yield tween('Slack off — set slips below the next connection', 1.5, { q: (st) => st.q - 0.2, slips: 1 });
    yield tween('Iron roughneck travels to well centre', 1.5, { roughneck: 1 });
    yield spin('Iron roughneck breaks out and spins out the connection', 2.5, -5, (st, d) => { st.stand.spin += d; st.roughneckSpin += d * 4; }, {
      begin: (st) => {
        const t = makeTubularState(STAND, new V3(0, st.stringTopY, 0), DOWN);
        t.attach = 'elevator';
        t.latched = true;
        t.slot = slot;
        t.spin = st.stringSpin;
        st.stand = t;
        st.stringInElevator = false;
        st.stringTopY = STUMP_Y;
      },
    });
    yield tween('Iron roughneck retracts to its park position', 1.5, { roughneck: 0 });
    yield* rackStandBack(slot);
  }
}

/** Hoist the joint off the catwalk: pin slides up the trough, then is tailed in over the floor. */
function hoistOffCatwalk() {
  const R = JOINT - L.elevatorSeat;
  const yEnd = PICK.endPoint.y;
  const qHang = qForElevatorY(yEnd + R, 0);
  const f = troughFrame(1);
  const T = f.T.clone().addScaledVector(f.n, L.troughAxisOffset);
  const u = f.u.clone();
  const E = new V3();
  const pin = new V3();
  const w = new V3();
  let left = false;
  return {
    label: 'Hoist the joint off the catwalk — links retract, floorhand tails the pin end in',
    duration: 8,
    begin() { left = false; },
    update(s, k) {
      s.q = lerp(PICK.q, qHang, smooth(k));
      s.linkTilt = Math.max(PICK_TILT * (1 - smooth(clamp01(k / 0.65))), linkTiltMin(s.q));
      elevatorPoint(s.q, s.linkTilt, E);
      let onTrough = false;
      if (!left) {
        w.subVectors(E, T);
        const b = w.dot(u);
        const disc = b * b - w.lengthSq() + R * R;
        if (disc >= 0) {
          const sPin = b - Math.sqrt(disc);
          if (sPin <= L.troughLength) { pin.copy(T).addScaledVector(u, sPin); onTrough = true; }
        }
        if (!onTrough) left = true;
      }
      if (!onTrough) {
        const dy = Math.min(R, E.y - yEnd);
        pin.set(0, yEnd, E.z + Math.sqrt(Math.max(0, R * R - dy * dy)));
      }
      s.single.axis.subVectors(pin, E).normalize();
      s.single.top.copy(E).addScaledVector(s.single.axis, -L.elevatorSeat);
    },
    end(s) {
      s.single.attach = 'elevator';
      s.single.axis.copy(DOWN);
    },
  };
}

/**
 * Pipe-handling mode: pick up a single joint from the pipe rack with the
 * hydraulic catwalk and the top-drive elevator, and add it to the string.
 */
export function* pipeHandlingProgram(s) {
  yield* toSlipsAndBreakOut(s);
  if (s.rackPicked >= RACK_PICK_LIST.length) {
    yield haltStep('No more joints on the catwalk side of the pipe rack — press Reset');
    return;
  }
  const item = RACK_PICK_LIST[s.rackPicked];
  const top0 = new V3(item.x, item.y, item.zc - JOINT / 2);
  const sTop0 = L.catwalkTailZ0 - top0.z;
  const liftY = item.y + 0.7;
  const troughY0 = troughPoint(0, 0).y;
  const skateBehind = (sTop) => sTop - JOINT - 0.35;

  yield step('Pipe kickers lift a joint off the rack', 1.5, (st, k) => {
    st.single.top.y = lerp(item.y, liftY, smooth(k));
  }, {
    begin: (st) => {
      st.single = makeTubularState(JOINT, top0, new V3(0, 0, 1));
      st.single.rackIndex = st.rackPicked;
      st.rackPicked++;
    },
  });
  yield step('Joint rolls across the indexer arms to the catwalk', 2.5, (st, k) => {
    const x = lerp(item.x, 0, smooth(k));
    st.single.top.x = x;
    st.single.spin = (item.x - x) / (L.toolJointOD / 2);
  });
  yield step('Kickers lower the joint into the catwalk trough', 1.2, (st, k) => {
    st.single.top.y = lerp(liftY, troughY0, smooth(k));
  }, { end: (st) => { st.single.attach = 'trough'; st.single.s = sTop0; } });

  let q0 = 0;
  let t0 = 0;
  let sk0 = 0;
  yield {
    label: 'Catwalk raises the trough to the V-door — top drive moves to the pick-up position',
    duration: 6,
    begin(st) {
      q0 = st.q;
      t0 = Math.max(0, st.linkTilt);
      sk0 = st.skateS;
      this.duration = Math.max(6, Math.abs(PICK.q - q0) / H);
    },
    update(st, k) {
      const e = smooth(k);
      st.catwalk = k;
      st.skateS = lerp(sk0, skateBehind(sTop0), e);
      st.q = lerp(q0, PICK.q, e);
      st.linkTilt = lerp(t0, PICK_TILT, e);
      st.elevator = 0;
    },
  };
  yield step('Catwalk skate pushes the joint up the trough onto the drill floor', 4, (st, k) => {
    st.single.s = lerp(sTop0, PICK.sTop, smooth(k));
    st.skateS = skateBehind(st.single.s);
  });
  yield tween('Close and latch the elevator below the box tool joint', 1, { elevator: 1 }, {
    end: (st) => { st.single.latched = true; st.single.attach = 'none'; },
  });
  yield hoistOffCatwalk();
  yield tween('Catwalk lowers the trough and retracts the skate', 4, { catwalk: 0, skateS: 2 });
  yield* stabAndSpinIn('single', 'Iron roughneck spins in the new joint');
  yield* makeUpTopDriveTo('single');
  yield tween('Open the elevator', 1, { elevator: 0 });
  yield pullSlips();
}
