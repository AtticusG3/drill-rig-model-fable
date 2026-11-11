import * as THREE from 'three';
import { createScene, CAMERA_PRESETS } from './scene.js';
import { buildEnvironment, makeSkyEnvScene } from './environment.js';
import { buildMast } from './rig/mast.js';
import { buildSubstructure } from './rig/substructure.js';
import { buildHoistingAssembly } from './rig/topDrive.js';
import { buildDrawworks } from './rig/drawworks.js';
import { buildPipeHandling } from './rig/pipeHandling.js';
import { buildWellControl } from './rig/wellControl.js';
import { buildMudSystem } from './rig/mudSystem.js';
import { buildAuxiliary } from './rig/auxiliary.js';
import { buildThirdParty } from './rig/thirdParty.js';
import { buildDrillString } from './rig/drillString.js';
import { buildFloorEquipment } from './rig/floorEquipment.js';
import { ParticleSystem } from './site/particles.js';
import { buildTraffic } from './site/vehicles.js';
import { buildWildlife } from './site/wildlife.js';
import { createLabels } from './labels.js';
import { RigAnimator } from './animations.js';
import { createUI } from './ui.js';
import { runValidation } from './validation.js';
import { beamBetween } from './geometry.js';
import { MATERIALS } from './materials.js';

const container = document.getElementById('app');
const { renderer, labelRenderer, scene, camera, controls, cameraRig, setEnvironmentFrom } = createScene(container);

/* ---------------- Build the site ---------------- */
const env = buildEnvironment();
scene.add(env.group);
setEnvironmentFrom(makeSkyEnvScene());

const mast = buildMast();
const sub = buildSubstructure();
const hoist = buildHoistingAssembly(mast);
const drawworks = buildDrawworks(mast);
const bop = buildWellControl();
const pipe = buildPipeHandling();
const mud = buildMudSystem(hoist, bop);
const aux = buildAuxiliary();
const thirdParty = buildThirdParty();
const string = buildDrillString();
const floor = buildFloorEquipment();

const rigGroup = new THREE.Group();
rigGroup.name = 'Rig';
rigGroup.add(mast.group, sub.group, floor.group, hoist.group, hoist.linkGroup, hoist.lines, hoist.serviceLoop.mesh, string.group, drawworks.group, drawworks.fastLine, bop.group);
scene.add(rigGroup, pipe.group, mud.group, aux.group, thirdParty.group);

// deadline: crown deadline sheave -> deadline anchor on the drill floor (+X)
{
  const dead = beamBetween(mast.deadLineTop, sub.deadlineAnchor, 0.02, MATERIALS.wireRope);
  dead.name = 'Deadline';
  rigGroup.add(dead);
}

/* ---------------- Site life: traffic, wildlife, dust ---------------- */
const particles = new ParticleSystem(900);
const traffic = buildTraffic(particles);
const wildlife = buildWildlife(particles);
scene.add(traffic.group, wildlife.group, particles.points);
const site = { enabled: true, time: 0 };

const labels = createLabels(scene, hoist);
const rig = {
  scene, mast, sub, hoist, drawworks, pipe, mud, bop, aux, string, floor, thirdParty, traffic, wildlife, env, site,
  obstacleRoots: [rigGroup, pipe.group, mud.group, aux.group, thirdParty.group],
};
const animator = new RigAnimator(rig);
rig.animator = animator;
const ui = createUI({ animator, rig, cameraRig, labels, renderer });

// keyboard camera presets
window.addEventListener('keydown', (e) => {
  const idx = parseInt(e.key, 10) - 1;
  if (idx >= 0 && idx < CAMERA_PRESETS.length && !e.ctrlKey && !e.metaKey) {
    cameraRig.flyTo(CAMERA_PRESETS[idx]);
    ui.setCameraPreset(CAMERA_PRESETS[idx].id);
  }
});

function stepSite(sdt) {
  site.time += sdt;
  env.update(sdt, site.time);
  thirdParty.update(sdt, site.time);
  traffic.state.enabled = site.enabled;
  traffic.update(sdt, site.time);
  if (site.enabled) wildlife.update(sdt, site.time);
  particles.update(sdt);
}
site.step = stepSite;

/* ---------------- Render loop ---------------- */
const clock = new THREE.Clock();
let validated = false;
function frame() {
  requestAnimationFrame(frame);
  const dt = clock.getDelta();
  animator.update(dt);

  // ambient site life runs on its own clock, independent of the rig sim speed
  stepSite(Math.min(dt, 0.1));
  particles.setViewport(renderer.domElement.height / renderer.getPixelRatio(), camera.fov);

  cameraRig.update(dt);
  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
  ui.update(dt, performance.now());
  if (!validated) {
    validated = true;
    const results = runValidation(rig);
    const passed = results.filter((r) => r.pass).length;
    ui.validationLine.textContent = `${passed}/${results.length} start-up checks passed — details in the browser console (F12).`;
    ui.validationLine.className = `status-line ${passed === results.length ? 'ok' : 'warn'}`;
    document.getElementById('loading').classList.add('hidden');
  }
}
frame();

// expose for console inspection / scripted testing
window.rig = rig;
window.rigApp = { cameraRig, presets: CAMERA_PRESETS, ui, renderer, camera, controls, particles };
