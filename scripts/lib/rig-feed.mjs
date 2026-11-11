// Simulated rig telemetry source: runs the model's own drilling / tripping procedures
// headless and reports what a rig's sensors would report. Used by the WebSocket
// simulator (telemetry-sim.mjs) and by the telemetry checks.
import { createState, deriveState, JOINT } from '../../src/sim/rigState.js';
import { Sequencer, tickRotation } from '../../src/sim/sequencer.js';
import { drillingProgram, tripOutProgram } from '../../src/sim/sequences.js';
import { LAYOUT as L } from '../../src/layout.js';

const PROGRAMS = { drilling: drillingProgram, trip: tripOutProgram };

export class RigFeed {
  /** program: 'drilling' | 'trip' | 'cycle' (drill until the setback is empty, trip out until full, repeat) */
  constructor({ program = 'cycle', blockWeight = 250, noise = true, seed = 7 } = {}) {
    this.mode = program;
    this.blockWeight = blockWeight;
    this.noise = noise;
    this.state = createState();
    deriveState(this.state);
    this.seq = new Sequencer(this.state);
    this.current = program === 'trip' ? 'trip' : 'drilling';
    this.holeDepth = 1850;
    this.stringLen = this.holeDepth + (this.state.stringTopY - L.rotaryTopY) - (this.state.q - L.hoistMin);
    this.prevTop = this.state.stringTopY;
    this.spp = 0;
    this.flow = 0;
    this.time = 0;
    this.seed = seed;
    this.startProgram();
  }

  rnd() {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296 - 0.5;
  }

  startProgram() {
    this.seq.start(PROGRAMS[this.current](this.state), () => {
      if (this.mode === 'cycle') this.current = this.current === 'drilling' ? 'trip' : 'drilling';
      this.restart = true;
    });
  }

  step(dt) {
    const s = this.state;
    let left = dt;
    while (left > 1e-9) {
      const h = Math.min(left, 1 / 30);
      left -= h;
      if (this.restart) { this.restart = false; this.startProgram(); }
      this.seq.update(h);
      tickRotation(s, h);
      deriveState(s);
      // pipe added to or removed from the string shows up as a jump of the string top
      const d = s.stringTopY - this.prevTop;
      if (Math.abs(d) > JOINT * 0.6) this.stringLen += Math.round(d / JOINT) * JOINT;
      this.prevTop = s.stringTopY;
      const pumpsOn = s.pumpsOn ? 1 : 0;
      this.spp += (pumpsOn * 17500 - this.spp) * Math.min(1, h * 1.5);
      this.flow += (pumpsOn * 2300 - this.flow) * Math.min(1, h * 2.5);
      this.time += h;
    }
  }

  get onBottom() {
    const s = this.state;
    return s.connected && s.slips < 0.01 && this.seq.step && this.seq.step.interruptible === true && s.q > L.hoistMin + 1e-3;
  }

  /** One telemetry message in SI units. */
  sample() {
    const s = this.state;
    const n = (amp) => (this.noise ? this.rnd() * 2 * amp : 0);
    const bitDepth = this.stringLen - (s.stringTopY - L.rotaryTopY);
    this.holeDepth = Math.max(this.holeDepth, bitDepth);
    const onBottom = this.onBottom;
    const wob = onBottom ? 110 + n(8) : 0;
    const onHook = (s.connected || s.stringInElevator) ? 1 - s.slips : 0;
    const stringWeight = this.stringLen * 0.25;                         // kN, buoyed
    const handled = (s.stand && s.stand.latched ? 9 : 0) + (s.single && s.single.latched ? 3 : 0);
    return {
      ts: Date.now(),
      blockHeight: +(s.q - L.rotaryTopY + n(0.004)).toFixed(3),
      rpm: +(s.rpm > 0.5 ? s.rpm + n(0.6) : 0).toFixed(1),
      slips: s.slips > 0.5,
      hookload: +(this.blockWeight + onHook * (stringWeight - wob) + handled + n(4)).toFixed(1),
      wob: +wob.toFixed(1),
      torque: +(s.rpm > 1 ? 6 + s.rpm * 0.02 + (onBottom ? 9 : 0) + n(0.6) : 0).toFixed(2),
      spp: +(this.spp + (this.spp > 100 ? n(120) : 0)).toFixed(0),
      flow: +(this.flow + (this.flow > 50 ? n(15) : 0)).toFixed(0),
      bitDepth: +bitDepth.toFixed(2),
      holeDepth: +this.holeDepth.toFixed(2),
      rop: +(onBottom ? 28 + n(3) : 0).toFixed(1),
    };
  }
}

/** Convert an SI message to oilfield units, tagged with unitSystem. */
export function toImperial(m) {
  return {
    ...m,
    unitSystem: 'imperial',
    blockHeight: +(m.blockHeight / 0.3048).toFixed(2),
    hookload: +(m.hookload / 4.4482216).toFixed(1),
    wob: +(m.wob / 4.4482216).toFixed(1),
    torque: +(m.torque / 1.3558179).toFixed(2),
    spp: +(m.spp / 6.894757).toFixed(0),
    flow: +(m.flow / 3.785412).toFixed(0),
    bitDepth: +(m.bitDepth / 0.3048).toFixed(1),
    holeDepth: +(m.holeDepth / 0.3048).toFixed(1),
    rop: +(m.rop / 0.3048).toFixed(1),
  };
}
