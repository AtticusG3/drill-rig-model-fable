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
    this.toPos.fromArray(preset.position);
    this.toTarget.fromArray(preset.target);
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
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
  function setEnvironmentFrom(envScene) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(envScene, 0.03, 0.1, 200).texture;
    scene.environmentIntensity = 0.85;
    pmrem.dispose();
  }

  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.5, 2500);
  const p0 = CAMERA_PRESETS[0];
  camera.position.fromArray(p0.position);

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
  sun.shadow.mapSize.set(4096, 4096);
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
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    labelRenderer.setSize(w, h);
  }
  window.addEventListener('resize', resize);

  return { renderer, labelRenderer, scene, camera, controls, sun, cameraRig, resize, setEnvironmentFrom };
}
