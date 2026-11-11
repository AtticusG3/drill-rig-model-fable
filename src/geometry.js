import * as THREE from 'three';
import { MATERIALS } from './materials.js';

/* ------------------------------------------------------------------ */
/*  Shared unit geometries                                            */
/*  Every structural member is a scaled/rotated copy of one of these, */
/*  so hundreds of beams share two GPU buffers.                       */
/* ------------------------------------------------------------------ */
export const UNIT_CYL = new THREE.CylinderGeometry(1, 1, 1, 10, 1);   // radius 1, height 1 along +Y, centred
export const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_SPHERE = new THREE.SphereGeometry(1, 10, 8);

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();

/**
 * Compute the rigid transform that maps the unit Y-aligned member onto the
 * segment A→B with the given radius (half-thickness).
 * Returns the matrix (also writes to `out` if provided).
 */
export function beamMatrix(a, b, radius, out = _m) {
  _dir.subVectors(b, a);
  const len = _dir.length();
  if (len < 1e-6) {
    out.identity();
    return out;
  }
  _mid.addVectors(a, b).multiplyScalar(0.5);
  _dir.divideScalar(len);
  _q.setFromUnitVectors(Y_AXIS, _dir);        // rotation taking +Y onto the member direction
  _s.set(radius, len, radius);
  out.compose(_mid, _q, _s);
  return out;
}

/** Position / orient an existing beam mesh so it spans A→B. */
export function updateBeam(mesh, a, b, radius = mesh.scale.x) {
  _dir.subVectors(b, a);
  const len = _dir.length();
  if (len < 1e-6) return;
  mesh.position.addVectors(a, b).multiplyScalar(0.5);
  _dir.divideScalar(len);
  mesh.quaternion.setFromUnitVectors(Y_AXIS, _dir);
  mesh.scale.set(radius, len, radius);
}

/** A single beam mesh between two world points (shape: 'cyl' | 'box'). */
export function beamBetween(a, b, radius, material, shape = 'cyl') {
  const mesh = new THREE.Mesh(shape === 'box' ? UNIT_BOX : UNIT_CYL, material);
  updateBeam(mesh, a, b, radius);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Collects many beams of one material/shape and emits a single InstancedMesh.
 */
export class BeamBatch {
  constructor(material, shape = 'cyl') {
    this.material = material;
    this.shape = shape;
    this.items = [];
  }
  add(a, b, radius) {
    this.items.push({ a: a.clone(), b: b.clone(), r: radius });
    return this;
  }
  get count() {
    return this.items.length;
  }
  build({ castShadow = true, receiveShadow = true } = {}) {
    const geom = this.shape === 'box' ? UNIT_BOX : UNIT_CYL;
    const mesh = new THREE.InstancedMesh(geom, this.material, Math.max(1, this.items.length));
    this.items.forEach((it, i) => mesh.setMatrixAt(i, beamMatrix(it.a, it.b, it.r)));
    mesh.count = this.items.length;           // an empty batch renders nothing
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    mesh.frustumCulled = false;
    return mesh;
  }
}

/* ------------------------------------------------------------------ */
/*  Convenience primitives                                            */
/* ------------------------------------------------------------------ */
export function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function cyl(rTop, rBot, h, material, segments = 24, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, segments), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function sphere(r, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(UNIT_SPHERE, material);
  m.scale.setScalar(r);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

/** A horizontal cylinder whose axis runs along X (rotated from the Y default). */
export function cylX(r, length, material, segments = 24, x = 0, y = 0, z = 0) {
  const m = cyl(r, r, length, material, segments, x, y, z);
  m.rotation.z = Math.PI / 2;
  return m;
}

/** A horizontal cylinder whose axis runs along Z. */
export function cylZ(r, length, material, segments = 24, x = 0, y = 0, z = 0) {
  const m = cyl(r, r, length, material, segments, x, y, z);
  m.rotation.x = Math.PI / 2;
  return m;
}

/* ------------------------------------------------------------------ */
/*  Truss generator                                                   */
/* ------------------------------------------------------------------ */
/**
 * Adds a truss bay between two rings of four corner nodes.
 * Node order (viewed from above): 0:(-x,-z) 1:(+x,-z) 2:(+x,+z) 3:(-x,+z)
 * Face i spans corner i → corner (i+1)%4.  Face indices: 0 = -Z (rear),
 * 1 = +X, 2 = +Z (front), 3 = -X.
 *
 * @param {object} batches   { legs: BeamBatch, horiz: BeamBatch, diag: BeamBatch }
 * @param {THREE.Vector3[]} bottom  four nodes
 * @param {THREE.Vector3[]} top     four nodes
 * @param {object} opts  { legR, horizR, diagR, faces:[bool x4], legs:bool, topRing:bool, xBrace:bool }
 */
export function addTrussBay(batches, bottom, top, opts = {}) {
  const {
    legR = 0.18,
    horizR = 0.08,
    diagR = 0.06,
    faces = [true, true, true, true],
    legs = true,
    topRing = true,
    xBrace = true,
  } = opts;

  if (legs) for (let i = 0; i < 4; i++) batches.legs.add(bottom[i], top[i], legR);
  if (topRing) for (let i = 0; i < 4; i++) batches.horiz.add(top[i], top[(i + 1) % 4], horizR);

  for (let i = 0; i < 4; i++) {
    if (!faces[i]) continue;
    const j = (i + 1) % 4;
    // Diagonals genuinely connect the structural nodes of this face
    batches.diag.add(bottom[i], top[j], diagR);
    if (xBrace) batches.diag.add(bottom[j], top[i], diagR);
  }
}

/** Four corner nodes of a rectangle centred on (cx, cz) at height y. */
export function ringNodes(cx, y, cz, halfX, halfZ) {
  return [
    new THREE.Vector3(cx - halfX, y, cz - halfZ),
    new THREE.Vector3(cx + halfX, y, cz - halfZ),
    new THREE.Vector3(cx + halfX, y, cz + halfZ),
    new THREE.Vector3(cx - halfX, y, cz + halfZ),
  ];
}

/* ------------------------------------------------------------------ */
/*  Pipe generator                                                    */
/* ------------------------------------------------------------------ */
/**
 * A drill-pipe section along local +Y, centred at the origin.
 * Tool joints (box + pin) are enlarged cylinders at each end and at every
 * `jointSpacing` metres along the body.
 */
export function makePipeSection(length, od, tjOD, { jointSpacing = 9.5, tjLength = 0.45, bodyMat = MATERIALS.drillPipe, tjMat = MATERIALS.toolJoint } = {}) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(od / 2, od / 2, length, 12), bodyMat);
  body.castShadow = true;
  g.add(body);

  const tjGeom = new THREE.CylinderGeometry(tjOD / 2, tjOD / 2, tjLength, 12);
  const positions = [];
  for (let y = -length / 2; y <= length / 2 + 1e-3; y += jointSpacing) positions.push(y);
  if (positions[positions.length - 1] < length / 2 - 0.5) positions.push(length / 2);
  for (const y of positions) {
    const tj = new THREE.Mesh(tjGeom, tjMat);
    tj.position.y = THREE.MathUtils.clamp(y, -length / 2 + tjLength / 2, length / 2 - tjLength / 2);
    tj.castShadow = true;
    g.add(tj);
  }
  return g;
}

const _tubularGeomCache = new Map();
function cachedCyl(r, h, seg) {
  const key = `${r.toFixed(4)}|${h.toFixed(4)}|${seg}`;
  if (!_tubularGeomCache.has(key)) _tubularGeomCache.set(key, new THREE.CylinderGeometry(r, r, h, seg));
  return _tubularGeomCache.get(key);
}

/**
 * Tubular (single, stand or string) with its origin at the box end and the
 * pipe extending down local -Y. Every joint has a box tool joint at its top
 * and a pin tool joint at its bottom, so a connection shows as one long
 * upset (pin + box) and the top of the tubular shows a box ready to receive
 * a pin or the saver sub. Geometries are cached by length.
 */
export function makeTubular(length, { jointSpacing = 9.5, od = 0.127, tjOD = 0.168, bodyMat = MATERIALS.drillPipe, tjMat = MATERIALS.toolJoint, castShadow = true } = {}) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(cachedCyl(od / 2, length, 16), bodyMat);
  body.position.y = -length / 2;
  body.castShadow = castShadow;
  g.add(body);
  const boxLen = 0.42;
  const pinLen = 0.3;
  const nJoints = Math.max(1, Math.round(length / jointSpacing));
  const boxGeom = cachedCyl(tjOD / 2, boxLen, 16);
  const pinGeom = cachedCyl(tjOD / 2, pinLen, 16);
  const pinNoseGeom = new THREE.CylinderGeometry(0.06, 0.075, 0.12, 12);
  for (let j = 0; j < nJoints; j++) {
    const top = -j * jointSpacing;
    const box = new THREE.Mesh(boxGeom, tjMat);
    box.position.y = top - boxLen / 2;
    box.castShadow = castShadow;
    g.add(box);
    const bottom = Math.max(-length, top - jointSpacing);
    const pin = new THREE.Mesh(pinGeom, tjMat);
    pin.position.y = bottom + pinLen / 2;
    pin.castShadow = castShadow;
    g.add(pin);
  }
  // pin nose (threaded end) at the very bottom
  const nose = new THREE.Mesh(pinNoseGeom, MATERIALS.toolJoint);
  nose.position.y = -length - 0.06;
  g.add(nose);
  g.userData.length = length;
  return g;
}

const _NEG_Y = new THREE.Vector3(0, -1, 0);
const _qAlign = new THREE.Quaternion();
const _qSpin = new THREE.Quaternion();
/** Place a tubular built by makeTubular from a top point, unit axis (top -> pin) and spin angle. */
export function poseTubular(obj, top, axis, spin = 0) {
  obj.position.copy(top);
  _qAlign.setFromUnitVectors(_NEG_Y, axis);
  _qSpin.setFromAxisAngle(Y_AXIS, spin);
  obj.quaternion.copy(_qAlign).multiply(_qSpin);
}

/* ------------------------------------------------------------------ */
/*  Equipment skid generator                                          */
/* ------------------------------------------------------------------ */
/** Steel skid frame: two longitudinal beams along X, cross members, lifting lugs. Origin at base centre. */
export function makeSkid(length, width, height = 0.4, material = MATERIALS.subSteel) {
  const g = new THREE.Group();
  const hw = width / 2;
  for (const z of [-hw + height / 2, hw - height / 2]) {
    g.add(box(length, height, height, material, 0, height / 2, z));
  }
  const n = Math.max(2, Math.round(length / 3));
  for (let i = 0; i <= n; i++) {
    const x = -length / 2 + height / 2 + (length - height) * (i / n);
    g.add(box(height * 0.7, height * 0.8, width - height * 2, material, x, height / 2, 0));
  }
  // lifting lugs
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    g.add(box(0.3, 0.3, 0.06, material, sx * (length / 2 - 0.5), height + 0.1, sz * (hw + 0.03)));
  }
  return g;
}

/* ------------------------------------------------------------------ */
/*  Stair generator                                                   */
/* ------------------------------------------------------------------ */
/**
 * Straight stair flight from `bottom` to `top` (world points on the stair
 * centreline at tread level). Treads stay horizontal; stringers and rails are
 * beams between their true endpoints.
 */
export function makeStairs(bottom, top, width = 1.2, { treadMat = MATERIALS.grating, stringerMat = MATERIALS.galvanised, railMat = MATERIALS.safetyYellow, riserHeight = 0.2, railHeight = 1.0, landing = 0 } = {}) {
  const g = new THREE.Group();
  const rise = top.y - bottom.y;
  const horiz = new THREE.Vector3(top.x - bottom.x, 0, top.z - bottom.z);
  const run = horiz.length();
  const heading = horiz.clone().normalize();
  const yaw = Math.atan2(heading.x, heading.z);
  const side = new THREE.Vector3(heading.z, 0, -heading.x); // perpendicular in plan
  const n = Math.max(1, Math.round(rise / riserHeight));
  const treadDepth = run / n;

  // treads (horizontal)
  const treadGeom = new THREE.BoxGeometry(width, 0.05, treadDepth * 1.05);
  for (let i = 1; i <= n; i++) {
    const t = new THREE.Mesh(treadGeom, treadMat);
    const p = bottom.clone().addScaledVector(heading, treadDepth * (i - 0.5));
    p.y = bottom.y + (rise * i) / n;
    t.position.copy(p);
    t.rotation.y = yaw;
    t.castShadow = true;
    t.receiveShadow = true;
    g.add(t);
  }

  // stringers + handrails, both sides
  for (const s of [-1, 1]) {
    const off = side.clone().multiplyScalar((s * width) / 2);
    const a = bottom.clone().add(off);
    const b = top.clone().add(off);
    a.y -= 0.1; b.y -= 0.1;
    g.add(beamBetween(a, b, 0.09, stringerMat, 'box'));

    const ra = a.clone(); ra.y += railHeight + 0.1;
    const rb = b.clone(); rb.y += railHeight + 0.1;
    g.add(beamBetween(ra, rb, 0.025, railMat));
    const ma = a.clone(); ma.y += railHeight / 2 + 0.1;
    const mb = b.clone(); mb.y += railHeight / 2 + 0.1;
    g.add(beamBetween(ma, mb, 0.02, railMat));

    const posts = Math.max(2, Math.round(run / 1.5));
    for (let i = 0; i <= posts; i++) {
      const f = i / posts;
      const pa = a.clone().lerp(b, f);
      const pb = pa.clone(); pb.y += railHeight + 0.1;
      g.add(beamBetween(pa, pb, 0.025, railMat));
    }
  }

  // optional landing platform at the top
  if (landing > 0) {
    const lp = top.clone().addScaledVector(heading, landing / 2);
    const land = new THREE.Mesh(new THREE.BoxGeometry(width, 0.08, landing), treadMat);
    land.position.set(lp.x, top.y - 0.04, lp.z);
    land.rotation.y = yaw;
    land.castShadow = land.receiveShadow = true;
    g.add(land);
  }
  return g;
}

/* ------------------------------------------------------------------ */
/*  Rail generator                                                    */
/* ------------------------------------------------------------------ */
/**
 * Safety railing along a polyline of points at platform level.
 * Posts at each vertex and every `postSpacing`, top rail, mid rail, toe board.
 */
export function makeRailing(points, { height = 1.1, postSpacing = 1.6, closed = false, toeBoard = true, material = MATERIALS.safetyYellow, postR = 0.025, railR = 0.022 } = {}) {
  const g = new THREE.Group();
  const posts = new BeamBatch(material, 'cyl');
  const rails = new BeamBatch(material, 'cyl');
  const pts = closed ? [...points, points[0]] : points;
  const up = new THREE.Vector3(0, height, 0);
  const mid = new THREE.Vector3(0, height * 0.5, 0);

  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const seg = b.clone().sub(a);
    const len = seg.length();
    const n = Math.max(1, Math.round(len / postSpacing));
    for (let k = 0; k <= n; k++) {
      if (k === n && i < pts.length - 2) continue; // shared with next segment's first post
      const p = a.clone().addScaledVector(seg, k / n);
      posts.add(p, p.clone().add(up), postR);
    }
    rails.add(a.clone().add(up), b.clone().add(up), railR);
    rails.add(a.clone().add(mid), b.clone().add(mid), railR);
    if (toeBoard) {
      const tb = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.15, len), material);
      tb.position.copy(a).add(b).multiplyScalar(0.5);
      tb.position.y += 0.075;
      tb.rotation.y = Math.atan2(seg.x, seg.z);
      tb.castShadow = true;
      g.add(tb);
    }
  }
  g.add(posts.build());
  g.add(rails.build());
  return g;
}

/* ------------------------------------------------------------------ */
/*  Hose generator                                                    */
/* ------------------------------------------------------------------ */
/**
 * Flexible hose hanging between two endpoints, rebuilt on demand.
 * The curve is a cubic Bezier whose control points sag below the endpoints
 * by an amount that grows as the endpoints move closer (fixed hose length).
 */
export class Hose {
  constructor(radius = 0.08, material = MATERIALS.hoseBlack, { segments = 40, hoseLength = 25, minSag = 1.5 } = {}) {
    this.radius = radius;
    this.material = material;
    this.segments = segments;
    this.hoseLength = hoseLength;
    this.minSag = minSag;
    this.a = new THREE.Vector3();
    this.b = new THREE.Vector3();
    this.curve = new THREE.CubicBezierCurve3(new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3());
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this._dirty = true;
  }

  /** Set endpoints (world space); geometry rebuilds only if they changed. */
  update(a, b) {
    if (!this._dirty && a.distanceToSquared(this.a) < 1e-8 && b.distanceToSquared(this.b) < 1e-8) return;
    this.a.copy(a);
    this.b.copy(b);
    const dist = a.distanceTo(b);
    const sag = Math.max(this.minSag, (this.hoseLength - dist) * 0.45);
    const c = this.curve;
    c.v0.copy(a);
    c.v3.copy(b);
    // leave the goosenecks heading up/outward then hang down
    c.v1.set(a.x + (b.x - a.x) * 0.15, a.y - sag, a.z + (b.z - a.z) * 0.15);
    c.v2.set(b.x - (b.x - a.x) * 0.15, b.y - sag, b.z - (b.z - a.z) * 0.15);
    const old = this.mesh.geometry;
    this.mesh.geometry = new THREE.TubeGeometry(c, this.segments, this.radius, 8, false);
    old.dispose();
    this._dirty = false;
  }

  /** Point along the hose (t in 0..1) for flow indicators. */
  pointAt(t, out) {
    return this.curve.getPoint(t, out);
  }
}

/* ------------------------------------------------------------------ */
/*  Rigid pipe run                                                    */
/* ------------------------------------------------------------------ */
/** Straight pipe segments through a list of points, with elbow spheres at corners. */
export function makePipeRun(points, radius, material = MATERIALS.pipeDarkGreen) {
  const g = new THREE.Group();
  const batch = new BeamBatch(material, 'cyl');
  for (let i = 0; i < points.length - 1; i++) batch.add(points[i], points[i + 1], radius);
  g.add(batch.build());
  for (let i = 1; i < points.length - 1; i++) g.add(sphere(radius * 1.05, material, points[i].x, points[i].y, points[i].z));
  g.userData.points = points.map((p) => p.clone());
  return g;
}

/** Build a CurvePath of straight segments for animating particles along a pipe run. */
export function polylineCurve(points) {
  const path = new THREE.CurvePath();
  for (let i = 0; i < points.length - 1; i++) path.add(new THREE.LineCurve3(points[i], points[i + 1]));
  return path;
}

/** Ladder between two heights at (x, z), rungs facing +Z by default. */
export function makeLadder(x, y0, y1, z, { width = 0.45, material = MATERIALS.galvanised, rotationY = 0 } = {}) {
  const g = new THREE.Group();
  const h = y1 - y0;
  const rails = new BeamBatch(material, 'cyl');
  for (const s of [-1, 1]) rails.add(new THREE.Vector3(s * width / 2, 0, 0), new THREE.Vector3(s * width / 2, h, 0), 0.02);
  const n = Math.floor(h / 0.3);
  for (let i = 1; i <= n; i++) rails.add(new THREE.Vector3(-width / 2, i * 0.3, 0), new THREE.Vector3(width / 2, i * 0.3, 0), 0.015);
  g.add(rails.build({ castShadow: false }));
  g.position.set(x, y0, z);
  g.rotation.y = rotationY;
  return g;
}

export function v3(x, y, z) {
  return new THREE.Vector3(x, y, z);
}
