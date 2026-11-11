import { deriveState } from './rigState.js';

/**
 * Runs a generator "program" of steps against a rig state.
 *
 * A step is { label, duration, begin?(s), update?(s, k, dt), end?(s), done?(s),
 *             interruptible?, safePoint? }.
 *   - duration: seconds; Infinity means "until done(s) returns true".
 *   - interruptible: a stop request may abort the program during this step.
 *   - safePoint: the state *before* this step is a safe place to stop.
 * Programs may set s.halt to a message to end themselves.
 */
export class Sequencer {
  constructor(state) {
    this.state = state;
    this.gen = null;
    this.step = null;
    this.t = 0;
    this.stopRequested = false;
    this.onFinish = null;
    this.stepIndex = 0;
  }

  get active() {
    return this.gen !== null;
  }

  get label() {
    return this.step ? this.step.label : '';
  }

  start(gen, onFinish) {
    this.abort();
    this.gen = gen;
    this.onFinish = onFinish || null;
    this.stopRequested = false;
    this.stepIndex = 0;
    this.state.halt = null;
    this._next();
  }

  requestStop() {
    if (this.gen) this.stopRequested = true;
  }

  /** Hard stop without callbacks (used by reset). */
  abort() {
    if (this.gen) this.gen.return();
    this.gen = null;
    this.step = null;
  }

  _finish(reason) {
    if (this.gen) this.gen.return();
    this.gen = null;
    this.step = null;
    const cb = this.onFinish;
    this.onFinish = null;
    if (cb) cb(reason);
  }

  _next() {
    const s = this.state;
    if (s.halt) return this._finish('halted');
    const r = this.gen.next();
    if (r.done) return this._finish('done');
    const st = r.value;
    if (this.stopRequested && st.safePoint) return this._finish('stopped');
    this.step = st;
    this.t = 0;
    this.stepIndex++;
    s.label = st.label;
    if (st.begin) st.begin(s);
    deriveState(s);
  }

  update(dt) {
    const s = this.state;
    let guard = 0;
    while (this.gen && this.step && guard++ < 64) {
      const st = this.step;
      if (this.stopRequested && st.interruptible) return this._finish('stopped');
      const dur = st.duration;
      let use;
      let finished;
      if (dur === Infinity) {
        use = dt;
        this.t += use;
        if (st.update) st.update(s, 0, use);
        deriveState(s);
        finished = st.done ? st.done(s) : true;
        dt = 0;
      } else {
        use = Math.min(dt, Math.max(0, dur - this.t));
        this.t += use;
        dt -= use;
        const k = dur > 0 ? Math.min(1, this.t / dur) : 1;
        if (st.update) st.update(s, k, use);
        deriveState(s);
        finished = this.t >= dur - 1e-9;
      }
      if (!finished) break;
      if (st.end) st.end(s);
      deriveState(s);
      this._next();
      if (dt <= 1e-9 && this.step && this.step.duration > 0) break;
    }
  }
}

/** Run a program headless to completion (or until `until(s)` / maxTime). Used by validation. */
export function simulate(state, gen, { dt = 1 / 30, maxTime = 600, until = null, onTick = null } = {}) {
  const seq = new Sequencer(state);
  let reason = null;
  seq.start(gen, (r) => { reason = r; });
  let t = 0;
  deriveState(state);
  while (seq.active && t < maxTime) {
    seq.update(dt);
    tickRotation(state, dt);
    deriveState(state);
    t += dt;
    if (onTick) onTick(state, seq, t);
    if (until && until(state, seq)) { seq.abort(); reason = 'until'; break; }
  }
  return { reason: reason ?? 'timeout', time: t };
}

/** Continuous quill / string rotation from the current RPM. */
export function tickRotation(s, dt) {
  if (s.rpm <= 0) return;
  const d = (s.rpm * Math.PI * 2 / 60) * dt;
  s.quillAngle += d;
  if (s.connected) s.stringSpin += d;
}
