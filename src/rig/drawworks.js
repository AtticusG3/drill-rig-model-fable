import * as THREE from 'three';
import { MATERIALS } from '../materials.js';
import { LAYOUT } from '../layout.js';
import { box, cyl, cylZ, makeSkid, beamBetween, v3 } from '../geometry.js';

/**
 * Drawworks on the -X side of the drill floor. Drum axis is horizontal and
 * parallel to Z (parallel to the crown sheave axles) so the fast line leaves
 * the drum toward +X and rises to the crown fast-line sheave.
 */
export function buildDrawworks(mast) {
  const L = LAYOUT;
  const group = new THREE.Group();
  group.name = 'Drawworks';
  const [px, py, pz] = L.drawworksPos;
  group.position.set(px, py, pz);

  // structural mounting frame
  group.add(makeSkid(3.4, 2.4, 0.3, MATERIALS.subSteel));

  // drum housing: bearing pedestals, drum shaft, drum, flanges, wire rope wraps
  const drumY = 1.15;
  for (const z of [-1.05, 1.05]) group.add(box(0.6, 1.25, 0.3, MATERIALS.drawworksBlue, 0.1, 0.3 + 0.62, z));
  group.add(cylZ(0.13, 3.1, MATERIALS.galvanised, 14, 0.1, drumY, 0));                        // drum shaft
  const drum = cylZ(0.55, 1.6, MATERIALS.drawworksGrey, 32, 0.1, drumY, 0);
  drum.name = 'Drum';
  group.add(drum);
  const rope = cylZ(0.62, 1.4, MATERIALS.wireRope, 32, 0.1, drumY, 0);
  rope.name = 'DrumRope';
  group.add(rope);
  for (const z of [-0.85, 0.85]) group.add(cylZ(0.9, 0.08, MATERIALS.drawworksBlue, 32, 0.1, drumY, z));  // flanges
  // lebus grooving suggestion: thin dark rings
  for (let k = -3; k <= 3; k++) group.add(cylZ(0.63, 0.03, MATERIALS.topDriveDark, 24, 0.1, drumY, k * 0.2));
  // painted marks on the drum flanges so drum rotation is visible while hoisting
  const drumMarks = [];
  for (const z of [-0.9, 0.9]) {
    const mark = box(1.7, 0.12, 0.03, MATERIALS.safetyYellow, 0.1, drumY, z);
    mark.castShadow = false;
    group.add(mark);
    drumMarks.push(mark);
  }

  // brake assemblies: discs outboard of the flanges with calipers
  for (const z of [-1.3, 1.3]) {
    group.add(cylZ(0.8, 0.07, MATERIALS.motorGrey, 32, 0.1, drumY, z));
    group.add(box(0.35, 0.45, 0.2, MATERIALS.safetyRed, 0.1, drumY + 0.7, z));
    group.add(box(0.35, 0.45, 0.2, MATERIALS.safetyRed, 0.1 + 0.6, drumY + 0.45, z));
  }

  // gearbox at the -Z end of the shaft, two AC motors feeding it (axes along Z)
  group.add(box(1.1, 1.3, 0.9, MATERIALS.drawworksBlue, -0.9, 0.95, -1.75));
  for (const x of [-1.35, -0.45]) {
    const m = cylZ(0.4, 1.5, MATERIALS.motorBlue, 24, x, 0.95, 0.4);
    group.add(m);
    group.add(cylZ(0.42, 0.1, MATERIALS.motorGrey, 24, x, 0.95, 1.15));
    group.add(box(0.5, 0.3, 0.6, MATERIALS.motorGrey, x, 1.5, 0.4));   // terminal box
  }
  // coupling guard between motors and gearbox
  group.add(box(1.4, 0.95, 0.4, MATERIALS.safetyYellowDark, -0.9, 0.95, -1.1));

  // protective guard over the drum (frame + mesh plate)
  const guardY = drumY + 0.95;
  group.add(box(1.9, 0.04, 2.2, MATERIALS.safetyYellowDark, 0.1, guardY, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    group.add(box(0.06, guardY - 0.3, 0.06, MATERIALS.safetyYellowDark, 0.1 + sx * 0.9, 0.3 + (guardY - 0.3) / 2, sz * 1.05));
  }
  // driller-side control console stub
  group.add(box(0.5, 0.9, 0.5, MATERIALS.motorGrey, 1.4, 0.75, 1.3));

  /* ---- Fast line: drum top -> crown fast-line sheave (fixed in world space) ---- */
  const drumTopWorld = v3(px + 0.1, py + drumY + 0.62, pz);
  // the fast line leaves the drum and runs to the outboard side of the fast-line sheave, outside the mast face
  const fastLine = beamBetween(drumTopWorld, mast.fastLineTop, 0.02, MATERIALS.wireRope);
  fastLine.name = 'FastLine';

  return {
    group,
    fastLine,
    drum,
    rope,
    drumRadius: 0.62,
    spin(radians) {
      // drum/rope are Y-axis cylinders turned onto Z by rotation.x, so spin about their own local Y
      drum.rotation.y += radians;
      rope.rotation.y += radians;
      for (const m of drumMarks) m.rotation.z += radians;
    },
  };
}
