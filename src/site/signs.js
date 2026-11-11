import * as THREE from 'three';
import { registerMaterial } from '../materials.js';

/**
 * Painted sign board texture. `lines` is an array of strings or
 * { text, size, color, weight } objects, drawn centred top to bottom.
 */
export function makeSignTexture(lines, { width = 512, height = 256, bg = '#f4f1e8', fg = '#16202a', border = '#16202a', band = null } = {}) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  if (band) {
    ctx.fillStyle = band;
    ctx.fillRect(0, 0, width, Math.round(height * 0.3));
  }
  ctx.strokeStyle = border;
  ctx.lineWidth = Math.max(4, width / 90);
  ctx.strokeRect(6, 6, width - 12, height - 12);
  const items = lines.map((l) => (typeof l === 'string' ? { text: l } : l));
  const total = items.reduce((a, l) => a + (l.size ?? 44) * 1.25, 0);
  let y = (height - total) / 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const l of items) {
    const size = l.size ?? 44;
    ctx.font = `${l.weight ?? 700} ${size}px "Segoe UI", Arial, sans-serif`;
    ctx.fillStyle = l.color ?? fg;
    y += size * 0.625;
    ctx.fillText(l.text, width / 2, y, width - 36);
    y += size * 0.625;
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** A flat sign plate (facing local +Z) carrying a sign texture. */
export function makeSign(lines, w, h, opts = {}) {
  const tex = makeSignTexture(lines, { width: 512, height: Math.max(64, Math.round((512 * h) / w)), ...opts });
  const mat = registerMaterial(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0.05 }));
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.04), [null, null, null, null, mat, null].map((x) => x ?? SIGN_BACK));
  m.castShadow = true;
  return m;
}

const SIGN_BACK = registerMaterial(new THREE.MeshStandardMaterial({ color: 0x8d949a, roughness: 0.5, metalness: 0.6 }));
