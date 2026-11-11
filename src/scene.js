import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

/** Camera presets: elevated three-quarter overview first (initial view). */
export const CAMERA_PRESETS = [
  { id: 'overview', name: 'Overview', position: [72, 46, 84], target: [0, 18, 0] },
  { id: 'front', name: 'Front (+Z)', position: [0, 24, 98], target: [0, 20, 0] },
  { id: 'side', name: 'Side (along X)', position: [98, 24, 0], target: [0, 20, 0] },
  { id: 'top', name: 'Top', position: [0, 170, 0.6], target: [0, 0, 0] },
  { id: 'floor', name: 'Drill Floor', position: [10.5, 13.5, 12.5], target: [0, 10.5, 0] },
  { id: 'pipe', name: 'Pipe Handling', position: [-17, 14, 30], target: [2, 6, 12] },
  { id: 'mud', name: 'Mud System', position: [20, 15, -50], target: [-6, 3, -26] },
  { id: 'offices', name: 'Service Cabins (DD / MWD)', position: [-10, 11, 37], target: [-25, 2, 15] },
  { id: 'gate', name: 'Gate & Access Road', position: [36, 6, 96], target: [24, 2.5, 48] },
];

/** Phone / tablet: touch is the primary input. Drives lighter render settings and the compact layout. */
export const IS_TOUCH = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;

/**
 * Presets are framed for a landscape screen. On a narrow (portrait) screen the camera backs
 * away along its line of sight so the same width of the site stays in view.
 */
export function portraitFit(aspect) {
  return aspect >= 1 ? 1 : Math.min(1.9, 0.6 + 0.4 / aspect);
}

function easeInOut(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Smooth camera transitions between presets. */
export class CameraRig {
  constructor(camera, controls) {
    this.camera = camera;
    this.controls = controls;
    this.active = false;
    this.t = 0;
    this.duration = 1.4;
    this.fromPos = new THREE.Vector3();
    this.fromTarget = new THREE.Vector3();
    this.toPos = new THREE.Vector3();
    this.toTarget = new THREE.Vector3();
  }
  flyTo(preset, duration = 1.4) {
    this.fromPos.copy(this.camera.position);
    this.fromTarget.copy(this.controls.target);
    this.toTarget.fromArray(preset.target);
    this.toPos.fromArray(preset.position).sub(this.toTarget).multiplyScalar(portraitFit(this.camera.aspect)).add(this.toTarget);
    this.duration = duration;
    this.t = 0;
    this.active = true;
    this.controls.enabled = false;
  }
  update(dt) {
    if (!this.active) return;
    this.t = Math.min(1, this.t + dt / this.duration);
    const k = easeInOut(this.t);
    this.camera.position.lerpVectors(this.fromPos, this.toPos, k);
    this.controls.target.lerpVectors(this.fromTarget, this.toTarget, k);
    if (this.t >= 1) {
      this.active = false;
      this.controls.enabled = true;
    }
    this.controls.update();
  }
}

export function createScene(container) {
  // phones: high-density screens already hide aliasing, so skip MSAA and cap the render resolution
  const dpr = window.devicePixelRatio || 1;
  const maxPixelRatio = IS_TOUCH ? Math.min(dpr, 1.5) : Math.min(dpr, 2);
  const renderer = new THREE.WebGLRenderer({ antialias: !(IS_TOUCH && dpr >= 2), powerPreference: 'high-performance' });
  renderer.setPixelRatio(maxPixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = IS_TOUCH ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.domElement.style.position = 'absolute';
  labelRenderer.domElement.style.top = '0';
  labelRenderer.domElement.style.pointerEvents = 'none';
  container.appendChild(labelRenderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xdccbb6);
  scene.fog = new THREE.Fog(0xdccbb6, 280, 1250);     // warm dust haze matched to the sky horizon

  // Image-based lighting baked from the procedural sky (blue above, red earth below)
  // so steel reflects the real surroundings. Call once the sky exists.
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envTarget = null;
  function setEnvironmentFrom(envScene) {
    const target = pmrem.fromScene(envScene, 0.03, 0.1, 200);
    scene.environment = target.texture;
    scene.environmentIntensity = 0.85;
    if (envTarget) envTarget.dispose();
    envTarget = target;
  }

  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.5, 2500);
  const p0 = CAMERA_PRESETS[0];
  camera.position.fromArray(p0.position).sub(new THREE.Vector3().fromArray(p0.target)).multiplyScalar(portraitFit(camera.aspect)).add(new THREE.Vector3().fromArray(p0.target));

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.fromArray(p0.target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 2;
  controls.maxDistance = 520;
  controls.maxPolarAngle = Math.PI / 2 - 0.01; // never below ground
  controls.update();

  /* ---------------- Lighting: harsh Australian sun ---------------- */
  const sun = new THREE.DirectionalLight(0xfff0d8, 3.1);
  sun.position.set(55, 95, 40);       // high sun from the +X/+Z quadrant: rakes the lattice and floor
  sun.castShadow = true;
  sun.shadow.mapSize.set(IS_TOUCH ? 2048 : 4096, IS_TOUCH ? 2048 : 4096);
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 320;
  sun.shadow.camera.left = -85;
  sun.shadow.camera.right = 85;
  sun.shadow.camera.top = 85;
  sun.shadow.camera.bottom = -85;
  sun.shadow.bias = -0.00035;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);
  scene.add(sun.target);

  const hemi = new THREE.HemisphereLight(0x9fc6ff, 0x8a6650, 0.25);
  scene.add(hemi);
  const ambient = new THREE.AmbientLight(0xffffff, 0.05);
  scene.add(ambient);

  const cameraRig = new CameraRig(camera, controls);

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    // rotating the phone: keep the same framing by moving the camera along its line of sight
    const fit = portraitFit(camera.aspect);
    if (fit !== lastFit) {
      if (!cameraRig.active) camera.position.sub(controls.target).multiplyScalar(fit / lastFit).add(controls.target);
      lastFit = fit;
    }
    // keep the rig centred in the part of the screen not covered by the open panel
    if (viewShiftX > 0 || viewShiftY > 0) camera.setViewOffset(w, h, Math.round(viewShiftX), Math.round(viewShiftY), w, h);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    labelRenderer.setSize(w, h);
  }
  let viewShiftX = 0;
  let viewShiftY = 0;
  let lastFit = portraitFit(camera.aspect);
  /**
   * Shift the rendered view left by `x` and up by `y` CSS pixels: half the size of a panel
   * covering the right or the bottom of the screen.
   */
  function setViewShift(x, y) {
    if (Math.abs(x - viewShiftX) < 1 && Math.abs(y - viewShiftY) < 1) return;
    viewShiftX = x;
    viewShiftY = y;
    resize();
  }
  /** Render-resolution scale (1 = the device cap). Used by the adaptive quality control on phones. */
  function setResolutionScale(k) {
    renderer.setPixelRatio(Math.max(0.6, maxPixelRatio * k));
    resize();
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 250));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);

  return { renderer, labelRenderer, scene, camera, controls, sun, hemi, ambient, cameraRig, resize, setEnvironmentFrom, setViewShift, setResolutionScale };
}
