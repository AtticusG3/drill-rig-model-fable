import * as THREE from 'three';
import { registerMaterial } from '../materials.js';
import { terrainHeight, WIND, mulberry32, insidePad, nearRoad } from './terrain.js';
import { STOCK_BORE } from '../environment.js';

const mat = (color, roughness = 0.9) => registerMaterial(new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 }));
const geomCache = new Map();
function boxGeom(w, h, d) {
  const key = `${w}|${h}|${d}`;
  if (!geomCache.has(key)) geomCache.set(key, new THREE.BoxGeometry(w, h, d));
  return geomCache.get(key);
}
function part(w, h, d, material, x, y, z, parent) {
  const m = new THREE.Mesh(boxGeom(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

const COATS = {
  cattle: [
    { body: mat(0x8a4a2c), face: mat(0xeee6d8) },   // Hereford-type red with white face
    { body: mat(0xb9b2a6), face: mat(0x9a948a) },   // grey Brahman
    { body: mat(0x9c5a34), face: mat(0x9c5a34) },   // Droughtmaster red
    { body: mat(0x2b2623), face: mat(0x2b2623) },   // black
    { body: mat(0xd8cdb8), face: mat(0xd8cdb8) },   // cream
  ],
  horse: [
    { body: mat(0x6a3a22), mane: mat(0x1c1512) },   // bay
    { body: mat(0x9a5a30), mane: mat(0xb88a58) },   // chestnut
    { body: mat(0xa8a6a2), mane: mat(0x6a6864) },   // grey
    { body: mat(0x2a2422), mane: mat(0x141110) },   // black
  ],
};
const HOOF = mat(0x2a2420);
const HORN = mat(0xd8d0bc);

/**
 * Low-poly quadruped built from boxes. Local +Z is forward, origin on the ground.
 * Returns pivots for the legs, neck and tail so the gait can be animated.
 */
function buildAnimal(kind, coat, scale) {
  const g = new THREE.Group();
  const cow = kind === 'cattle';
  const legH = cow ? 0.72 : 0.95;
  const bodyL = cow ? 1.9 : 1.95;
  const bodyW = cow ? 0.72 : 0.56;
  const bodyH = cow ? 0.82 : 0.7;
  const body = new THREE.Group();
  body.position.y = legH + bodyH / 2;
  g.add(body);
  part(bodyW, bodyH, bodyL, coat.body, 0, 0, 0, body);
  if (cow) {
    part(bodyW * 0.8, 0.16, bodyL * 0.6, coat.body, 0, -bodyH / 2 - 0.05, -0.1, body);     // belly
    if (coat === COATS.cattle[1] || coat === COATS.cattle[2]) part(0.34, 0.26, 0.5, coat.body, 0, bodyH / 2 + 0.1, 0.55, body);   // Brahman hump
  } else {
    part(bodyW * 0.92, bodyH * 0.9, 0.5, coat.body, 0, 0.03, -bodyL / 2 + 0.1, body);      // hindquarters
  }

  // neck + head on a pivot at the shoulders
  const neck = new THREE.Group();
  neck.position.set(0, bodyH * (cow ? 0.2 : 0.3), bodyL / 2 - 0.1);
  body.add(neck);
  const neckLen = cow ? 0.55 : 0.95;
  part(cow ? 0.36 : 0.26, cow ? 0.42 : 0.36, neckLen, coat.body, 0, 0, neckLen / 2, neck);
  const head = new THREE.Group();
  head.position.set(0, 0, neckLen);
  neck.add(head);
  part(cow ? 0.36 : 0.24, cow ? 0.36 : 0.28, cow ? 0.52 : 0.6, cow ? coat.face : coat.body, 0, -0.04, 0.2, head);
  part(cow ? 0.26 : 0.18, cow ? 0.22 : 0.18, 0.16, cow ? coat.face : coat.body, 0, -0.1, 0.52, head);   // muzzle
  for (const sx of [-1, 1]) part(0.06, 0.14, 0.1, coat.body, sx * (cow ? 0.24 : 0.1), cow ? 0.12 : 0.2, 0.0, head);   // ears
  if (cow) for (const sx of [-1, 1]) part(0.22, 0.05, 0.05, HORN, sx * 0.26, 0.18, 0.08, head);
  else part(0.06, 0.3, neckLen + 0.25, coat.mane, 0, 0.26, neckLen / 2 - 0.05, neck);                    // mane

  // legs on hip / shoulder pivots
  const legs = [];
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const hip = new THREE.Group();
    hip.position.set(sx * (bodyW / 2 - 0.1), legH, sz * (bodyL / 2 - 0.18));
    g.add(hip);
    part(cow ? 0.17 : 0.13, legH - 0.1, cow ? 0.19 : 0.15, coat.body, 0, -(legH - 0.1) / 2, 0, hip);
    part(cow ? 0.18 : 0.14, 0.1, cow ? 0.2 : 0.16, HOOF, 0, -legH + 0.05, 0, hip);
    legs.push(hip);
  }

  const tail = new THREE.Group();
  tail.position.set(0, bodyH / 2 - 0.05, -bodyL / 2);
  body.add(tail);
  if (cow) {
    part(0.05, 0.75, 0.05, coat.body, 0, -0.38, -0.03, tail);
    part(0.09, 0.2, 0.09, HOOF, 0, -0.82, -0.03, tail);
  } else {
    part(0.12, 0.85, 0.12, coat.mane, 0, -0.4, -0.08, tail);
  }

  g.scale.setScalar(scale);
  return { group: g, body, neck, head, legs, tail, kind, legH: legH * scale };
}

/** Wandering herd inside a rectangular paddock zone (convex, so straight walks never leave it). */
class Herd {
  constructor(kind, count, zone, rnd, group) {
    this.kind = kind;
    this.zone = zone;
    this.rnd = rnd;
    this.animals = [];
    this.center = new THREE.Vector2(zone.cx, zone.cz);
    this.centerTarget = this.center.clone();
    this.moveTimer = 20 + rnd() * 30;
    this.spook = 0;
    for (let i = 0; i < count; i++) {
      const coats = COATS[kind];
      const coat = coats[Math.floor(rnd() * coats.length)];
      const calf = kind === 'cattle' && rnd() < 0.22;
      const a = buildAnimal(kind, coat, calf ? 0.6 : 0.92 + rnd() * 0.18);
      const p = this.pickNear(this.center, 16);
      a.x = p.x;
      a.z = p.y;
      a.heading = rnd() * Math.PI * 2;
      a.state = 'graze';
      a.timer = rnd() * 12;
      a.phase = rnd() * 6;
      a.neckPitch = 0.9;
      a.speed = 0;
      a.tx = a.x;
      a.tz = a.z;
      a.tailPhase = rnd() * 6;
      this.animals.push(a);
      group.add(a.group);
    }
  }

  ok(x, z) {
    const zn = this.zone;
    if (x < zn.x0 || x > zn.x1 || z < zn.z0 || z > zn.z1) return false;
    if (insidePad(x, z, 12) || nearRoad(x, z, 6)) return false;
    if (Math.abs(x - (STOCK_BORE.x + 6.5)) < 4.5 && Math.abs(z - (STOCK_BORE.z + 1.5)) < 4.5) return false;   // stock tank
    if (Math.abs(x - STOCK_BORE.x) < 2.2 && Math.abs(z - STOCK_BORE.z) < 2.2) return false;                   // windmill
    if (Math.abs(x - (STOCK_BORE.x + 7)) < 3.9 && Math.abs(z - (STOCK_BORE.z - 5)) < 1.3) return false;             // trough
    return true;
  }

  pickNear(c, radius) {
    for (let k = 0; k < 30; k++) {
      const a = this.rnd() * Math.PI * 2;
      const r = Math.sqrt(this.rnd()) * radius;
      const x = c.x + Math.cos(a) * r;
      const z = c.y + Math.sin(a) * r;
      if (this.ok(x, z)) return new THREE.Vector2(x, z);
    }
    return c.clone();
  }

  update(dt, t, particles, dustColor) {
    const rnd = this.rnd;
    const horse = this.kind === 'horse';
    // the herd centre drifts to a new spot every so often; horses sometimes canter there together
    this.moveTimer -= dt;
    if (this.moveTimer <= 0) {
      const zn = this.zone;
      for (let k = 0; k < 30; k++) {
        const x = zn.x0 + 14 + rnd() * (zn.x1 - zn.x0 - 28);
        const z = zn.z0 + 14 + rnd() * (zn.z1 - zn.z0 - 28);
        if (this.ok(x, z)) { this.centerTarget.set(x, z); break; }
      }
      this.moveTimer = (horse ? 35 : 70) + rnd() * 60;
      this.spook = horse && rnd() < 0.7 ? 1 : 0;
      for (const a of this.animals) {
        if (rnd() < (horse ? 1 : 0.6)) {
          const p = this.pickNear(this.centerTarget, horse ? 12 : 18);
          a.tx = p.x;
          a.tz = p.y;
          a.state = 'walk';
          a.run = this.spook;
          a.timer = rnd() * (horse ? 1.5 : 6);     // staggered start
        }
      }
    }
    this.center.lerp(this.centerTarget, Math.min(1, dt * 0.05));

    for (const a of this.animals) {
      a.timer -= dt;
      let wantSpeed = 0;
      if (a.state === 'graze' || a.state === 'idle') {
        if (a.timer <= 0) {
          const r = rnd();
          if (r < 0.45) {
            const p = this.pickNear(new THREE.Vector2(a.x, a.z).lerp(this.centerTarget, 0.35), 9);
            a.tx = p.x;
            a.tz = p.y;
            a.state = 'walk';
            a.run = 0;
            a.timer = 0;
          } else {
            a.state = r < 0.8 ? 'graze' : 'idle';
            a.timer = 5 + rnd() * 14;
          }
        }
      } else if (a.timer <= 0) {
        const dx = a.tx - a.x;
        const dz = a.tz - a.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.6) {
          a.state = rnd() < 0.75 ? 'graze' : 'idle';
          a.timer = 6 + rnd() * 16;
          a.run = 0;
        } else {
          const want = Math.atan2(dx, dz);
          let dh = want - a.heading;
          dh = Math.atan2(Math.sin(dh), Math.cos(dh));
          a.heading += THREE.MathUtils.clamp(dh, -dt * (a.run ? 2.4 : 1.3), dt * (a.run ? 2.4 : 1.3));
          const top = a.run ? 6.5 : horse ? 1.35 : 0.85;
          wantSpeed = Math.min(top, 0.4 + dist * 0.8) * (Math.abs(dh) > 1 ? 0.35 : 1);
        }
      }
      a.speed += THREE.MathUtils.clamp(wantSpeed - a.speed, -dt * 3, dt * (a.run ? 3 : 1));
      if (a.speed > 0.01) {
        a.x += Math.sin(a.heading) * a.speed * dt;
        a.z += Math.cos(a.heading) * a.speed * dt;
        a.phase += (a.speed * dt * 2.6) / a.legH * 0.72;
      }

      // pose
      const g = a.group;
      const canter = a.speed > 3;
      g.position.set(a.x, terrainHeight(a.x, a.z) + (canter ? Math.abs(Math.sin(a.phase)) * 0.12 : 0), a.z);
      g.rotation.y = a.heading;
      const amp = Math.min(0.75, a.speed * (canter ? 0.12 : 0.42));
      const sw = Math.sin(a.phase) * amp;
      if (canter) {
        // fore pair and hind pair swing roughly together
        a.legs[0].rotation.x = sw; a.legs[1].rotation.x = Math.sin(a.phase + 0.5) * amp;
        a.legs[2].rotation.x = -sw; a.legs[3].rotation.x = -Math.sin(a.phase + 0.5) * amp;
        a.body.rotation.x = Math.sin(a.phase) * 0.06;
      } else {
        // walk: diagonal pairs
        a.legs[0].rotation.x = sw; a.legs[3].rotation.x = sw;
        a.legs[1].rotation.x = -sw; a.legs[2].rotation.x = -sw;
        a.body.rotation.x = 0;
      }
      const neckRest = horse ? -0.75 : -0.12;                     // negative pitch raises the head
      const neckGraze = horse ? 1.0 : 1.2;
      const neckWant = a.state === 'graze' && a.speed < 0.1 ? neckGraze + Math.sin(t * 1.7 + a.tailPhase) * 0.05 : canter ? neckRest + 0.3 : neckRest + Math.sin(a.phase * 2) * 0.03;
      a.neckPitch += (neckWant - a.neckPitch) * Math.min(1, dt * 2.2);
      a.neck.rotation.x = a.neckPitch;
      a.head.rotation.x = a.state === 'graze' ? -0.25 : horse ? 0.75 : 0.2;
      a.head.rotation.y = a.state === 'idle' ? Math.sin(t * 0.4 + a.tailPhase) * 0.5 : 0;
      const swish = Math.max(0, Math.sin(t * 0.9 + a.tailPhase * 3) - 0.6) * 2.5;
      a.tail.rotation.z = Math.sin(t * 7 + a.tailPhase) * 0.5 * swish;
      a.tail.rotation.x = canter ? -0.9 : -0.08;

      if (canter && particles && rnd() < dt * 9) {
        particles.emit(a.x - Math.sin(a.heading) * 0.8, g.position.y + 0.2, a.z - Math.cos(a.heading) * 0.8, WIND.x + (rnd() - 0.5), 0.5 + rnd() * 0.5, WIND.z + (rnd() - 0.5), { life: 2 + rnd(), size: 0.7, grow: 3, alpha: 0.22, color: dustColor });
      }
    }
  }
}

/* ---------------- Tumbleweeds ---------------- */
function buildTumbleweed() {
  const g = new THREE.Group();
  const twig = new THREE.LineBasicMaterial({ color: 0x8a744e });
  const twig2 = new THREE.LineBasicMaterial({ color: 0xb09a6c });
  // irregular twig ball: jitter each vertex radially (same offset for coincident vertices)
  const ragged = (geom, amount, seed) => {
    const p = geom.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const h = Math.sin(p.getX(i) * 12.9898 + p.getY(i) * 78.233 + p.getZ(i) * 37.719 + seed) * 43758.5453;
      const k = 1 - amount + (h - Math.floor(h)) * amount * 1.6;
      p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
    }
    return new THREE.WireframeGeometry(geom);
  };
  const a = new THREE.LineSegments(ragged(new THREE.IcosahedronGeometry(1, 3), 0.3, 1), twig);
  const b = new THREE.LineSegments(ragged(new THREE.IcosahedronGeometry(0.85, 2), 0.35, 2), twig2);
  b.rotation.set(0.6, 0.4, 0.2);
  const c = new THREE.LineSegments(ragged(new THREE.OctahedronGeometry(0.62, 3), 0.4, 3), twig);
  c.rotation.set(0.2, 1.1, 0.7);
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 1), registerMaterial(new THREE.MeshStandardMaterial({ color: 0x8f7a54, roughness: 1, transparent: true, opacity: 0.35, depthWrite: false })));
  g.add(a, b, c, core);
  return g;
}

/* ---------------- Birds (kites circling on the thermals) ---------------- */
function buildBird() {
  const g = new THREE.Group();
  const m = registerMaterial(new THREE.MeshStandardMaterial({ color: 0x3a2e26, roughness: 1, side: THREE.DoubleSide }));
  const wingGeom = new THREE.BufferGeometry();
  wingGeom.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.25, 0, 0, -0.3, 1.25, 0, -0.05, 1.25, 0, -0.05, 0, 0, 0.25, 0.9, 0, 0.2], 3));
  wingGeom.computeVertexNormals();
  const wl = new THREE.Group();
  const wr = new THREE.Group();
  wl.add(new THREE.Mesh(wingGeom, m));
  const r = new THREE.Mesh(wingGeom, m);
  r.scale.x = -1;
  wr.add(r);
  g.add(wl, wr);
  const bodyM = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.9, 5), m);
  bodyM.rotation.x = Math.PI / 2;
  g.add(bodyM);
  const tailGeom = new THREE.BufferGeometry();
  tailGeom.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.3, -0.22, 0, -0.75, 0.22, 0, -0.75], 3));
  tailGeom.computeVertexNormals();
  g.add(new THREE.Mesh(tailGeom, m));
  return { group: g, wl, wr };
}

export function buildWildlife(particles) {
  const group = new THREE.Group();
  group.name = 'Wildlife';
  const rnd = mulberry32(4242);
  const DUST = new THREE.Color(0xc98e68);

  const cattle = new Herd('cattle', 11, { x0: -210, x1: -68, z0: -70, z1: 160, cx: STOCK_BORE.x + 18, cz: STOCK_BORE.z - 14 }, rnd, group);
  const horses = new Herd('horse', 4, { x0: 68, x1: 210, z0: -130, z1: 26, cx: 96, cz: -22 }, rnd, group);
  const herds = [cattle, horses];

  // soft blob shadows (the sun shadow map only covers the pad)
  const all = [...cattle.animals, ...horses.animals];
  const TUMBLE_N = 5;
  const blobGeom = new THREE.CircleGeometry(1, 14);
  blobGeom.rotateX(-Math.PI / 2);
  const blobs = new THREE.InstancedMesh(blobGeom, new THREE.MeshBasicMaterial({ color: 0x2a1408, transparent: true, opacity: 0.32, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), all.length + TUMBLE_N);
  blobs.frustumCulled = false;
  blobs.renderOrder = 2;
  group.add(blobs);
  const _m = new THREE.Matrix4();
  const _p = new THREE.Vector3();
  const _q = new THREE.Quaternion();
  const _s = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);

  // tumbleweeds roll downwind on lines that pass either side of the pad
  const perp = new THREE.Vector3(-WIND.z, 0, WIND.x);
  const rollAxis = new THREE.Vector3().crossVectors(UP, WIND).normalize();
  const weeds = [];
  for (let i = 0; i < TUMBLE_N; i++) {
    const w = { group: buildTumbleweed(), active: false, u: 0, l: 0, r: 0.5, speed: 5, bounce: 0, wob: 0, spin: 0 };
    w.group.visible = false;
    group.add(w.group);
    weeds.push(w);
  }
  let nextWeed = 3;
  function spawnWeed(t) {
    const w = weeds.find((x) => !x.active);
    if (!w) return;
    w.active = true;
    w.group.visible = true;
    w.r = 0.35 + rnd() * 0.45;
    w.l = (rnd() < 0.65 ? 1 : -1) * (80 + rnd() * 120);      // lateral offset: never crosses the pad
    w.u = -260;
    w.speed = 4 + rnd() * 3.5;
    w.bounce = rnd() * 6;
    w.wob = rnd() * 6;
    w.spin = 0;
    w.group.scale.setScalar(w.r);
    nextWeed = t + 5 + rnd() * 16;
  }

  const birds = [];
  for (let i = 0; i < 3; i++) {
    const b = buildBird();
    b.radius = 45 + rnd() * 60;
    b.height = 55 + rnd() * 40;
    b.angle = rnd() * 6;
    b.rate = (0.07 + rnd() * 0.05) * (rnd() < 0.5 ? 1 : -1);
    b.cx = -60 + rnd() * 200;
    b.cz = 60 + rnd() * 120;
    b.group.scale.setScalar(1.5);
    group.add(b.group);
    birds.push(b);
  }

  function update(dt, t) {
    for (const h of herds) h.update(dt, t, particles, DUST);

    if (t >= nextWeed) spawnWeed(t);
    const gust = 1 + 0.45 * Math.sin(t * 0.37) + 0.2 * Math.sin(t * 1.3);
    weeds.forEach((w, i) => {
      const bi = all.length + i;
      if (!w.active) {
        blobs.setMatrixAt(bi, _m.makeScale(0, 0, 0));
        return;
      }
      const v = w.speed * Math.max(0.35, gust);
      w.u += v * dt;
      w.bounce += dt * (2.5 + v * 0.5);
      w.spin += (v * dt) / w.r;
      const lat = w.l + Math.sin(w.u * 0.03 + w.wob) * 6;
      const x = perp.x * lat + WIND.x * w.u;
      const z = perp.z * lat + WIND.z * w.u;
      const hop = Math.pow(Math.abs(Math.sin(w.bounce)), 0.7) * w.r * (0.5 + v * 0.14);
      const y0 = terrainHeight(x, z);
      w.group.position.set(x, y0 + w.r * 0.9 + hop, z);
      w.group.quaternion.setFromAxisAngle(rollAxis, w.spin);
      const sh = w.r * (1 - Math.min(0.5, hop * 0.3));
      blobs.setMatrixAt(bi, _m.compose(_p.set(x, y0 + 0.06, z), _q.identity(), _s.set(sh, 1, sh)));
      if (w.u > 260) {
        w.active = false;
        w.group.visible = false;
      }
    });

    all.forEach((a, i) => {
      const len = a.kind === 'cattle' ? 1.25 : 1.2;
      _q.setFromAxisAngle(UP, a.heading);
      const sc = a.group.scale.x;
      blobs.setMatrixAt(i, _m.compose(_p.set(a.x + 0.25, a.group.position.y + 0.07, a.z - 0.15), _q, _s.set(0.55 * sc, 1, len * sc)));
    });
    blobs.instanceMatrix.needsUpdate = true;

    for (const b of birds) {
      b.angle += b.rate * dt;
      b.cx += WIND.x * dt * 0.4;
      b.cz += WIND.z * dt * 0.4;
      if (Math.abs(b.cx) > 260) b.cx *= -0.9;
      if (Math.abs(b.cz) > 260) b.cz *= -0.9;
      const x = b.cx + Math.cos(b.angle) * b.radius;
      const z = b.cz + Math.sin(b.angle) * b.radius;
      b.group.position.set(x, b.height + Math.sin(t * 0.2 + b.radius) * 4, z);
      const dir = Math.sign(b.rate);
      b.group.rotation.set(0, Math.atan2(-Math.sin(b.angle) * dir, Math.cos(b.angle) * dir), 0);
      b.group.rotateZ(-0.35 * dir);                       // bank into the turn
      const flap = Math.sin(t * 0.9 + b.radius) > 0.93 ? Math.sin(t * 9) * 0.5 : 0.12;
      b.wl.rotation.z = flap;
      b.wr.rotation.z = -flap;
    }
  }
  update(0, 0);

  return { group, update, herds, weeds, birds };
}
