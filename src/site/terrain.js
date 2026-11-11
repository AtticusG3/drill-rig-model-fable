import * as THREE from 'three';
import { LAYOUT } from '../layout.js';

/** Deterministic pseudo random so the site looks the same on every load. */
export function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Low frequency terrain noise, zero inside the pad so the rig sits on flat ground. */
export function terrainHeight(x, z) {
  const padHalfX = LAYOUT.siteX / 2 + 6;
  const padHalfZ = LAYOUT.siteZ / 2 + 6;
  const dx = Math.max(0, Math.abs(x) - padHalfX);
  const dz = Math.max(0, Math.abs(z) - padHalfZ);
  const d = Math.hypot(dx, dz);
  const blend = Math.min(1, d / 40);
  const n = Math.sin(x * 0.021) * Math.cos(z * 0.017) * 0.8 + Math.sin(x * 0.053 + z * 0.031) * 0.35 + Math.cos(z * 0.044 - x * 0.012) * 0.25;
  return n * blend * 1.1;
}

/** Smooth value noise in 0..1 (used for ground colour patches and vegetation density). */
export function patchNoise(x, z) {
  const a = Math.sin(x * 0.013 + 1.7) * Math.cos(z * 0.011 - 0.4);
  const b = Math.sin(x * 0.037 - z * 0.029 + 2.1) * 0.5;
  const c = Math.cos(x * 0.071 + z * 0.083) * 0.25;
  return THREE.MathUtils.clamp(0.5 + (a + b + c) * 0.36, 0, 1);
}

/* ---------------- Access road ---------------- */
export const GATE_X = 24;
export const GATE_Z = LAYOUT.siteZ / 2;
export const ROAD_HALF_WIDTH = 4.5;
export const ROAD_END_Z = 560;

/** Road centreline X for a given Z beyond the gate: straight to the gate, then a long sweeping bend. */
export function roadCenterX(z) {
  const d = Math.max(0, z - 95);
  return GATE_X + 0.00075 * d * d + 6 * Math.sin(Math.max(0, z - 60) * 0.012);
}

/** True when (x, z) is on or close to the road corridor. */
export function nearRoad(x, z, margin = 3) {
  if (z < GATE_Z - 2) return false;
  return Math.abs(x - roadCenterX(z)) < ROAD_HALF_WIDTH + margin;
}

export function insidePad(x, z, margin = 0) {
  return Math.abs(x) < LAYOUT.siteX / 2 + margin && Math.abs(z) < LAYOUT.siteZ / 2 + margin;
}

/** Prevailing wind (unit vector in XZ) shared by the windsock, tumbleweeds, dust and clouds. */
export const WIND = new THREE.Vector3(-0.93, 0, 0.37).normalize();
