import * as THREE from 'three';
import { MATERIALS, registerMaterial } from '../materials.js';
import { LAYOUT as L } from '../layout.js';
import { box, sphere } from '../geometry.js';

const C = (hex) => new THREE.Color(hex);
const KEY = {
  zenithDay: C(0x1f5cb5), zenithNight: C(0x03060d), zenithDusk: C(0x2b3c72),
  horizonDay: C(0x9cc4e8), horizonNight: C(0x0a111e), horizonDusk: C(0xf0a06a),
  hazeDay: C(0xe2cdb4), hazeNight: C(0x090d15), hazeDusk: C(0xf2955a),
  groundDay: C(0xb8724e), groundNight: C(0x070605),
  envGroundDay: C(0x7d6a5f),
  sunHigh: C(0xfff0d8), sunLow: C(0xff8a4a), moon: C(0x9db4e0),
  hemiDay: C(0x9fc6ff), hemiNight: C(0x26324a),
  cloudDusk: C(0xffb88c),
  glow: C(0xff8a3c),
};
const smooth = THREE.MathUtils.smoothstep;
const NOON_TILT = THREE.MathUtils.degToRad(25);   // sun culminates 65 deg up, toward +Z
const NOON = new THREE.Vector3(0, Math.cos(NOON_TILT), Math.sin(NOON_TILT));
const WEST = new THREE.Vector3(-1, 0, 0);

/** Unit vector toward the sun for a time of day in hours (rises +X at 06:00, sets -X at 18:00). */
export function sunDirection(hours, out = new THREE.Vector3()) {
  const h = ((hours - 12) / 24) * Math.PI * 2;
  return out.copy(NOON).multiplyScalar(Math.cos(h)).addScaledVector(WEST, Math.sin(h)).normalize();
}

export function formatTime(hours) {
  const h = ((hours % 24) + 24) % 24;
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/**
 * Day / night cycle: moves the sun (or the moon at night), recolours the sky,
 * fog and ambient light, re-bakes the image-based lighting as the light
 * changes, and switches the rig's floodlights, mast lights, cabin windows and
 * crown beacon on at dusk.
 */
export function createDayNight({ scene, renderer, sun, hemi, ambient, skyMat, envSky, bakeEnvironment, particles, wildlife }) {
  const state = { time: 10, auto: true, dayLength: 600, daylight: 1, lights: 0, elevation: 0 };
  const group = new THREE.Group();
  group.name = 'RigLights';

  /* ---- light fittings: floodlight towers (existing lamps), mast legs, racking board, crown beacon ---- */
  const spots = [];
  for (const [x, z] of [[-46, -36], [46, -36], [-46, 36], [46, 36]]) {
    const s = new THREE.SpotLight(0xf3f6ff, 0, 0, 0.72, 0.75, 2);
    s.position.set(x, 18.9, z);
    s.target.position.set(x * 0.08, 4, z * 0.08);
    group.add(s, s.target);
    spots.push(s);
  }
  const points = [];
  for (const [x, y, z, k] of [[0, 36.5, 2.4, 260], [-2.6, 12.6, 3.2, 45], [2.8, 12.6, -3.0, 45]]) {
    const p = new THREE.PointLight(0xfff0d0, 0, 0, 2);
    p.position.set(x, y, z);
    p.userData.k = k;
    group.add(p);
    points.push(p);
  }
  for (const y of [12.5, 20, 28, 36, 44]) {
    const half = THREE.MathUtils.lerp(L.mastBaseHalfX, L.mastTopHalfX, (y - L.mastBaseY) / (L.mastTopY - L.mastBaseY));
    for (const sx of [-1, 1]) group.add(box(0.14, 0.5, 0.14, MATERIALS.lightFixture, sx * (half + 0.12), y, L.mastHalfZ + 0.12));
  }
  const beaconMat = registerMaterial(new THREE.MeshStandardMaterial({ color: 0x7a1010, emissive: 0xff2010, emissiveIntensity: 0, roughness: 0.4 }));
  group.add(sphere(0.2, beaconMat, 0, L.mastTopY + 2.75, 0));
  scene.add(group);
  MATERIALS.glassDark.emissive = new THREE.Color(0xffc878);
  MATERIALS.glassDark.emissiveIntensity = 0;

  const dir = new THREE.Vector3();
  const moonDir = new THREE.Vector3();
  const fogColor = scene.fog.color;
  let bakedAt = { e: 999, t: -1e9 };
  let wall = 0;

  function apply(force = false) {
    sunDirection(state.time, dir);
    const e = THREE.MathUtils.radToDeg(Math.asin(dir.y));
    const day = smooth(e, -6, 10);
    const dusk = THREE.MathUtils.clamp(1 - Math.abs(e - 2) / 14, 0, 1);
    const night = 1 - smooth(e, -12, -2);
    state.daylight = day;
    state.elevation = e;
    moonDir.copy(dir).negate();

    /* ---- sky (the visible dome and the copy used to bake reflections) ---- */
    for (const m of [skyMat, envSky.material]) {
      const u = m.uniforms;
      u.zenith.value.copy(KEY.zenithNight).lerp(KEY.zenithDay, day).lerp(KEY.zenithDusk, dusk * 0.5);
      u.horizon.value.copy(KEY.horizonNight).lerp(KEY.horizonDay, day).lerp(KEY.horizonDusk, dusk * 0.75);
      u.haze.value.copy(KEY.hazeNight).lerp(KEY.hazeDay, day).lerp(KEY.hazeDusk, dusk * 0.8);
      u.sunDir.value.copy(dir);
      u.sunColor.value.copy(KEY.sunLow).lerp(KEY.sunHigh, smooth(e, 0, 20));
      u.sunVis.value = smooth(e, -3, 0.5);
      u.moonDir.value.copy(moonDir);
      u.night.value = night;
      u.glow.value = dusk * 0.85;
      u.cloudTint.value.setRGB(1, 1, 1).lerp(KEY.cloudDusk, dusk * 0.7).multiplyScalar(THREE.MathUtils.lerp(0.07, 1, day));
    }
    skyMat.uniforms.groundCol.value.copy(KEY.groundNight).lerp(KEY.groundDay, day);
    envSky.material.uniforms.groundCol.value.copy(KEY.groundNight).lerp(KEY.envGroundDay, day);
    fogColor.copy(skyMat.uniforms.haze.value);
    if (scene.background && scene.background.isColor) scene.background.copy(fogColor);

    /* ---- sun by day, moon by night (one shadow-casting light) ---- */
    if (e > -3) {
      sun.position.copy(dir).multiplyScalar(160);
      sun.color.copy(KEY.sunLow).lerp(KEY.sunHigh, smooth(e, 0, 22));
      sun.intensity = 3.1 * smooth(e, -3, 14);
    } else {
      sun.position.copy(moonDir).multiplyScalar(160);
      sun.color.copy(KEY.moon);
      sun.intensity = 0.34 * smooth(-e, 4, 14);
    }
    hemi.intensity = THREE.MathUtils.lerp(0.05, 0.25, day);
    hemi.color.copy(KEY.hemiNight).lerp(KEY.hemiDay, day);
    ambient.intensity = THREE.MathUtils.lerp(0.03, 0.05, day);
    renderer.toneMappingExposure = THREE.MathUtils.lerp(1.2, 1.05, day);

    /* ---- artificial lighting comes on at dusk ---- */
    const on = 1 - smooth(day, 0.25, 0.6);
    state.lights = on;
    for (const s of spots) s.intensity = 2400 * on;
    for (const p of points) p.intensity = p.userData.k * on;
    MATERIALS.lightFixture.emissiveIntensity = 0.6 + 9 * on;
    MATERIALS.glassDark.emissiveIntensity = 0.6 * on;
    beaconMat.emissiveIntensity = on > 0.5 && Math.sin(wall * 4.2) > 0.2 ? 6 : 0.2 * on;

    /* ---- unlit effects follow the daylight ---- */
    if (particles) particles.material.uniforms.uLight.value = THREE.MathUtils.lerp(0.08, 1, day);
    if (wildlife && wildlife.setDaylight) wildlife.setDaylight(day);

    /* ---- image-based lighting: re-bake when the light has changed noticeably ---- */
    if (force || (Math.abs(e - bakedAt.e) > 2.5 && wall - bakedAt.t > 0.5) || (Math.abs(e - bakedAt.e) > 0.4 && wall - bakedAt.t > 6)) {
      bakeEnvironment(envSky.scene);
      bakedAt = { e, t: wall };
    }
  }

  function update(dt) {
    wall += dt;
    if (state.auto) state.time = (state.time + (dt * 24) / state.dayLength) % 24;
    apply();
  }

  function setTime(hours) {
    state.time = ((hours % 24) + 24) % 24;
    apply(true);
  }

  apply(true);
  return { state, update, setTime, apply, group, spots, points };
}
