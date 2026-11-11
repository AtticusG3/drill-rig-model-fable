import * as THREE from 'three';
import { LAYOUT } from '../layout.js';
import { makeTubular } from '../geometry.js';

/**
 * The drill string in the hole. Its origin is the box tool joint at the top
 * of the string; it extends 95 m downward (through the rotary, BOP and
 * cellar, and on below ground where it is hidden by the terrain).
 *
 * The group sits on the wellbore axis and only ever translates along Y and
 * rotates about Y, so it cannot drift off the well centre. When the string is
 * made up to the top drive the view keeps its top at the saver sub and its
 * rotation equal to the quill; when it is in the slips it is stationary.
 */
export function buildDrillString() {
  const group = new THREE.Group();
  group.name = 'DrillString';
  const length = 95;
  const tub = makeTubular(length, { jointSpacing: LAYOUT.pipeJointLength, od: LAYOUT.pipeOD, tjOD: LAYOUT.toolJointOD });
  group.add(tub);
  return {
    group,
    length,
    update(topY, spin) {
      group.position.set(0, topY, 0);
      group.rotation.set(0, spin, 0);
    },
  };
}
