import * as THREE from 'three';
import { MATERIALS } from '../materials.js';
import { LAYOUT } from '../layout.js';
import { box, cyl, cylX, cylZ, makeSkid, makeRailing, makeLadder, makePipeRun, polylineCurve, Hose, sphere, beamBetween, v3 } from '../geometry.js';

/**
 * Drilling-fluid circulation: mud pumps (-X, -Z) -> discharge header ->
 * standpipe on the mast -> rotary hose -> top drive -> drill string ->
 * bell nipple -> flowline -> shale shakers -> mud tanks -> suction -> pumps.
 */
export function buildMudSystem(hoist, bop) {
  const L = LAYOUT;
  const group = new THREE.Group();
  group.name = 'MudSystem';

  const tankX = L.mudTankX;
  const tl = L.mudTankLength;
  const tw = L.mudTankWidth;
  const th = L.mudTankHeight;

  /* ------------------------------------------------------------------ */
  /*  Shaker tank + shale shakers + flowline                             */
  /* ------------------------------------------------------------------ */
  const shakers = new THREE.Group();
  shakers.name = 'ShaleShakers';
  const sz = L.shakerTankZ;
  shakers.add(box(tl, th, tw, MATERIALS.tankGreenDark, tankX, th / 2, sz));
  shakers.add(box(tl - 0.2, 0.06, tw - 0.2, MATERIALS.mudBrown, tankX, th + 0.03, sz));  // mud surface
  // possum belly (distribution box) along the +Z edge, fed by the flowline
  shakers.add(box(7.5, 0.6, 0.6, MATERIALS.tankGreen, tankX - 0.2, th + 1.3, sz + tw / 2 - 0.1));
  for (const x of [tankX - 2.8, tankX + 2.4]) {
    const basket = new THREE.Group();
    basket.position.set(x, th + 0.95, sz - 0.1);
    basket.rotation.x = -4 * Math.PI / 180;                              // screens slope down toward -Z
    basket.add(box(2.4, 0.5, 1.9, MATERIALS.tankGreen, 0, 0, 0));
    basket.add(box(2.2, 0.04, 1.7, MATERIALS.galvanised, 0, 0.27, 0));   // screen deck
    for (const dz of [-0.45, 0.45]) basket.add(cylX(0.18, 0.5, MATERIALS.motorBlue, 16, 0, 0.5, dz));   // vibrator motors
    basket.add(box(0.5, 0.35, 1.2, MATERIALS.motorGrey, 0, 0.42, 0));
    shakers.add(basket);
    for (const sx of [-1, 1]) for (const dz of [-1, 1]) shakers.add(cyl(0.08, 0.08, 0.5, MATERIALS.galvanised, 8, x + sx * 1.0, th + 0.45, sz + dz * 0.8));  // springs/legs
  }
  shakers.add(makeRailing([v3(tankX - tl / 2, th, sz - tw / 2), v3(tankX + tl / 2, th, sz - tw / 2), v3(tankX + tl / 2, th, sz + tw / 2)], { height: 1.0, postSpacing: 1.5 }));
  shakers.add(makeLadder(tankX - tl / 2 - 0.3, 0.05, th + 0.2, sz, { rotationY: Math.PI / 2 }));
  group.add(shakers);

  // flowline from the bell nipple (slopes down toward the shakers)
  const flowPts = [bop.bellNippleOutlet.clone(), v3(0.5, 6.6, -0.6), v3(0.5, 4.8, sz + tw / 2 + 0.6), v3(0.5, 4.3, sz + tw / 2 - 0.1)];
  const flowline = makePipeRun(flowPts, 0.2, MATERIALS.pipeDarkGreen);
  flowline.name = 'Flowline';
  group.add(flowline);
  // flowline supports
  for (const [z, y] of [[-4, 6.0], [-9, 5.3]]) group.add(box(0.15, y, 0.15, MATERIALS.galvanised, 0.5, y / 2, z));

  /* ------------------------------------------------------------------ */
  /*  Mud tanks                                                          */
  /* ------------------------------------------------------------------ */
  const tanks = new THREE.Group();
  tanks.name = 'MudTanks';
  const tankCentres = [];
  L.mudTankZs.forEach((z, i) => {
    tanks.add(box(tl, th, tw, MATERIALS.tankGreen, tankX, th / 2, z));
    tankCentres.push(v3(tankX, th / 2, z));
    tanks.add(box(tl - 0.2, 0.06, tw - 0.2, MATERIALS.mudBrown, tankX, th + 0.03, z));     // fluid surface
    // skid runners
    for (const dz of [-tw / 2 + 0.2, tw / 2 - 0.2]) tanks.add(box(tl, 0.25, 0.3, MATERIALS.subSteel, tankX, 0.125, z + dz));
    // top walkway along the +Z edge with handrail, and stiffener ribs on the side
    tanks.add(box(tl, 0.06, 0.9, MATERIALS.grating, tankX, th + 0.03, z + tw / 2 - 0.45));
    tanks.add(makeRailing([v3(tankX - tl / 2, th, z + tw / 2), v3(tankX + tl / 2, th, z + tw / 2)], { height: 1.0, postSpacing: 1.5 }));
    tanks.add(makeRailing([v3(tankX - tl / 2, th, z - tw / 2), v3(tankX + tl / 2, th, z - tw / 2)], { height: 1.0, postSpacing: 1.5, toeBoard: false }));
    for (let x = -tl / 2 + 1; x < tl / 2; x += 2) tanks.add(box(0.12, th - 0.2, 0.1, MATERIALS.tankGreenDark, tankX + x, th / 2, z - tw / 2 - 0.05));
    // access ladder at the +X end
    tanks.add(makeLadder(tankX + tl / 2 + 0.3, 0.05, th + 0.2, z, { rotationY: -Math.PI / 2 }));
    // agitators: motor + gearbox on top, shaft into the tank
    for (const ax of [tankX - 3, tankX + 3]) {
      tanks.add(box(0.7, 0.4, 0.7, MATERIALS.motorGrey, ax, th + 0.2, z - 0.4));
      tanks.add(cyl(0.3, 0.3, 0.7, MATERIALS.motorBlue, 20, ax, th + 0.75, z - 0.4));
      tanks.add(cyl(0.06, 0.06, th, MATERIALS.galvanised, 8, ax, th / 2, z - 0.4));
    }
    // cross-over walkway to the next tank
    if (i < L.mudTankZs.length - 1) {
      const zMid = (z + L.mudTankZs[i + 1]) / 2;
      tanks.add(box(1.2, 0.06, 1.1, MATERIALS.grating, tankX + 4, th + 0.03, zMid));
      tanks.add(box(1.2, 0.06, 1.1, MATERIALS.grating, tankX - 4, th + 0.03, zMid));
    }
  });
  // equaliser pipework between tanks (two lines at low level) and valves
  for (const x of [tankX - 3.5, tankX + 4.5]) {
    const pts = [];
    for (const z of L.mudTankZs) pts.push(v3(x, 0.8, z));
    pts.unshift(v3(x, 0.8, sz));
    tanks.add(makePipeRun(pts, 0.14, MATERIALS.pipeDarkGreen));
    for (let i = 0; i < L.mudTankZs.length; i++) {
      const z = (L.mudTankZs[i] + (i === 0 ? sz : L.mudTankZs[i - 1])) / 2;
      tanks.add(box(0.35, 0.35, 0.35, MATERIALS.safetyRed, x, 0.8, z));
      tanks.add(cyl(0.03, 0.03, 0.5, MATERIALS.galvanised, 6, x, 1.1, z));
    }
  }
  // solids control on the first tank: degasser, desander/desilter cones, centrifuge
  const sc = L.mudTankZs[0];
  tanks.add(cyl(0.6, 0.6, 2.4, MATERIALS.tankGreenDark, 24, tankX - 1.0, th + 1.2, sc - 0.5));
  tanks.add(cyl(0.2, 0.6, 0.4, MATERIALS.tankGreenDark, 24, tankX - 1.0, th + 2.6, sc - 0.5));
  tanks.add(cyl(0.08, 0.08, 1.2, MATERIALS.galvanised, 8, tankX - 1.0, th + 3.4, sc - 0.5));   // vent
  for (let i = 0; i < 4; i++) {
    const cx = tankX + 1.2 + i * 0.55;
    tanks.add(cyl(0.28, 0.06, 1.1, MATERIALS.safetyYellowDark, 14, cx, th + 1.05, sc - 0.6));
    tanks.add(cyl(0.28, 0.28, 0.3, MATERIALS.safetyYellowDark, 14, cx, th + 1.75, sc - 0.6));
  }
  tanks.add(box(2.6, 0.5, 0.4, MATERIALS.tankGreenDark, tankX + 2.0, th + 2.1, sc - 0.6));   // cone inlet manifold
  tanks.add(box(2.4, 1.2, 1.0, MATERIALS.motorGrey, tankX + 4.5, th + 0.6, sc - 0.6));       // centrifuge
  tanks.add(cylX(0.5, 1.4, MATERIALS.motorBlue, 20, tankX + 4.5, th + 0.95, sc - 0.6));
  group.add(tanks);

  // suction manifold along the -X ends of the tanks toward the pumps
  const suctionPts = [];
  for (const z of L.mudTankZs) suctionPts.push(v3(tankX - tl / 2 - 0.5, 0.7, z));
  const suctionHeader = makePipeRun([...suctionPts].reverse().concat([v3(tankX - tl / 2 - 0.5, 0.7, L.mudTankZs[0] + 1.5)]), 0.2, MATERIALS.pipeDarkGreen);
  group.add(suctionHeader);
  for (const z of L.mudTankZs) group.add(makePipeRun([v3(tankX - tl / 2 + 0.2, 0.7, z), v3(tankX - tl / 2 - 0.5, 0.7, z)], 0.2, MATERIALS.pipeDarkGreen));
  // suction line from manifold to pump row
  const pumpZ = L.mudPumpZ;
  const suctionLine = makePipeRun([v3(tankX - tl / 2 - 0.5, 0.7, pumpZ + 3.0), v3(L.mudPumpXs[0] + 2.5, 0.7, pumpZ + 3.0), v3(L.mudPumpXs[2] - 1.0, 0.7, pumpZ + 3.0)], 0.22, MATERIALS.pipeDarkGreen);
  group.add(suctionLine);

  /* ------------------------------------------------------------------ */
  /*  Triplex mud pumps                                                  */
  /* ------------------------------------------------------------------ */
  const pumps = new THREE.Group();
  pumps.name = 'MudPumps';
  const ponyRods = [];
  const pumpCentres = [];
  L.mudPumpXs.forEach((px, i) => {
    const p = new THREE.Group();
    p.position.set(px, 0.02, pumpZ);
    pumpCentres.push(v3(px, 1.5, pumpZ));
    const skid = makeSkid(7.6, 3.2, 0.4);
    skid.rotation.y = Math.PI / 2;
    p.add(skid);
    // power end (crankcase)
    p.add(box(2.6, 2.3, 3.4, MATERIALS.pumpRed, 0, 0.4 + 1.15, 0.2));
    p.add(box(2.8, 0.2, 3.6, MATERIALS.pumpRed, 0, 2.75, 0.2));
    p.add(cylX(0.35, 3.0, MATERIALS.motorGrey, 16, 0, 1.9, -1.4));                 // crankshaft end covers
    // fluid end with three cylinder modules, suction & discharge manifolds
    p.add(box(2.8, 1.5, 0.9, MATERIALS.pumpRed, 0, 1.55, 2.5));
    for (const cx of [-0.85, 0, 0.85]) {
      p.add(cylZ(0.3, 0.9, MATERIALS.motorGrey, 18, cx, 1.55, 3.2));                 // cylinder / valve pods
      p.add(cyl(0.22, 0.22, 0.5, MATERIALS.motorGrey, 14, cx, 2.5, 2.5));            // discharge valve covers
      p.add(cyl(0.22, 0.22, 0.5, MATERIALS.motorGrey, 14, cx, 0.65, 2.5));           // suction valve covers
      const rod = cylZ(0.07, 0.7, MATERIALS.drillCollar, 10, cx, 1.55, 2.0);         // pony rod between power and fluid end
      p.add(rod);
      ponyRods.push({ mesh: rod, phase: (cx + 0.85) / 0.85 * (Math.PI * 2 / 3) });
    }
    p.add(cylX(0.25, 3.4, MATERIALS.pipeDarkGreen, 16, 0, 0.65, 3.0));              // suction manifold
    p.add(cylX(0.14, 3.0, MATERIALS.bopDark, 16, 0, 2.5, 3.1));                      // discharge manifold
    p.add(sphere(0.5, MATERIALS.bopDark, 1.1, 3.1, 3.1));                             // pulsation dampener
    p.add(cyl(0.12, 0.12, 0.6, MATERIALS.bopDark, 10, 1.1, 2.7, 3.1));
    // drive: two AC motors on the rear with belt guard
    for (const mx of [-0.85, 0.85]) {
      p.add(cylZ(0.5, 1.8, MATERIALS.motorBlue, 24, mx, 1.0, -2.6));
      p.add(box(0.5, 0.35, 0.7, MATERIALS.motorGrey, mx, 1.65, -2.6));
    }
    p.add(box(2.6, 2.4, 0.4, MATERIALS.safetyYellowDark, 0, 1.6, -1.65));            // belt / coupling guard
    pumps.add(p);
    // suction branch from the suction line to each pump
    pumps.add(makePipeRun([v3(px + 1.7, 0.7, pumpZ + 3.0), v3(px + 1.7, 0.65, pumpZ + 3.0)], 0.2, MATERIALS.pipeDarkGreen));
  });
  group.add(pumps);

  /* ------------------------------------------------------------------ */
  /*  Discharge header -> standpipe -> gooseneck                        */
  /* ------------------------------------------------------------------ */
  const headerZ = pumpZ + 3.6;
  const headerY = 1.2;
  const spX = L.standpipeX;
  const spZ = L.standpipeZ;
  // each pump's riser to the header
  for (const px of L.mudPumpXs) {
    group.add(makePipeRun([v3(px + 1.1, 3.1, pumpZ + 3.1), v3(px + 1.1, 3.1, headerZ), v3(px + 1.1, headerY, headerZ)], 0.1, MATERIALS.bopDark));
  }
  // ground run passes under the substructure through the unbraced centre panel (z ~ 0.6),
  // then rises as the standpipe inside the mast beside the -X/+Z leg
  const dischargePts = [
    v3(L.mudPumpXs[2] + 1.1, headerY, headerZ),
    v3(-5.5, headerY, headerZ),
    v3(-5.5, headerY, 0.6),
    v3(spX, headerY, 0.6),
    v3(spX, headerY, spZ),
    v3(spX, L.standpipeTopY, spZ),
    v3(spX + 0.45, L.standpipeTopY + 0.35, spZ - 0.25),
  ];
  const discharge = makePipeRun(dischargePts, 0.12, MATERIALS.bopDark);
  discharge.name = 'DischargeLine';
  group.add(discharge);
  // pipe supports along the ground run
  for (let x = -24; x < -6; x += 4) group.add(box(0.15, headerY, 0.15, MATERIALS.galvanised, x, headerY / 2, headerZ));
  for (let z = -24; z < 0; z += 5) group.add(box(0.15, headerY, 0.15, MATERIALS.galvanised, -5.5, headerY / 2, z));
  // standpipe manifold on the drill floor with valves
  group.add(box(0.6, 1.4, 0.5, MATERIALS.bopDark, spX, L.floorY + 0.7, spZ));
  for (const dy of [0.4, 0.9]) group.add(cyl(0.18, 0.18, 0.08, MATERIALS.safetyRed, 16, spX + 0.4, L.floorY + dy, spZ).rotateZ(Math.PI / 2));
  // standpipe clamps back to the -X/+Z mast leg every 4 m
  for (let y = L.floorY + 4; y < L.standpipeTopY; y += 4) {
    const legX = -(L.mastBaseHalfX + (L.mastTopHalfX - L.mastBaseHalfX) * ((y - L.mastBaseY) / (L.mastTopY - L.mastBaseY)));
    group.add(beamBetween(v3(spX, y, spZ), v3(legX + 0.15, y, L.mastHalfZ - 0.1), 0.05, MATERIALS.galvanised, 'box'));
  }

  const standpipeOutlet = dischargePts[dischargePts.length - 1].clone();
  const dischargeCurve = polylineCurve(dischargePts);
  const flowCurve = polylineCurve(flowPts);

  /* ------------------------------------------------------------------ */
  /*  Rotary hose (dynamic) between the gooseneck and the top drive      */
  /* ------------------------------------------------------------------ */
  const hose = new Hose(0.1, MATERIALS.hoseBlack, { segments: 48, hoseLength: 26, minSag: 2.0 });
  hose.mesh.name = 'RotaryHose';
  group.add(hose.mesh);
  const _inlet = new THREE.Vector3();
  function updateHose() {
    hoist.getHoseInletWorld(_inlet);
    hose.update(standpipeOutlet, _inlet);
  }
  updateHose();

  /* ------------------------------------------------------------------ */
  /*  Circulation indicators: particles + flow arrows                    */
  /* ------------------------------------------------------------------ */
  const indicators = new THREE.Group();
  indicators.name = 'FlowIndicators';
  const N_DISCHARGE = 70;
  const N_HOSE = 16;
  const N_FLOW = 14;
  const particles = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 8, 6), MATERIALS.mudParticle, N_DISCHARGE + N_HOSE + N_FLOW);
  particles.frustumCulled = false;
  indicators.add(particles);
  const arrowGeom = new THREE.ConeGeometry(0.16, 0.45, 10);
  for (const y of [12, 17, 22, 27]) {
    const a = new THREE.Mesh(arrowGeom, MATERIALS.mudParticle);
    a.position.set(spX - 0.35, y, spZ);
    indicators.add(a);
  }
  for (const z of [-3, -7, -11]) {
    const a = new THREE.Mesh(arrowGeom, MATERIALS.mudParticle);
    a.position.set(0.95, 6.6 - (6.6 - 4.8) * ((-z - 0.6) / 12.2), z);
    a.rotation.x = -Math.PI / 2;
    indicators.add(a);
  }
  indicators.visible = false;
  group.add(indicators);

  const _m = new THREE.Matrix4();
  const _pt = new THREE.Vector3();
  let flowPhase = 0;
  function updateFlow(dt) {
    flowPhase = (flowPhase + dt * 0.08) % 1;
    let idx = 0;
    for (let i = 0; i < N_DISCHARGE; i++) {
      const u = (i / N_DISCHARGE + flowPhase) % 1;
      dischargeCurve.getPointAt(u, _pt);
      particles.setMatrixAt(idx++, _m.makeTranslation(_pt.x, _pt.y, _pt.z));
    }
    for (let i = 0; i < N_HOSE; i++) {
      const u = (i / N_HOSE + flowPhase * 3) % 1;
      hose.pointAt(u, _pt);
      particles.setMatrixAt(idx++, _m.makeTranslation(_pt.x, _pt.y, _pt.z));
    }
    for (let i = 0; i < N_FLOW; i++) {
      const u = (i / N_FLOW + flowPhase * 2) % 1;
      flowCurve.getPointAt(u, _pt);
      particles.setMatrixAt(idx++, _m.makeTranslation(_pt.x, _pt.y, _pt.z));
    }
    particles.instanceMatrix.needsUpdate = true;
  }

  let pumpPhase = 0;
  function updatePumps(dt, strokesPerSecond) {
    pumpPhase += dt * strokesPerSecond * Math.PI * 2;
    for (const r of ponyRods) r.mesh.position.z = 2.0 + Math.sin(pumpPhase + r.phase) * 0.18;
  }

  return {
    group,
    tanks,
    pumps,
    shakers,
    hose,
    indicators,
    tankCentres,
    pumpCentres,
    standpipeOutlet,
    updateHose,
    updateFlow,
    updatePumps,
    setCirculating(on) {
      indicators.visible = on;
    },
  };
}
