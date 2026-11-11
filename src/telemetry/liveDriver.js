import * as THREE from 'three';
import { LAYOUT as L } from '../layout.js';
import {
  JOINT, STAND, STUMP_Y, SAVER, DRILL_TILT, LINK_DROP, elevatorPoint, slotPos, nextFullSlot, nextEmptySlot, makeTubularState, smooth,
} from '../sim/rigState.js';

const DOWN = new THREE.Vector3(0, -1, 0);
const reportedRpm = (d) => (d.snap ? d.snap.rpmReported : 0);
const approach = (v, target, rate, dt) => v + Math.sign(target - v) * Math.min(Math.abs(target - v), rate * dt);

/**
 * Drives the rig simulation state from validated live telemetry.
 *
 * Telemetry only carries block height, RPM, slips, loads and flows, so the
 * driver infers what the pipe is doing from the mechanics:
 *   - with the slips set the string cannot move, so if the block moves away the
 *     top drive must be broken out (the string top stays where it was set);
 *   - a top drive hoisted to the racking board over a floor-height stump is
 *     fetching a stand, which is then shown in the elevator and stabbed;
 *   - a block that comes down past the top of a tall stump means that stand
 *     has been racked back;
 *   - when the slips are pulled the string follows the block again: made up to the
 *     top drive, or (block ~1.2 m higher than a made-up connection, no rotation, no
 *     pumps) hanging in the elevator for tripping.
 * The model never does anything mechanically impossible: values that would
 * drive the top drive through pipe or past its limits are clamped and flagged.
 */
export class LiveDriver {
  constructor(validator) {
    this.validator = validator;
    this.flags = new Map();
    this.snap = null;
    this.activity = 'Live: waiting for telemetry';
    this.inSlips = false;
    this.setQ = 0;
    this.stand = null;       // { slot, plumb (0..1), plumbed, stabbed }
    this.speed = 0;
    this.attached = false;
  }

  raise(code, text, severity, now) {
    const f = this.flags.get(code);
    if (f) { f.text = text; f.last = now; } else this.flags.set(code, { code, text, severity, first: now, last: now, count: 1 });
  }

  activeFlags(now) {
    return [...this.flags.values()].filter((f) => now - f.last < 6000);
  }

  /** Take over the rig state (must be at a safe point: no tubular being handled). */
  attach(s) {
    this.inSlips = s.slips > 0.5;
    this.setQ = s.q;
    this.stand = null;
    this.speed = 0;
    this.attached = true;
    this.first = true;
    s.manualRotation = false;
    s.label = this.activity;
  }

  /** Hand the rig back to the built-in procedures in a state they can start from. */
  detach(s) {
    this.returnStand(s);
    if (s.stringInElevator) {
      // tripping on elevators: hand over as "made up" at the same string position
      s.stringInElevator = false;
      s.connected = true;
      s.q = s.stringTopY + SAVER;
    }
    s.elevator = 0;
    if (s.connected) {
      s.slips = 0;                 // string on the hook, wherever the block is
    } else {
      s.slips = 1;
      s.stringTopY = STUMP_Y;
      s.q = Math.max(s.q, STUMP_Y + SAVER + 0.3);
      s.rpm = 0;
      s.pumpsOn = false;
    }
    this.attached = false;
  }

  returnStand(s) {
    if (!this.stand) return;
    s.setback[this.stand.slot] = true;
    s.stand = null;
    this.stand = null;
  }

  /** Block height at which the elevator can latch a stand still standing in setback slot `slot`. */
  latchQ(slot) {
    const p = slotPos(slot);
    const d = Math.hypot(p.x, p.z);
    const topY = L.setbackY + Math.sqrt(STAND * STAND - d * d);
    return topY - L.elevatorSeat - L.linkPivotLocal + L.linkLength;
  }

  update(s, dt, now) {
    const snap = this.validator.snapshot(now);
    this.snap = snap;
    const prevQ = s.q;

    if (snap.link === 'none') {
      this.activity = 'Live: waiting for telemetry';
      s.label = this.activity;
      return snap;
    }
    const lost = snap.link === 'lost';
    if (this.first && snap.link === 'live') {
      // joining a feed mid-connection: slips already set with the block well above the floor means the
      // top drive is broken out over a floor-height stump
      this.first = false;
      if (snap.slips && snap.q !== null && snap.q > STUMP_Y + SAVER + 1.0) {
        s.connected = false;
        s.stringInElevator = false;
        s.stringTopY = STUMP_Y;
        s.slips = 1;
        s.rpm = 0;
        this.inSlips = true;
        this.setQ = STUMP_Y + SAVER;
      }
    }

    /* ---- slips ---- */
    const wantSlips = snap.slips;
    if (!lost && wantSlips && !this.inSlips) {
      this.inSlips = true;
      this.setQ = snap.q === null ? s.q : THREE.MathUtils.clamp(snap.q, L.hoistMin, L.hoistMax);   // where the rig says the block was when the slips went in
    } else if (!lost && !wantSlips && this.inSlips) {
      this.inSlips = false;
      if (!s.connected && !s.stringInElevator) this.makeUp(s, now);
    }
    // slips only go in once the string has stopped turning, and come out before it turns again
    if (this.inSlips) { if (s.rpm < 0.5) s.slips = approach(s.slips, 1, 1.2, dt); } else s.slips = approach(s.slips, 0, 1.2, dt);

    /* ---- hoist ---- */
    let goal = snap.q === null || lost ? s.q : snap.q;
    const onHook = s.connected || s.stringInElevator;
    if (this.inSlips && onHook) {
      // string is held by the slips: the block cannot take it anywhere. Moving away means the top drive
      // was broken out (or the elevator unlatched); the string top stays where it was set.
      if (Math.abs(goal - this.setQ) > 0.6 && s.slips >= 0.99 && Math.abs(s.q - this.setQ) < 0.3) {
        const top = s.stringTopY;
        s.connected = false;
        s.stringInElevator = false;
        s.stringTopY = top;
      } else {
        goal = this.setQ;
      }
    }
    if (s.stringInElevator && !this.inSlips && (snap.rpm > 5 || snap.pumpsOn)) {
      // rotation or circulation is only possible made up to the top drive
      s.stringInElevator = false;
      s.connected = true;
      this.raise('pipe.madeup', 'Rotation / circulation seen while tripping on elevators — string shown made up to the top drive', 'info', now);
    }
    if (!s.connected && !s.stringInElevator) goal = this.handlePipe(s, goal, dt, now);
    const maxV = 5;
    // exponential approach (frame-rate independent), limited to a believable block speed
    s.q += THREE.MathUtils.clamp((goal - s.q) * (1 - Math.exp(-8 * dt)), -maxV * dt, maxV * dt);
    s.q = THREE.MathUtils.clamp(s.q, L.hoistMin, L.hoistMax);
    this.speed += ((s.q - prevQ) / Math.max(dt, 1e-3) - this.speed) * Math.min(1, dt * 3);

    /* ---- rotation, pumps, links ---- */
    const free = s.connected && !this.inSlips && s.slips < 0.01;
    const rpmGoal = lost || !free ? 0 : snap.rpm;
    s.rpm = approach(s.rpm, rpmGoal, 150, dt);
    if (s.rpm < 0.3 && rpmGoal === 0) s.rpm = 0;
    if (snap.pumpsOn && !s.connected) this.raise('pumps.open', 'Pumps reported on while the top drive is broken out — circulation not shown', 'info', now);
    s.pumpsOn = !lost && snap.pumpsOn && s.connected;
    const tiltGoal = s.connected && !this.stand ? (s.q < 14 ? DRILL_TILT : 0) : 0;
    s.linkTilt = approach(s.linkTilt, tiltGoal, 0.7, dt);
    s.elevator = s.stringInElevator ? 1 : approach(s.elevator, this.stand ? 1 : 0, 2, dt);
    s.roughneck = approach(s.roughneck, 0, 1, dt);

    /* ---- activity (rig-state) classification ---- */
    let a;
    if (lost) a = 'Telemetry lost — holding last position';
    else if (snap.link === 'stale') a = 'Telemetry stale — holding';
    else if (this.inSlips) {
      if (s.connected || s.stringInElevator) a = 'In slips';
      else if (this.stand) a = this.stand.stabbed ? 'Connection — stand stabbed, making up' : 'Connection — running in a stand from the setback';
      else a = s.stringTopY > STUMP_Y + 3 ? 'Connection — stand above the floor, breaking out' : 'Connection — top drive broken out';
    } else if (snap.onBottom && snap.pumpsOn && s.rpm > 5) a = 'Drilling ahead — rotating on bottom';
    else if (snap.onBottom && snap.pumpsOn) a = 'Sliding — oriented drilling, string not rotating';
    else if (s.rpm > 5) a = snap.pumpsOn ? 'Rotating and circulating off bottom' : 'Rotating off bottom';
    else if (this.speed > 0.15) a = s.stringInElevator ? 'Tripping — pulling out on elevators' : 'Hoisting — pulling out';
    else if (this.speed < -0.15) a = s.stringInElevator ? 'Tripping — running in on elevators' : 'Lowering — running in';
    else if (snap.pumpsOn) a = 'Circulating';
    else a = 'Stationary';
    this.activity = `Live: ${a}`;
    s.label = this.activity;
    return snap;
  }

  /** Slips pulled with the top drive broken out: the string is made up again and follows the block. */
  makeUp(s, now) {
    const newTop = s.q - SAVER;
    const delta = newTop - s.stringTopY;
    const elevatorGap = LINK_DROP - L.elevatorSeat - SAVER;        // block sits this much higher when the string hangs in the elevator
    if (!this.stand && Math.abs(delta - elevatorGap) < 0.35 && reportedRpm(this) < 5) {
      s.stringInElevator = true;
      s.elevator = 1;
      s.linkTilt = 0;
      return;
    }
    if (this.stand) {
      this.stand = null;          // the stand in the elevator becomes part of the string; its slot stays empty
      s.stand = null;
    } else if (delta > JOINT * 0.5) {
      const n = Math.max(1, Math.round(delta / STAND));
      let taken = 0;
      for (let i = 0; i < n; i++) {
        const slot = nextFullSlot(s);
        if (slot < 0) break;
        s.setback[slot] = false;
        taken++;
      }
      this.raise('pipe.added', `String is ${delta.toFixed(1)} m longer after the connection — ${taken} stand(s) taken from the setback`, 'info', now);
    }
    s.connected = true;
    s.stringTopY = newTop;
  }

  /** Top drive is free of the string: pipe-handling inference and the limits it imposes on the block. Returns the allowed hoist goal. */
  handlePipe(s, goal, dt, now) {
    const stump = s.stringTopY;

    // tall stump (a stand pulled out of the hole) and the block comes down through it: the stand has been racked back
    if (stump > STUMP_Y + 3 && goal < stump + SAVER - 1.0) {
      const n = Math.max(1, Math.round((stump - STUMP_Y) / STAND));
      let racked = 0;
      for (let i = 0; i < n; i++) {
        const slot = nextEmptySlot(s);
        if (slot < 0) break;
        s.setback[slot] = true;
        racked++;
        s.standsRacked++;
      }
      s.stringTopY = Math.max(STUMP_Y, stump - n * STAND);
      if (racked < n) this.raise('setback.full', 'A stand was racked back but the model setback is full — not shown', 'info', now);
      return goal;
    }

    const st = this.stand;
    if (!st) {
      // top drive hoisted to the racking board over a floor-height stump: it is fetching the next stand
      if (stump <= STUMP_Y + 2) {
        const slot = nextFullSlot(s);
        if (slot >= 0 && s.q >= this.latchQ(slot) - 0.05 && this.speed >= -0.05) {
          s.setback[slot] = false;
          const p = slotPos(slot);
          const d = Math.hypot(p.x, p.z);
          const t = makeTubularState(STAND, new THREE.Vector3(), DOWN);
          t.slot = slot;
          t.attach = 'elevator';
          t.latched = true;
          this.stand = { slot, plumb: 0, plumbed: false, stabbed: false, lean: new THREE.Vector3(p.x, -Math.sqrt(STAND * STAND - d * d), p.z).divideScalar(STAND), latchQ: this.latchQ(slot) };
          t.axis.copy(this.stand.lean);
          s.stand = t;
        }
      }
    } else {
      const t = s.stand;
      const E = elevatorPoint(s.q, s.linkTilt);
      const plumbBottom = E.y + L.elevatorSeat - STAND;
      if (!st.stabbed) {
        if (!st.plumbed) {
          // pin still on (or just off) the setback; it is swung to well centre once it can clear the stump
          if (s.q < st.latchQ - 0.25) { this.returnStand(s); return Math.max(goal, stump + SAVER); }
          const can = plumbBottom >= stump + 0.05;
          st.plumb = approach(st.plumb, can ? 1 : 0, 0.6, dt);
          t.axis.copy(st.lean).lerp(DOWN, smooth(st.plumb)).normalize();
          if (st.plumb >= 0.999) st.plumbed = true;
        } else if (plumbBottom <= stump) {
          // pin lands in the box of the string in the slips
          st.stabbed = true;
          t.attach = 'none';
          t.latched = false;
          t.axis.copy(DOWN);
          t.top.set(0, stump + STAND, 0);
        }
      } else if (E.y + L.elevatorSeat > t.top.y + 0.02) {
        // block went back up: the elevator picks the stand up again
        st.stabbed = false;
        t.attach = 'elevator';
        t.latched = true;
      }
      if (st.stabbed) {
        const limit = t.top.y + SAVER;
        if (goal < limit - 1.0) {
          // the block is lower than a made-up stand would allow: there is no stand after all
          this.returnStand(s);
        } else {
          return Math.max(goal, limit);
        }
      }
    }

    const limit = stump + SAVER;
    if (goal < limit - 0.3 && stump <= STUMP_Y + 3) this.raise('block.stump', `Block height would put the top drive ${(limit - goal).toFixed(1)} m into the string held in the slips — held above it`, 'warn', now);
    return Math.max(goal, limit);
  }
}
