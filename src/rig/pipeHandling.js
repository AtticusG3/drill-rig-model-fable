import * as THREE from 'three';
import { MATERIALS } from '../materials.js';
import { LAYOUT } from '../layout.js';
import { box, makeSkid, makeRailing, makeTubular, poseTubular, beamBetween, updateBeam, cylX, v3 } from '../geometry.js';
import { JOINT, RACK_PICK_LIST, rackLayerY, rackPipeX, rackRowZ, troughFrame } from '../sim/rigState.js';

/**
 * Pipe racks (+X) and a hydraulic catwalk (+Z, in line with the V-door).
 *
 * Catwalk: a 31.6 m trough whose tail rides on a carriage along the base
 * rails. Two telescopic lift cylinders raise the rig end; once the trough is
 * above deck height in front of the V-door the tail carriage runs forward so
 * the trough end reaches over the drill floor (pose from troughFrame()).
 * A skate in the trough pushes the joint up toward the elevator.
 */
export function buildPipeHandling() {
  const L = LAYOUT;
  const group = new THREE.Group();
  group.name = 'PipeHandling';

  const racks = new THREE.Group();
  racks.name = 'PipeRacks';
  const catwalk = new THREE.Group();
  catwalk.name = 'Catwalk';
  group.add(racks, catwalk);

  /* ------------------------------------------------------------------ */
  /*  Pipe racks: bolsters on legs, three layers of parallel joints       */
  /* ------------------------------------------------------------------ */
  const stations = [1.5, 11, 20.5, 28.5].map((d) => L.rackZ0 + d);
  const rackHalfW = ((L.rackPerLayer - 1) * L.rackPitchX) / 2 + 0.3;
  const pipeR = L.pipeOD / 2;
  const tjR = L.toolJointOD / 2;
  const bodyLen = JOINT - 0.75;
  const bodyGeom = new THREE.CylinderGeometry(pipeR, pipeR, bodyLen, 12);
  bodyGeom.rotateX(Math.PI / 2);                 // axis along Z
  const boxGeom = new THREE.CylinderGeometry(tjR, tjR, 0.42, 12);
  boxGeom.rotateX(Math.PI / 2);
  const pinGeom = new THREE.CylinderGeometry(tjR, tjR, 0.3, 12);
  pinGeom.rotateX(Math.PI / 2);

  const total = L.rackXs.length * L.rackLayers * L.rackPerLayer * L.rackRows;
  const bodies = new THREE.InstancedMesh(bodyGeom, MATERIALS.drillPipe, total);
  const joints = new THREE.InstancedMesh(boxGeom, MATERIALS.toolJoint, total);
  const pins = new THREE.InstancedMesh(pinGeom, MATERIALS.toolJoint, total);
  const _m = new THREE.Matrix4();
  const _zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const slotIndex = new Map();                    // "rack|layer|i|j" -> instance index
  const original = [];
  let n = 0;

  L.rackXs.forEach((rx, ri) => {
    for (const z of stations) {
      racks.add(box(rackHalfW * 2, 0.25, 0.25, MATERIALS.subSteel, rx, L.rackY - 0.125, z));
      for (const sx of [-1, 1]) racks.add(box(0.25, L.rackY - 0.25, 0.25, MATERIALS.subSteel, rx + sx * (rackHalfW - 0.125), (L.rackY - 0.25) / 2, z));
      for (const sx of [-1, 1]) racks.add(box(0.12, 0.9, 0.12, MATERIALS.safetyYellow, rx + sx * (rackHalfW + 0.06), L.rackY + 0.45, z));
      for (let k = 1; k < L.rackLayers; k++) racks.add(box(rackHalfW * 2 - 0.4, 0.14, 0.14, MATERIALS.rigMat, rx, rackLayerY(k) - pipeR - 0.07, z));
    }
    for (let k = 0; k < L.rackLayers; k++) {
      for (let i = 0; i < L.rackPerLayer; i++) {
        for (let j = 0; j < L.rackRows; j++) {
          const x = rackPipeX(ri, i);
          const y = rackLayerY(k);
          const zc = rackRowZ(j);
          slotIndex.set(`${ri}|${k}|${i}|${j}`, n);
          // box end toward the rig (-Z), pin end toward +Z
          const mb = new THREE.Matrix4().makeTranslation(x, y, zc);
          const mj = new THREE.Matrix4().makeTranslation(x, y, zc - JOINT / 2 + 0.21);
          const mp = new THREE.Matrix4().makeTranslation(x, y, zc + JOINT / 2 - 0.15);
          original.push([mb, mj, mp]);
          bodies.setMatrixAt(n, mb);
          joints.setMatrixAt(n, mj);
          pins.setMatrixAt(n, mp);
          n++;
        }
      }
    }
  });
  for (const im of [bodies, joints, pins]) {
    im.castShadow = true;
    im.receiveShadow = true;
    racks.add(im);
  }
  const pickIndices = RACK_PICK_LIST.map((p) => slotIndex.get(`${p.rack}|${p.layer}|${p.i}|${p.j}`));
  let shownPicked = 0;
  function setPicked(count) {
    if (count === shownPicked) return;
    pickIndices.forEach((idx, k) => {
      const hide = k < count;
      bodies.setMatrixAt(idx, hide ? _zero : original[idx][0]);
      joints.setMatrixAt(idx, hide ? _zero : original[idx][1]);
      pins.setMatrixAt(idx, hide ? _zero : original[idx][2]);
    });
    for (const im of [bodies, joints, pins]) im.instanceMatrix.needsUpdate = true;
    shownPicked = count;
  }

  // indexer / kicker arms between the first rack and the catwalk
  for (const z of [14, 18.5, 23, 27.5]) {
    catwalk.add(beamBetween(v3(rackPipeX(0, 0) - 0.2, rackLayerY(L.rackLayers - 1) - 0.08, z), v3(0.95, 1.5, z), 0.05, MATERIALS.safetyYellow, 'box'));
    catwalk.add(box(0.2, 1.2, 0.2, MATERIALS.subSteel, 2.6, 0.6, z));
  }

  /* ------------------------------------------------------------------ */
  /*  Catwalk base                                                       */
  /* ------------------------------------------------------------------ */
  const cwLen = L.catwalkZ1 - L.catwalkZ0;
  const cwMid = (L.catwalkZ0 + L.catwalkZ1) / 2;
  const skid = makeSkid(cwLen, 2.6, 0.4, MATERIALS.subSteel);
  skid.rotation.y = Math.PI / 2;
  skid.position.set(0, 0.02, cwMid);
  catwalk.add(skid);
  // tail-carriage rails on the base
  for (const sx of [-1, 1]) catwalk.add(box(0.12, 0.12, 6.5, MATERIALS.galvanised, sx * 0.55, 0.5, (L.catwalkTailZ0 + L.catwalkTailZ1) / 2 + 0.3));
  // walking surfaces each side with outriggers
  for (const sx of [-1, 1]) {
    catwalk.add(box(0.9, 0.06, cwLen, MATERIALS.grating, sx * 1.75, 0.95, cwMid));
    for (let z = L.catwalkZ0 + 1; z < L.catwalkZ1; z += 4) {
      catwalk.add(box(0.9, 0.12, 0.2, MATERIALS.subSteelLight, sx * 1.75, 0.86, z));
      catwalk.add(box(0.15, 0.8, 0.15, MATERIALS.subSteelLight, sx * 2.1, 0.42, z));
    }
  }
  catwalk.add(makeRailing([v3(-2.2, 0.98, L.catwalkZ0), v3(-2.2, 0.98, L.catwalkZ1), v3(2.2, 0.98, L.catwalkZ1)], { height: 1.0, postSpacing: 2.0 }));
  catwalk.add(box(0.08, 0.2, cwLen, MATERIALS.safetyYellow, 2.2, 1.08, cwMid));
  // trough rest pads on the base
  for (let z = L.catwalkZ0 + 2; z < L.catwalkTailZ0 - 2; z += 6) catwalk.add(box(1.0, 0.45, 0.4, MATERIALS.subSteel, 0, 0.45, z));

  /* ------------------------------------------------------------------ */
  /*  Trough (moves): local -Z runs from the tail toward the rig          */
  /* ------------------------------------------------------------------ */
  const trough = new THREE.Group();
  trough.name = 'CatwalkTrough';
  const Lt = L.troughLength;
  // trough reference line = local origin axis; pipe axis rides 0.3 above it with its tool joints on the floor plate
  trough.add(box(0.8, 0.08, Lt, MATERIALS.subSteelLight, 0, 0.176, -Lt / 2));          // trough floor plate
  for (const sx of [-1, 1]) {
    const side = box(0.06, 0.42, Lt, MATERIALS.safetyYellow, sx * 0.48, 0.35, -Lt / 2);
    side.rotation.z = -sx * 0.5;
    trough.add(side);
  }
  trough.add(box(0.9, 0.3, Lt, MATERIALS.safetyYellow, 0, -0.01, -Lt / 2));            // box-section beam under the trough
  const endRoller = cylX(0.1, 0.9, MATERIALS.galvanised, 12, 0, 0.25, -Lt + 0.15);
  trough.add(endRoller);
  // tail carriage (rides the base rails)
  trough.add(box(1.4, 0.5, 1.2, MATERIALS.subSteel, 0, -0.35, -0.4));
  for (const sx of [-1, 1]) trough.add(cylX(0.18, 0.12, MATERIALS.rubber, 14, sx * 0.55, -0.45, -0.4));
  // skate (pipe pusher)
  const skate = box(0.5, 0.32, 0.45, MATERIALS.safetyRed, 0, 0.36, -6);
  trough.add(skate);
  catwalk.add(trough);

  // lift cylinders: base clevis -> trough lug (rebuilt every update)
  const liftS = 20;
  const baseLug = [v3(-0.55, 0.45, 18.0), v3(0.55, 0.45, 18.0)];
  const troughLugLocal = [v3(-0.5, -0.35, -liftS), v3(0.5, -0.35, -liftS)];
  const barrels = [];
  const rods = [];
  for (const b of baseLug) {
    catwalk.add(box(0.35, 0.5, 0.5, MATERIALS.subSteel, b.x, 0.3, b.z));
    const barrel = beamBetween(b, v3(b.x, 2, b.z), 0.13, MATERIALS.motorGrey);
    const rod = beamBetween(b, v3(b.x, 2, b.z), 0.07, MATERIALS.drillCollar);
    catwalk.add(barrel, rod);
    barrels.push(barrel);
    rods.push(rod);
  }

  /* ------------------------------------------------------------------ */
  /*  The joint being handled                                            */
  /* ------------------------------------------------------------------ */
  const single = makeTubular(JOINT, { jointSpacing: JOINT, od: L.pipeOD, tjOD: L.toolJointOD });
  single.name = 'TransferJoint';
  single.visible = false;
  group.add(single);

  const frame = troughFrame(0);
  const _w = new THREE.Vector3();
  const _mid = new THREE.Vector3();
  let lastK = -1;
  let lastSkate = -1;

  function update(s) {
    setPicked(s.rackPicked);
    if (s.catwalk !== lastK || s.skateS !== lastSkate) {
      troughFrame(s.catwalk, frame);
      trough.position.copy(frame.T);
      trough.rotation.set(frame.alpha, 0, 0);
      skate.position.z = -Math.max(0.6, Math.min(Lt - 0.4, s.skateS));
      trough.updateMatrixWorld(true);
      for (let i = 0; i < 2; i++) {
        _w.copy(troughLugLocal[i]);
        trough.localToWorld(_w);
        catwalk.worldToLocal(_w);
        // two-stage cylinder: barrel covers the lower 55 %, rod the rest
        _mid.copy(baseLug[i]).lerp(_w, 0.55);
        updateBeam(barrels[i], baseLug[i], _mid, 0.13);
        updateBeam(rods[i], _mid, _w, 0.07);
      }
      lastK = s.catwalk;
      lastSkate = s.skateS;
    }
    if (s.single) {
      single.visible = true;
      poseTubular(single, s.single.top, s.single.axis, s.single.spin);
    } else {
      single.visible = false;
    }
  }

  return { group, racks, catwalk, trough, single, update, setPicked };
}
