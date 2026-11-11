import { LAYOUT as L } from '../layout.js';

/*
 * Telemetry validation for the live rig feed. Pure logic (no DOM, no three.js),
 * so it runs in the browser and in Node tests.
 *
 * A message is a JSON object (or an array of them). Channel values may sit at
 * the top level or under `data` / `values`. Optional:
 *   ts | timestamp | time     epoch ms, epoch s or ISO string
 *   units: { channel: unit }  per-channel unit, e.g. { blockHeight: "ft" }
 *   unitSystem: "imperial"    ft, klbf, kft.lbf, psi, gpm
 *
 * Every value passes through: type check -> unit conversion -> plausibility
 * (hard) range -> spike filter -> operating-range clamp. A rejected value never
 * reaches the model: the last good value is held and a flag is raised.
 */

/* ---------------- units (factor converts to the internal unit) ---------------- */
const UNITS = {
  length: { m: 1, ft: 0.3048, in: 0.0254 },                                                    // m
  force: { kn: 1, n: 0.001, dan: 0.01, kdan: 10, klbf: 4.4482216, kip: 4.4482216, klb: 4.4482216, lbf: 0.0044482216, t: 9.80665, tonne: 9.80665, kg: 0.00980665 },   // kN
  torque: { 'kn.m': 1, knm: 1, 'n.m': 0.001, nm: 0.001, 'ft.lbf': 0.0013558179, 'ft.lb': 0.0013558179, 'kft.lbf': 1.3558179, 'kft.lb': 1.3558179 },                   // kN.m
  pressure: { kpa: 1, mpa: 1000, bar: 100, psi: 6.894757 },                                    // kPa
  flow: { 'l/min': 1, lpm: 1, gpm: 3.785412, 'm3/min': 1000, 'm3/h': 16.666667 },              // L/min
  speed: { rpm: 1, 'rev/min': 1 },
  rate: { 'm/h': 1, 'm/hr': 1, 'ft/h': 0.3048, 'ft/hr': 0.3048 },                              // m/h
};
const IMPERIAL = { length: 'ft', force: 'klbf', torque: 'kft.lbf', pressure: 'psi', flow: 'gpm', speed: 'rpm', rate: 'ft/h' };
const normUnit = (u) => String(u).trim().toLowerCase().replace(/[\s]/g, '').replace(/[·*-]/g, '.').replace('³', '3');

const BLOCK_MIN = L.hoistMin - L.rotaryTopY;     // drilled down: saver sub 0.9 m above the rotary table
const BLOCK_MAX = L.hoistMax - L.rotaryTopY;     // crown-saver limit

/**
 * Channel specification.
 *   hard: plausible range; outside it the value is a sensor fault and is rejected
 *   oper: range the model can show; outside it the value is clamped and flagged
 *   maxRate: fastest believable change per second (spike filter)
 *   floor: small negative noise below this magnitude is snapped to zero
 */
export const CHANNELS = {
  blockHeight: { label: 'Block height', unit: 'm', kind: 'length', aliases: ['blockheight', 'block_height', 'blockposition', 'block_position', 'blockpos', 'bpos', 'hookheight', 'hook_height', 'blkpos'], hard: [-3, 60], oper: [BLOCK_MIN, BLOCK_MAX], maxRate: 4.5, tol: 0.3, digits: 2 },
  rpm: { label: 'String RPM', unit: 'rpm', kind: 'speed', aliases: ['rpm', 'rotaryspeed', 'rotary_rpm', 'topdriverpm', 'tdrpm', 'rpma', 'surfacerpm'], hard: [-30, 400], oper: [0, 250], maxRate: 250, tol: 8, floor: 6, digits: 0 },
  hookload: { label: 'Hookload', unit: 'kN', kind: 'force', aliases: ['hookload', 'hook_load', 'hkld', 'hkla', 'weight', 'stringweight'], hard: [-100, 6000], oper: [0, 4500], maxRate: 2500, tol: 60, floor: 60, digits: 0 },
  wob: { label: 'Weight on bit', unit: 'kN', kind: 'force', aliases: ['wob', 'weightonbit', 'weight_on_bit', 'woba'], hard: [-400, 800], oper: [0, 500], maxRate: 1500, tol: 30, floor: 400, digits: 0 },
  torque: { label: 'Torque', unit: 'kN.m', kind: 'torque', aliases: ['torque', 'tq', 'tqa', 'surfacetorque', 'rotarytorque'], hard: [-10, 120], oper: [0, 80], maxRate: 80, tol: 5, floor: 10, digits: 1 },
  spp: { label: 'Standpipe pressure', unit: 'kPa', kind: 'pressure', aliases: ['spp', 'sppa', 'standpipepressure', 'standpipe_pressure', 'pumppressure'], hard: [-500, 60000], oper: [0, 42000], maxRate: 30000, tol: 800, floor: 500, digits: 0 },
  flow: { label: 'Flow in', unit: 'L/min', kind: 'flow', aliases: ['flow', 'flowin', 'flow_in', 'mfia', 'pumpflow', 'flowrate'], hard: [-200, 8000], oper: [0, 6000], maxRate: 9000, tol: 150, floor: 200, digits: 0 },
  bitDepth: { label: 'Bit depth', unit: 'm', kind: 'length', aliases: ['bitdepth', 'bit_depth', 'dbtm', 'bitposition'], hard: [-5, 15000], oper: [0, 15000], maxRate: 6, tol: 1, digits: 1 },
  holeDepth: { label: 'Hole depth', unit: 'm', kind: 'length', aliases: ['holedepth', 'hole_depth', 'dmea', 'depth', 'md', 'totaldepth'], hard: [-5, 15000], oper: [0, 15000], maxRate: 2, tol: 1, digits: 1 },
  rop: { label: 'ROP', unit: 'm/h', kind: 'rate', aliases: ['rop', 'ropa', 'rateofpenetration'], hard: [-5, 600], oper: [0, 400], maxRate: 500, tol: 50, floor: 5, digits: 1 },
};
const SLIPS_ALIASES = ['slips', 'slipstatus', 'slip_status', 'slipsset', 'inslips', 'in_slips', 'slipstate'];
const TS_ALIASES = ['ts', 'timestamp', 'time', 't'];

const ALIAS = new Map();
for (const [name, spec] of Object.entries(CHANNELS)) for (const a of spec.aliases) ALIAS.set(a, name);
for (const a of SLIPS_ALIASES) ALIAS.set(a, 'slips');
const keyNorm = (k) => String(k).toLowerCase().replace(/[\s.-]/g, '');

const TRUE_WORDS = new Set(['1', 'true', 'set', 'in', 'on', 'closed', 'engaged', 'yes']);
const FALSE_WORDS = new Set(['0', 'false', 'out', 'off', 'open', 'pulled', 'released', 'no']);

export const DEFAULT_CONFIG = {
  blockDatum: 0,            // m added to the reported block height (if the rig measures from a different datum)
  blockWeight: 250,         // kN: travelling block + top drive, hook empty
  staleAfterMs: 3000,       // link with no valid message for this long is STALE (model holds)
  lostAfterMs: 10000,       // ... and after this long is LOST (rotation and pumps shown stopped)
  channelStaleMs: 6000,     // a single channel with no valid sample for this long is flagged
  spikeConfirm: 3,          // consecutive agreeing samples that turn a rejected jump into an accepted step
  flagHoldMs: 6000,         // how long a transient flag stays listed
};

const fmt = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : String(v));

export class TelemetryValidator {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.reset();
  }

  reset() {
    this.ch = {};
    for (const name of Object.keys(CHANNELS)) this.ch[name] = { value: null, quality: 'missing', t: -Infinity, cand: null, note: '' };
    this.slips = { value: null, t: -Infinity, quality: 'missing' };
    this.inferredSlips = false;
    this.pumps = false;
    this.flags = new Map();
    this.lastRx = -Infinity;        // receive time of the last message that carried at least one valid value
    this.lastTs = null;             // source timestamp of the last accepted message
    this.stats = { received: 0, accepted: 0, dropped: 0, rejectedValues: 0, clampedValues: 0, malformed: 0 };
    this.conflictSince = {};
    this.unknownKeys = new Set();
  }

  configure(patch) {
    Object.assign(this.config, patch);
  }

  raise(code, text, severity, now) {
    const f = this.flags.get(code);
    if (f) { f.text = text; f.severity = severity; f.last = now; f.count++; } else this.flags.set(code, { code, text, severity, first: now, last: now, count: 1 });
  }

  /** Feed one raw frame (string, object or array of objects). `now` is a monotonic receive time in ms. */
  ingest(raw, now) {
    let msg = raw;
    if (typeof raw === 'string') {
      try {
        msg = JSON.parse(raw);
      } catch {
        this.stats.malformed++;
        this.raise('frame.malformed', 'Frame is not valid JSON — ignored', 'warn', now);
        return 0;
      }
    }
    if (Array.isArray(msg)) {
      let n = 0;
      for (const m of msg) n += this.ingest(m, now);
      return n;
    }
    if (msg === null || typeof msg !== 'object') {
      this.stats.malformed++;
      this.raise('frame.malformed', 'Frame is not a JSON object — ignored', 'warn', now);
      return 0;
    }
    this.stats.received++;
    if (msg.config && typeof msg.config === 'object') this.configure(msg.config);

    const body = (msg.data && typeof msg.data === 'object' && msg.data) || (msg.values && typeof msg.values === 'object' && msg.values) || msg;
    const units = { ...(msg.units || {}), ...(body.units || {}) };
    const unitNorm = {};
    for (const k of Object.keys(units)) unitNorm[ALIAS.get(keyNorm(k)) || k] = units[k];
    const imperial = String(msg.unitSystem || body.unitSystem || '').toLowerCase().startsWith('imp');

    /* ---- source timestamp: ordering and sample spacing ---- */
    let ts = null;
    for (const k of TS_ALIASES) {
      const v = msg[k] ?? body[k];
      if (v === undefined || v === null) continue;
      ts = typeof v === 'number' ? (v < 1e11 ? v * 1000 : v) : Date.parse(v);
      if (!Number.isFinite(ts)) { ts = null; this.raise('ts.invalid', 'Unreadable timestamp — using arrival time', 'info', now); }
      break;
    }
    let dt = Math.max(0.02, (now - this.lastRx) / 1000);
    if (ts !== null && this.lastTs !== null) {
      const d = ts - this.lastTs;
      if (d < -60000) {
        this.raise('ts.reset', 'Source clock jumped backwards — treating as a feed restart', 'warn', now);
      } else if (d < 0) {
        this.stats.dropped++;
        this.raise('ts.order', `Out-of-order sample (${fmt(-d / 1000, 2)} s old) — dropped`, 'info', now);
        return 0;
      } else if (d === 0) {
        this.stats.dropped++;                 // duplicate
        return 0;
      } else if (d < 10000) {
        dt = Math.max(0.02, d / 1000);
      }
    }

    /* ---- channels ---- */
    let good = 0;
    const seen = new Set();
    for (const [key, rawVal] of Object.entries(body)) {
      const nk = keyNorm(key);
      if (TS_ALIASES.includes(nk) || nk === 'units' || nk === 'unitsystem' || nk === 'config' || nk === 'data' || nk === 'values') continue;
      const name = ALIAS.get(nk);
      if (!name) { this.unknownKeys.add(key); continue; }
      if (seen.has(name)) continue;           // two aliases of one channel in a message: first wins
      seen.add(name);
      if (name === 'slips') { if (this.acceptSlips(rawVal, now)) good++; continue; }
      const spec = CHANNELS[name];
      const unit = unitNorm[name] ?? (imperial ? IMPERIAL[spec.kind] : null);
      if (this.acceptNumeric(name, spec, rawVal, unit, dt, now)) good++;
    }

    if (good > 0) {
      this.lastRx = now;
      if (ts !== null) this.lastTs = ts;
      this.stats.accepted++;
    } else {
      this.raise('frame.empty', 'Message carried no usable values', 'info', now);
    }
    return good;
  }

  acceptSlips(rawVal, now) {
    let v = null;
    if (typeof rawVal === 'boolean') v = rawVal;
    else if (typeof rawVal === 'number' && (rawVal === 0 || rawVal === 1)) v = rawVal === 1;
    else if (typeof rawVal === 'string') {
      const w = rawVal.trim().toLowerCase();
      if (TRUE_WORDS.has(w)) v = true;
      else if (FALSE_WORDS.has(w)) v = false;
    }
    if (v === null) {
      this.stats.rejectedValues++;
      this.raise('slips.invalid', `Slips status "${String(rawVal).slice(0, 20)}" not understood — holding last state`, 'warn', now);
      return false;
    }
    this.slips.value = v;
    this.slips.t = now;
    this.slips.quality = 'good';
    return true;
  }

  acceptNumeric(name, spec, rawVal, unit, dt, now) {
    const st = this.ch[name];
    const reject = (code, text) => {
      this.stats.rejectedValues++;
      if (st.value !== null) st.quality = 'held';
      st.note = text;
      this.raise(`${name}.${code}`, `${spec.label}: ${text} — holding ${st.value === null ? 'default' : fmt(st.value, spec.digits) + ' ' + spec.unit}`, 'warn', now);
      return false;
    };

    // 1. type
    let v = rawVal;
    if (typeof v === 'string' && v.trim() !== '') v = Number(v);
    if (typeof v !== 'number' || !Number.isFinite(v)) return reject('invalid', `non-numeric value (${String(rawVal).slice(0, 16)})`);

    // 2. units
    if (unit) {
      const f = UNITS[spec.kind][normUnit(unit)];
      if (f === undefined) this.raise(`${name}.unit`, `${spec.label}: unknown unit "${unit}" — assuming ${spec.unit}`, 'warn', now);
      else v *= f;
    }
    if (name === 'blockHeight') v += this.config.blockDatum;

    // 3. plausibility
    if (v < spec.hard[0] || v > spec.hard[1]) return reject('range', `${fmt(v, spec.digits)} ${spec.unit} is outside the plausible range ${spec.hard[0]}..${spec.hard[1]}`);
    if (spec.floor && v < 0 && v > -spec.floor) v = 0;        // sensor noise around zero

    // 4. spike filter: a jump faster than the equipment can move is held back until it persists
    if (st.value !== null && now - st.t < 8000) {
      const limit = spec.maxRate * dt + spec.tol;
      if (Math.abs(v - st.raw) > limit) {
        const c = st.cand;
        if (c && Math.abs(v - c.v) <= spec.maxRate * Math.max(0.02, (now - c.t) / 1000) + spec.tol) {
          c.n++;
          c.v = v;
          c.t = now;
        } else {
          st.cand = { v, n: 1, t: now };
        }
        if (st.cand.n < this.config.spikeConfirm) {
          return reject('spike', `jump of ${fmt(v - st.raw, spec.digits)} ${spec.unit} in ${fmt(dt, 2)} s is faster than physically possible (sample ${st.cand.n}/${this.config.spikeConfirm})`);
        }
        this.raise(`${name}.step`, `${spec.label}: step to ${fmt(v, spec.digits)} ${spec.unit} persisted for ${st.cand.n} samples — accepted as a real change or re-zero`, 'info', now);
      }
    }
    st.cand = null;
    if (name === 'blockHeight') {
      st.vel = st.value !== null && now - st.t < 3000 ? Math.max(-spec.maxRate, Math.min(spec.maxRate, (v - st.raw) / dt)) : 0;
      st.dt = Math.min(dt, 2);
    }
    st.raw = v;

    // 5. operating range: value is real but beyond what the model can show
    let quality = 'good';
    st.note = '';
    const margin = spec.tol * 0.5;
    if (v < spec.oper[0] && v >= spec.oper[0] - margin) v = spec.oper[0];
    else if (v > spec.oper[1] && v <= spec.oper[1] + margin) v = spec.oper[1];
    if (v < spec.oper[0] - 1e-9 || v > spec.oper[1] + 1e-9) {
      const c = Math.min(spec.oper[1], Math.max(spec.oper[0], v));
      this.stats.clampedValues++;
      quality = 'clamped';
      st.note = `reported ${fmt(v, spec.digits)}`;
      const why = name === 'blockHeight' ? (v > spec.oper[1] ? ' (crown-saver limit)' : ' (floor-saver limit)') : name === 'rpm' && v < 0 ? ' (reverse rotation is not modelled)' : '';
      this.raise(`${name}.clamp`, `${spec.label}: ${fmt(v, spec.digits)} ${spec.unit} is outside the operating range — shown as ${fmt(c, spec.digits)}${why}`, 'warn', now);
      v = c;
    }
    st.value = v;
    st.quality = quality;
    st.t = now;
    return true;
  }

  /**
   * Hoist position for the model: the last valid block height, carried forward at the last
   * measured block speed for at most one sample period so slow feeds still animate smoothly.
   */
  predictQ(now, link) {
    const st = this.ch.blockHeight;
    const spec = CHANNELS.blockHeight;
    let h = st.value;
    if (link === 'live' && st.quality === 'good' && st.vel) {
      const ahead = Math.min((now - st.t) / 1000, st.dt || 0, 1);
      h = Math.min(spec.oper[1], Math.max(spec.oper[0], h + st.vel * ahead));
    }
    return L.rotaryTopY + h;
  }

  /** Current validated picture of the rig at monotonic time `now`. */
  snapshot(now) {
    const cfg = this.config;
    const age = now - this.lastRx;
    const link = this.lastRx === -Infinity ? 'none' : age > cfg.lostAfterMs ? 'lost' : age > cfg.staleAfterMs ? 'stale' : 'live';
    if (link === 'stale') this.raise('link.stale', `No valid data for ${fmt(age / 1000, 0)} s — holding the last known state`, 'warn', now);
    if (link === 'lost') this.raise('link.lost', `Telemetry lost for ${fmt(age / 1000, 0)} s — position held, rotation and pumps shown stopped`, 'error', now);

    const channels = {};
    const fresh = (name) => this.ch[name].value !== null && now - this.ch[name].t < cfg.channelStaleMs;
    for (const [name, spec] of Object.entries(CHANNELS)) {
      const st = this.ch[name];
      let quality = st.quality;
      if (st.value !== null && link === 'live' && now - st.t > cfg.channelStaleMs) {
        quality = 'stale';
        this.raise(`${name}.stale`, `${spec.label}: no valid sample for ${fmt((now - st.t) / 1000, 0)} s — holding ${fmt(st.value, spec.digits)} ${spec.unit}`, 'warn', now);
      }
      channels[name] = { value: st.value, quality, ageMs: now - st.t, note: st.note, label: spec.label, unit: spec.unit, digits: spec.digits };
    }
    const val = (name) => this.ch[name].value;

    /* ---- depth consistency ---- */
    if (fresh('bitDepth') && fresh('holeDepth') && val('bitDepth') > val('holeDepth') + 0.5) {
      this.raise('depth.conflict', `Bit depth ${fmt(val('bitDepth'))} m is deeper than hole depth ${fmt(val('holeDepth'))} m — using hole depth`, 'warn', now);
      channels.bitDepth.value = val('holeDepth');
      channels.bitDepth.quality = 'clamped';
    }

    /* ---- slips: reported, cross-checked against hookload and rotation, or inferred ---- */
    const hookFresh = fresh('hookload');
    const hook = val('hookload');
    const rpm = fresh('rpm') ? val('rpm') : 0;
    const rotating = rpm > 10;
    if (hookFresh) {
      if (hook < cfg.blockWeight + 60) this.inferredSlips = true;
      else if (hook > cfg.blockWeight + 150) this.inferredSlips = false;
    }
    let slips;
    let slipsSource;
    // a slips signal older than 5 s is only trusted when there is no hookload to infer from
    if (this.slips.value !== null && (now - this.slips.t < 5000 || !hookFresh)) {
      slips = this.slips.value;
      slipsSource = 'reported';
      const hookCarriesString = hookFresh && hook > cfg.blockWeight + 250;
      if (slips && hookCarriesString && rotating) {
        slips = false;
        slipsSource = 'overridden';
        this.raise('slips.override', `Slips read SET, but the hook carries ${fmt(hook, 0)} kN and the string turns at ${fmt(rpm, 0)} rpm — treating slips as OUT`, 'error', now);
      } else if (slips && hookCarriesString) {
        const since = this.conflictSince.hook ?? (this.conflictSince.hook = now);
        if (now - since > 3000) this.raise('slips.hookload', `Slips read SET but the hook still carries ${fmt(hook, 0)} kN — slips or hookload sensor suspect`, 'warn', now);
      } else {
        this.conflictSince.hook = null;
      }
    } else if (hookFresh) {
      slips = this.inferredSlips;
      slipsSource = 'inferred';
      this.raise('slips.inferred', 'No slips signal — inferring slips from hookload', 'info', now);
    } else {
      slips = this.slips.value ?? false;
      slipsSource = 'unknown';
      if (link === 'live') this.raise('slips.unknown', 'No slips signal and no hookload — assuming the last known slips state', 'warn', now);
    }
    let rpmEffective = rpm;
    if (slips && rotating) {
      rpmEffective = 0;
      this.raise('rpm.slips', `${fmt(rpm, 0)} rpm reported with the slips set — rotation is not applied to the string`, 'warn', now);
    }

    /* ---- pumps ---- */
    const flowFresh = fresh('flow');
    const sppFresh = fresh('spp');
    if (flowFresh || sppFresh) {
      const on = (flowFresh && val('flow') > 150) || (sppFresh && val('spp') > 1000);
      const off = (!flowFresh || val('flow') < 50) && (!sppFresh || val('spp') < 300);
      if (on) this.pumps = true;
      else if (off) this.pumps = false;
      if (flowFresh && sppFresh && val('flow') > 300 && val('spp') < 100) this.raise('pumps.conflict', 'Flow reported with no standpipe pressure — one of the two sensors is suspect', 'info', now);
    }

    const onBottom = (fresh('wob') && val('wob') > 15) || (fresh('bitDepth') && fresh('holeDepth') && val('holeDepth') - val('bitDepth') < 0.3 && val('holeDepth') > 1);

    const flags = [];
    for (const f of this.flags.values()) if (now - f.last < cfg.flagHoldMs) flags.push(f);
    const rank = { error: 0, warn: 1, info: 2 };
    flags.sort((a, b) => rank[a.severity] - rank[b.severity] || b.last - a.last);

    return {
      link,
      ageMs: age,
      channels,
      q: this.ch.blockHeight.value === null ? null : this.predictQ(now, link),
      blockFresh: fresh('blockHeight'),
      slips,
      slipsSource,
      rpm: rpmEffective,
      rpmReported: rpm,
      pumpsOn: this.pumps,
      onBottom,
      flags,
      stats: this.stats,
    };
  }
}
