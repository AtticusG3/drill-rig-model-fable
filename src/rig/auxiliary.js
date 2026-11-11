import * as THREE from 'three';
import { MATERIALS } from '../materials.js';
import { LAYOUT } from '../layout.js';
import { box, cyl, cylZ, BeamBatch, addTrussBay, ringNodes, makeStairs, makeRailing, v3 } from '../geometry.js';

/** Shipping-container style building with corrugation ribs, doors and optional stacks/vents. */
function container(length, width, height, material, { ribs = true } = {}) {
  const g = new THREE.Group();
  g.add(box(length, height, width, material, 0, height / 2 + 0.15, 0));
  g.add(box(length, 0.15, width, MATERIALS.subSteel, 0, 0.075, 0));                 // base frame
  if (ribs) {
    for (let x = -length / 2 + 0.6; x < length / 2; x += 0.6) {
      for (const sz of [-1, 1]) g.add(box(0.08, height - 0.3, 0.06, material, x, height / 2 + 0.15, sz * (width / 2 + 0.02)));
    }
  }
  for (const sx of [-1, 1]) g.add(box(0.06, height - 0.4, width - 0.3, MATERIALS.subSteel, sx * (length / 2 + 0.01), height / 2 + 0.15, 0));   // end doors
  return g;
}

export function buildAuxiliary() {
  const L = LAYOUT;
  const group = new THREE.Group();
  group.name = 'Auxiliary';

  /* ---- Electrical power: three generator containers with exhaust stacks, radiators and vents ---- */
  const gens = new THREE.Group();
  gens.name = 'Generators';
  L.generatorZs.forEach((z) => {
    const c = container(12, 3, 3, MATERIALS.containerWhite);
    c.position.set(L.generatorX, 0.02, z);
    // exhaust stack with rain cap
    c.add(cyl(0.22, 0.22, 2.6, MATERIALS.motorGrey, 14, -4.5, 3.15 + 1.3, 0.6));
    c.add(cyl(0.35, 0.22, 0.3, MATERIALS.motorGrey, 14, -4.5, 3.15 + 2.75, 0.6));
    // radiator / cooling module on the roof with fan rings
    c.add(box(3.0, 0.8, 2.6, MATERIALS.motorGrey, 3.5, 3.15 + 0.4, 0));
    for (const fx of [2.8, 4.2]) c.add(cyl(0.55, 0.55, 0.1, MATERIALS.subSteel, 20, fx, 3.15 + 0.85, 0));
    // louvre vents on the side walls
    for (const sz of [-1, 1]) for (const vx of [-2.5, 0, 2.5]) c.add(box(1.6, 1.2, 0.06, MATERIALS.subSteelLight, vx, 1.9, sz * 1.54));
    gens.add(c);
  });
  group.add(gens);

  // power distribution (VFD / SCR) house, long axis along Z, with transformer beside it
  const ph = container(10, 3.2, 3, MATERIALS.containerWhite, { ribs: false });
  ph.rotation.y = Math.PI / 2;
  ph.position.set(L.powerHouse[0], 0.02, L.powerHouse[2]);
  ph.name = 'PowerHouse';
  group.add(ph);
  group.add(box(2.2, 2.0, 1.8, MATERIALS.motorGrey, L.powerHouse[0] + 3.2, 1.0, L.powerHouse[2] - 6.5));   // transformer
  for (let k = 0; k < 6; k++) group.add(box(0.12, 1.6, 1.6, MATERIALS.motorGrey, L.powerHouse[0] + 2.2 + k * 0.4, 1.0, L.powerHouse[2] - 6.5));
  // steps to the power house door
  group.add(makeStairs(v3(L.powerHouse[0] + 2.6, 0.02, L.powerHouse[2] + 2), v3(L.powerHouse[0] + 1.7, 0.35, L.powerHouse[2] + 2), 1.0, { landing: 0.5 }));

  // cable trays: generators -> power house -> substructure (raised on short posts)
  const trays = new THREE.Group();
  trays.name = 'CableTrays';
  const trayY = 0.7;
  const trayRun = (a, b) => {
    const len = a.distanceTo(b);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const t = box(len, 0.1, 0.45, MATERIALS.galvanised, mid.x, mid.y, mid.z);
    t.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
    trays.add(t);
    const n = Math.max(1, Math.round(len / 3));
    for (let i = 0; i <= n; i++) {
      const p = a.clone().lerp(b, i / n);
      trays.add(box(0.1, trayY, 0.1, MATERIALS.galvanised, p.x, trayY / 2, p.z));
    }
  };
  trayRun(v3(L.generatorX + 6.2, trayY, L.generatorZs[0]), v3(L.powerHouse[0] - 1.8, trayY, L.generatorZs[0]));
  trayRun(v3(L.generatorX + 6.2, trayY, L.generatorZs[2]), v3(L.powerHouse[0] - 1.8, trayY, L.generatorZs[2]));
  trayRun(v3(L.powerHouse[0] - 1.8, trayY, L.generatorZs[0]), v3(L.powerHouse[0] - 1.8, trayY, L.generatorZs[2]));
  trayRun(v3(L.powerHouse[0] + 1.8, trayY, -1.0), v3(-8.2, trayY, -1.0));
  trayRun(v3(L.powerHouse[0] + 1.8, trayY, -4), v3(L.mudPumpXs[1], trayY, L.mudPumpZ - 5));   // to the mud pumps
  group.add(trays);

  /* ---- Fuel tank on saddles inside a containment bund ---- */
  const [fx, , fz] = L.fuelTank;
  const fuel = new THREE.Group();
  fuel.name = 'FuelTank';
  const tank = cylZ(1.5, 10, MATERIALS.containerWhite, 32, fx, 1.9, fz);
  fuel.add(tank);
  for (const dz of [-3.5, 3.5]) fuel.add(box(2.4, 0.6, 0.5, MATERIALS.subSteel, fx, 0.35, fz + dz));
  fuel.add(box(0.6, 0.5, 0.6, MATERIALS.subSteel, fx, 3.6, fz));                                    // manway
  fuel.add(cyl(0.08, 0.08, 1.2, MATERIALS.galvanised, 8, fx + 0.8, 3.9, fz - 2));                   // vent
  const bundW = 7, bundL = 13, bundH = 0.6;
  for (const sx of [-1, 1]) fuel.add(box(0.3, bundH, bundL, MATERIALS.concrete, fx + sx * bundW / 2, bundH / 2, fz));
  for (const sz of [-1, 1]) fuel.add(box(bundW, bundH, 0.3, MATERIALS.concrete, fx, bundH / 2, fz + sz * bundL / 2));
  fuel.add(makeStairs(v3(fx + bundW / 2 + 1.2, 0.02, fz + 5), v3(fx + bundW / 2, bundH, fz + 5), 0.9));
  group.add(fuel);

  /* ---- Toolpusher office / control building with steps ---- */
  const office = container(12, 3, 3, MATERIALS.containerWhite, { ribs: false });
  office.position.set(-26, 0.02, 24);
  office.name = 'Office';
  for (const wx of [-4, -1, 2, 5]) office.add(box(1.2, 1.0, 0.05, MATERIALS.glassDark, wx, 2.0, 1.53));
  office.add(box(0.9, 2.1, 0.05, MATERIALS.subSteel, 3.5, 1.2, 1.53));   // door
  group.add(office);
  group.add(makeStairs(v3(-22.5, 0.02, 27.6), v3(-22.5, 0.5, 26.0), 1.0, { landing: 0.6 }));

  /* ---- Tool storage area: containers, pipe tub and open tool crib ---- */
  const storage = new THREE.Group();
  storage.name = 'ToolStorage';
  const c1 = container(6, 2.5, 2.6, MATERIALS.containerBlue);
  c1.position.set(30, 0.02, -14);
  const c2 = container(6, 2.5, 2.6, MATERIALS.containerRust);
  c2.position.set(30, 0.02, -19);
  const c3 = container(12, 2.5, 2.6, MATERIALS.containerBlue);
  c3.rotation.y = Math.PI / 2;
  c3.position.set(38, 0.02, -16);
  storage.add(c1, c2, c3);
  // open tool crib: posts + roof
  for (const px of [25, 31]) for (const pz of [-28, -24]) storage.add(box(0.2, 3.0, 0.2, MATERIALS.galvanised, px, 1.5, pz));
  storage.add(box(7, 0.08, 5, MATERIALS.galvanised, 28, 3.0, -26));
  for (let i = 0; i < 5; i++) storage.add(box(1.2, 0.8 + (i % 2) * 0.4, 1.0, [MATERIALS.safetyRed, MATERIALS.containerBlue, MATERIALS.motorGrey][i % 3], 25.5 + i * 1.3, 0.4 + (i % 2) * 0.2, -26));
  // drill collar / HWDP tub
  for (let i = 0; i < 6; i++) storage.add(cylZ(0.1, 9.0, MATERIALS.drillCollar, 10, 20 + i * 0.25, 0.4, -24));
  for (const z of [-27.5, -20.5]) storage.add(box(2.0, 0.3, 0.3, MATERIALS.subSteel, 20.6, 0.15, z));
  group.add(storage);

  /* ---- Safety barriers along the road edge near the pipe racks ---- */
  for (let z = 10; z <= 42; z += 2.1) group.add(box(0.5, 0.8, 2.0, MATERIALS.concrete, 18.5, 0.4, z));

  /* ---- Floodlight towers at four corners of the pad ---- */
  const towers = new THREE.Group();
  towers.name = 'FloodlightTowers';
  for (const [tx, tz] of [[-46, -36], [46, -36], [-46, 36], [46, 36]]) {
    const legs = new BeamBatch(MATERIALS.galvanised, 'cyl');
    const horiz = new BeamBatch(MATERIALS.galvanised, 'cyl');
    const diag = new BeamBatch(MATERIALS.galvanised, 'cyl');
    const b = { legs, horiz, diag };
    const bays = 5;
    const bayH = 3.6;
    for (let i = 0; i < bays; i++) {
      const hw0 = THREE.MathUtils.lerp(0.9, 0.35, i / bays);
      const hw1 = THREE.MathUtils.lerp(0.9, 0.35, (i + 1) / bays);
      addTrussBay(b, ringNodes(tx, i * bayH, tz, hw0, hw0), ringNodes(tx, (i + 1) * bayH, tz, hw1, hw1), { legR: 0.05, horizR: 0.03, diagR: 0.02, xBrace: false });
    }
    towers.add(legs.build(), horiz.build({ castShadow: false }), diag.build({ castShadow: false }));
    for (const n of ringNodes(tx, 0, tz, 0.9, 0.9)) towers.add(box(0.5, 0.3, 0.5, MATERIALS.concrete, n.x, 0.15, n.z));
    // lamp bar facing the rig
    const topY = bays * bayH;
    towers.add(box(0.2, 0.2, 2.6, MATERIALS.galvanised, tx, topY + 0.4, tz));
    const toward = Math.atan2(-tx, -tz);
    for (const dz of [-1, -0.33, 0.33, 1]) {
      const lamp = box(0.5, 0.35, 0.5, MATERIALS.lightFixture, 0, 0, 0);
      lamp.position.set(tx, topY + 0.8, tz + dz);
      lamp.rotation.y = toward;
      towers.add(lamp);
    }
  }
  group.add(towers);

  /* ---- Perimeter fence with a gate gap at the access road ---- */
  const fence = new THREE.Group();
  fence.name = 'Fence';
  const posts = new BeamBatch(MATERIALS.fence, 'cyl');
  const wires = new BeamBatch(MATERIALS.fence, 'cyl');
  const hx = L.siteX / 2, hz = L.siteZ / 2;
  const roadX = 24, gateHalf = 6;
  const edges = [
    [v3(-hx, 0, -hz), v3(hx, 0, -hz)],
    [v3(hx, 0, -hz), v3(hx, 0, hz)],
    [v3(-hx, 0, hz), v3(-hx, 0, -hz)],
    [v3(-hx, 0, hz), v3(roadX - gateHalf, 0, hz)],
    [v3(roadX + gateHalf, 0, hz), v3(hx, 0, hz)],
  ];
  for (const [a, b] of edges) {
    const n = Math.max(1, Math.round(a.distanceTo(b) / 4));
    for (let i = 0; i <= n; i++) {
      const p = a.clone().lerp(b, i / n);
      posts.add(p, v3(p.x, 1.9, p.z), 0.04);
    }
    for (const y of [0.6, 1.2, 1.8]) wires.add(v3(a.x, y, a.z), v3(b.x, y, b.z), 0.012);
  }
  fence.add(posts.build({ castShadow: false }), wires.build({ castShadow: false, receiveShadow: false }));
  // gate posts and swing gates (open)
  for (const sx of [-1, 1]) {
    fence.add(cyl(0.12, 0.12, 2.4, MATERIALS.fence, 12, roadX + sx * gateHalf, 1.2, hz));
    // open swing gate: tubular frame with a diagonal brace
    const gx = roadX + sx * gateHalf;
    for (const y of [0.2, 1.0, 1.9]) fence.add(box(0.05, 0.06, 5.5, MATERIALS.fence, gx, y, hz + 2.75));
    for (const dz of [0.03, 1.85, 3.65, 5.47]) fence.add(box(0.05, 1.76, 0.06, MATERIALS.fence, gx, 1.05, hz + dz));
    const brace = box(0.04, 0.05, 5.75, MATERIALS.fence, gx, 1.05, hz + 2.75);
    brace.rotation.x = Math.atan2(1.7, 5.5);
    fence.add(brace);
  }
  group.add(fence);

  /* ---- Walkways: grating path from the office / power area to the left stairs ---- */
  const walk = box(22, 0.05, 1.2, MATERIALS.grating, -19, 0.23, 4.5);
  group.add(walk);
  group.add(makeRailing([v3(-30, 0.25, 5.1), v3(-16.8, 0.25, 5.1)], { height: 1.0, postSpacing: 2.5, toeBoard: false }));

  // small water tank near the mud tanks
  group.add(cyl(2.0, 2.0, 3.0, MATERIALS.containerWhite, 32, 14, 1.5, -34));
  group.add(cyl(2.1, 2.0, 0.3, MATERIALS.containerWhite, 32, 14, 3.1, -34));

  return { group, gens, towers, fence };
}
