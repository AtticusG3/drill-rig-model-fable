import * as THREE from 'three';
import { MATERIALS, makePlateTexture, registerMaterial } from '../materials.js';
import { LAYOUT } from '../layout.js';
import { BeamBatch, box, cyl, makeRailing, makeStairs, v3 } from '../geometry.js';

/**
 * Elevated box-on-box substructure, drill floor deck with a true circular
 * rotary opening, rotary table, railings with V-door and stair gaps, two
 * stair flights to ground, driller's cabin, setback stands and floor storage.
 */
export function buildSubstructure() {
  const L = LAYOUT;
  const group = new THREE.Group();
  group.name = 'Substructure';
  const bracing = new THREE.Group();
  bracing.name = 'SubstructureBracing';

  const hx = L.floorX / 2;   // 8
  const hz = L.floorZ / 2;   // 6
  const deckBottom = L.floorY - L.deckThickness;   // 7.75
  const matTop = 0.2;
  const skidH = 0.6;
  const colTop = deckBottom - 0.35;                // top of columns (under floor beams)

  const heavy = new BeamBatch(MATERIALS.subSteel, 'box');
  const light = new BeamBatch(MATERIALS.subSteelLight, 'box');
  const diag = new BeamBatch(MATERIALS.subSteelLight, 'cyl');

  const colXs = [-7.5, -2.6, 2.6, 7.5];
  const colZs = [-5.5, -1.8, 1.8, 5.5];

  /* ---- Base skids along Z on the rig mats ---- */
  for (const x of colXs) group.add(box(skidH, skidH, L.floorZ + 0.4, MATERIALS.subSteel, x, matTop + skidH / 2, 0));
  // skid cross ties
  for (const z of [-5.8, 5.8]) group.add(box(colXs[3] - colXs[0], 0.4, 0.4, MATERIALS.subSteel, 0, matTop + 0.2, z));

  /* ---- Columns ---- */
  const colBottom = matTop + skidH;
  for (const x of colXs) for (const z of colZs) heavy.add(v3(x, colBottom, z), v3(x, colTop, z), 0.26);

  /* ---- Horizontal load-bearing beams: floor-level grillage + mid-height ties ---- */
  const beamY = colTop + 0.17;
  for (const x of colXs) heavy.add(v3(x, beamY, -hz), v3(x, beamY, hz), 0.18);
  for (const z of colZs) heavy.add(v3(-hx, beamY, z), v3(hx, beamY, z), 0.18);
  // mast support beams run under the mast legs (z = +-mastHalfZ)
  for (const z of [-L.mastHalfZ, L.mastHalfZ]) heavy.add(v3(-hx, beamY, z), v3(hx, beamY, z), 0.2);
  // intermediate deck joists
  for (let x = -7; x <= 7; x += 1.4) if (Math.abs(x) > 2.0) light.add(v3(x, beamY + 0.05, -hz), v3(x, beamY + 0.05, hz), 0.1);
  const midY = (colBottom + colTop) / 2;
  for (const x of [colXs[0], colXs[3]]) light.add(v3(x, midY, -hz), v3(x, midY, hz), 0.14);
  for (const z of [colZs[0], colZs[3]]) light.add(v3(-hx, midY, z), v3(hx, midY, z), 0.14);
  for (const x of [colXs[1], colXs[2]]) {
    light.add(v3(x, midY, -hz), v3(x, midY, colZs[1]), 0.14);
    light.add(v3(x, midY, colZs[2]), v3(x, midY, hz), 0.14);
  }

  /* ---- Diagonal braces in two tiers. Front (+Z) centre panels left open for BOP / access. ---- */
  const tiers = [[colBottom, midY], [midY, colTop]];
  function xBrace(a, b, y0, y1) {
    diag.add(v3(a.x, y0, a.z), v3(b.x, y1, b.z), 0.08);
    diag.add(v3(b.x, y0, b.z), v3(a.x, y1, a.z), 0.08);
  }
  for (const [y0, y1] of tiers) {
    // outer side frames (x = +-7.5): all panels except the front one (access opening to cellar area)
    for (const x of [colXs[0], colXs[3]]) {
      for (let i = 0; i < colZs.length - 1; i++) {
        if (i === 2) continue; // open front side panel
        xBrace(v3(x, 0, colZs[i]), v3(x, 0, colZs[i + 1]), y0, y1);
      }
    }
    // rear frame (z = -5.5): outer panels braced, centre panel single diagonal so pipework can pass
    for (let i = 0; i < colXs.length - 1; i++) {
      if (i === 1) {
        diag.add(v3(colXs[2], y0, colZs[0]), v3(colXs[1], y1, colZs[0]), 0.08);
      } else xBrace(v3(colXs[i], 0, colZs[0]), v3(colXs[i + 1], 0, colZs[0]), y0, y1);
    }
    // front frame (z = +5.5): outer panels only (centre open = access opening)
    xBrace(v3(colXs[0], 0, colZs[3]), v3(colXs[1], 0, colZs[3]), y0, y1);
    xBrace(v3(colXs[2], 0, colZs[3]), v3(colXs[3], 0, colZs[3]), y0, y1);
    // inner longitudinal frames (x = +-2.6): rear and front panels, never across the well centre
    for (const x of [colXs[1], colXs[2]]) {
      xBrace(v3(x, 0, colZs[0]), v3(x, 0, colZs[1]), y0, y1);
      xBrace(v3(x, 0, colZs[2]), v3(x, 0, colZs[3]), y0, y1);
    }
  }

  group.add(heavy.build());
  group.add(light.build());
  bracing.add(diag.build());
  group.add(bracing);

  /* ---- Drill floor deck with a circular rotary opening (extruded shape with hole) ---- */
  const shape = new THREE.Shape();
  shape.moveTo(-hx, -hz);
  shape.lineTo(hx, -hz);
  shape.lineTo(hx, hz);
  shape.lineTo(-hx, hz);
  shape.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, 0, L.rotaryRadius + 0.05, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const deckGeom = new THREE.ExtrudeGeometry(shape, { depth: L.deckThickness, bevelEnabled: false, curveSegments: 32 });
  deckGeom.rotateX(-Math.PI / 2); // shape plane -> XZ, depth -> +Y
  const deckTex = makePlateTexture(1);
  deckTex.repeat.set(0.6, 0.6);
  const deckMat = registerMaterial(new THREE.MeshStandardMaterial({ color: 0xc9ced3, roughness: 0.7, metalness: 0.5, map: deckTex }));
  const deck = new THREE.Mesh(deckGeom, deckMat);
  deck.position.y = deckBottom;
  deck.castShadow = true;
  deck.receiveShadow = true;
  deck.name = 'DrillFloorDeck';
  group.add(deck);

  /* ---- Rotary table: open bore, housing ring, master bushing, slips, trim ring ---- */
  const rotary = new THREE.Group();
  rotary.name = 'RotaryTable';
  const housing = new THREE.Mesh(new THREE.CylinderGeometry(L.rotaryRadius + 0.12, L.rotaryRadius + 0.12, 0.75, 40, 1, true), MATERIALS.topDriveDark);
  housing.position.y = deckBottom + 0.375 - 0.05;
  housing.castShadow = true;
  rotary.add(housing);
  const topRing = new THREE.Mesh(new THREE.RingGeometry(L.rotaryBoreRadius + 0.05, L.rotaryRadius + 0.12, 40), MATERIALS.galvanised);
  topRing.rotation.x = -Math.PI / 2;
  topRing.position.y = L.rotaryTopY;
  topRing.receiveShadow = true;
  rotary.add(topRing);
  const bushing = new THREE.Mesh(new THREE.TorusGeometry(L.rotaryBoreRadius - 0.07, 0.12, 10, 40), MATERIALS.drillCollar);
  bushing.rotation.x = Math.PI / 2;
  bushing.position.y = L.rotaryTopY - 0.02;
  rotary.add(bushing);
  const trim = new THREE.Mesh(new THREE.TorusGeometry(L.rotaryRadius - 0.08, 0.04, 8, 48), MATERIALS.toolJoint);
  trim.rotation.x = Math.PI / 2;
  trim.position.y = L.rotaryTopY + 0.02;
  rotary.add(trim);
  group.add(rotary);

  /* ---- Perimeter railings with V-door gap (front) and stair gaps ---- */
  const y = L.floorY;
  const vDoor = 1.6;
  const stairZ = -4.5;      // right stair (+X side)
  const stairZL = 4.5;      // left stair (-X side)
  const rails = [
    // front edge split by the V-door
    [v3(-hx, y, hz), v3(-vDoor, y, hz)],
    [v3(vDoor, y, hz), v3(hx, y, hz)],
    // right edge with stair gap at z = -4.5
    [v3(hx, y, hz), v3(hx, y, stairZ + 0.75)],
    [v3(hx, y, stairZ - 0.75), v3(hx, y, -hz)],
    // rear edge
    [v3(hx, y, -hz), v3(-hx, y, -hz)],
    // left edge with stair gap at z = +4.5
    [v3(-hx, y, -hz), v3(-hx, y, stairZL - 0.75)],
    [v3(-hx, y, stairZL + 0.75), v3(-hx, y, hz)],
  ];
  for (const r of rails) group.add(makeRailing(r, { postSpacing: 1.5 }));
  // V-door posts
  for (const x of [-vDoor, vDoor]) group.add(box(0.12, 1.2, 0.12, MATERIALS.safetyYellow, x, y + 0.6, hz));

  /* ---- Stairs: ground -> drill floor, treads horizontal, landing at deck edge ---- */
  const stairR = makeStairs(v3(hx + 8.4, matTop, stairZ), v3(hx, L.floorY, stairZ), 1.3);
  stairR.name = 'StairsRight';
  group.add(stairR);
  const stairL = makeStairs(v3(-hx - 8.4, matTop, stairZL), v3(-hx, L.floorY, stairZL), 1.3);
  stairL.name = 'StairsLeft';
  group.add(stairL);
  // landing frame posts supporting stair tops
  for (const [x, z] of [[hx + 4.2, stairZ], [-hx - 4.2, stairZL]]) {
    for (const dz of [-0.65, 0.65]) group.add(box(0.15, 4.1, 0.15, MATERIALS.galvanised, x, matTop + 2.05, z + dz));
  }

  /* ---- Driller's cabin: elevated beside the floor, windows facing well centre ---- */
  const cabin = new THREE.Group();
  cabin.name = 'DrillersCabin';
  const [cx, cy, cz] = L.cabinPos;
  const cw = 3.0, ch = 2.8, cd = 3.0;
  cabin.add(box(cw, ch, cd, MATERIALS.cabinWhite, cx, cy + ch / 2 + 0.2, cz));
  cabin.add(box(cw + 0.4, 0.12, cd + 0.4, MATERIALS.subSteelLight, cx, cy + ch + 0.26, cz));   // roof
  cabin.add(box(cw, 0.2, cd, MATERIALS.subSteel, cx, cy + 0.1, cz));                               // raised base
  // large tinted windows facing +X (well centre) and +Z
  const winE = box(0.05, 1.3, cd - 0.5, MATERIALS.glassDark, cx + cw / 2 + 0.01, cy + 1.75, cz);
  winE.castShadow = false;
  cabin.add(winE);
  const winS = box(cw - 0.6, 1.3, 0.05, MATERIALS.glassDark, cx, cy + 1.75, cz + cd / 2 + 0.01);
  winS.castShadow = false;
  cabin.add(winS);
  // external door on the -X side
  cabin.add(box(0.06, 2.0, 0.9, MATERIALS.subSteel, cx - cw / 2 - 0.02, cy + 1.2, cz - 0.6));
  // control console inside (sloped toward the window)
  const console_ = box(1.0, 0.5, 1.8, MATERIALS.topDriveDark, cx + 0.7, cy + 0.95, cz);
  console_.rotation.z = -0.35;
  cabin.add(console_);
  const chair = box(0.5, 0.9, 0.5, MATERIALS.rubber, cx - 0.3, cy + 0.65, cz);
  cabin.add(chair);
  // air conditioner on the roof
  cabin.add(box(0.8, 0.5, 0.8, MATERIALS.galvanised, cx - 0.6, cy + ch + 0.55, cz - 0.6));
  group.add(cabin);

  /* ---- Mousehole for the transferred joint ---- */
  const [mx, my, mz] = L.mousehole;
  group.add(cyl(0.2, 0.2, 0.8, MATERIALS.topDriveDark, 16, mx, my + 0.15, mz));

  /* ---- Equipment storage / tool boxes on the floor ---- */
  group.add(box(2.2, 1.0, 1.0, MATERIALS.containerRust, 5.0, y + 0.5, -5.2));
  group.add(box(1.6, 1.0, 0.8, MATERIALS.safetyRed, 6.6, y + 0.5, 4.9));
  group.add(box(1.0, 0.8, 1.0, MATERIALS.containerBlue, 3.2, y + 0.4, 5.2));
  // deadline anchor (+X side, receives the deadline from the crown)
  const anchor = new THREE.Group();
  anchor.name = 'DeadlineAnchor';
  anchor.add(box(0.9, 0.5, 0.9, MATERIALS.subSteel, 6.5, y + 0.25, 0.95));
  const drum = cyl(0.45, 0.45, 0.4, MATERIALS.drawworksGrey, 20, 6.5, y + 0.75, 0.95);
  drum.rotation.x = Math.PI / 2;
  anchor.add(drum);
  group.add(anchor);

  return {
    group,
    bracing,
    deck,
    rotary,
    cabin,
    deadlineAnchor: v3(6.5, y + 0.95, 0.95),
    floorTopY: L.floorY,
  };
}
