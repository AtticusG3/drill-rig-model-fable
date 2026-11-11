import * as THREE from 'three';
import { MATERIALS, registerMaterial } from '../materials.js';
import { LAYOUT } from '../layout.js';
import { box, cyl, cylX, cylZ, makeStairs, v3 } from '../geometry.js';
import { makeSign } from '../site/signs.js';
import { WIND } from '../site/terrain.js';

const paint = (color, roughness = 0.6, metalness = 0.1) => registerMaterial(new THREE.MeshStandardMaterial({ color, roughness, metalness }));

const M = {
  wall: paint(0xe9e6de, 0.7),
  roof: paint(0xc9cdd0, 0.5, 0.4),
  ddBand: paint(0x1f5fa8),
  mwdBand: paint(0xd9621e),
  mudBand: paint(0x2f7d4f),
  ac: paint(0xd5d8da, 0.5, 0.3),
  uteWhite: paint(0xf2f2ee, 0.35, 0.3),
  hiVis: paint(0xff7a1a, 0.6),
  beacon: registerMaterial(new THREE.MeshStandardMaterial({ color: 0xff9a1a, emissive: 0xff7a00, emissiveIntensity: 0.9, roughness: 0.3 })),
  sack: paint(0xcdbb96, 0.95, 0),
  pallet: paint(0x9a7a52, 0.95, 0),
  loo: paint(0x2f6fa5, 0.6),
  green: paint(0x1f8a4c, 0.6),
};

/**
 * Skid-mounted portable office. Local frame: long axis X, door and windows on
 * the +Z face, origin at ground level under the centre.
 */
function cabin({ length = 9, width = 3, height = 2.7, band, signFront, signEnd, windows = 3 }) {
  const g = new THREE.Group();
  const base = 0.35;
  // skid runners and floor frame
  for (const sz of [-1, 1]) g.add(box(length + 0.5, 0.25, 0.25, MATERIALS.subSteel, 0, 0.125, sz * (width / 2 - 0.35)));
  g.add(box(length, 0.1, width, MATERIALS.subSteel, 0, base - 0.05, 0));
  g.add(box(length, height, width, M.wall, 0, base + height / 2, 0));
  g.add(box(length + 0.16, 0.1, width + 0.16, M.roof, 0, base + height + 0.05, 0));
  // company colour band under the roof line, all round
  g.add(box(length + 0.04, 0.32, width + 0.04, band, 0, base + height - 0.3, 0));
  // corner posts
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.14, height, 0.14, MATERIALS.subSteelLight, sx * (length / 2 - 0.05), base + height / 2, sz * (width / 2 - 0.05)));

  // door near the +X end of the front, windows along the rest
  const doorX = length / 2 - 1.3;
  g.add(box(0.95, 2.05, 0.06, MATERIALS.subSteelLight, doorX, base + 1.03, width / 2 + 0.02));
  g.add(box(0.3, 0.4, 0.07, MATERIALS.glassDark, doorX, base + 1.55, width / 2 + 0.03));
  const span = length - 3.4;
  for (let i = 0; i < windows; i++) {
    const x = -length / 2 + 0.9 + (span * (i + 0.5)) / windows;
    g.add(box(1.25, 0.95, 0.06, MATERIALS.subSteel, x, base + 1.55, width / 2 + 0.01));
    g.add(box(1.1, 0.8, 0.07, MATERIALS.glassDark, x, base + 1.55, width / 2 + 0.02));
  }
  // landing and steps to the door
  g.add(box(1.5, 0.06, 1.1, MATERIALS.grating, doorX, base, width / 2 + 0.55));
  g.add(makeStairs(v3(doorX, 0, width / 2 + 1.9), v3(doorX, base, width / 2 + 1.1), 1.1, { railHeight: 0.9 }));
  // split-system air conditioners on the -X end wall, conduit and light over the door
  for (const dz of [-0.7, 0.7]) g.add(box(0.35, 0.6, 0.85, M.ac, -length / 2 - 0.18, base + 1.9, dz));
  g.add(box(0.5, 0.12, 0.2, MATERIALS.lightFixture, doorX, base + 2.3, width / 2 + 0.1));

  if (signFront) {
    const s = makeSign(signFront.lines, signFront.w ?? 3.2, signFront.h ?? 0.75, signFront.opts);
    s.position.set(signFront.x ?? -length / 2 + 2.2, base + height - 0.72, width / 2 + 0.04);
    g.add(s);
  }
  if (signEnd) {
    const s = makeSign(signEnd.lines, signEnd.w ?? 2.2, signEnd.h ?? 0.9, signEnd.opts);
    s.rotation.y = Math.PI / 2;
    s.position.set(length / 2 + 0.04, base + height - 0.95, 0);
    g.add(s);
  }
  g.userData.roofY = base + height + 0.1;
  return g;
}

/** Light vehicle: dual-cab ute with mine-spec flag and beacon. Local +Z is forward. */
function ute() {
  const g = new THREE.Group();
  g.add(box(1.85, 0.55, 5.2, M.uteWhite, 0, 0.75, 0));                 // chassis / lower body
  g.add(box(1.75, 0.7, 2.2, M.uteWhite, 0, 1.35, 0.35));               // cab
  g.add(box(1.6, 0.5, 0.06, MATERIALS.glassDark, 0, 1.4, 1.46));       // windscreen
  g.add(box(1.6, 0.45, 0.06, MATERIALS.glassDark, 0, 1.4, -0.76));
  for (const sx of [-1, 1]) g.add(box(0.06, 0.42, 1.7, MATERIALS.glassDark, sx * 0.88, 1.42, 0.35));
  g.add(box(1.9, 0.08, 2.0, MATERIALS.galvanised, 0, 1.05, -1.6));     // steel tray
  for (const sx of [-1, 1]) g.add(box(0.05, 0.3, 2.0, MATERIALS.galvanised, sx * 0.93, 1.22, -1.6));
  g.add(box(1.9, 0.6, 0.05, MATERIALS.galvanised, 0, 1.4, -0.62));     // headboard
  g.add(box(1.7, 0.25, 0.3, MATERIALS.subSteel, 0, 0.65, 2.65));       // bull bar
  g.add(box(1.5, 0.07, 0.07, M.hiVis, 0, 0.75, 2.62));
  for (const sx of [-1, 1]) for (const z of [1.65, -1.6]) {
    const w = cylX(0.4, 0.3, MATERIALS.rubber, 16, sx * 0.85, 0.4, z);
    g.add(w);
  }
  g.add(cyl(0.07, 0.07, 0.12, M.beacon, 10, 0, 1.77, 0.3));
  g.add(cyl(0.012, 0.012, 2.6, MATERIALS.galvanised, 6, 0.8, 2.3, 2.5));
  g.add(box(0.02, 0.3, 0.45, M.hiVis, 0.8, 3.45, 2.28));
  return g;
}

export function buildThirdParty() {
  const L = LAYOUT;
  const group = new THREE.Group();
  group.name = 'ThirdPartyServices';

  /* ---- Directional driller office: door faces the catwalk side (+Z), sign on the rig-facing end ---- */
  const dd = cabin({
    band: M.ddBand,
    signFront: { lines: [{ text: 'DIRECTIONAL DRILLING', size: 60, color: '#ffffff' }], opts: { bg: '#1f5fa8', border: '#ffffff' }, w: 3.6, h: 0.6 },
    signEnd: { lines: [{ text: 'DD OFFICE', size: 86, color: '#1f5fa8' }, { text: 'Well plan  |  Surveys  |  Steering', size: 38 }] },
  });
  dd.name = 'DDOffice';
  dd.position.fromArray(L.ddOffice);
  group.add(dd);
  // survey plot board on the rig-facing wall
  const plot = makeSign([{ text: 'KW-7H  PLAN vs ACTUAL', size: 34 }, { text: 'KOP 850 m   BUR 3 deg/30 m   AZI 137', size: 26, color: '#b11f1f' }], 1.8, 0.8);
  plot.position.set(-0.3, 1.7, -1.54);
  plot.rotation.y = Math.PI;
  dd.add(plot);

  /* ---- MWD / LWD unit: satellite dish, antenna, tool rack, data cable to the rig ---- */
  const mwd = cabin({
    band: M.mwdBand,
    windows: 2,
    signFront: { lines: [{ text: 'MWD / LWD UNIT', size: 64, color: '#ffffff' }], opts: { bg: '#d9621e', border: '#ffffff' }, w: 3.2, h: 0.6 },
    signEnd: { lines: [{ text: 'MWD', size: 96, color: '#d9621e' }, { text: 'Pulse telemetry  |  Gamma  |  Toolface', size: 36 }] },
  });
  mwd.name = 'MWDUnit';
  mwd.position.fromArray(L.mwdUnit);
  group.add(mwd);
  const roofY = mwd.userData.roofY;
  // VSAT dish on a roof mount
  const dish = new THREE.Group();
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.75, 20, 8, 0, Math.PI * 2, 0, 0.9), registerMaterial(new THREE.MeshStandardMaterial({ color: 0xe6e8ea, roughness: 0.4, metalness: 0.3, side: THREE.DoubleSide })));
  bowl.rotation.x = Math.PI;          // open side up
  bowl.position.y = 0.75;
  dish.add(bowl);
  dish.add(cyl(0.015, 0.015, 0.7, MATERIALS.galvanised, 6, 0, 0.4, 0));
  dish.add(box(0.1, 0.1, 0.1, MATERIALS.motorGrey, 0, 0.78, 0));
  dish.rotation.set(0.75, 0.6, 0);    // tilted toward the northern sky
  dish.position.set(-2.6, roofY + 0.75, -0.4);
  mwd.add(dish);
  mwd.add(cyl(0.05, 0.05, 0.75, MATERIALS.galvanised, 8, -2.6, roofY + 0.37, -0.4));
  // radio mast with whip antennas
  mwd.add(cyl(0.035, 0.035, 4.0, MATERIALS.galvanised, 8, 3.9, roofY + 2.0, -1.2));
  mwd.add(cyl(0.01, 0.01, 1.6, MATERIALS.subSteel, 6, 3.9, roofY + 4.8, -1.2));
  mwd.add(box(0.6, 0.04, 0.04, MATERIALS.galvanised, 3.9, roofY + 3.6, -1.2));
  // tool rack beside the unit: MWD collars / pulser subs on stands
  for (let i = 0; i < 4; i++) mwd.add(cylX(0.09, 7.5, i === 1 ? MATERIALS.topDriveYellow : MATERIALS.drillCollar, 12, -0.2, 0.55, -2.3 - i * 0.28));
  for (const x of [-3.2, 0, 2.8]) mwd.add(box(0.2, 0.42, 1.4, MATERIALS.subSteel, x, 0.21, -2.7));

  // data / power cable tray from the MWD unit past the DD office to the substructure stairs
  const trayY = 0.55;
  const tray = (a, b) => {
    const len = a.distanceTo(b);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const t = box(len, 0.08, 0.3, MATERIALS.galvanised, mid.x, trayY, mid.z);
    t.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
    group.add(t);
    const n = Math.max(1, Math.round(len / 3));
    for (let i = 0; i <= n; i++) {
      const p = a.clone().lerp(b, i / n);
      group.add(box(0.08, trayY, 0.08, MATERIALS.galvanised, p.x, trayY / 2, p.z));
    }
  };
  const cz = L.ddOffice[2] - 2.6;
  tray(v3(L.mwdUnit[0] + 4.6, 0, cz - 1.1), v3(L.ddOffice[0] + 5.2, 0, cz - 1.1));
  tray(v3(L.ddOffice[0] + 5.2, 0, cz - 1.1), v3(L.ddOffice[0] + 5.2, 0, 8.2));

  /* ---- Mud engineer lab beside the mud tanks, with sack pallets ---- */
  const mudLab = cabin({
    length: 6.2,
    width: 2.6,
    windows: 2,
    band: M.mudBand,
    signFront: { lines: [{ text: 'MUD ENGINEER', size: 60, color: '#ffffff' }], opts: { bg: '#2f7d4f', border: '#ffffff' }, w: 2.6, h: 0.55, x: -1.2 },
    signEnd: { lines: [{ text: 'FLUIDS LAB', size: 74, color: '#2f7d4f' }, { text: 'Mud checks  |  Rheology  |  Solids', size: 34 }], w: 2.0, h: 0.85 },
  });
  mudLab.name = 'MudEngineerLab';
  mudLab.rotation.y = Math.PI / 2;      // door faces +X, away from the tanks
  mudLab.position.fromArray(L.mudLab);
  group.add(mudLab);
  // sample bench with mud balance and funnel under a small awning on the tank side
  mudLab.add(box(2.2, 0.06, 0.7, MATERIALS.galvanised, -1.2, 1.1, -1.75));
  for (const x of [-2.2, -0.2]) mudLab.add(box(0.06, 1.1, 0.6, MATERIALS.galvanised, x, 0.55, -1.75));
  mudLab.add(cyl(0.12, 0.03, 0.3, MATERIALS.safetyYellow, 12, -1.7, 1.3, -1.75));      // Marsh funnel
  mudLab.add(box(0.5, 0.06, 0.08, MATERIALS.drillCollar, -0.8, 1.17, -1.75));          // mud balance
  mudLab.add(box(2.6, 0.05, 1.2, M.roof, -1.2, 2.5, -1.9));
  // pallets of barite / bentonite sacks
  for (let p = 0; p < 3; p++) {
    const px = L.mudLab[0] + 3.4;
    const pz = L.mudLab[2] - 2.6 + p * 1.7;
    group.add(box(1.2, 0.14, 1.2, M.pallet, px, 0.09, pz));
    const layers = 3 + (p % 2);
    for (let l = 0; l < layers; l++) group.add(box(1.1, 0.22, 1.1, M.sack, px, 0.27 + l * 0.23, pz));
  }

  /* ---- Parked light vehicles by the offices ---- */
  const utes = new THREE.Group();
  utes.name = 'LightVehicles';
  [[-38, 31.5, Math.PI], [-41.4, 31.3, Math.PI], [-44.8, 31.6, Math.PI + 0.04], [19.5, -33.5, -Math.PI / 2]].forEach(([x, z, ry]) => {
    const u = ute();
    u.position.set(x, 0.02, z);
    u.rotation.y = ry;
    utes.add(u);
  });
  group.add(utes);

  /* ---- Portable toilets, muster point, windsock ---- */
  for (const dx of [0, 1.5]) {
    group.add(box(1.2, 2.3, 1.2, M.loo, -35.5 - dx, 1.17, 21));
    group.add(box(1.3, 0.1, 1.3, M.wall, -35.5 - dx, 2.36, 21));
  }
  const muster = new THREE.Group();
  const ms = makeSign([{ text: 'EMERGENCY', size: 60, color: '#ffffff' }, { text: 'MUSTER POINT', size: 60, color: '#ffffff' }], 2.2, 1.1, { bg: '#1f8a4c', border: '#ffffff' });
  ms.position.y = 2.3;
  muster.add(ms, cyl(0.045, 0.045, 2.9, MATERIALS.galvanised, 8, -0.9, 1.45, -0.05), cyl(0.045, 0.045, 2.9, MATERIALS.galvanised, 8, 0.9, 1.45, -0.05));
  muster.position.set(37, 0, 43.4);
  muster.rotation.y = Math.PI;
  group.add(muster);

  const sockPos = v3(-33, 0, 37);
  group.add(cyl(0.05, 0.07, 7.5, MATERIALS.galvanised, 10, sockPos.x, 3.75, sockPos.z));
  const sock = new THREE.Group();
  sock.position.set(sockPos.x, 7.3, sockPos.z);
  const sockMat = registerMaterial(new THREE.MeshStandardMaterial({ color: 0xff6a14, roughness: 0.8, side: THREE.DoubleSide }));
  const sockWhite = registerMaterial(new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.8, side: THREE.DoubleSide }));
  const segs = [];
  let parent = sock;
  for (let i = 0; i < 5; i++) {
    const r0 = 0.34 - i * 0.045;
    const r1 = r0 - 0.045;
    const hold = new THREE.Group();
    hold.position.z = i === 0 ? 0.05 : 0.5;
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, 0.5, 14, 1, true), i % 2 ? sockWhite : sockMat);
    seg.rotation.x = Math.PI / 2;     // axis along local +Z, small end downwind
    seg.position.z = 0.25;
    seg.castShadow = true;
    hold.add(seg);
    parent.add(hold);
    parent = hold;
    segs.push(hold);
  }
  group.add(sock);
  const windYaw = Math.atan2(WIND.x, WIND.z);

  function update(dt, t) {
    sock.rotation.y = windYaw + Math.sin(t * 0.7) * 0.12 + Math.sin(t * 2.3) * 0.04;
    segs.forEach((h, i) => {
      h.rotation.x = 0.1 + i * 0.035 + Math.sin(t * 3.1 + i * 0.9) * 0.05;
      h.rotation.y = Math.sin(t * 2.2 + i * 1.3) * 0.06;
    });
  }
  update(0, 0);

  return { group, dd, mwd, mudLab, utes, update };
}
