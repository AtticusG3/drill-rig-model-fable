import * as THREE from 'three';

/** Registry of every material so wireframe mode can toggle them. */
const registry = [];

function mat(color, roughness, metalness, extra = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
  registry.push(m);
  return m;
}

/** Procedural canvas texture: tiled noise with a base colour and speckle variation. */
export function makeNoiseTexture({ size = 512, base = '#8a3a22', variation = 40, speckle = 0.0, speckleColor = '#000', repeat = 1 } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * variation;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);
  if (speckle > 0) {
    ctx.fillStyle = speckleColor;
    const count = Math.floor(size * size * speckle);
    for (let i = 0; i < count; i++) {
      ctx.globalAlpha = 0.2 + Math.random() * 0.5;
      ctx.fillRect(Math.random() * size, Math.random() * size, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
    ctx.globalAlpha = 1;
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Diamond / checker plate style texture for decking. */
export function makePlateTexture(repeat = 8) {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#5d6469';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = '#444a4f';
  ctx.lineWidth = 2;
  const step = 32;
  for (let y = 0; y < size; y += step) {
    for (let x = 0; x < size; x += step) {
      const off = ((x + y) / step) % 2 ? step / 2 : 0;
      ctx.beginPath();
      ctx.moveTo(x + 6, y + off + 6);
      ctx.lineTo(x + step - 6, y + off + 10);
      ctx.stroke();
    }
  }
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  for (let i = 0; i < 400; i++) ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Steel grating texture (dark bars on mid grey). */
export function makeGratingTexture(repeat = 10) {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#3a3f44';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#7d858c';
  for (let x = 0; x < size; x += 16) ctx.fillRect(x, 0, 4, size);
  for (let y = 0; y < size; y += 32) ctx.fillRect(0, y, size, 3);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Drill-pipe body: mill-finish steel with a painted longitudinal stripe and a
 * thinner contrasting stripe 180 deg opposite, so rotation about the pipe
 * axis is easy to read. Canvas X wraps around the circumference (cylinder U).
 */
function makePipeTexture() {
  const w = 256;
  const h = 64;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#7a8189';
  ctx.fillRect(0, 0, w, h);
  // mill scale / longitudinal grinding streaks
  for (let i = 0; i < 160; i++) {
    const x = Math.random() * w;
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(40,44,50,0.35)' : 'rgba(170,176,182,0.25)';
    ctx.fillRect(x, 0, 1 + Math.random() * 2, h);
  }
  // painted stripe (white) and opposite thin stripe (safety yellow)
  ctx.fillStyle = '#f1f1ec';
  ctx.fillRect(0, 0, 34, h);
  ctx.fillStyle = '#f2b705';
  ctx.fillRect(w / 2, 0, 14, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Tool joint: bright machined steel with dark hardbanding rings and a paint mark. */
function makeToolJointTexture() {
  const w = 128;
  const h = 64;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#a9b0b6';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#4b5056';
  for (const y of [8, 20]) ctx.fillRect(0, y, w, 6);           // hardbanding
  ctx.fillStyle = '#2f6fb3';
  ctx.fillRect(0, 44, w, 8);                                    // colour-code band
  ctx.fillStyle = '#f1f1ec';
  ctx.fillRect(0, 0, 18, h);                                    // rotation mark
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export const MATERIALS = {
  // Structure (painted steel is a dielectric finish: low metalness)
  mastSteel: mat(0xe4e7e9, 0.5, 0.15),
  mastSteelDark: mat(0xc3c8cc, 0.55, 0.15),
  subSteel: mat(0x50565d, 0.65, 0.25),
  subSteelLight: mat(0x6a7178, 0.6, 0.25),
  galvanised: mat(0x9aa3a9, 0.45, 0.8),
  deckPlate: mat(0xb8bec4, 0.7, 0.4, { map: makePlateTexture(10) }),
  grating: mat(0xc0c6cc, 0.8, 0.4, { map: makeGratingTexture(12) }),

  // Safety
  safetyYellow: mat(0xf2b705, 0.55, 0.1),
  safetyYellowDark: mat(0xc99a00, 0.6, 0.1),
  safetyRed: mat(0xc1272d, 0.5, 0.1),

  // Equipment
  topDriveYellow: mat(0xf0b400, 0.45, 0.15),
  topDriveDark: mat(0x3a3f45, 0.55, 0.35),
  blockYellow: mat(0xf4bc1c, 0.45, 0.15),
  drawworksBlue: mat(0x2a4b6e, 0.5, 0.2),
  drawworksGrey: mat(0x5a6570, 0.55, 0.35),
  pumpRed: mat(0xb0281f, 0.5, 0.15),
  tankGreen: mat(0x355343, 0.7, 0.15),
  tankGreenDark: mat(0x2a4235, 0.75, 0.15),
  containerWhite: mat(0xe7e4dc, 0.7, 0.1),
  containerBlue: mat(0x355a7a, 0.7, 0.1),
  containerRust: mat(0x7a4a2a, 0.85, 0.1),
  cabinWhite: mat(0xe3e6e2, 0.65, 0.1),
  glassDark: mat(0x0f1a22, 0.1, 0.9, { transparent: true, opacity: 0.85 }),
  bopDark: mat(0x2e343a, 0.5, 0.4),
  bopRed: mat(0x9c2222, 0.55, 0.15),

  // Pipe
  drillPipe: mat(0xffffff, 0.38, 0.7, { map: makePipeTexture() }),
  toolJoint: mat(0xffffff, 0.3, 0.85, { map: makeToolJointTexture() }),
  drillCollar: mat(0xb4bbc1, 0.3, 0.9),
  pipeDarkGreen: mat(0x3a4d42, 0.6, 0.2),
  hoseBlack: mat(0x141414, 0.8, 0.1),
  wireRope: mat(0x4a4a4a, 0.5, 0.8),
  mudBrown: mat(0x6a4a2a, 0.9, 0.0),
  mudParticle: mat(0xc98a3a, 0.6, 0.0, { emissive: 0x8a5a1a, emissiveIntensity: 0.8 }),

  // Motors / misc
  motorGrey: mat(0x4a5158, 0.5, 0.35),
  motorBlue: mat(0x25486b, 0.5, 0.2),
  rubber: mat(0x111111, 0.95, 0.0),
  concrete: mat(0x8f8a82, 0.95, 0.0),
  lightFixture: mat(0xffffff, 0.3, 0.2, { emissive: 0xfff2cc, emissiveIntensity: 0.6 }),

  // Environment
  rigMat: mat(0x4a3a2c, 0.95, 0.0),
  gravel: mat(0xffffff, 0.98, 0.0, { map: makeNoiseTexture({ base: '#b3a994', variation: 70, speckle: 0.025, speckleColor: '#5a5044', repeat: 24 }) }),
  earth: mat(0xffffff, 1.0, 0.0, { map: makeNoiseTexture({ base: '#b45a34', variation: 55, speckle: 0.012, speckleColor: '#6a3018', repeat: 80 }) }),
  roadDirt: mat(0x8a4a2a, 1.0, 0.0),
  oilStain: mat(0x1a1510, 0.6, 0.1, { transparent: true, opacity: 0.6 }),
  scrub: mat(0x66704f, 1.0, 0.0),
  scrubDry: mat(0x857c5a, 1.0, 0.0),
  grassDry: mat(0xa8926a, 1.0, 0.0),
  hills: mat(0xb0927e, 1.0, 0.0),
  fence: mat(0x8a9196, 0.5, 0.6),
};

/** Register an externally created material so wireframe mode can reach it. */
export function registerMaterial(m) {
  registry.push(m);
  return m;
}

export function setWireframe(on) {
  for (const m of registry) m.wireframe = on;
}

export function getMaterialRegistry() {
  return registry;
}
