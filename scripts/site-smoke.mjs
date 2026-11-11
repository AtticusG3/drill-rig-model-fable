// Headless smoke test: builds the whole scene with DOM stubs, runs the site life for a few
// simulated minutes (trucks, livestock, tumbleweeds), then runs all start-up checks.
// Usage: npm run smoke
import * as THREE from 'three';
const grad = { addColorStop() {} };
const ctxStub = new Proxy({}, {
  get(t, k) {
    if (k === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
    if (k === 'measureText') return () => ({ width: 10 });
    if (k in t) return t[k];
    return () => {};
  },
  set(t, k, v) { t[k] = v; return true; },
});
function makeEl(tag) {
  return { tagName: tag, style: {}, className: '', textContent: '', innerHTML: '', children: [], width: 0, height: 0,
    getContext() { return ctxStub; }, appendChild(c) { this.children.push(c); return c; }, append(...c) { this.children.push(...c); },
    addEventListener() {}, setAttribute() {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } } };
}
globalThis.document = { createElement: makeEl, createElementNS: makeEl, getElementById: makeEl, body: makeEl('body'), createTextNode: (t) => ({ text: t }) };
globalThis.window = { innerWidth: 1600, innerHeight: 900, devicePixelRatio: 1, addEventListener() {} };
const imp = (p) => import(new URL(p, import.meta.url));
const { buildMast } = await imp('../src/rig/mast.js');
const { buildSubstructure } = await imp('../src/rig/substructure.js');
const { buildHoistingAssembly } = await imp('../src/rig/topDrive.js');
const { buildDrawworks } = await imp('../src/rig/drawworks.js');
const { buildPipeHandling } = await imp('../src/rig/pipeHandling.js');
const { buildWellControl } = await imp('../src/rig/wellControl.js');
const { buildMudSystem } = await imp('../src/rig/mudSystem.js');
const { buildAuxiliary } = await imp('../src/rig/auxiliary.js');
const { buildThirdParty } = await imp('../src/rig/thirdParty.js');
const { buildDrillString } = await imp('../src/rig/drillString.js');
const { buildFloorEquipment } = await imp('../src/rig/floorEquipment.js');
const { buildEnvironment, makeSkyEnvScene } = await imp('../src/environment.js');
const { ParticleSystem } = await imp('../src/site/particles.js');
const { buildTraffic } = await imp('../src/site/vehicles.js');
const { buildWildlife } = await imp('../src/site/wildlife.js');
const { RigAnimator } = await imp('../src/animations.js');
const { runValidation } = await imp('../src/validation.js');
const { createLabels } = await imp('../src/labels.js');
const { insidePad, nearRoad } = await imp('../src/site/terrain.js');

const scene = new THREE.Scene();
const env = buildEnvironment();
scene.add(env.group);
makeSkyEnvScene();
const mast = buildMast(), sub = buildSubstructure(), hoist = buildHoistingAssembly(mast), drawworks = buildDrawworks(mast);
const bop = buildWellControl(), pipe = buildPipeHandling(), mud = buildMudSystem(hoist, bop), aux = buildAuxiliary(), string = buildDrillString(), floor = buildFloorEquipment();
const thirdParty = buildThirdParty();
const rigGroup = new THREE.Group();
rigGroup.add(mast.group, sub.group, floor.group, hoist.group, hoist.linkGroup, hoist.lines, hoist.serviceLoop.mesh, string.group, drawworks.group, drawworks.fastLine, bop.group);
scene.add(rigGroup, pipe.group, mud.group, aux.group, thirdParty.group);
const particles = new ParticleSystem(900);
const traffic = buildTraffic(particles);
const wildlife = buildWildlife(particles);
scene.add(traffic.group, wildlife.group, particles.points);
createLabels(scene, hoist);
const site = { enabled: true, time: 0 };
const rig = { scene, mast, sub, hoist, drawworks, pipe, mud, bop, aux, string, floor, thirdParty, traffic, wildlife, env, site, obstacleRoots: [rigGroup, pipe.group, mud.group, aux.group, thirdParty.group] };
const animator = new RigAnimator(rig); rig.animator = animator;

// run 12 simulated minutes of site life at 30 Hz
let lastStatus = '';
const seen = new Set();
let maxLive = 0, wetMax = 0, bad = 0;
const dt = 1 / 30;
let minHerdPad = Infinity;
for (let i = 0; i < 12 * 60 * 30; i++) {
  site.time += dt;
  env.update(dt, site.time);
  thirdParty.update(dt, site.time);
  traffic.update(dt, site.time);
  wildlife.update(dt, site.time);
  particles.update(dt);
  maxLive = Math.max(maxLive, particles.live);
  const st = traffic.state.status.replace(/\(\d+ s\)/, '');
  if (st !== lastStatus) { lastStatus = st; if (!seen.has(st)) { seen.add(st); console.log(`t=${site.time.toFixed(0)}s  ${st}`); } }
  if (i % 30 === 0) {
    for (const h of wildlife.herds) for (const a of h.animals) {
      if (!Number.isFinite(a.x + a.z + a.group.position.y)) bad++;
      if (insidePad(a.x, a.z, 4) || nearRoad(a.x, a.z, 1)) bad++;
    }
    for (const t of Object.values(traffic.trucks)) if (!Number.isFinite(t.group.position.x + t.group.position.z + t.group.rotation.y)) bad++;
  }
}
console.log('trips completed:', traffic.state.trips, '| max live particles:', maxLive, '| bad samples:', bad);
for (const r of Object.values(traffic.routes)) console.log(r.kind, 'route length', r.length.toFixed(0), 'm, stops', r.stops.length);
const results = runValidation(rig);
const failed = results.filter((r) => !r.pass);
for (const r of results) console.log(r.pass ? 'PASS' : 'FAIL', r.name, '—', r.detail);
process.exit(failed.length || bad ? 1 : 0);
