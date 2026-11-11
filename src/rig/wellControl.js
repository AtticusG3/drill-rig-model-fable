import * as THREE from 'three';
import { MATERIALS } from '../materials.js';
import { LAYOUT } from '../layout.js';
import { box, cyl, cylX, makePipeRun, makeSkid, v3 } from '../geometry.js';

/**
 * BOP stack beneath the drill floor, coaxial with the wellbore:
 *   wellhead 0.3..1.0 | drilling spool 1.0..1.6 | lower double ram 1.6..3.0 |
 *   spacer 3.0..3.2 | upper ram 3.2..4.6 | annular 4.8..6.4 | bell nipple 6.4..7.3
 * Rotary table bottom is at 7.7, so the stack never touches the floor.
 */
export function buildWellControl() {
  const group = new THREE.Group();
  group.name = 'BOPStack';

  const flange = (y, r = 0.72, t = 0.18) => cyl(r, r, t, MATERIALS.bopDark, 32, 0, y, 0);
  const boltsRing = (y, r = 0.62, n = 12) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      group.add(cyl(0.04, 0.04, 0.26, MATERIALS.toolJoint, 8, Math.cos(a) * r, y, Math.sin(a) * r));
    }
  };

  // wellhead / casing head
  group.add(cyl(0.5, 0.55, 0.7, MATERIALS.bopDark, 32, 0, 0.65, 0));
  group.add(flange(1.0, 0.75, 0.2));
  boltsRing(1.0, 0.65);
  // drilling spool with choke/kill outlets
  group.add(cyl(0.42, 0.42, 0.5, MATERIALS.bopDark, 32, 0, 1.35, 0));
  group.add(cylX(0.14, 1.2, MATERIALS.bopDark, 16, 0, 1.35, 0));
  for (const sx of [-1, 1]) group.add(cyl(0.22, 0.22, 0.12, MATERIALS.bopDark, 16, sx * 0.6, 1.35, 0).rotateZ(Math.PI / 2));
  group.add(flange(1.6, 0.75, 0.2));
  boltsRing(1.6, 0.65);

  // ram preventers (two bodies) with bonnets along X
  const ramBody = (y) => {
    group.add(box(2.0, 1.3, 1.3, MATERIALS.bopRed, 0, y, 0));
    for (const sx of [-1, 1]) {
      group.add(cylX(0.4, 0.8, MATERIALS.bopDark, 20, sx * 1.4, y, 0));        // bonnet
      group.add(cylX(0.14, 0.5, MATERIALS.bopDark, 12, sx * 2.0, y, 0));       // operating cylinder
      for (const sz of [-1, 1]) group.add(cylX(0.05, 0.5, MATERIALS.toolJoint, 8, sx * 1.25, y + 0.45, sz * 0.45));  // bonnet bolts
    }
    group.add(cyl(0.55, 0.55, 1.3, MATERIALS.bopDark, 24, 0, y, 0));          // vertical bore housing
  };
  ramBody(2.3);
  group.add(flange(3.05, 0.75, 0.2));
  boltsRing(3.05, 0.65);
  ramBody(3.9);
  group.add(flange(4.7, 0.78, 0.2));
  boltsRing(4.7, 0.68);

  // annular preventer: cylinder with domed head
  group.add(cyl(0.78, 0.78, 1.2, MATERIALS.bopDark, 32, 0, 5.4, 0));
  group.add(cyl(0.48, 0.78, 0.45, MATERIALS.bopDark, 32, 0, 6.22, 0));
  group.add(cyl(0.5, 0.5, 0.12, MATERIALS.bopRed, 32, 0, 6.5, 0));
  // bell nipple up to just below the rotary table
  group.add(cyl(0.3, 0.3, 0.85, MATERIALS.bopDark, 24, 0, 6.98, 0));

  /* ---- Hydraulic control lines: from an accumulator / manifold to the ram operating cylinders ---- */
  const manifoldPos = v3(3.6, 0.9, -3.4);
  group.add(box(1.4, 1.0, 0.8, MATERIALS.motorGrey, manifoldPos.x, manifoldPos.y, manifoldPos.z));
  for (const b of [v3(-2.2, 2.3, 0), v3(2.2, 2.3, 0), v3(-2.2, 3.9, 0), v3(2.2, 3.9, 0)]) {
    const mid = v3(b.x, 0.6, -2.2);
    const line = makePipeRun([v3(manifoldPos.x, 0.6, manifoldPos.z + 0.4), v3(b.x, 0.6, -3.0), mid, v3(b.x, b.y, -0.6), v3(b.x, b.y, -0.3)], 0.03, MATERIALS.rubber);
    group.add(line);
  }

  /* ---- Choke line (+X) to the choke manifold skid, kill line (-X) ---- */
  const choke = makePipeRun([v3(0.6, 1.35, 0), v3(3.4, 1.35, 0), v3(3.4, 1.35, -7.0), v3(9.0, 1.0, -9.0)], 0.1, MATERIALS.bopDark);
  group.add(choke);
  const chokeSkid = new THREE.Group();
  chokeSkid.position.set(10.5, 0.2, -9.5);
  chokeSkid.add(makeSkid(4, 2.2, 0.3));
  for (let i = 0; i < 4; i++) {
    const vx = -1.2 + i * 0.8;
    chokeSkid.add(cyl(0.2, 0.2, 1.1, MATERIALS.bopDark, 16, vx, 0.9, 0));
    chokeSkid.add(cylX(0.08, 0.6, MATERIALS.safetyRed, 10, vx, 1.6, 0));   // valve hand wheels (as hubs)
  }
  chokeSkid.add(cylX(0.1, 3.6, MATERIALS.bopDark, 12, 0, 1.0, 0));
  group.add(chokeSkid);
  const kill = makePipeRun([v3(-0.6, 1.35, 0), v3(-3.3, 1.35, 0), v3(-3.3, 0.7, -3.0), v3(-6.5, 0.7, -8.0)], 0.1, MATERIALS.bopDark);
  group.add(kill);

  return {
    group,
    topY: 7.4,
    bellNippleOutlet: v3(0, 6.8, -0.3),
    manifold: manifoldPos,
  };
}
