import * as THREE from 'three';
import { MATERIALS } from '../materials.js';
import { LAYOUT } from '../layout.js';
import { box, cyl, cylZ, beamBetween, updateBeam, Hose, v3 } from '../geometry.js';
import { elevatorPoint } from '../sim/rigState.js';

/**
 * Hoisting assembly: integrated travelling block-hook + top drive. The group
 * moves only along Y (position.y = hoist position = quill-bottom elevation),
 * so every child stays coaxial with the wellbore (X = 0, Z = 0).
 *
 * Local Y datum: 0 = quill bottom / saver-sub top.
 *   saver sub -0.5..0 | IBOP + pipe handler 0..0.9 | gearbox 0.9..2.3 |
 *   motor 2.3..4.7 | bail 4.7..5.0 | block becket 5.0 | block 5.0..7.5
 *
 * Elevator links and the elevator are world-space objects positioned from the
 * link-tilt state (they swing outside the vertical-only group).
 */
export function buildHoistingAssembly(mast) {
  const L = LAYOUT;
  const group = new THREE.Group();
  group.name = 'HoistingAssembly';

  /* ---------------- Rotating group: quill, IBOP, saver sub ---------------- */
  const rotating = new THREE.Group();
  rotating.name = 'RotatingQuill';
  rotating.add(cyl(0.16, 0.16, 0.9, MATERIALS.drillCollar, 20, 0, 0.45, 0));          // main shaft / IBOP body
  rotating.add(cyl(0.19, 0.19, 0.25, MATERIALS.safetyRed, 20, 0, 0.6, 0));           // IBOP actuator collar (red = easy to see turning)
  const saver = cyl(0.085, 0.085, L.saverSubLength, MATERIALS.toolJoint, 20, 0, -L.saverSubLength / 2, 0);
  rotating.add(saver);
  rotating.add(cyl(0.12, 0.12, 0.6, MATERIALS.drillCollar, 16, 0, 4.9, 0));          // wash pipe / swivel stem
  // painted index marks on the quill so rotation is obvious
  for (const a of [0, Math.PI]) {
    const m = box(0.05, 0.85, 0.04, a === 0 ? MATERIALS.safetyYellow : MATERIALS.cabinWhite, Math.cos(a) * 0.16, 0.45, Math.sin(a) * 0.16);
    m.castShadow = false;
    rotating.add(m);
  }
  group.add(rotating);

  /* ---------------- Top drive body (stationary housing) ---------------- */
  const body = new THREE.Group();
  body.name = 'TopDrive';
  body.add(box(1.6, 1.4, 1.2, MATERIALS.topDriveDark, 0, 1.6, 0));                   // gearbox
  body.add(box(1.8, 0.2, 1.4, MATERIALS.topDriveYellow, 0, 2.35, 0));                // gearbox top flange
  body.add(cyl(0.68, 0.68, 2.3, MATERIALS.topDriveYellow, 32, 0, 3.55, 0));         // AC motor
  body.add(cyl(0.72, 0.72, 0.25, MATERIALS.topDriveDark, 32, 0, 2.5, 0));
  body.add(cyl(0.5, 0.5, 0.3, MATERIALS.topDriveDark, 24, 0, 4.85, 0));             // swivel housing
  body.add(box(0.5, 0.6, 0.5, MATERIALS.topDriveDark, 0.85, 3.8, -0.3));             // cooling blower
  // bail: links the top drive to the block becket
  for (const sx of [-1, 1]) body.add(cyl(0.07, 0.07, 0.5, MATERIALS.drillCollar, 10, sx * 0.3, 4.95 + 0.0, 0));
  body.add(box(0.9, 0.12, 0.3, MATERIALS.topDriveDark, 0, 5.15, 0));
  // pipe handler: rotating-head ring with backup-wrench jaws around the saver sub (non-rotating here)
  const handler = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.07, 10, 28), MATERIALS.topDriveYellow);
  handler.rotation.x = Math.PI / 2;
  handler.position.y = 0.75;
  body.add(handler);
  for (const sx of [-1, 1]) {
    body.add(box(0.14, 0.75, 0.18, MATERIALS.topDriveDark, sx * 0.34, 0.15, 0));     // backup wrench legs
    body.add(box(0.14, 0.12, 0.3, MATERIALS.topDriveDark, sx * 0.19, -0.18, 0));     // backup jaws at the saver sub
  }
  // link-tilt actuators: from the gearbox to the link ears
  for (const sx of [-1, 1]) {
    body.add(box(0.22, 0.45, 0.3, MATERIALS.topDriveDark, sx * 0.75, L.linkPivotLocal, 0));   // link ears
    body.add(cylZ(0.05, 0.9, MATERIALS.drillCollar, 10, sx * 0.62, 1.55, 0.6));                // tilt cylinder
  }
  // mud inlet gooseneck on top (rotary hose attaches here)
  const gooseneck = cyl(0.09, 0.09, 0.6, MATERIALS.topDriveDark, 12, 0.35, 5.05, 0.45);
  gooseneck.rotation.x = 0.6;
  body.add(gooseneck);
  const hoseInletLocal = v3(0.35, 5.0, 0.6);
  const serviceLoopLocal = v3(-0.6, 4.4, -0.9);
  body.add(box(0.3, 0.3, 0.4, MATERIALS.topDriveDark, -0.6, 4.4, -0.75));             // electrical junction box
  // torque reaction arms to the guide dolly (rear, -Z)
  for (const yy of [1.9, 4.0]) body.add(box(1.2, 0.3, 0.6, MATERIALS.topDriveDark, 0, yy, -0.9));
  // guide dolly: open frame (two posts riding the rails + two cross beams) with roller shoes on the rail fronts
  for (const sx of [-1, 1]) body.add(box(0.26, 2.8, 0.18, MATERIALS.topDriveYellow, sx * L.guideRailX, 2.95, L.guideRailZ + 0.3));
  for (const yy of [1.9, 4.0]) body.add(box(3.26, 0.26, 0.18, MATERIALS.topDriveYellow, 0, yy, L.guideRailZ + 0.3));
  for (const sx of [-1, 1]) for (const yy of [1.9, 4.0]) {
    body.add(box(0.42, 0.34, 0.3, MATERIALS.topDriveDark, sx * L.guideRailX, yy, L.guideRailZ + 0.09));
  }
  group.add(body);

  /* ---------------- Integrated travelling block-hook ---------------- */
  const block = new THREE.Group();
  block.name = 'TravellingBlock';
  const blockBottom = 5.0;
  const blockTop = L.blockTopLocal;
  const sheaveY = blockBottom + 1.35;
  const sheaveZs = mast.crownSheaveZs;
  for (const sz of [-1, 1]) block.add(box(1.6, L.blockHeight - 0.2, 0.08, MATERIALS.blockYellow, 0, (blockBottom + blockTop) / 2 + 0.1, sz * 0.86));
  block.add(box(0.4, 0.3, 1.8, MATERIALS.blockYellow, 0, blockTop - 0.15, 0));          // top tie (between the line runs)
  block.add(box(1.2, 0.4, 1.8, MATERIALS.blockYellow, 0, blockBottom + 0.2, 0));        // becket / hook body
  block.add(box(0.5, 0.25, 0.5, MATERIALS.topDriveDark, 0, blockBottom + 0.02, 0));     // becket pin housing
  block.add(cylZ(0.11, 1.9, MATERIALS.galvanised, 12, 0, sheaveY, 0));
  const blockSheaveR = 0.62;
  const sheaveGeom = new THREE.CylinderGeometry(blockSheaveR, blockSheaveR, 0.16, 28);
  const grooveGeom = new THREE.TorusGeometry(blockSheaveR, 0.05, 8, 28);
  const blockSheaves = [];
  for (const z of sheaveZs) {
    const s = new THREE.Mesh(sheaveGeom, MATERIALS.galvanised);
    s.rotation.x = Math.PI / 2;
    s.position.set(0, sheaveY, z);
    s.castShadow = true;
    block.add(s);
    blockSheaves.push(s);
    const g = new THREE.Mesh(grooveGeom, MATERIALS.topDriveDark);
    g.position.set(0, sheaveY, z);
    block.add(g);
    // spoke marks so sheave rotation is visible
    const spoke = box(blockSheaveR * 1.8, 0.08, 0.17, MATERIALS.topDriveDark, 0, 0, 0);
    spoke.castShadow = false;
    s.add(spoke);
  }
  group.add(block);

  /* ---------------- Elevator links + elevator (world space) ---------------- */
  const linkGroup = new THREE.Group();
  linkGroup.name = 'ElevatorLinks';
  const links = [0, 1].map(() => {
    const m = beamBetween(v3(0, 0, 0), v3(0, 1, 0), 0.045, MATERIALS.toolJoint);
    linkGroup.add(m);
    return m;
  });
  const elevator = new THREE.Group();
  elevator.name = 'Elevator';
  // local +Y = bore axis; ring in the local XZ plane; links attach at local x = +-0.42
  const half = new THREE.TorusGeometry(0.2, 0.075, 10, 16, Math.PI);
  const fixedHalf = new THREE.Mesh(half, MATERIALS.topDriveYellow);
  fixedHalf.rotation.x = Math.PI / 2;           // arc in local XZ, spanning z >= 0
  fixedHalf.castShadow = true;
  elevator.add(fixedHalf);
  const gate = new THREE.Group();               // hinged at local (-0.2, 0, 0)
  gate.position.set(-0.2, 0, 0);
  const gateHalf = new THREE.Mesh(half, MATERIALS.topDriveYellow);
  gateHalf.rotation.x = -Math.PI / 2;           // arc in local XZ, spanning z <= 0 (the opening gate)
  gateHalf.position.set(0.2, 0, 0);
  gateHalf.castShadow = true;
  gate.add(gateHalf);
  gate.add(box(0.12, 0.12, 0.12, MATERIALS.topDriveDark, 0.4, 0, 0.02));              // latch block
  elevator.add(gate);
  for (const sx of [-1, 1]) elevator.add(box(0.2, 0.16, 0.14, MATERIALS.topDriveDark, sx * 0.34, 0.02, 0));   // link ears
  elevator.add(box(0.36, 0.06, 0.2, MATERIALS.topDriveDark, 0, -0.1, 0.2));              // body on the fixed half
  linkGroup.add(elevator);

  /* ---------------- Drilling line: 10 reeved runs between block and crown ---------------- */
  const lines = new THREE.Group();
  lines.name = 'DrillingLine';
  const runs = [];
  for (const z of sheaveZs) for (const sx of [-1, 1]) {
    const m = beamBetween(v3(sx * 0.62, 20, z), v3(sx * 0.62, 30, z), 0.02, MATERIALS.wireRope);
    m.castShadow = false;
    lines.add(m);
    runs.push({ mesh: m, x: sx * 0.62, z });
  }
  const crownRopeY = mast.crownSheaveY;

  /* ---------------- Electrical service loop ---------------- */
  const serviceLoop = new Hose(0.05, MATERIALS.rubber, { segments: 32, hoseLength: 22, minSag: 1.2 });
  serviceLoop.mesh.name = 'ServiceLoop';

  /* ---------------- Update from simulation state ---------------- */
  const _a = new THREE.Vector3();
  const _b = new THREE.Vector3();
  const _w = new THREE.Vector3();
  const _E = new THREE.Vector3();
  const _up = new THREE.Vector3();
  const _x = new THREE.Vector3(1, 0, 0);
  const _z = new THREE.Vector3();
  const _m = new THREE.Matrix4();
  let lastQ = NaN;

  const api = {
    group,
    rotating,
    body,
    block,
    lines,
    linkGroup,
    elevator,
    serviceLoop,
    blockSheaves,
    localBlockTop: blockTop,
    localBlockBottom: blockBottom,
    localTopDriveTop: 5.0,
    localQuillBottom: 0,
    hoseInletLocal,

    /** Apply hoist position, quill angle, link tilt, elevator state; `boreAxis` = carried pipe axis (top->pin) or null. */
    update(q, quillAngle, tilt, elevatorClosed, boreAxis) {
      if (q !== lastQ) {
        const dq = Number.isNaN(lastQ) ? 0 : q - lastQ;
        lastQ = q;
        group.position.set(0, q, 0);
        group.updateMatrixWorld(true);
        for (const r of runs) {
          _a.set(r.x, q + sheaveY, r.z);
          _b.set(r.x, crownRopeY, r.z);
          updateBeam(r.mesh, _a, _b, 0.02);
        }
        for (const s of blockSheaves) s.rotation.y += dq / blockSheaveR;
        _w.copy(serviceLoopLocal);
        body.localToWorld(_w);
        serviceLoop.update(mast.serviceLoopAnchor, _w);
      }
      rotating.rotation.y = quillAngle;

      // links from the ears to the elevator ears
      elevatorPoint(q, tilt, _E);
      for (let i = 0; i < 2; i++) {
        const sx = i === 0 ? -1 : 1;
        _a.set(sx * 0.75, q + L.linkPivotLocal, 0);
        _b.set(sx * 0.42, _E.y, _E.z);
        updateBeam(links[i], _a, _b, 0.045);
      }
      // elevator: bore axis follows the carried pipe, otherwise hangs in line with the links
      if (boreAxis) _up.copy(boreAxis).negate();
      else _up.set(0, q + L.linkPivotLocal - _E.y, -_E.z).normalize();
      _z.crossVectors(_x, _up).normalize();
      _m.makeBasis(_x, _up, _z);
      elevator.quaternion.setFromRotationMatrix(_m);
      elevator.position.copy(_E);
      gate.rotation.y = (1 - elevatorClosed) * 1.9;
    },

    /** World-space hose inlet on the top drive. */
    getHoseInletWorld(out) {
      out.copy(hoseInletLocal);
      return body.localToWorld(out);
    },
  };

  api.update(20, 0, 0, 0, null);
  return api;
}
