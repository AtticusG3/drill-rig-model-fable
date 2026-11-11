import * as THREE from 'three';

/**
 * Small pooled soft-particle system (dust, water spray) drawn as one Points object.
 * Each particle has position, velocity, life, size growth and a colour.
 */
export class ParticleSystem {
  constructor(capacity = 700) {
    this.capacity = capacity;
    this.pos = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.alpha = new Float32Array(capacity);
    this.life = new Float32Array(capacity);      // remaining
    this.span = new Float32Array(capacity);      // total
    this.size0 = new Float32Array(capacity);
    this.grow = new Float32Array(capacity);
    this.alpha0 = new Float32Array(capacity);
    this.gravity = new Float32Array(capacity);
    this.cursor = 0;
    this.live = 0;

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geom.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    geom.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    geom.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uScale: { value: 1000 }, uLight: { value: 1 } },
      vertexShader: `
        attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
        uniform float uScale;
        varying float vAlpha; varying vec3 vColor;
        void main() {
          vAlpha = aAlpha; vColor = aColor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aAlpha > 0.0 ? aSize * uScale / max(0.5, -mv.z) : 0.0;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform float uLight;
        varying float vAlpha; varying vec3 vColor;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float a = smoothstep(1.0, 0.15, d) * vAlpha;
          if (a < 0.004) discard;
          gl_FragColor = vec4(vColor * uLight, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.points = new THREE.Points(geom, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    this.points.name = 'Particles';
  }

  /** Emit one particle. `color` is a THREE.Color (linear). */
  emit(x, y, z, vx, vy, vz, { life = 2, size = 1, grow = 1, alpha = 0.4, color, gravity = 0 }) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = color.r; this.col[i * 3 + 1] = color.g; this.col[i * 3 + 2] = color.b;
    this.life[i] = life; this.span[i] = life;
    this.size0[i] = size; this.grow[i] = grow; this.alpha0[i] = alpha; this.gravity[i] = gravity;
    this.size[i] = size; this.alpha[i] = 0;
  }

  update(dt) {
    let live = 0;
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      live++;
      const k = 1 - this.life[i] / this.span[i];          // 0 -> 1 over the lifetime
      this.vel[i * 3 + 1] -= this.gravity[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.05) { this.pos[i * 3 + 1] = 0.05; this.vel[i * 3 + 1] = 0; }
      this.size[i] = this.size0[i] * (1 + this.grow[i] * k);
      this.alpha[i] = this.alpha0[i] * Math.min(1, k * 8) * (1 - k) * (1 - k);
    }
    this.live = live;
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = true;
    a.aSize.needsUpdate = true;
    a.aAlpha.needsUpdate = true;
    a.aColor.needsUpdate = true;
  }

  /** Keep point sizes in world metres: call when the viewport or camera FOV changes. */
  setViewport(heightPx, fovDeg) {
    this.material.uniforms.uScale.value = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
  }
}
