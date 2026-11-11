import * as THREE from 'three';
import { MATERIALS, registerMaterial } from '../materials.js';
import { LAYOUT } from '../layout.js';
import { box, cyl, cylX, cylZ, beamBetween, v3 } from '../geometry.js';
import { makeSign } from './signs.js';
import { terrainHeight, roadCenterX, GATE_Z, WIND, mulberry32 } from './terrain.js';

const paint = (color, roughness = 0.5, metalness = 0.15) => registerMaterial(new THREE.MeshStandardMaterial({ color, roughness, metalness }));
const M = {
  cabWhite: paint(0xf1f1ec, 0.35, 0.3),
  cabRed: paint(0xb3261e, 0.35, 0.3),
  chassis: paint(0x2b2f33, 0.7, 0.4),
  waterTank: paint(0xe8ebee, 0.45, 0.2),
  waterBlue: paint(0x1f6fb5, 0.5, 0.2),
  alu: paint(0xc9ced2, 0.22, 0.9),
  hazard: paint(0xe0541b, 0.5, 0.1),
  beacon: registerMaterial(new THREE.MeshStandardMaterial({ color: 0xffa21a, emissive: 0xff8a00, emissiveIntensity: 1, roughness: 0.3 })),
  hub: paint(0xb9bec2, 0.4, 0.8),
};

const LANE = 1.6;              // lane offset from the road centreline (keep left)
const ROUTE_START_Z = 480;
const DS = 0.5;                // route sample spacing, m
const TRUCK_HALF_WIDTH = 1.25;

/* ------------------------------------------------------------------ */
/*  Truck models. Local +Z is forward, origin on the ground under the  */
/*  middle of the wheelbase.                                           */
/* ------------------------------------------------------------------ */
function truckBase(cabMat) {
  const g = new THREE.Group();
  const wheels = [];
  for (const sx of [-1, 1]) g.add(box(0.14, 0.28, 8.8, M.chassis, sx * 0.45, 0.95, -0.2));
  // cab-over cab
  g.add(box(2.4, 2.0, 2.1, cabMat, 0, 2.15, 3.3));
  g.add(box(2.2, 0.85, 0.06, MATERIALS.glassDark, 0, 2.55, 4.36));
  for (const sx of [-1, 1]) {
    g.add(box(0.06, 0.7, 1.1, MATERIALS.glassDark, sx * 1.21, 2.55, 3.55));
    g.add(box(0.08, 0.35, 0.2, M.chassis, sx * 1.42, 2.6, 4.2));     // mirrors
    g.add(box(0.5, 0.5, 0.9, M.chassis, sx * 0.95, 0.75, 1.6));      // fuel tank / battery box
  }
  g.add(box(2.45, 0.5, 0.3, M.chassis, 0, 0.75, 4.45));              // bumper / bull bar
  g.add(box(2.3, 0.08, 0.08, MATERIALS.galvanised, 0, 1.3, 4.55));
  for (const sx of [-1, 1]) g.add(box(0.3, 0.16, 0.05, MATERIALS.lightFixture, sx * 0.9, 0.85, 4.61));
  g.add(cyl(0.07, 0.07, 2.6, MATERIALS.galvanised, 10, 1.0, 2.6, 2.1));   // exhaust stack
  const beacon = cyl(0.09, 0.09, 0.14, M.beacon, 10, 0, 3.24, 3.3);
  g.add(beacon);
  // axles: steer, tandem drive
  const axle = (z, dual) => {
    for (const sx of [-1, 1]) {
      const w = new THREE.Group();
      w.position.set(sx * (dual ? 0.98 : 1.05), 0.52, z);
      w.add(cylX(0.52, dual ? 0.62 : 0.34, MATERIALS.rubber, 18));
      w.add(cylX(0.26, (dual ? 0.62 : 0.34) + 0.02, M.hub, 8));
      w.add(box(0.03, 0.5, 0.1, M.chassis, sx * ((dual ? 0.31 : 0.17) + 0.012), 0, 0));   // spoke mark so wheel spin reads
      wheels.push(w);
      g.add(w);
    }
    g.add(box(1.9, 0.14, 0.14, M.chassis, 0, 0.52, z));
  };
  axle(3.1, false);
  axle(-1.9, true);
  axle(-3.25, true);
  for (const sx of [-1, 1]) g.add(box(0.66, 0.06, 2.9, M.chassis, sx * 0.98, 1.12, -2.58));   // mudguards
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { group: g, wheels, beacon };
}

function buildWaterTruck() {
  const t = truckBase(M.cabWhite);
  const g = t.group;
  const tank = cylZ(1.2, 5.9, M.waterTank, 28, 0, 2.3, -1.2);
  tank.scale.set(1.0, 1, 0.84);            // cylZ is rotated about X, so local Z scale squashes world Y
  g.add(tank);
  for (const z of [-3.6, -1.2, 1.2]) {
    const band = cylZ(1.215, 0.3, M.waterBlue, 28, 0, 2.3, z);
    band.scale.set(1.0, 1, 0.84);
    g.add(band);
  }
  g.add(box(0.7, 0.2, 0.7, M.chassis, 0, 3.38, -1.2));               // fill hatch
  g.add(box(2.0, 0.3, 5.8, M.chassis, 0, 1.25, -1.2));               // tank cradle
  for (const sx of [-1, 1]) {
    const s = makeSign([{ text: 'WATER', size: 150, color: '#ffffff' }], 2.2, 0.7, { bg: '#1f6fb5', border: '#ffffff' });
    s.rotation.y = (sx * Math.PI) / 2;
    s.position.set(sx * 1.215, 2.3, -1.2);
    g.add(s);
  }
  // rear spray bar with nozzles, pump box
  g.add(box(3.0, 0.1, 0.1, MATERIALS.galvanised, 0, 0.75, -4.55));
  for (let i = -3; i <= 3; i++) g.add(cyl(0.06, 0.09, 0.14, M.waterBlue, 8, i * 0.48, 0.66, -4.55));
  g.add(box(0.9, 0.6, 0.5, M.waterBlue, 0, 1.25, -4.3));
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { ...t, kind: 'water', name: 'Water truck', sprayBar: v3(0, 0.62, -4.6) };
}

function buildFuelTruck() {
  const t = truckBase(M.cabRed);
  const g = t.group;
  const tank = cylZ(1.15, 6.0, M.alu, 28, 0, 2.3, -1.25);
  tank.scale.set(1.0, 1, 0.9);
  g.add(tank);
  for (const z of [-4.2, 1.7]) {
    const cap = cylZ(1.16, 0.12, M.hazard, 28, 0, 2.3, z);
    cap.scale.set(1.0, 1, 0.9);
    g.add(cap);
  }
  g.add(box(2.0, 0.3, 5.9, M.chassis, 0, 1.25, -1.25));
  g.add(box(0.5, 0.1, 5.4, MATERIALS.galvanised, 0, 3.38, -1.25));    // top walkway
  for (const z of [-3, -1.25, 0.5]) g.add(cyl(0.3, 0.3, 0.14, M.chassis, 14, 0, 3.47, z));   // manways
  for (const sx of [-1, 1]) {
    const s = makeSign([{ text: 'DIESEL', size: 120, color: '#ffffff' }, { text: 'COMBUSTIBLE LIQUID', size: 44, color: '#ffffff' }], 2.4, 0.8, { bg: '#b3261e', border: '#ffffff' });
    s.rotation.y = (sx * Math.PI) / 2;
    s.position.set(sx * 1.16, 2.3, -1.25);
    g.add(s);
    g.add(box(0.5, 0.55, 1.4, M.alu, sx * 0.95, 0.85, -0.2));         // hose lockers
  }
  const placard = makeSign([{ text: '3', size: 150, color: '#ffffff' }], 0.5, 0.5, { width: 128, height: 128, bg: '#c81e1e', border: '#ffffff' });
  placard.rotation.y = Math.PI;
  placard.position.set(0, 1.9, -4.32);
  g.add(placard);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { ...t, kind: 'fuel', name: 'Fuel truck' };
}

/* ------------------------------------------------------------------ */
/*  Routes                                                             */
/* ------------------------------------------------------------------ */
const FUEL_STOP = v3(LAYOUT.fuelTank[0] - 9, 0, LAYOUT.fuelTank[2]);

/** Pad waypoints [x, z] between the inbound and outbound road lanes. */
const PAD_ROUTES = {
  // loop down the east side of the pad and back, spraying
  water: [[22.4, 45], [23.5, 38], [28, 27], [28.5, 8], [30.5, -2.5], [35, -7], [40.5, -4], [42.5, 5], [42.5, 26], [39.5, 34.5], [33, 39], [27.5, 41.6], [25.6, 45.6]],
  // east side, along the rear of the pad behind the mud system, up the west side to the fuel bund, turn, and back
  fuel: [[22.4, 45], [23.5, 38], [30, 31], [39, 26], [42.5, 16], [42.5, -33], [39.5, -39.3], [33, -40.5], [-44, -40.5], [-49.5, -39], [-51, -33], [-51, -12],
    [FUEL_STOP.x, FUEL_STOP.z], [-51, 10], [-50, 18], [-46.5, 23], [-42.5, 21], [-42.5, 15], [-47, 9.5], [-50.5, 3], [-51, -6], [-51, -33], [-49.5, -39], [-44, -40.5],
    [33, -40.5], [39.5, -39.3], [42.5, -33], [42.5, 16], [40, 25], [33, 33.5], [27.5, 40], [25.6, 45.6]],
};

function buildRoute(kind) {
  const pts = [];
  for (let z = ROUTE_START_Z; z > GATE_Z + 10; z -= 14) pts.push(v3(roadCenterX(z) - LANE, 0, z));
  for (const [x, z] of PAD_ROUTES[kind]) pts.push(v3(x, 0, z));
  for (let z = GATE_Z + 14; z <= ROUTE_START_Z; z += 14) pts.push(v3(roadCenterX(z) + LANE, 0, z));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  curve.arcLengthDivisions = pts.length * 60;
  const length = curve.getLength();
  const n = Math.ceil(length / DS);
  const samples = curve.getSpacedPoints(n);
  const ds = length / n;

  // speed limit per sample: road speed, pad speed, cornering limit, then a braking pass
  const vmax = new Float32Array(n + 1);
  for (let i = 0; i <= n; i++) {
    const a = samples[Math.max(0, i - 6)];
    const b = samples[i];
    const c = samples[Math.min(n, i + 6)];
    const h1 = Math.atan2(b.x - a.x, b.z - a.z);
    const h2 = Math.atan2(c.x - b.x, c.z - b.z);
    let dh = Math.abs(h2 - h1);
    if (dh > Math.PI) dh = 2 * Math.PI - dh;
    const kappa = dh / (6 * ds);
    const base = THREE.MathUtils.lerp(5.5, 13, THREE.MathUtils.smoothstep(b.z, GATE_Z + 25, GATE_Z + 90));
    vmax[i] = Math.max(2.2, Math.min(base, kappa > 1e-4 ? Math.sqrt(1.5 / kappa) : 99));
  }
  const stops = [];
  if (kind === 'fuel') {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i <= n; i++) {
      const d = samples[i].distanceTo(FUEL_STOP);
      if (d < bestD - 1e-6) { bestD = d; best = i; }
      if (bestD < 0.5 && d > 3) break;      // first pass only
    }
    stops.push({ index: best, hold: 16 });
    vmax[best] = 0.35;
  }
  for (let i = n - 1; i >= 0; i--) vmax[i] = Math.min(vmax[i], Math.sqrt(vmax[i + 1] * vmax[i + 1] + 2 * 1.8 * ds));
  return { kind, samples, n, ds, length, vmax, stops };
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
function pointAt(route, s, out) {
  const f = THREE.MathUtils.clamp(s / route.ds, 0, route.n - 1e-6);
  const i = Math.floor(f);
  return out.copy(route.samples[i]).lerp(route.samples[i + 1], f - i);
}

/**
 * Minimum plan clearance between the truck body swept along the on-pad part of a
 * route and a list of obstacle boxes (THREE.Box3 in world space).
 */
export function routeClearance(route, boxes) {
  let min = Infinity;
  let where = null;
  const relevant = boxes.filter((b) => b.max.y > 0.45 && b.min.y < 3.6);
  for (let i = 8; i < route.n - 8; i += 2) {
    const c = route.samples[i];
    if (c.z > GATE_Z + 8) continue;
    const r = route.samples[i - 8];
    const f = route.samples[i + 8];
    for (const p of [r, c, f]) {
      for (const b of relevant) {
        const dx = Math.max(b.min.x - p.x, 0, p.x - b.max.x);
        const dz = Math.max(b.min.z - p.z, 0, p.z - b.max.z);
        const d = Math.hypot(dx, dz) - TRUCK_HALF_WIDTH;
        if (d < min) { min = d; where = [p.x, p.z]; }
      }
    }
  }
  return { min, where };
}

/* ------------------------------------------------------------------ */
/*  Traffic controller                                                 */
/* ------------------------------------------------------------------ */
export function buildTraffic(particles) {
  const group = new THREE.Group();
  group.name = 'SiteTraffic';
  const rnd = mulberry32(977);
  const routes = { water: buildRoute('water'), fuel: buildRoute('fuel') };
  const trucks = { water: buildWaterTruck(), fuel: buildFuelTruck() };
  for (const t of Object.values(trucks)) {
    t.group.visible = false;
    group.add(t.group);
  }

  /* ---- worn wheel tracks on the pad along both routes ---- */
  {
    const pos = [];
    const idx = [];
    const addStrip = (route, off) => {
      let base = -1;
      for (let i = 0; i < route.n; i += 3) {
        const p = route.samples[i];
        if (p.z > GATE_Z - 0.5) { base = -1; continue; }
        const q = route.samples[Math.min(route.n, i + 3)];
        const len = Math.hypot(q.x - p.x, q.z - p.z) || 1;
        const nx = (q.z - p.z) / len;
        const nz = -(q.x - p.x) / len;
        const v = pos.length / 3;
        pos.push(p.x + nx * (off - 0.26), 0.035, p.z + nz * (off - 0.26), p.x + nx * (off + 0.26), 0.035, p.z + nz * (off + 0.26));
        if (base >= 0) idx.push(base, v, base + 1, base + 1, v, v + 1);
        base = v;
      }
    };
    for (const r of Object.values(routes)) for (const off of [-0.98, 0.98]) addStrip(r, off);
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geom.setIndex(idx);
    geom.computeVertexNormals();
    const tracks = new THREE.Mesh(geom, registerMaterial(new THREE.MeshStandardMaterial({ color: 0x6a5a48, roughness: 1, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })));
    tracks.name = 'WheelTracks';
    tracks.receiveShadow = true;
    group.add(tracks);
  }

  /* ---- wet ground left by the water truck: multiply-blended patches that dry out ---- */
  const WET_N = 220;
  const WET_LIFE = 80;
  const wetGeom = new THREE.CircleGeometry(1, 16);
  wetGeom.rotateX(-Math.PI / 2);
  const wetFade = new THREE.InstancedBufferAttribute(new Float32Array(WET_N), 1);
  wetGeom.setAttribute('aFade', wetFade);
  // soft-edged dark patches; per-instance fade so they dry out gradually
  const wetMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
    uniforms: { wetColor: { value: new THREE.Color(0x3b3229) } },
    vertexShader: `
      attribute float aFade;
      varying float vFade; varying vec2 vUv;
      void main() {
        vFade = aFade; vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 wetColor;
      varying float vFade; varying vec2 vUv;
      void main() {
        float r = length(vUv - 0.5) * 2.0;
        float a = smoothstep(1.0, 0.35, r) * vFade * 0.34;
        if (a < 0.003) discard;
        gl_FragColor = vec4(wetColor, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const wet = new THREE.InstancedMesh(wetGeom, wetMat, WET_N);
  wet.name = 'WetGround';
  wet.frustumCulled = false;
  wet.renderOrder = 2;
  const wetBorn = new Float32Array(WET_N).fill(-1e9);
  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < WET_N; i++) wet.setMatrixAt(i, zero);
  let wetCursor = 0;
  const wetCells = new Map();          // 4 m grid cell -> time the cell dries
  const cellKey = (x, z) => `${Math.round(x / 4)},${Math.round(z / 4)}`;
  const isWet = (x, z, t) => (wetCells.get(cellKey(x, z)) ?? -1) > t;
  group.add(wet);

  function layWet(x, z, heading, t) {
    const i = wetCursor;
    wetCursor = (wetCursor + 1) % WET_N;
    _q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, heading + (rnd() - 0.5) * 0.3);
    wet.setMatrixAt(i, _m.compose(_a.set(x + (rnd() - 0.5) * 0.5, 0.05, z + (rnd() - 0.5) * 0.5), _q, _b.set(3.1 + rnd() * 0.6, 1, 3.0 + rnd() * 0.8)));
    wet.instanceMatrix.needsUpdate = true;
    wetBorn[i] = t;
    for (const dx of [-2, 2]) wetCells.set(cellKey(x + dx, z), t + WET_LIFE * 0.8);
    wetCells.set(cellKey(x, z), t + WET_LIFE * 0.8);
  }

  /* ---- fuel transfer hose, shown while unloading ---- */
  const hose = new THREE.Group();
  hose.name = 'FuelHose';
  const [fx, , fz] = LAYOUT.fuelTank;
  hose.add(beamBetween(v3(FUEL_STOP.x + 1.2, 0.9, fz - 0.4), v3(fx - 4.2, 0.12, fz - 1.2), 0.045, MATERIALS.hoseBlack));
  hose.add(beamBetween(v3(fx - 4.2, 0.12, fz - 1.2), v3(fx - 3.5, 0.75, fz - 1.5), 0.045, MATERIALS.hoseBlack));
  hose.add(beamBetween(v3(fx - 3.5, 0.75, fz - 1.5), v3(fx - 1.2, 1.3, fz - 1.8), 0.045, MATERIALS.hoseBlack));
  hose.visible = false;
  group.add(hose);

  const DUST_PAD = new THREE.Color(0xcdbb9f);
  const DUST_ROAD = new THREE.Color(0xc98e68);
  const SPRAY = new THREE.Color(0xdfeeff);

  const state = {
    enabled: true,
    active: null,            // { truck, route, s, v, hold, stopIdx, lastWet }
    nextKind: 'water',
    nextAt: 4,
    status: 'No vehicles on site',
    trips: 0,
  };

  function start(kind, t, near = false) {
    const route = routes[kind];
    const truck = trucks[kind];
    let s = 0;
    if (near) {
      // begin part-way down the road so the arrival is quick
      while (s < route.length && pointAt(route, s, _a).z > 215) s += 5;
    }
    state.active = { truck, route, s, v: route.vmax[Math.floor(s / route.ds)], hold: 0, stopIdx: 0, lastWet: -1e9, spin: 0 };
    truck.group.visible = true;
    state.status = `${truck.name} inbound`;
    place(state.active, 0, t);
  }

  /** Call a truck now. Returns false if one is already on site. */
  function call(kind, t) {
    if (state.active) return false;
    start(kind, t, true);
    return true;
  }

  const _front = new THREE.Vector3();
  const _rear = new THREE.Vector3();
  function place(a, dt, t) {
    const { truck, route } = a;
    pointAt(route, a.s + 3.1, _front);
    pointAt(route, a.s - 2.6, _rear);
    const heading = Math.atan2(_front.x - _rear.x, _front.z - _rear.z);
    const g = truck.group;
    g.position.set((_front.x + _rear.x) / 2, 0, (_front.z + _rear.z) / 2);
    // the wheelbase midpoint sits 0.25 m ahead of the model origin
    g.position.x -= Math.sin(heading) * 0.25;
    g.position.z -= Math.cos(heading) * 0.25;
    g.position.y = terrainHeight(g.position.x, g.position.z) + 0.02;
    g.rotation.y = heading;
    a.heading = heading;
    a.spin += (a.v * dt) / 0.52;
    for (const w of truck.wheels) w.rotation.x = a.spin;
    truck.beacon.material.emissiveIntensity = Math.sin(t * 9) > 0 ? 1.6 : 0.15;
  }

  function update(dt, t) {
    // dry out the wet patches
    let anyWet = false;
    for (let i = 0; i < WET_N; i++) {
      const age = t - wetBorn[i];
      if (age > WET_LIFE + 1) continue;
      anyWet = true;
      if (age >= WET_LIFE) {
        wet.setMatrixAt(i, zero);
        wet.instanceMatrix.needsUpdate = true;
        wetFade.array[i] = 0;
        wetFade.needsUpdate = true;
        wetBorn[i] = -1e9;
        continue;
      }
      wetFade.array[i] = Math.min(1, age / 0.8) * (1 - THREE.MathUtils.smoothstep(age, WET_LIFE * 0.45, WET_LIFE));
    }
    if (anyWet) wetFade.needsUpdate = true;

    const a = state.active;
    if (!a) {
      if (state.enabled && t >= state.nextAt) start(state.nextKind, t, state.trips === 0);
      return;
    }
    const { truck, route } = a;
    const i = Math.min(route.n, Math.floor(a.s / route.ds));
    const onPad = truck.group.position.z < GATE_Z - 1;

    if (a.hold > 0) {
      a.hold -= dt;
      a.v = 0;
      hose.visible = true;
      state.status = `${truck.name} unloading diesel (${Math.ceil(a.hold)} s)`;
      if (a.hold <= 0) hose.visible = false;
    } else {
      const target = route.vmax[i];
      a.v += THREE.MathUtils.clamp(target - a.v, -2.6 * dt, 1.1 * dt);
      a.v = Math.max(a.v, 0.3);
      a.s += a.v * dt;
      const stop = route.stops[a.stopIdx];
      if (stop && a.s >= stop.index * route.ds) {
        a.s = stop.index * route.ds;
        a.hold = stop.hold;
        a.stopIdx++;
      }
      if (truck.kind === 'water') state.status = onPad ? 'Water truck spraying for dust suppression' : a.s < route.length / 2 ? 'Water truck inbound' : 'Water truck leaving site';
      else state.status = a.stopIdx === 0 ? (onPad ? 'Fuel truck driving to the fuel tank' : 'Fuel truck inbound') : 'Fuel truck leaving site';
    }
    place(a, dt, t);

    const g = truck.group;
    const sin = Math.sin(a.heading);
    const cos = Math.cos(a.heading);
    const toWorld = (lx, lz, out) => out.set(g.position.x + cos * lx + sin * lz, 0, g.position.z - sin * lx + cos * lz);

    // water spray and wet trail (inside the pad only)
    const spraying = truck.kind === 'water' && onPad && a.v > 0.5;
    if (spraying) {
      const count = Math.round(110 * dt + rnd());
      for (let k = 0; k < count; k++) {
        const lx = (rnd() - 0.5) * 3.0;
        toWorld(lx, truck.sprayBar.z, _a);
        const out = lx * 1.6 + (rnd() - 0.5) * 1.2;
        const back = -(1.5 + rnd() * 2.5) + a.v;      // relative to the ground
        particles.emit(_a.x, truck.sprayBar.y, _a.z, cos * out + sin * back, 0.6 + rnd() * 1.6, -sin * out + cos * back, { life: 0.5 + rnd() * 0.35, size: 0.35 + rnd() * 0.3, grow: 2.2, alpha: 0.5, color: SPRAY, gravity: 7 });
      }
      if (rnd() < dt * 14) {
        toWorld((rnd() - 0.5) * 4, truck.sprayBar.z - 1.2, _a);
        particles.emit(_a.x, 0.5, _a.z, WIND.x * 1.2, 0.5, WIND.z * 1.2, { life: 1.8, size: 1.4, grow: 2.5, alpha: 0.16, color: SPRAY });
      }
      if (a.s - a.lastWet > 1.9) {
        a.lastWet = a.s;
        toWorld(0, truck.sprayBar.z - 1.6, _a);
        layWet(_a.x, _a.z, a.heading, t);
      }
    }

    // wheel dust: heavy on the dry road, light on gravel, almost none on wet ground or behind the spray bar
    if (a.v > 1) {
      const dry = spraying ? 0.06 : isWet(g.position.x, g.position.z, t) ? 0.1 : 1;
      const rate = a.v * (onPad ? 1.5 : 2.6) * dry;
      const count = Math.floor(rate * dt + rnd());
      for (let k = 0; k < count; k++) {
        toWorld((rnd() < 0.5 ? -1 : 1) * 1.0 + (rnd() - 0.5) * 0.4, -3.6 - rnd() * 1.5, _a);
        particles.emit(_a.x, terrainHeight(_a.x, _a.z) + 0.3, _a.z,
          WIND.x * 1.3 + sin * a.v * 0.15 + (rnd() - 0.5) * 0.8, 0.5 + rnd() * 0.9, WIND.z * 1.3 + cos * a.v * 0.15 + (rnd() - 0.5) * 0.8,
          { life: 3 + rnd() * 2.5, size: 1.1 + rnd() * 0.9, grow: 3.2 + (onPad ? 0 : 1.5), alpha: onPad ? 0.2 : 0.3, color: onPad ? DUST_PAD : DUST_ROAD });
      }
    }

    if (a.s >= route.length - 4) {
      truck.group.visible = false;
      state.active = null;
      state.trips++;
      state.nextKind = truck.kind === 'water' ? 'fuel' : 'water';
      state.nextAt = t + 45 + rnd() * 75;
      state.status = 'No vehicles on site';
    }
  }

  return { group, update, call, routes, trucks, state, fuelStop: FUEL_STOP };
}
