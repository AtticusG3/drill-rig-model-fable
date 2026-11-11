import * as THREE from 'three';
import { MATERIALS } from '../materials.js';
import { LAYOUT } from '../layout.js';
import { BeamBatch, addTrussBay, ringNodes, box, cylZ, makeRailing, beamBetween, v3 } from '../geometry.js';

/**
 * Lattice drilling mast: four tapering corner legs, horizontal rings at every
 * bay, X-bracing on each face (front bays left open for the V-door, lower side
 * bays open for floor access), crown block, top-drive guide rails, racking
 * board, cable tray and crown platform.
 *
 * Returns { group, bracing, crownSheaveY, fastSheave, deadSheave, topY, guideRails }
 */
export function buildMast() {
  const L = LAYOUT;
  const group = new THREE.Group();
  group.name = 'Mast';

  const bracing = new THREE.Group();   // toggled by "show structural bracing"
  bracing.name = 'MastBracing';

  const legs = new BeamBatch(MATERIALS.mastSteel, 'box');
  const horiz = new BeamBatch(MATERIALS.mastSteel, 'cyl');
  const diag = new BeamBatch(MATERIALS.mastSteelDark, 'cyl');
  const batches = { legs, horiz, diag };

  const bayH = (L.mastTopY - L.mastBaseY) / L.mastBays;
  const halfXAt = (i) => THREE.MathUtils.lerp(L.mastBaseHalfX, L.mastTopHalfX, i / L.mastBays);
  const rings = [];
  for (let i = 0; i <= L.mastBays; i++) rings.push(ringNodes(0, L.mastBaseY + i * bayH, 0, halfXAt(i), L.mastHalfZ));

  for (let i = 0; i < L.mastBays; i++) {
    const bottom = rings[i];
    const top = rings[i + 1];
    // Faces: 0 = -Z rear, 1 = +X, 2 = +Z front (V-door), 3 = -X
    const faces = [true, i >= 1, i >= 3, i >= 1];
    const crownBay = i === L.mastBays - 1;
    addTrussBay(batches, bottom, top, {
      legR: 0.22,
      horizR: crownBay ? 0.11 : 0.085,
      diagR: crownBay ? 0.08 : 0.065,
      faces,
      topRing: true,
    });
    // mid-bay horizontal on braced faces (lattice panel points)
    const midY = bottom[0].y + bayH / 2;
    const hx = (halfXAt(i) + halfXAt(i + 1)) / 2;
    const mid = ringNodes(0, midY, 0, hx, L.mastHalfZ);
    for (let f = 0; f < 4; f++) if (faces[f]) horiz.add(mid[f], mid[(f + 1) % 4], 0.05);
    // V-door opening: light tie beams only on the open front bays
    if (!faces[2]) horiz.add(bottom[2], bottom[3], 0.085);
  }
  // base ring at floor level
  for (let i = 0; i < 4; i++) horiz.add(rings[0][i], rings[0][(i + 1) % 4], 0.12);

  /* ---- Reinforcement at the drill floor connection: heavy leg boots + knee braces ---- */
  for (const n of rings[0]) {
    group.add(box(0.75, 0.6, 0.75, MATERIALS.subSteel, n.x, n.y + 0.3, n.z));
  }
  const kneeR = 0.07;
  for (let f = 0; f < 4; f++) {
    if (f === 2) continue; // V-door side
    const a = rings[0][f];
    const b = rings[0][(f + 1) % 4];
    const up = v3(0, 2.2, 0);
    diag.add(a.clone().lerp(b, 0.25), a.clone().add(up), kneeR);
    diag.add(a.clone().lerp(b, 0.75), b.clone().add(up), kneeR);
  }

  /* ---- Crown reinforcement: water-table grillage beams (the reeved lines pass between them) ---- */
  const topRing = rings[L.mastBays];
  for (const z of [-1.15, 1.15]) horiz.add(new THREE.Vector3(topRing[0].x, topRing[0].y, z), new THREE.Vector3(topRing[1].x, topRing[1].y, z), 0.12);
  const belowTop = rings[L.mastBays - 1];
  for (let f = 0; f < 4; f++) {
    const a = belowTop[f].clone().lerp(belowTop[(f + 1) % 4], 0.5);
    const b = topRing[f].clone().lerp(topRing[(f + 1) % 4], 0.5);
    horiz.add(a, b, 0.06);
  }

  /* ---- Top-drive guide rails (parallel to the mast centreline) ---- */
  const guideRails = new BeamBatch(MATERIALS.mastSteelDark, 'box');
  const railBottom = L.mastBaseY + 1.0;
  const railTop = L.crownUndersideY - 0.3;
  for (const sx of [-1, 1]) {
    const x = sx * L.guideRailX;
    guideRails.add(v3(x, railBottom, L.guideRailZ), v3(x, railTop, L.guideRailZ), 0.08);
    // brackets from the back face of the rail to the rear mast face at every ring
    for (let i = 1; i < L.mastBays; i++) {
      const y = rings[i][0].y;
      guideRails.add(v3(x, y, L.guideRailZ - 0.08), v3(x, y, -L.mastHalfZ), 0.05);
    }
  }
  // rail stop at bottom
  for (const sx of [-1, 1]) group.add(box(0.5, 0.3, 0.5, MATERIALS.safetyYellow, sx * L.guideRailX, railBottom - 0.15, L.guideRailZ));

  /* ---- Cable tray + service lines along the rear -X leg ---- */
  const trayA = v3(-halfXAt(0) - 0.45, L.mastBaseY + 1.0, -2.0);
  const trayB = v3(-halfXAt(9) - 0.45, L.mastBaseY + 9 * bayH, -2.0);
  group.add(beamBetween(trayA, trayB, 0.16, MATERIALS.galvanised, 'box'));
  const lines = new BeamBatch(MATERIALS.rubber, 'cyl');
  for (let k = 0; k < 3; k++) {
    const off = v3(-0.1 - k * 0.09, 0, 0.22);
    lines.add(trayA.clone().add(off), trayB.clone().add(off), 0.03);
  }
  group.add(lines.build({ castShadow: false }));

  /* ---- Build structural batches ---- */
  group.add(legs.build());
  group.add(horiz.build());
  bracing.add(diag.build());
  group.add(bracing);
  group.add(guideRails.build());

  /* ---- Crown block: sits ON the water table at the mast top ---- */
  const crown = new THREE.Group();
  crown.name = 'CrownBlock';
  const topHalfX = halfXAt(L.mastBays);
  const wtY = L.mastTopY;                    // water-table top
  const crownBeamY = wtY + 0.2;              // crown skid beams 0.4 deep sitting on the water table
  // skid beams spanning X (outboard of the line runs) and Z, plus outriggers for the fast/dead sheaves
  for (const z of [-1.15, 1.15]) crown.add(box(topHalfX * 2 + 1.6, 0.4, 0.3, MATERIALS.subSteel, 0, crownBeamY, z));
  for (const x of [-topHalfX + 0.3, topHalfX - 0.3]) crown.add(box(0.3, 0.4, L.mastHalfZ * 2, MATERIALS.subSteel, x, crownBeamY, 0));
  const sheaveR = 0.75;
  const sheaveY = crownBeamY + 0.2 + 0.25 + sheaveR;
  // bearing pedestals and common axle (axle along Z, sheaves in the X-Y plane)
  for (const z of [-1.0, 1.0]) crown.add(box(0.6, sheaveY - crownBeamY, 0.3, MATERIALS.subSteelLight, 0, (crownBeamY + sheaveY) / 2, z));
  crown.add(cylZ(0.1, 2.3, MATERIALS.galvanised, 12, 0, sheaveY, 0));
  const sheaveZs = [-0.6, -0.3, 0, 0.3, 0.6];
  const sheaveGeom = new THREE.CylinderGeometry(sheaveR, sheaveR, 0.16, 28);
  const grooveGeom = new THREE.TorusGeometry(sheaveR, 0.05, 8, 28);
  for (const z of sheaveZs) {
    const s = new THREE.Mesh(sheaveGeom, MATERIALS.galvanised);
    s.rotation.x = Math.PI / 2;
    s.position.set(0, sheaveY, z);
    s.castShadow = true;
    crown.add(s);
    const g = new THREE.Mesh(grooveGeom, MATERIALS.topDriveDark);
    g.position.set(0, sheaveY, z);
    crown.add(g);
  }
  // sheave guard (open frame over the cluster)
  for (const sx of [-1, 1]) crown.add(box(0.06, 0.06, 1.8, MATERIALS.safetyYellow, sx * 0.9, sheaveY + sheaveR + 0.25, 0));
  for (const z of [-0.9, 0.9]) for (const sx of [-1, 1]) crown.add(box(0.06, sheaveY + sheaveR + 0.25 - crownBeamY, 0.06, MATERIALS.safetyYellow, sx * 0.9, (crownBeamY + sheaveY + sheaveR + 0.25) / 2, z));

  // fast-line sheave (drawworks side, -X) and deadline sheave (+X), cantilevered outboard of the mast
  const fsR = 0.55;
  const fastSheave = v3(-(topHalfX + 0.25), crownBeamY + 0.2 + 0.15 + fsR, LAYOUT.drawworksPos[2]);
  const deadSheave = v3(topHalfX + 0.25, crownBeamY + 0.2 + 0.15 + fsR, 0.95);
  for (const p of [fastSheave, deadSheave]) {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(fsR, fsR, 0.16, 24), MATERIALS.galvanised);
    s.rotation.x = Math.PI / 2;
    s.position.copy(p);
    s.castShadow = true;
    crown.add(s);
    for (const dz of [-0.17, 0.17]) crown.add(box(0.3, p.y - crownBeamY, 0.06, MATERIALS.subSteelLight, p.x, (crownBeamY + p.y) / 2, p.z + dz));
    crown.add(cylZ(0.06, 0.45, MATERIALS.galvanised, 10, p.x, p.y, p.z));
    crown.add(box(0.5, 0.3, 0.6, MATERIALS.subSteel, p.x, crownBeamY, p.z));
  }
  // drilling line over the top: fast sheave -> cluster -> ... -> deadline sheave
  const ropeTop = sheaveY + sheaveR;
  const fsTop = fastSheave.y + fsR;
  crown.add(beamBetween(v3(fastSheave.x, fsTop, fastSheave.z), v3(-0.62, ropeTop, sheaveZs[0]), 0.02, MATERIALS.wireRope));
  crown.add(beamBetween(v3(deadSheave.x, fsTop, deadSheave.z), v3(0.62, ropeTop, sheaveZs[4]), 0.02, MATERIALS.wireRope));
  for (let k = 0; k < sheaveZs.length - 1; k++) {
    crown.add(beamBetween(v3(0.62, ropeTop, sheaveZs[k]), v3(-0.62, ropeTop, sheaveZs[k + 1]), 0.02, MATERIALS.wireRope));
  }
  group.add(crown);

  /* ---- Water-table walkway around the crown (centre open for the reeved lines) with railing ---- */
  const platY = wtY + 0.02;
  const px = topHalfX + 0.6;
  const pz = L.mastHalfZ + 0.4;
  const walkW = 0.9;
  for (const sz of [-1, 1]) {
    const w = box(px * 2, 0.06, walkW, MATERIALS.grating, 0, platY, sz * (pz - walkW / 2));
    w.castShadow = false;
    group.add(w);
  }
  for (const sx of [-1, 1]) {
    const w = box(walkW, 0.06, pz * 2 - walkW * 2, MATERIALS.grating, sx * (px - walkW / 2), platY, 0);
    w.castShadow = false;
    group.add(w);
  }
  group.add(makeRailing([v3(-px, platY, -pz), v3(px, platY, -pz), v3(px, platY, pz), v3(-px, platY, pz)], { closed: true, postSpacing: 1.3 }));
  // aviation obstruction light on a corner mast
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff2020, emissiveIntensity: 1.5 }));
  beacon.position.set(px - 0.2, platY + 2.6, pz - 0.2);
  group.add(beacon);
  group.add(beamBetween(v3(px - 0.2, platY, pz - 0.2), v3(px - 0.2, platY + 2.4, pz - 0.2), 0.04, MATERIALS.galvanised));

  /* ---- Racking board (monkey board) at the rear face ---- */
  const mbY = L.monkeyBoardY;
  const mbHalfX = halfXAt((mbY - L.mastBaseY) / bayH);
  const mb = new THREE.Group();
  mb.name = 'RackingBoard';
  const deck = new THREE.Mesh(new THREE.BoxGeometry(mbHalfX * 2, 0.08, 1.5), MATERIALS.grating);
  deck.position.set(0, mbY, -L.mastHalfZ - 0.75);
  deck.castShadow = deck.receiveShadow = true;
  mb.add(deck);
  mb.add(makeRailing([v3(-mbHalfX, mbY, -L.mastHalfZ), v3(-mbHalfX, mbY, -L.mastHalfZ - 1.5), v3(mbHalfX, mbY, -L.mastHalfZ - 1.5), v3(mbHalfX, mbY, -L.mastHalfZ)], { postSpacing: 1.2 }));
  // support brackets back to the rear ring below
  const supportY = L.mastBaseY + Math.floor((mbY - L.mastBaseY) / bayH) * bayH;
  for (const sx of [-1, 1]) {
    mb.add(beamBetween(v3(sx * (mbHalfX - 0.2), mbY - 0.05, -L.mastHalfZ - 1.4), v3(sx * (mbHalfX - 0.2), supportY, -L.mastHalfZ), 0.05, MATERIALS.mastSteelDark));
  }
  // fingerboard: fingers reaching inward over the setback area
  const fingers = new BeamBatch(MATERIALS.safetyYellow, 'cyl');
  for (const fx of [-1.3, -0.9, -0.5, -0.1, 0.1, 0.5, 0.9, 1.3]) {
    fingers.add(v3(fx, mbY + 0.25, -L.mastHalfZ), v3(fx, mbY + 0.25, -1.75), 0.03);
  }
  fingers.add(v3(-1.5, mbY + 0.25, -L.mastHalfZ), v3(1.5, mbY + 0.25, -L.mastHalfZ), 0.05);
  mb.add(fingers.build({ castShadow: false }));
  group.add(mb);

  /* ---- Ladder up the -X face (inside the legs) ---- */
  const ladder = new BeamBatch(MATERIALS.galvanised, 'cyl');
  const lx0 = -halfXAt(0) + 0.3;
  const lx1 = -halfXAt(L.mastBays) + 0.3;
  for (const dz of [-0.2, 0.2]) ladder.add(v3(lx0, L.mastBaseY + 0.6, -2.0 + dz), v3(lx1, L.mastTopY, -2.0 + dz), 0.02);
  const nR = Math.floor((L.mastTopY - L.mastBaseY) / 0.3);
  for (let i = 1; i < nR; i++) {
    const f = i / nR;
    const x = THREE.MathUtils.lerp(lx0, lx1, f);
    const y = THREE.MathUtils.lerp(L.mastBaseY + 0.6, L.mastTopY, f);
    ladder.add(v3(x, y, -2.2), v3(x, y, -1.8), 0.015);
  }
  group.add(ladder.build({ castShadow: false }));

  return {
    group,
    bracing,
    crown,
    crownSheaveY: sheaveY,
    crownSheaveR: sheaveR,
    crownSheaveZs: sheaveZs,
    fastSheave,
    deadSheave,
    // rope tangent points on the outboard side of the fast/dead sheaves (lines run down outside the mast faces)
    fastLineTop: v3(fastSheave.x - fsR, fastSheave.y, fastSheave.z),
    deadLineTop: v3(deadSheave.x + fsR, deadSheave.y, deadSheave.z),
    topY: topRing[0].y,
    guideRailBottomY: railBottom,
    guideRailTopY: railTop,
    serviceLoopAnchor: v3(-halfXAt(5) + 0.4, L.mastBaseY + 5 * bayH, -1.9),
  };
}
