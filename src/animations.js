import * as THREE from 'three';
import { LAYOUT } from './layout.js';
import { createState, deriveState, SAVER } from './sim/rigState.js';
import { Sequencer, tickRotation } from './sim/sequencer.js';
import { idleProgram, drillingProgram, tripOutProgram, pipeHandlingProgram } from './sim/sequences.js';

export const MODES = [
  { id: 'idle', name: 'Idle' },
  { id: 'drilling', name: 'Drilling' },
  { id: 'hoisting', name: 'Hoisting (trip out)' },
  { id: 'pipe', name: 'Pipe Handling' },
];
const modeName = (id) => MODES.find((m) => m.id === id)?.name ?? id;

const PROGRAMS = {
  idle: idleProgram,
  drilling: drillingProgram,
  hoisting: tripOutProgram,
  pipe: pipeHandlingProgram,
};

const START_MESSAGES = {
  idle: 'Idle: stopping rotation and pumps. Hoist and RPM are then under manual control.',
  drilling: 'Drilling: drill each stand down, then make a connection with the next stand from the setback.',
  hoisting: 'Hoisting: tripping out on elevators and racking stands back in the fingerboard.',
  pipe: 'Pipe handling: picking up a single from the rack with the catwalk and the top-drive elevator.',
};

const DOWN = new THREE.Vector3(0, -1, 0);

/**
 * Owns the rig simulation state and the step sequencer, and drives the
 * scene objects from that state every frame. Mode changes requested while an
 * operation is running are deferred to the next safe point (string made up,
 * or string in the slips with an empty elevator), never mid-lift.
 */
export class RigAnimator {
  constructor(rig) {
    this.rig = rig;
    this.state = createState();
    deriveState(this.state);
    this.seq = new Sequencer(this.state);
    this.mode = 'idle';
    this.pending = null;
    this.hoistTarget = this.state.q;
    this.simSpeed = 1;
    this.paused = false;
    this.onStatus = () => {};
    this.lastQ = this.state.q;
    this.applyView(0);
  }

  get busy() {
    return this.seq.active;
  }

  get operation() {
    if (this.seq.active) return this.seq.label;
    return this.mode === 'idle' ? 'Manual control' : 'Stopped';
  }

  status(msg, level = 'info') {
    this.onStatus(msg, level);
  }

  /* -------------------------- commands -------------------------- */
  setMode(mode) {
    if (this.seq.active) {
      if (mode === this.mode && !this.pending) return true;
      this.pending = mode;
      this.seq.requestStop();
      this.status(`Finishing the current operation safely before switching to ${modeName(mode)}…`, 'warn');
      return true;
    }
    this.startMode(mode);
    return true;
  }

  startMode(mode) {
    this.mode = mode;
    this.pending = null;
    this.status(START_MESSAGES[mode]);
    this.seq.start(PROGRAMS[mode](this.state), (reason) => this.onProgramEnd(reason));
  }

  onProgramEnd(reason) {
    const s = this.state;
    this.hoistTarget = s.q;
    if (this.pending) {
      const next = this.pending;
      this.pending = null;
      this.startMode(next);
      return;
    }
    if (reason === 'halted') {
      this.mode = 'idle';
      this.status(s.halt, 'warn');
    } else if (this.mode === 'pipe') {
      this.mode = 'idle';
      this.status('Single picked up and made up: the string is one joint longer. Press "Start pipe transfer" for another.', 'ok');
    } else if (this.mode === 'idle') {
      this.status('Idle: manual control of hoist and rotation.', 'info');
    } else {
      this.mode = 'idle';
      this.status('Operation stopped at a safe point. Manual control.', 'info');
    }
  }

  /** Manual hoist target (Idle only). Returns the clamped target actually applied. */
  setHoistTarget(y) {
    const s = this.state;
    if (this.seq.active || this.mode !== 'idle') return this.hoistTarget;
    const lo = s.connected ? LAYOUT.hoistMin : s.stringTopY + SAVER + 0.3;
    this.hoistTarget = THREE.MathUtils.clamp(y, lo, LAYOUT.hoistMax);
    return this.hoistTarget;
  }

  setRPM(v) {
    this.state.rpmSet = THREE.MathUtils.clamp(v, 0, 200);
  }

  toggleRotation() {
    const s = this.state;
    if (this.seq.active) {
      this.status('Rotation is controlled by the running operation.', 'warn');
      return false;
    }
    if (!s.manualRotation) {
      if (!s.connected) {
        this.status('Top drive is broken out from the string: make up (Drilling mode) before rotating.', 'warn');
        return false;
      }
      if (s.slips > 0) {
        this.status('Cannot rotate: the string is in the slips.', 'warn');
        return false;
      }
      if (s.rpmSet <= 0) s.rpmSet = 60;
    }
    s.manualRotation = !s.manualRotation;
    this.status(s.manualRotation ? `Rotating the string off bottom at ${Math.round(s.rpmSet)} RPM.` : 'Rotation stopping.');
    return true;
  }

  startTransfer() {
    const s = this.state;
    if (!this.seq.active && s.manualRotation && s.rpm > 0.5) {
      this.status('Cannot start a pipe transfer while the string is rotating. Stop rotation first.', 'warn');
      return false;
    }
    if (this.seq.active && this.mode === 'pipe') {
      this.status('Pipe transfer already running.', 'warn');
      return false;
    }
    return this.setMode('pipe');
  }

  reset() {
    this.seq.abort();
    const rpmSet = this.state.rpmSet;
    const fresh = createState();
    Object.keys(this.state).forEach((k) => delete this.state[k]);
    Object.assign(this.state, fresh, { rpmSet });
    deriveState(this.state);
    this.mode = 'idle';
    this.pending = null;
    this.hoistTarget = this.state.q;
    this.applyView(0);
    this.status('Reset: string made up, off bottom, setback and pipe rack restocked.');
  }

  /* -------------------------- per frame -------------------------- */
  update(rawDt) {
    const s = this.state;
    const dt = this.paused ? 0 : Math.min(rawDt, 0.1) * this.simSpeed;
    if (dt > 0) {
      if (this.seq.active) {
        this.seq.update(dt);
      } else if (this.mode === 'idle') {
        const d = this.hoistTarget - s.q;
        s.q += Math.sign(d) * Math.min(Math.abs(d), LAYOUT.hoistSpeed * dt);
        const want = s.manualRotation && s.connected && s.slips === 0 ? s.rpmSet : 0;
        s.rpm += Math.sign(want - s.rpm) * Math.min(Math.abs(want - s.rpm), 80 * dt);
        if (s.rpm < 0.5 && !s.manualRotation) s.rpm = 0;
        s.label = 'Manual control';
      }
      tickRotation(s, dt);
      deriveState(s);
    }
    this.applyView(dt);
  }

  /** Push the simulation state into the scene objects. */
  applyView(dt) {
    const r = this.rig;
    const s = this.state;
    let bore = null;
    if (s.stand && (s.stand.latched || (s.elevator > 0.5 && s.stand.attach === 'none' && s.stand.axis.y < -0.999))) bore = s.stand.axis;
    else if (s.single && (s.single.latched || (s.elevator > 0.5 && s.single.attach === 'none' && s.single.axis.y < -0.999))) bore = s.single.axis;
    else if (s.stringInElevator || (s.elevator > 0.5 && s.connected)) bore = DOWN;
    r.hoist.update(s.q, s.quillAngle, s.linkTilt, s.elevator, bore);
    const dq = s.q - this.lastQ;
    if (dq !== 0) {
      r.mud.updateHose();
      // 10 lines strung: the drum spools 10x block travel; scaled down 4x so it reads at 60 fps
      r.drawworks.spin((-dq * 10) / r.drawworks.drumRadius / 4);
      this.lastQ = s.q;
    }
    r.string.update(s.stringTopY, s.stringSpin);
    r.floor.update(s);
    r.pipe.update(s);
    r.mud.setCirculating(s.pumpsOn);
    if (s.pumpsOn && dt > 0) {
      r.mud.updateFlow(dt);
      r.mud.updatePumps(dt, 1.1);
    }
  }
}
