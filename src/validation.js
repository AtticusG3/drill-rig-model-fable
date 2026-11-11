import * as THREE from 'three';
import { LAYOUT } from './layout.js';
import { createState, deriveState, linkTiltMin, DRILL_TILT } from './sim/rigState.js';
import { runProcedureChecks, runFullCycleCheck } from './sim/checks.js';
import { routeClearance } from './site/vehicles.js';

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _box = new THREE.Box3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

const fmt = (n) => (Math.round(n * 1000) / 1000).toString();

/** Signed distance of point p outside the mast face on side sx (-1 = -X face, +1 = +X face); > 0 means outside. */
function outsideMastFace(p, sx) {
  const L = LAYOUT;
  const f = (p.y - L.mastBaseY) / (L.mastTopY - L.mastBaseY);
  const half = L.mastBaseHalfX + (L.mastTopHalfX - L.mastBaseHalfX) * Math.min(1, Math.max(0, f));
  return sx * p.x - half;
}

const _ib = new THREE.Box3();
const _im = new THREE.Matrix4();
/** World-space bounding boxes of every mesh (and every instance of instanced meshes) under the given roots. */
export function collectBoxes(roots) {
  const boxes = [];
  for (const root of roots) {
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      if (!o.geometry.boundingBox || o.geometry.boundingBox.isEmpty()) return;
      if (o.isInstancedMesh) {
        for (let i = 0; i < o.count; i++) {
          o.getMatrixAt(i, _im);
          _im.premultiply(o.matrixWorld);
          boxes.push(_ib.copy(o.geometry.boundingBox).applyMatrix4(_im).clone());
        }
      } else {
        boxes.push(_ib.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld).clone());
      }
    });
  }
  return boxes;
}

/**
 * Programmatic spatial and procedural checks. Prints explicit PASS / FAIL
 * lines to the browser console and returns { name, pass, detail }[].
 */
export function runValidation(rig) {
  const { scene, mast, sub, hoist, drawworks, pipe, mud, bop, string, animator } = rig;
  const L = LAYOUT;
  const s = animator.state;
  const results = [];
  const check = (name, pass, detail) => results.push({ name, pass: !!pass, detail });
  scene.updateMatrixWorld(true);

  /* 1. Well centre alignment */
  {
    const items = [['top-drive quill', hoist.rotating], ['drill string', string.group], ['rotary table', sub.rotary], ['BOP stack', bop.group]];
    let worst = 0;
    const parts = [];
    for (const [label, obj] of items) {
      obj.getWorldPosition(_v);
      const r = Math.hypot(_v.x, _v.z);
      worst = Math.max(worst, r);
      parts.push(`${label} r=${fmt(r)}`);
    }
    check('Well centre alignment (X=0, Z=0)', worst < 0.01, parts.join(', '));
  }

  /* 2. Crown above travelling block at maximum hoist */
  {
    hoist.update(L.hoistMax, 0, 0, 0, null);
    scene.updateMatrixWorld(true);
    _box.setFromObject(hoist.block);
    const blockTop = _box.max.y;
    _box.setFromObject(mast.crown);
    const crownBottom = _box.min.y;
    check('Crown block above travelling block (at max hoist)', crownBottom > blockTop && blockTop < L.crownUndersideY, `crown base ${fmt(crownBottom)} m, water-table underside ${fmt(L.crownUndersideY)} m > block top ${fmt(blockTop)} m`);

    /* 3. Travelling block above top drive */
    _a.set(0, hoist.localBlockBottom, 0);
    hoist.block.localToWorld(_a);
    _b.set(0, hoist.localTopDriveTop, 0);
    hoist.body.localToWorld(_b);
    check('Travelling block above top drive', _a.y >= _b.y - 1e-6, `block becket ${fmt(_a.y)} m >= top-drive bail ${fmt(_b.y)} m`);
  }

  /* 4. Top drive above rotary table at minimum hoist (links in drill-down tilt) */
  {
    const tilt = Math.max(DRILL_TILT, linkTiltMin(L.hoistMin));
    hoist.update(L.hoistMin, 0, tilt, 0, null);
    scene.updateMatrixWorld(true);
    _a.set(0, hoist.localQuillBottom, 0);
    hoist.rotating.localToWorld(_a);
    _box.setFromObject(hoist.body).union(new THREE.Box3().setFromObject(hoist.linkGroup));
    const lowest = _box.min.y;
    check('Top drive above rotary table (at min hoist)', _a.y > L.rotaryTopY && lowest > sub.floorTopY, `quill ${fmt(_a.y)} m > rotary ${fmt(L.rotaryTopY)} m; lowest part (elevator in drill-down tilt) ${fmt(lowest)} m > deck ${fmt(sub.floorTopY)} m`);
  }

  /* 5. Drill floor elevation */
  _box.setFromObject(sub.deck);
  check('Drill floor elevation ~ 8 m', Math.abs(_box.max.y - 8) < 0.3, `deck top ${fmt(_box.max.y)} m`);

  /* 6. Mast height */
  _box.setFromObject(mast.crown);
  check('Mast height ~ 48 m (crown on the water table)', Math.abs(mast.topY - 48) < 0.5 && _box.min.y >= mast.topY - 0.01 && _box.max.y < 51, `leg tops ${fmt(mast.topY)} m, crown ${fmt(_box.min.y)}..${fmt(_box.max.y)} m`);

  /* 7-9. Equipment arrangement */
  _box.setFromObject(pipe.racks);
  check('Pipe racks on positive X', _box.min.x > 0, `rack extent X ${fmt(_box.min.x)} .. ${fmt(_box.max.x)} m`);
  _box.setFromObject(drawworks.group);
  check('Drawworks on negative X', _box.max.x < 0, `drawworks extent X ${fmt(_box.min.x)} .. ${fmt(_box.max.x)} m`);
  {
    _box.setFromObject(mud.tanks);
    const shakerBox = new THREE.Box3().setFromObject(mud.shakers);
    check('Mud tanks behind the rig (negative Z)', _box.max.z < -L.floorZ / 2 && shakerBox.max.z < -L.floorZ / 2, `tanks Z ${fmt(_box.min.z)} .. ${fmt(_box.max.z)} m; shakers max Z ${fmt(shakerBox.max.z)} m`);
  }

  /* 10. Drill string rotation axis */
  {
    string.update(30, 1.234);
    string.group.updateMatrixWorld(true);
    string.group.getWorldQuaternion(_q);
    _v.set(0, 1, 0).applyQuaternion(_q);
    const dot = _v.y;
    string.group.getWorldPosition(_a);
    string.update(12, 4.2);
    string.group.updateMatrixWorld(true);
    string.group.getWorldPosition(_b);
    const drift = Math.max(Math.hypot(_a.x, _a.z), Math.hypot(_b.x, _b.z));
    check('Drill string rotates about world Y without orbiting', dot > 0.9999 && drift < 1e-6, `axis·Y = ${fmt(dot)}, centre drift ${fmt(drift)} m at two elevations and spins`);
  }

  /* 11. Hoisting travel limits */
  {
    const t = createState();
    t.q = 1e6;
    deriveState(t);
    const hi = t.q;
    t.q = -1e6;
    deriveState(t);
    const lo = t.q;
    const pass = hi === L.hoistMax && lo === L.hoistMin && L.hoistMax + L.blockTopLocal < L.crownUndersideY;
    check('Hoisting travel clamped to defined limits', pass, `travel ${fmt(lo)} .. ${fmt(hi)} m; block top at max ${fmt(L.hoistMax + L.blockTopLocal)} m < water table ${fmt(L.crownUndersideY)} m`);
  }

  /* 12. Fast line and deadline run outside the mast faces */
  {
    drawworks.fastLine.updateMatrixWorld(true);
    let minOut = Infinity;
    const lineSamples = (a, b, sx) => {
      for (let i = 0; i <= 40; i++) {
        _v.lerpVectors(a, b, i / 40);
        if (_v.y > L.mastBaseY + 1 && _v.y < L.mastTopY - 0.2) minOut = Math.min(minOut, outsideMastFace(_v, sx));
      }
    };
    const fl = drawworks.fastLine;
    const dir = new THREE.Vector3(0, 1, 0).applyQuaternion(fl.quaternion).multiplyScalar(fl.scale.y / 2);
    lineSamples(fl.position.clone().sub(dir), fl.position.clone().add(dir), -1);
    lineSamples(mast.deadLineTop, sub.deadlineAnchor, 1);
    check('Fast line and deadline clear the mast faces', minOut > 0.05, `closest approach outside the face ${fmt(minOut)} m`);
  }

  /* 13-16. Operating procedures, dry-run headless from a fresh state */
  const proc = runProcedureChecks();
  for (const r of proc.results) results.push(r);
  results.push(runFullCycleCheck());

  // restore the live view (the hoist re-applies because its cached position differs; the hose was never moved)
  animator.applyView(0);
  scene.updateMatrixWorld(true);

  /* ---- site: third-party cabins and truck routes ---- */
  if (rig.thirdParty && rig.traffic && rig.obstacleRoots) {
    const others = collectBoxes(rig.obstacleRoots.filter((r) => r !== rig.thirdParty.group)).filter((b) => b.max.y > 0.45);
    const hx = L.siteX / 2;
    const hz = L.siteZ / 2;
    let ok = true;
    const parts = [];
    for (const [label, obj] of [['DD office', rig.thirdParty.dd], ['MWD unit', rig.thirdParty.mwd], ['Mud engineer lab', rig.thirdParty.mudLab]]) {
      _box.setFromObject(obj);
      const onPad = _box.min.x > -hx + 1 && _box.max.x < hx - 1 && _box.min.z > -hz + 1 && _box.max.z < hz - 1;
      _box.expandByScalar(-0.05);
      _box.min.y = Math.max(_box.min.y, 0.5);
      const hit = others.some((b) => b.intersectsBox(_box));
      ok = ok && onPad && !hit;
      parts.push(`${label} ${onPad ? 'on pad' : 'OFF PAD'}${hit ? ', OVERLAPS equipment' : ', clear'}`);
    }
    check('Third-party cabins (DD, MWD, mud engineer) on the pad and clear of equipment', ok, parts.join('; '));

    const all = collectBoxes(rig.obstacleRoots);
    const parts2 = [];
    let worst = Infinity;
    for (const route of Object.values(rig.traffic.routes)) {
      const c = routeClearance(route, all);
      worst = Math.min(worst, c.min);
      parts2.push(`${route.kind} truck route: min clearance ${fmt(c.min)} m${c.where ? ` at (${fmt(c.where[0])}, ${fmt(c.where[1])})` : ''}`);
    }
    check('Truck routes clear of fixed equipment', worst > 0.3, parts2.join('; '));
  }

  /* ---- report ---- */
  const passed = results.filter((r) => r.pass).length;
  console.group(`%cRig spatial & procedural validation: ${passed}/${results.length} passed`, `color:${passed === results.length ? '#4bd37b' : '#ff7a45'};font-weight:bold`);
  for (const r of results) {
    if (r.pass) console.log(`%c PASS %c ${r.name} — ${r.detail}`, 'background:#1f6b3a;color:#fff;border-radius:3px', 'color:inherit');
    else console.error(`FAIL  ${r.name} — ${r.detail}`);
  }
  console.groupEnd();
  return results;
}
