import * as THREE from 'three';
import { LAYOUT as L } from '../layout.js';

/**
 * Pure simulation state for the rig (no meshes). The scene view reads this
 * every frame; sequences mutate it; validation dry-runs it headless.
 */

export const DEG = Math.PI / 180;
export const TAU = Math.PI * 2;
export const JOINT = L.pipeJointLength;
export const STAND = JOINT * L.standJoints;
export const STUMP_Y = L.rotaryTopY + L.stickup;            // top of the box tool joint held in the slips
export const SAVER = L.saverSubLength;
export const Q_SLIPS = STUMP_Y + SAVER;                     // hoist position with the string made up and the connection at slip height
export const LINK_DROP = L.linkLength - L.linkPivotLocal;   // elevator seat below the quill with links vertical
export const Q_TRIP_LATCH = STUMP_Y - L.elevatorSeat + LINK_DROP;
export const DRILL_TILT = L.drillDownTiltDeg * DEG;
export const PICK_TILT = L.pickupTiltDeg * DEG;
export const BACK_TILT = L.backTiltDeg * DEG;
export const SLOT_COUNT = L.setbackXs.length * L.setbackZs.length;
export const MOUSE_Z = L.mousehole[2];
export const MOUSE_TILT = Math.asin(MOUSE_Z / L.linkLength);   // link tilt that puts the elevator over the mousehole
export const MOUSE_TOP_Y = STUMP_Y;                            // box of the joint landed in the mousehole: same working height as the stump

export const smooth = (k) => k * k * (3 - 2 * k);
export const lerp = (a, b, k) => a + (b - a) * k;
export const clamp01 = (k) => Math.min(1, Math.max(0, k));

/* ------------------------------------------------------------------ */
/*  Elevator / links                                                   */
/* ------------------------------------------------------------------ */
/** Elevator seat point for hoist position q and link tilt (rad, + toward the V-door). */
export function elevatorPoint(q, tilt, out = new THREE.Vector3()) {
  return out.set(0, q + L.linkPivotLocal - L.linkLength * Math.cos(tilt), L.linkLength * Math.sin(tilt));
}

/** Minimum forward link tilt that keeps the elevator above the rotary table at hoist position q. */
export function linkTiltMin(q) {
  const c = (q + L.linkPivotLocal - L.elevatorMinY) / L.linkLength;
  if (c >= 1) return 0;
  return Math.acos(Math.max(-1, c));
}

/** Hoist position that puts the elevator seat at height y for a given tilt. */
export function qForElevatorY(y, tilt) {
  return y - L.linkPivotLocal + L.linkLength * Math.cos(tilt);
}

/* ------------------------------------------------------------------ */
/*  Setback slots                                                      */
/* ------------------------------------------------------------------ */
export function slotPos(i) {
  const nx = L.setbackXs.length;
  return { x: L.setbackXs[i % nx], z: L.setbackZs[Math.floor(i / nx)] };
}
/**
 * Pick order: front row before back row (a back-row stand would otherwise be
 * dragged through the front row), inner slots before outer. Racking back uses
 * the reverse order.
 */
export const PICK_ORDER = (() => {
  const nx = L.setbackXs.length;
  const order = [];
  for (let row = 0; row < L.setbackZs.length; row++) {
    const idx = Array.from({ length: nx }, (_, i) => row * nx + i);
    idx.sort((a, b) => Math.abs(L.setbackXs[a % nx]) - Math.abs(L.setbackXs[b % nx]) || L.setbackXs[b % nx] - L.setbackXs[a % nx]);
    order.push(...idx);
  }
  return order;
})();
export const RACK_ORDER = [...PICK_ORDER].reverse();

/** A slot is reachable when every slot in front of it (same column, rows nearer the well) is empty. */
export function slotReachable(s, i) {
  const nx = L.setbackXs.length;
  const col = i % nx;
  for (let row = 0; row < Math.floor(i / nx); row++) if (s.setback[row * nx + col]) return false;
  return true;
}
export function nextFullSlot(s) {
  return PICK_ORDER.find((i) => s.setback[i] && slotReachable(s, i)) ?? -1;
}
export function nextEmptySlot(s) {
  return RACK_ORDER.find((i) => !s.setback[i] && slotReachable(s, i)) ?? -1;
}

/* ------------------------------------------------------------------ */
/*  Pipe rack positions (shared by the rack mesh and the pickup logic)  */
/* ------------------------------------------------------------------ */
export function rackLayerY(k) {
  const pipeR = L.pipeOD / 2;
  return L.rackY + pipeR + k * (pipeR * 2 + 0.15);
}
export function rackPipeX(rack, i) {
  return L.rackXs[rack] - ((L.rackPerLayer - 1) * L.rackPitchX) / 2 + i * L.rackPitchX;
}
export function rackRowZ(j) {
  return L.rackZ0 + 0.05 + j * (JOINT + 0.1) + JOINT / 2;
}
/** Joints the catwalk can take, nearest the catwalk first (top layer of the first rack, rows 0 and 1). */
export const RACK_PICK_LIST = (() => {
  const list = [];
  for (let j = 0; j < 2; j++) for (let i = 0; i < L.rackPerLayer; i++) {
    list.push({ rack: 0, layer: L.rackLayers - 1, i, j, x: rackPipeX(0, i), y: rackLayerY(L.rackLayers - 1), zc: rackRowZ(j) });
  }
  return list;
})();

/* ------------------------------------------------------------------ */
/*  Catwalk trough kinematics                                          */
/* ------------------------------------------------------------------ */
/**
 * Trough pose for raise progress k in [0,1]. First 60 %: the rig end lifts
 * (tail fixed) until the trough end is above deck height in front of the
 * V-door; last 40 %: the trough runs forward on its tail carriage so its end
 * reaches over the drill floor.
 */
export function troughFrame(k, out = { T: new THREE.Vector3(), u: new THREE.Vector3(), n: new THREE.Vector3(), alpha: 0 }) {
  const a = L.troughRaiseDeg * DEG * smooth(clamp01(k / 0.6));
  const tz = lerp(L.catwalkTailZ0, L.catwalkTailZ1, smooth(clamp01((k - 0.6) / 0.4)));
  out.alpha = a;
  out.T.set(0, L.catwalkTailY, tz);
  out.u.set(0, Math.sin(a), -Math.cos(a));     // along the trough toward the rig
  out.n.set(0, Math.cos(a), Math.sin(a));      // trough floor normal
  return out;
}
const _tf = { T: new THREE.Vector3(), u: new THREE.Vector3(), n: new THREE.Vector3(), alpha: 0 };
/** Point on the pipe axis lying in the trough, s metres from the tail. */
export function troughPoint(k, s, out = new THREE.Vector3()) {
  troughFrame(k, _tf);
  return out.copy(_tf.T).addScaledVector(_tf.u, s).addScaledVector(_tf.n, L.troughAxisOffset);
}

/** Pick-up geometry: trough distance of the elevator seat and the hoist position for the V-door pick. */
export const PICK = (() => {
  const f = troughFrame(1);
  const ez = L.linkLength * Math.sin(PICK_TILT);
  const sSeat = (f.T.z + L.troughAxisOffset * Math.sin(f.alpha) - ez) / Math.cos(f.alpha);
  const seat = troughPoint(1, sSeat);
  return {
    sSeat,
    sTop: sSeat + L.elevatorSeat,
    seat,
    q: qForElevatorY(seat.y, PICK_TILT),
    endPoint: troughPoint(1, L.troughLength),
  };
})();

/* ------------------------------------------------------------------ */
/*  Tubulars                                                           */
/* ------------------------------------------------------------------ */
/**
 * A handled tubular. `top` is the box end, `axis` the unit vector from the
 * box end toward the pin end, so bottom = top + len * axis.
 */
export function makeTubularState(len, top, axis) {
  return { len, top: top.clone(), axis: axis.clone().normalize(), spin: 0, attach: 'none', latched: false, slot: -1, rackIndex: -1 };
}
export function tubularBottom(t, out = new THREE.Vector3()) {
  return out.copy(t.top).addScaledVector(t.axis, t.len);
}
/** Pose of a tubular whose pin end rests at B and whose box end is at horizontal position (hx, hz). */
export function poseBottomFixed(t, B, hx, hz) {
  const dx = hx - B.x;
  const dz = hz - B.z;
  const h = Math.sqrt(Math.max(0, t.len * t.len - dx * dx - dz * dz));
  t.top.set(hx, B.y + h, hz);
  t.axis.set(B.x - hx, -h, B.z - hz).divideScalar(t.len);
  return t;
}

/* ------------------------------------------------------------------ */
/*  State                                                              */
/* ------------------------------------------------------------------ */
export function createState() {
  const setback = new Array(SLOT_COUNT).fill(true);
  // the two outer front-row slots start empty so a trip out can rack stands immediately
  const nx = L.setbackXs.length;
  for (let i = 0; i < nx; i++) if (Math.abs(L.setbackXs[i]) === Math.max(...L.setbackXs.map(Math.abs))) setback[i] = false;
  return {
    q: 20.0,                 // hoist position: quill-bottom elevation
    linkTilt: 0,             // rad, + toward V-door
    elevator: 0,             // 0 open .. 1 latched
    quillAngle: 0,
    rpm: 0,                  // actual quill RPM
    rpmSet: 120,             // driller set-point
    manualRotation: false,
    connected: true,         // string made up to the saver sub
    slips: 0,                // 0 pulled .. 1 set
    stringTopY: 20.0 - SAVER,
    stringSpin: 0,
    stringInElevator: false, // tripping: string hangs in the elevator
    pumpsOn: false,
    stand: null,
    single: null,
    build: null,             // joint or double standing in the mousehole while a stand is built
    catwalk: 0,              // trough raise progress 0..1
    skateS: 6,               // skate position along the trough (from tail)
    roughneck: 0,            // 0 parked .. 1 at well centre
    roughneckSpin: 0,
    roughneckSwing: 0,       // 0 facing well centre .. 1 slewed and extended to the mousehole
    setback,
    rackPicked: 0,
    label: 'Idle',
    halt: null,
    connections: 0,
    standsRacked: 0,
    standsBuilt: 0,
    drilled: 0,
  };
}

const _E = new THREE.Vector3();
/**
 * Enforce derived relationships after every update:
 * link-tilt clearance, string position, tubulars hanging in the elevator.
 */
export function deriveState(s) {
  s.q = Math.min(L.hoistMax, Math.max(L.hoistMin, s.q));
  if (s.linkTilt < 0 && s.q < 30) s.linkTilt = 0;
  if (s.linkTilt >= 0) s.linkTilt = Math.max(s.linkTilt, linkTiltMin(s.q));
  elevatorPoint(s.q, s.linkTilt, _E);
  if (s.connected) s.stringTopY = s.q - SAVER;
  else if (s.stringInElevator) s.stringTopY = _E.y + L.elevatorSeat;
  for (const t of [s.stand, s.single, s.build]) {
    if (t && t.attach === 'elevator') t.top.copy(_E).addScaledVector(t.axis, -L.elevatorSeat);
    if (t && t.attach === 'trough') {
      troughPoint(s.catwalk, t.s, t.top);
      t.axis.copy(troughFrame(s.catwalk, _tf).u).negate();
    }
  }
  return s;
}

export function getElevatorPoint(s, out = new THREE.Vector3()) {
  return elevatorPoint(s.q, s.linkTilt, out);
}
