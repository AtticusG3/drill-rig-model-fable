import * as THREE from 'three';
import { MATERIALS, registerMaterial, makeNoiseTexture } from './materials.js';
import { LAYOUT } from './layout.js';
import { box, cyl, BeamBatch, v3 } from './geometry.js';
import { mulberry32, terrainHeight, patchNoise, roadCenterX, nearRoad, insidePad, GATE_X, GATE_Z, ROAD_END_Z, WIND } from './site/terrain.js';
import { makeSign } from './site/signs.js';

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _e = new THREE.Euler();

/** Direction of the sun (matches the directional light in scene.js). */
export const SUN_DIR = new THREE.Vector3(55, 95, 40).normalize();

/* ------------------------------------------------------------------ */
/*  Sky: gradient + horizon dust haze + sun glow + drifting fbm clouds */
/* ------------------------------------------------------------------ */
function makeSkyMaterial({ sunIntensity = 10 } = {}) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      zenith: { value: new THREE.Color(0x1f5cb5) },
      horizon: { value: new THREE.Color(0x9cc4e8) },
      haze: { value: new THREE.Color(0xe2cdb4) },
      groundCol: { value: new THREE.Color(0xb8724e) },
      sunDir: { value: SUN_DIR.clone() },
      sunColor: { value: new THREE.Color(0xfff0d6) },
      sunIntensity: { value: sunIntensity },
      time: { value: 0 },
      wind: { value: new THREE.Vector2(WIND.x, WIND.z) },
      cloudAmount: { value: 0.46 },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 zenith; uniform vec3 horizon; uniform vec3 haze; uniform vec3 groundCol;
      uniform vec3 sunDir; uniform vec3 sunColor; uniform float sunIntensity;
      uniform float time; uniform vec2 wind; uniform float cloudAmount;
      varying vec3 vDir;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      float fbm(vec2 p) {
        float a = 0.5; float s = 0.0;
        for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + 17.0; a *= 0.5; }
        return s;
      }
      void main() {
        vec3 d = normalize(vDir);
        float h = max(d.y, 0.0);
        vec3 col = mix(horizon, zenith, pow(h, 0.5));
        col = mix(col, haze, smoothstep(0.11, 0.0, d.y) * 0.78);
        if (d.y > 0.015) {
          vec2 uv = d.xz / (d.y + 0.14) * 1.5 - wind * time * 0.012;
          float n = fbm(uv);
          float c = smoothstep(1.0 - cloudAmount, 1.0 - cloudAmount + 0.26, n);
          float shade = smoothstep(0.25, 0.85, fbm(uv * 2.7 + 9.0));
          vec3 cc = mix(vec3(0.74, 0.77, 0.83), vec3(1.0, 0.99, 0.97), shade);
          col = mix(col, cc, c * smoothstep(0.015, 0.2, d.y) * 0.92);
        }
        float sd = max(dot(d, sunDir), 0.0);
        col += sunColor * (pow(sd, 2200.0) * sunIntensity + pow(sd, 90.0) * 0.22 + pow(sd, 10.0) * 0.07);
        col = mix(col, groundCol, smoothstep(0.0, -0.06, d.y));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

/** Small scene used to bake the image-based lighting (sky above, red earth below). */
export function makeSkyEnvScene() {
  const s = new THREE.Scene();
  const m = makeSkyMaterial({ sunIntensity: 3 });
  m.uniforms.groundCol.value.set(0x7d6a5f);
  s.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), m));
  return s;
}

/* ------------------------------------------------------------------ */
/*  Access road ribbon                                                  */
/* ------------------------------------------------------------------ */
const ROAD_VISUAL_WIDTH = 13;   // 9 m running surface + soft shoulders that fade into the earth

function makeRoadTexture() {
  const w = 256;
  const h = 256;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#a2603c';
  ctx.fillRect(0, 0, w, h);
  // graded crown is a little darker, wheel paths are polished pale
  ctx.fillStyle = 'rgba(70,36,20,0.25)';
  ctx.fillRect(w * 0.47, 0, w * 0.06, h);
  for (const u of [0.312, 0.458, 0.542, 0.688]) {
    const g = ctx.createLinearGradient((u - 0.045) * w, 0, (u + 0.045) * w, 0);
    g.addColorStop(0, 'rgba(214,170,132,0)');
    g.addColorStop(0.5, 'rgba(214,170,132,0.75)');
    g.addColorStop(1, 'rgba(214,170,132,0)');
    ctx.fillStyle = g;
    ctx.fillRect((u - 0.045) * w, 0, 0.09 * w, h);
  }
  // corrugations and loose stones
  for (let y = 0; y < h; y += 8) {
    ctx.fillStyle = 'rgba(60,30,16,0.045)';
    ctx.fillRect(w * 0.2, y + (y % 16 ? 1 : 0), w * 0.6, 3);
  }
  for (let i = 0; i < 1400; i++) {
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(60,32,20,0.35)' : 'rgba(230,200,170,0.3)';
    ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  // soft shoulders: alpha ramps to zero at both edges
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / (w - 1);
      const edge = Math.min(u, 1 - u);
      const ragged = 0.02 * Math.sin((y / h) * Math.PI * 6) + 0.012 * Math.sin((y / h) * Math.PI * 14 + x * 0.1);
      const a = THREE.MathUtils.smoothstep(edge + ragged, 0.03, 0.15);
      d[(y * w + x) * 4 + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function buildRoad(g) {
  const z0 = GATE_Z - 1.5;
  const step = 4;
  const n = Math.ceil((ROAD_END_Z - z0) / step);
  const pos = [];
  const uv = [];
  const idx = [];
  let dist = 0;
  let prev = null;
  for (let i = 0; i <= n; i++) {
    const z = z0 + i * step;
    const x = roadCenterX(z);
    const tx = roadCenterX(z + 0.5) - roadCenterX(z - 0.5);
    const len = Math.hypot(tx, 1);
    const nx = 1 / len;          // perpendicular in plan (pointing +X)
    const nz = -tx / len;
    if (prev) dist += Math.hypot(x - prev.x, z - prev.z);
    prev = { x, z };
    for (const s of [-1, 1]) {
      const px = x + (s * nx * ROAD_VISUAL_WIDTH) / 2;
      const pz = z + (s * nz * ROAD_VISUAL_WIDTH) / 2;
      pos.push(px, terrainHeight(px, pz) + 0.07, pz);
      uv.push(s < 0 ? 0 : 1, dist / ROAD_VISUAL_WIDTH);
    }
    if (i < n) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geom.setIndex(idx);
  geom.computeVertexNormals();
  const mat = registerMaterial(new THREE.MeshStandardMaterial({ map: makeRoadTexture(), roughness: 1, metalness: 0, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  const road = new THREE.Mesh(geom, mat);
  road.name = 'AccessRoad';
  road.receiveShadow = true;
  road.renderOrder = 1;
  g.add(road);

  // guide posts with red reflectors, both sides
  const postZs = [];
  for (let z = GATE_Z + 16; z < 430; z += 26) postZs.push(z);
  const postGeom = new THREE.BoxGeometry(0.1, 1.0, 0.04);
  const posts = new THREE.InstancedMesh(postGeom, MATERIALS.containerWhite, postZs.length * 2);
  const reflMat = registerMaterial(new THREE.MeshStandardMaterial({ color: 0xc81e1e, roughness: 0.3, emissive: 0x4a0606 }));
  const refl = new THREE.InstancedMesh(new THREE.BoxGeometry(0.105, 0.12, 0.045), reflMat, postZs.length * 2);
  let k = 0;
  for (const z of postZs) {
    for (const s of [-1, 1]) {
      const x = roadCenterX(z) + s * 5.4;
      const y = terrainHeight(x, z);
      _q.identity();
      _s.set(1, 1, 1);
      posts.setMatrixAt(k, _m.compose(_p.set(x, y + 0.5, z), _q, _s));
      refl.setMatrixAt(k, _m.compose(_p.set(x, y + 0.82, z), _q, _s));
      k++;
    }
  }
  posts.castShadow = true;
  posts.frustumCulled = false;
  refl.frustumCulled = false;
  g.add(posts, refl);

  // cattle grid across the gateway
  const grid = new THREE.Group();
  grid.name = 'CattleGrid';
  for (let i = 0; i < 10; i++) grid.add(box(11.4, 0.07, 0.12, MATERIALS.galvanised, GATE_X, 0.075, GATE_Z + 0.5 + i * 0.32));
  for (const s of [-1, 1]) grid.add(box(0.2, 0.12, 3.3, MATERIALS.subSteel, GATE_X + s * 5.75, 0.08, GATE_Z + 1.95));
  for (const dz of [0.25, 3.65]) grid.add(box(11.7, 0.14, 0.25, MATERIALS.concrete, GATE_X, 0.07, GATE_Z + dz));
  g.add(grid);

  // site entry board and speed sign
  const entry = new THREE.Group();
  entry.name = 'EntrySign';
  const board = makeSign([
    { text: 'RIG 12', size: 76, color: '#ffffff' },
    { text: 'DIRECTIONAL WELL  KW-7H', size: 40 },
    { text: 'ALL VISITORS REPORT TO SITE OFFICE', size: 30 },
    { text: 'PPE MUST BE WORN BEYOND THIS POINT', size: 30, color: '#b11f1f' },
  ], 4.2, 2.4, { band: '#1f4a78' });
  board.position.set(0, 2.5, 0);
  entry.add(board);
  for (const s of [-1, 1]) entry.add(cyl(0.06, 0.06, 3.7, MATERIALS.galvanised, 10, s * 1.8, 1.85, -0.06));
  entry.position.set(GATE_X + 9.4, 0, GATE_Z + 7);
  entry.rotation.y = -0.25;
  g.add(entry);

  const speed = new THREE.Group();
  const disc = makeSign([{ text: '10', size: 150, color: '#111' }], 0.9, 0.9, { width: 256, height: 256, bg: '#ffffff', border: '#c81e1e' });
  disc.position.y = 1.9;
  speed.add(disc, cyl(0.035, 0.035, 2.3, MATERIALS.galvanised, 8, 0, 1.15, -0.05));
  speed.position.set(GATE_X - 7.2, 0, GATE_Z + 9);
  speed.rotation.y = 0.15;
  g.add(speed);
}

/** Fan of dry grass blades on a transparent background (alpha-tested tuft card). */
function makeTuftTexture() {
  const w = 128;
  const h = 128;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  ctx.lineCap = 'round';
  for (let i = 0; i < 46; i++) {
    const x0 = w * (0.3 + Math.random() * 0.4);
    const lean = (Math.random() - 0.5) * 1.5;
    const len = h * (0.45 + Math.random() * 0.5);
    const shade = 150 + Math.floor(Math.random() * 90);
    ctx.strokeStyle = `rgb(${shade + 10},${shade},${Math.floor(shade * 0.72)})`;
    ctx.lineWidth = 2 + Math.random() * 2.5;
    ctx.beginPath();
    ctx.moveTo(x0, h);
    ctx.quadraticCurveTo(x0 + lean * len * 0.25, h - len * 0.6, x0 + lean * len * 0.6, h - len);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ------------------------------------------------------------------ */
/*  Stock bore: windmill, tank and trough for the cattle                */
/* ------------------------------------------------------------------ */
export const STOCK_BORE = { x: -118, z: 92 };

function buildWindmill(g) {
  const grp = new THREE.Group();
  grp.name = 'StockBore';
  const { x, z } = STOCK_BORE;
  const y0 = terrainHeight(x, z);
  grp.position.set(x, y0, z);

  const legs = new BeamBatch(MATERIALS.galvanised, 'cyl');
  const H = 10;
  const corners = (y, hw) => [v3(-hw, y, -hw), v3(hw, y, -hw), v3(hw, y, hw), v3(-hw, y, hw)];
  const base = corners(0, 1.5);
  const top = corners(H, 0.25);
  for (let i = 0; i < 4; i++) legs.add(base[i], top[i], 0.045);
  for (let b = 1; b <= 4; b++) {
    const f0 = (b - 1) / 4;
    const f1 = b / 4;
    const r0 = base.map((p, i) => p.clone().lerp(top[i], f0));
    const r1 = base.map((p, i) => p.clone().lerp(top[i], f1));
    for (let i = 0; i < 4; i++) {
      legs.add(r1[i], r1[(i + 1) % 4], 0.025);
      legs.add(r0[i], r1[(i + 1) % 4], 0.018);
    }
  }
  legs.add(v3(0, 0, 0), v3(0, H, 0), 0.03);   // pump rod
  grp.add(legs.build());

  // head: wheel on the upwind side, tail vane downwind
  const head = new THREE.Group();
  head.position.y = H + 0.35;
  head.rotation.y = Math.atan2(-WIND.x, -WIND.z);   // local +Z faces into the wind
  const wheel = new THREE.Group();
  wheel.position.z = 0.7;
  const bladeMat = registerMaterial(new THREE.MeshStandardMaterial({ color: 0xaab2b8, roughness: 0.45, metalness: 0.75, side: THREE.DoubleSide }));
  const bladeGeom = new THREE.PlaneGeometry(0.42, 1.25);
  for (let i = 0; i < 18; i++) {
    const hold = new THREE.Group();
    hold.rotation.z = (i / 18) * Math.PI * 2;
    const blade = new THREE.Mesh(bladeGeom, bladeMat);
    blade.position.y = 1.0;
    blade.rotation.y = 0.5;
    blade.castShadow = true;
    hold.add(blade);
    wheel.add(hold);
  }
  wheel.add(new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.025, 6, 40), MATERIALS.galvanised));
  wheel.add(new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.025, 6, 24), MATERIALS.galvanised));
  head.add(wheel);
  head.add(box(0.3, 0.35, 0.9, MATERIALS.motorGrey, 0, 0, 0.2));
  const tail = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.0), bladeMat);
  tail.rotation.y = Math.PI / 2;
  tail.position.set(0, 0.1, -2.3);
  tail.castShadow = true;
  head.add(tail);
  head.add(box(0.05, 0.05, 2.0, MATERIALS.galvanised, 0, 0, -1.0));
  grp.add(head);

  // corrugated stock tank with water, and a trough
  const waterMat = registerMaterial(new THREE.MeshStandardMaterial({ color: 0x3f6f7a, roughness: 0.08, metalness: 0.3 }));
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 1.7, 36, 1, true), registerMaterial(new THREE.MeshStandardMaterial({ color: 0xa5adb3, roughness: 0.45, metalness: 0.8, side: THREE.DoubleSide })));
  tank.position.set(6.5, 0.85, 1.5);
  tank.castShadow = true;
  grp.add(tank);
  const water = new THREE.Mesh(new THREE.CircleGeometry(3.15, 36), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(6.5, 1.45, 1.5);
  grp.add(water);
  grp.add(box(6, 0.5, 0.9, MATERIALS.concrete, 7, 0.25, -5));
  const tw = new THREE.Mesh(new THREE.PlaneGeometry(5.7, 0.65), waterMat);
  tw.rotation.x = -Math.PI / 2;
  tw.position.set(7, 0.51, -5);
  grp.add(tw);
  // bare, trampled ground around the water
  const bare = new THREE.Mesh(new THREE.CircleGeometry(15, 28), registerMaterial(new THREE.MeshStandardMaterial({ color: 0x9a5a3a, roughness: 1, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })));
  bare.rotation.x = -Math.PI / 2;
  bare.position.set(5, 0.12, -1);
  grp.add(bare);

  g.add(grp);
  return wheel;
}

/* ------------------------------------------------------------------ */
export function buildEnvironment() {
  const g = new THREE.Group();
  g.name = 'Environment';
  const rnd = mulberry32(1234);

  const skyMat = makeSkyMaterial();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), skyMat);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  g.add(sky);

  /* ---- Red earth with gentle terrain beyond the pad; colour patches via vertex colours ---- */
  const groundGeom = new THREE.PlaneGeometry(1800, 1800, 180, 180);
  groundGeom.rotateX(-Math.PI / 2);
  const pos = groundGeom.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, terrainHeight(x, z));
    const p = patchNoise(x, z);
    cols[i * 3] = THREE.MathUtils.lerp(1.0, 0.76, p);
    cols[i * 3 + 1] = THREE.MathUtils.lerp(0.97, 0.68, p);
    cols[i * 3 + 2] = THREE.MathUtils.lerp(0.94, 0.62, p);
  }
  groundGeom.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  groundGeom.computeVertexNormals();
  const earthMat = registerMaterial(new THREE.MeshStandardMaterial({
    map: MATERIALS.earth.map, roughness: 1, metalness: 0, vertexColors: true,
    bumpMap: makeNoiseTexture({ base: '#808080', variation: 120, repeat: 90 }), bumpScale: 0.5,
  }));
  const ground = new THREE.Mesh(groundGeom, earthMat);
  ground.receiveShadow = true;
  ground.position.y = -0.02;
  g.add(ground);

  /* ---- Compacted gravel pad 110 x 90 with a graded windrow around it ---- */
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(LAYOUT.siteX, LAYOUT.siteZ), MATERIALS.gravel);
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.02;
  pad.receiveShadow = true;
  g.add(pad);

  const hx = LAYOUT.siteX / 2;
  const hz = LAYOUT.siteZ / 2;
  const berms = [];
  const bermEdge = (ax, az, bx, bz) => {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.round(len / 2.6);
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      const x = ax + (bx - ax) * f + (rnd() - 0.5) * 0.9;
      const z = az + (bz - az) * f + (rnd() - 0.5) * 0.9;
      if (Math.abs(x - GATE_X) < 8.5 && z > 0) continue;   // gateway
      berms.push([x, z, 1.2 + rnd() * 0.9, 0.25 + rnd() * 0.3]);
    }
  };
  bermEdge(-hx - 2, -hz - 2, hx + 2, -hz - 2);
  bermEdge(hx + 2, -hz - 2, hx + 2, hz + 2);
  bermEdge(hx + 2, hz + 2, -hx - 2, hz + 2);
  bermEdge(-hx - 2, hz + 2, -hx - 2, -hz - 2);
  const bermMat = registerMaterial(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }));
  const berm = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 16, 8), bermMat, berms.length);
  berms.forEach(([x, z, r, h], i) => {
    _q.setFromEuler(_e.set(0, rnd() * Math.PI, 0));
    berm.setMatrixAt(i, _m.compose(_p.set(x, 0, z), _q, _s.set(r, h, r * 0.8)));
    berm.setColorAt(i, _c.setHSL(0.048 + rnd() * 0.01, 0.52, 0.34 + rnd() * 0.05, THREE.SRGBColorSpace));
  });
  berm.receiveShadow = true;
  berm.castShadow = true;
  berm.frustumCulled = false;
  g.add(berm);

  /* ---- Rig mats around the substructure (instanced, slight tone variation) ---- */
  const matGeom = new THREE.BoxGeometry(2.4, 0.2, 8);
  const matCols = [];
  for (let x = -22.8; x <= 22.8; x += 2.45) for (let z = -12; z <= 16; z += 8.1) {
    if (Math.abs(x) < 1.6 && Math.abs(z) < 4.5) continue;   // leave the well cellar open
    matCols.push([x, z]);
  }
  const mats = new THREE.InstancedMesh(matGeom, MATERIALS.rigMat, matCols.length);
  matCols.forEach(([x, z], i) => {
    _q.identity();
    mats.setMatrixAt(i, _m.compose(_p.set(x, 0.1, z), _q, _s.set(1, 1, 1)));
    mats.setColorAt(i, _c.setHSL(0.07, 0.25, 0.18 + rnd() * 0.08));
  });
  mats.receiveShadow = true;
  mats.castShadow = true;
  g.add(mats);

  // concrete cellar slab at well centre
  g.add(box(3.4, 0.3, 3.4, MATERIALS.concrete, 0, 0.15, 0));
  const cellarRing = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.5, 32), MATERIALS.rubber);
  cellarRing.rotation.x = -Math.PI / 2;
  cellarRing.position.y = 0.31;
  g.add(cellarRing);

  buildRoad(g);

  /* ---- Oil-stained working areas ---- */
  const stainGeom = new THREE.CircleGeometry(1, 20);
  const stains = [
    [-11, 6, 2.2], [-12.5, -1, 1.6], [6, -9, 1.9], [-15, -30, 2.6], [-21, -27, 1.8], [10, 24, 1.4], [-3, 15, 1.2],
  ];
  for (const [x, z, r] of stains) {
    const s = new THREE.Mesh(stainGeom, MATERIALS.oilStain);
    s.rotation.x = -Math.PI / 2;
    s.position.set(x, 0.05, z);
    s.scale.set(r, r * (0.7 + rnd() * 0.5), 1);
    g.add(s);
  }

  /* ---- Drainage trench / containment along the rear pad edge and a sump ---- */
  const trench = new THREE.Mesh(new THREE.PlaneGeometry(LAYOUT.siteX - 4, 1.2), new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 1 }));
  trench.rotation.x = -Math.PI / 2;
  trench.position.set(0, 0.04, -LAYOUT.siteZ / 2 + 2);
  g.add(trench);
  g.add(box(4, 0.6, 3, MATERIALS.concrete, 12, 0.3, -20));
  const sumpMud = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.6), MATERIALS.mudBrown);
  sumpMud.rotation.x = -Math.PI / 2;
  sumpMud.position.set(12, 0.61, -20);
  g.add(sumpMud);

  /* ---- Vegetation: scrub, spinifex, trees, rocks, termite mounds ---- */
  const clear = (x, z, m) => insidePad(x, z, m) || nearRoad(x, z, 2.5) || Math.hypot(x - STOCK_BORE.x - 5, z - STOCK_BORE.z) < 13;
  const scatter = (count, rMin, rMax, pow, margin, fn, density = () => 1) => {
    let placed = 0;
    let guard = 0;
    while (placed < count && guard++ < count * 30) {
      const r = rMin + Math.pow(rnd(), pow) * (rMax - rMin);
      const a = rnd() * Math.PI * 2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (clear(x, z, margin)) continue;
      if (rnd() > density(x, z)) continue;
      fn(placed, x, z, terrainHeight(x, z));
      placed++;
    }
    return placed;
  };

  const scrubMat = registerMaterial(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true }));
  const scrub = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), scrubMat, 1300);
  scrub.count = scatter(1300, 72, 640, 0.7, 8, (i, x, z, y) => {
    const sc = 0.6 + rnd() * 1.3;
    _q.setFromEuler(_e.set(0, rnd() * Math.PI, 0));
    scrub.setMatrixAt(i, _m.compose(_p.set(x, y + sc * 0.4, z), _q, _s.set(sc * (0.8 + rnd() * 0.6), sc * 0.7, sc * (0.8 + rnd() * 0.6))));
    scrub.setColorAt(i, _c.copy(rnd() < 0.5 ? MATERIALS.scrub.color : MATERIALS.scrubDry.color).offsetHSL(0, 0, (rnd() - 0.5) * 0.08));
  }, (x, z) => 0.35 + 0.65 * patchNoise(x + 300, z - 120));
  scrub.frustumCulled = false;
  scrub.castShadow = true;
  g.add(scrub);

    // spinifex / dry grass tufts: three crossed alpha-tested blades cards per tuft
  const tuftGeom = new THREE.BufferGeometry();
  {
    const p = [];
    const uvs = [];
    const nrm = [];
    const ix = [];
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI;
      const cx = Math.cos(a) * 0.75;
      const cz = Math.sin(a) * 0.75;
      const v = p.length / 3;
      p.push(-cx, 0, -cz, cx, 0, cz, cx, 0.85, cz, -cx, 0.85, -cz);
      uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
      for (let n = 0; n < 4; n++) nrm.push(0, 1, 0);
      ix.push(v, v + 1, v + 2, v, v + 2, v + 3, v, v + 2, v + 1, v, v + 3, v + 2);
    }
    tuftGeom.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    tuftGeom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    tuftGeom.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    tuftGeom.setIndex(ix);
  }
  const grassMat = registerMaterial(new THREE.MeshStandardMaterial({ color: 0xffffff, map: makeTuftTexture(), alphaTest: 0.45, roughness: 1 }));
  const grass = new THREE.InstancedMesh(tuftGeom, grassMat, 3200);
  grass.count = scatter(3200, 60, 480, 0.6, 3, (i, x, z, y) => {
    const sc = 0.3 + rnd() * 0.6;
    _q.setFromEuler(_e.set(0, rnd() * Math.PI, 0));
    grass.setMatrixAt(i, _m.compose(_p.set(x, y - 0.03, z), _q, _s.set(sc * 1.5, sc * 1.3, sc * 1.5)));
    grass.setColorAt(i, _c.copy(MATERIALS.grassDry.color).offsetHSL((rnd() - 0.5) * 0.03, 0, (rnd() - 0.5) * 0.12));
  }, (x, z) => 0.25 + 0.75 * (1 - patchNoise(x, z)));
  grass.frustumCulled = false;
  g.add(grass);

  // trees: leaning trunk + three canopy clumps (mulga / small eucalypts)
  const TREES = 130;
  const trunkMat = registerMaterial(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }));
  const canopyMat = registerMaterial(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true }));
  const trunkGeom = new THREE.CylinderGeometry(0.55, 1, 1, 6);
  trunkGeom.translate(0, 0.5, 0);
  const trunks = new THREE.InstancedMesh(trunkGeom, trunkMat, TREES);
  const canopy = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), canopyMat, TREES * 3);
  const treeSpots = [];
  trunks.count = scatter(TREES, 85, 620, 0.8, 14, (i, x, z, y) => {
    const h = 3.2 + rnd() * 4.2;
    _q.setFromEuler(_e.set((rnd() - 0.5) * 0.22, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.22));
    trunks.setMatrixAt(i, _m.compose(_p.set(x, y - 0.1, z), _q, _s.set(0.22 + h * 0.03, h * 0.72, 0.22 + h * 0.03)));
    trunks.setColorAt(i, _c.setHSL(0.07, 0.12 + rnd() * 0.12, 0.5 + rnd() * 0.28, THREE.SRGBColorSpace));
    for (let k = 0; k < 3; k++) {
      const r = h * (0.28 + rnd() * 0.16);
      _q.setFromEuler(_e.set(rnd(), rnd() * 6, rnd()));
      canopy.setMatrixAt(i * 3 + k, _m.compose(_p.set(x + (rnd() - 0.5) * h * 0.45, y + h * (0.72 + rnd() * 0.25), z + (rnd() - 0.5) * h * 0.45), _q, _s.set(r, r * 0.62, r)));
      canopy.setColorAt(i * 3 + k, _c.setHSL(0.21 + rnd() * 0.06, 0.2 + rnd() * 0.1, 0.3 + rnd() * 0.09, THREE.SRGBColorSpace));
    }
    treeSpots.push([x, z]);
  }, (x, z) => 0.15 + 0.85 * Math.pow(patchNoise(x - 200, z + 400), 2));
  canopy.count = trunks.count * 3;
  for (const m of [trunks, canopy]) {
    m.castShadow = true;
    m.frustumCulled = false;
    g.add(m);
  }

  const rockMat = registerMaterial(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true }));
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), rockMat, 260);
  rocks.count = scatter(260, 62, 520, 0.75, 4, (i, x, z, y) => {
    const sc = 0.2 + Math.pow(rnd(), 2.5) * 1.5;
    _q.setFromEuler(_e.set(rnd() * 3, rnd() * 3, rnd() * 3));
    rocks.setMatrixAt(i, _m.compose(_p.set(x, y + sc * 0.2, z), _q, _s.set(sc, sc * 0.6, sc * (0.7 + rnd() * 0.6))));
    rocks.setColorAt(i, _c.setHSL(0.045 + rnd() * 0.02, 0.36, 0.3 + rnd() * 0.12, THREE.SRGBColorSpace));
  });
  rocks.castShadow = true;
  rocks.frustumCulled = false;
  g.add(rocks);

  const moundGeom = new THREE.ConeGeometry(0.5, 1, 7);
  moundGeom.translate(0, 0.5, 0);
  const mounds = new THREE.InstancedMesh(moundGeom, bermMat, 70);
  mounds.count = scatter(70, 75, 420, 0.8, 8, (i, x, z, y) => {
    const h = 0.7 + rnd() * 1.5;
    _q.setFromEuler(_e.set((rnd() - 0.5) * 0.15, rnd() * 3, (rnd() - 0.5) * 0.15));
    mounds.setMatrixAt(i, _m.compose(_p.set(x, y - 0.05, z), _q, _s.set(0.6 + rnd() * 0.7, h, 0.6 + rnd() * 0.7)));
    mounds.setColorAt(i, _c.setHSL(0.045, 0.55, 0.33 + rnd() * 0.06, THREE.SRGBColorSpace));
  });
  mounds.castShadow = true;
  mounds.frustumCulled = false;
  g.add(mounds);

  /* ---- Distant terrain: hills and flat-topped mesas in the haze ---- */
  const hillGeom = new THREE.SphereGeometry(1, 24, 12);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + rnd() * 0.3;
    const r = 700 + rnd() * 160;
    const h = new THREE.Mesh(hillGeom, MATERIALS.hills);
    const w = 120 + rnd() * 180;
    h.scale.set(w, 18 + rnd() * 30, w * (0.6 + rnd() * 0.5));
    h.position.set(Math.cos(a) * r, -6, Math.sin(a) * r);
    g.add(h);
  }
  const mesaMat = registerMaterial(new THREE.MeshStandardMaterial({ color: 0xa8684c, roughness: 1, flatShading: true }));
  for (let i = 0; i < 6; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 640 + rnd() * 180;
    const w = 50 + rnd() * 70;
    const hgt = 26 + rnd() * 26;
    const mesa = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 1, 1, 11), mesaMat);
    mesa.scale.set(w, hgt, w * (0.6 + rnd() * 0.6));
    mesa.rotation.y = rnd() * 3;
    mesa.position.set(Math.cos(a) * r, hgt / 2 - 2, Math.sin(a) * r);
    g.add(mesa);
  }

  const wheel = buildWindmill(g);

  function update(dt, t) {
    skyMat.uniforms.time.value = t;
    wheel.rotation.z -= dt * (2.2 + Math.sin(t * 0.3) * 0.7);
  }

  return { group: g, update, treeSpots };
}
