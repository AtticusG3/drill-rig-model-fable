import * as THREE from 'three';
import { MATERIALS } from '../materials.js';
import { LAYOUT } from '../layout.js';
import { box, cyl, cylX, makeTubular, poseTubular, v3 } from '../geometry.js';
import { SLOT_COUNT, STAND, slotPos, MOUSE_Z } from '../sim/rigState.js';

const DOWN = new THREE.Vector3(0, -1, 0);

/**
 * Drill-floor handling equipment driven by the simulation:
 *  - power slips in the rotary table
 *  - iron roughneck on a floor track (+X side of the rotary)
 *  - setback stands (one mesh per fingerboard slot; a stand being handled
 *    reuses its slot's mesh so it never teleports)
 */
export function buildFloorEquipment() {
  const L = LAYOUT;
  const group = new THREE.Group();
  group.name = 'FloorEquipment';

  /* ---------------- Power slips ---------------- */
  const slips = new THREE.Group();
  slips.name = 'PowerSlips';
  const segs = [];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + Math.PI / 6;
    const seg = new THREE.Group();
    const insert = box(0.16, 0.42, 0.24, MATERIALS.toolJoint, 0, 0, 0);
    seg.add(insert);
    seg.add(box(0.05, 0.3, 0.2, MATERIALS.topDriveDark, -0.08, 0, 0));          // die face
    seg.add(box(0.1, 0.08, 0.3, MATERIALS.safetyYellow, 0.06, 0.24, 0));        // handle
    seg.rotation.y = -a;
    seg.userData.angle = a;
    slips.add(seg);
    segs.push(seg);
  }
  group.add(slips);

  /* ---------------- Iron roughneck ---------------- */
  const roughneck = new THREE.Group();
  roughneck.name = 'IronRoughneck';
  // floor track along X at z = 0
  for (const z of [-0.35, 0.35]) group.add(box(L.roughneckParkX + 0.9 - (L.roughneckWorkX - 0.6), 0.08, 0.12, MATERIALS.subSteel, (L.roughneckParkX + 0.9 + L.roughneckWorkX - 0.6) / 2, L.floorY + 0.04, z));
  const carriage = new THREE.Group();
  carriage.add(box(1.1, 0.4, 0.9, MATERIALS.topDriveYellow, 0, L.floorY + 0.28, 0));       // base on the track
  carriage.add(box(0.4, 1.0, 0.45, MATERIALS.topDriveYellow, 0.25, L.floorY + 0.95, 0));   // column
  const arm = box(1, 0.22, 0.32, MATERIALS.topDriveYellow, 0, L.floorY + 1.15, 0);                // telescoping arm (scaled in update)
  carriage.add(arm);
  carriage.add(cyl(0.3, 0.3, 0.16, MATERIALS.topDriveDark, 18, 0.25, L.floorY + 0.5, 0));           // slew ring
  carriage.add(box(0.3, 0.5, 0.5, MATERIALS.motorGrey, 0.55, L.floorY + 0.75, 0));         // hydraulic power pack
  // head: C-frame open toward -X, centred at x = -reach
  const head = new THREE.Group();
  head.position.set(-L.roughneckReach, 0, 0);
  const hy = 8.45 + 0.7;                                                                    // connection height (stump top)
  head.add(box(0.12, 0.85, 0.7, MATERIALS.topDriveDark, 0.36, hy, 0));                     // back plate
  for (const sz of [-1, 1]) {
    head.add(box(0.5, 0.22, 0.12, MATERIALS.topDriveYellow, 0.12, hy - 0.25, sz * 0.27));  // torque wrench (lower jaws, grip the box)
    head.add(box(0.5, 0.2, 0.12, MATERIALS.topDriveYellow, 0.12, hy + 0.25, sz * 0.27));   // spinner frame (upper, grips the pin joint)
  }
  const rollers = [];
  for (const sz of [-1, 1]) {
    const r = cyl(0.07, 0.07, 0.22, MATERIALS.rubber, 14, 0, hy + 0.25, sz * 0.155);
    const mark = box(0.02, 0.22, 0.08, MATERIALS.safetyRed, 0.06, 0, 0);
    r.add(mark);
    head.add(r);
    rollers.push(r);
  }
  carriage.add(head);
  roughneck.add(carriage);
  group.add(roughneck);

  /* ---------------- Setback stands (one per fingerboard slot) ---------------- */
  const setback = new THREE.Group();
  setback.name = 'Setback';
  const stands = [];
  for (let i = 0; i < SLOT_COUNT; i++) {
    const t = makeTubular(STAND, { jointSpacing: L.pipeJointLength, od: L.pipeOD, tjOD: L.toolJointOD });
    const p = slotPos(i);
    poseTubular(t, v3(p.x, L.setbackY + STAND, p.z), DOWN, i * 0.7);
    setback.add(t);
    stands.push(t);
  }
  // setback drip pan / timbers where stands stand on the floor
  group.add(box(2.8, 0.05, 0.9, MATERIALS.rigMat, 0, L.floorY + 0.025, -2.18));
  group.add(setback);

  const swingAngle = Math.atan2(MOUSE_Z, L.roughneckWorkX);
  const mouseReach = Math.hypot(MOUSE_Z, L.roughneckWorkX);
  const _top = new THREE.Vector3();
  return {
    group,
    slips,
    roughneck,
    setback,
    stands,
    update(s) {
      // slips: set = wedged around the pipe in the bowl; pulled = lifted and spread
      const k = s.slips;
      const r = THREE.MathUtils.lerp(0.62, 0.155, k);
      const y = THREE.MathUtils.lerp(L.rotaryTopY + 0.35, L.rotaryTopY + 0.1, k);
      for (const seg of segs) {
        const a = seg.userData.angle;
        seg.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
      }
      // roughneck carriage
      carriage.position.x = THREE.MathUtils.lerp(L.roughneckParkX, L.roughneckWorkX, s.roughneck);
      // slew toward the mousehole and extend the arm to reach it
      const sw = s.roughneckSwing || 0;
      carriage.rotation.y = swingAngle * sw;
      const reach = THREE.MathUtils.lerp(L.roughneckReach, mouseReach, sw);
      head.position.x = -reach;
      arm.scale.x = reach - 0.25;
      arm.position.x = -(reach - 0.25) / 2 + 0.1;
      for (const ro of rollers) ro.rotation.y = s.roughneckSpin;
      // setback stands
      for (let i = 0; i < SLOT_COUNT; i++) {
        const m = stands[i];
        if (s.stand && s.stand.slot === i) {
          m.visible = true;
          poseTubular(m, s.stand.top, s.stand.axis, s.stand.spin);
        } else if (s.setback[i]) {
          m.visible = true;
          const p = slotPos(i);
          poseTubular(m, _top.set(p.x, L.setbackY + STAND, p.z), DOWN, i * 0.7);
        } else {
          m.visible = false;
        }
      }
    },
  };
}
