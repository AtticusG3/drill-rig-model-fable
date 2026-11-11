import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { LAYOUT } from './layout.js';

function makeLabel(text) {
  const el = document.createElement('div');
  el.className = 'eq-label';
  el.textContent = text;
  return new CSS2DObject(el);
}

/**
 * HTML overlay labels. Static labels sit in world space; the travelling block
 * and top drive labels are children of the hoisting group so they follow it.
 */
export function createLabels(scene, hoist) {
  const L = LAYOUT;
  const group = new THREE.Group();
  group.name = 'Labels';

  const staticLabels = [
    ['Crown Block', [0, L.mastTopY + 3.4, 0]],
    ['Racking Board', [-1.6, L.monkeyBoardY + 1.4, -L.mastHalfZ - 1.0]],
    ['Setback', [-1.9, L.floorY + 2.0, -2.2]],
    ['Iron Roughneck', [L.roughneckParkX, L.floorY + 2.0, 0]],
    ['Mast', [-L.mastBaseHalfX - 0.6, 30, 0]],
    ['Drill Floor', [6.0, L.floorY + 1.6, 5.0]],
    ['Rotary Table', [-0.9, L.rotaryTopY + 0.5, 1.4]],
    ['Drawworks', [L.drawworksPos[0], L.floorY + 3.0, L.drawworksPos[2]]],
    ['BOP Stack', [1.6, 4.5, 0.9]],
    ['Pipe Rack', [L.rackXs[1], 3.2, L.rackZ0 + 15]],
    ['Catwalk', [0, 2.8, 26]],
    ['Mud Pumps', [L.mudPumpXs[1], 4.8, L.mudPumpZ]],
    ['Mud Tanks', [L.mudTankX, 5.6, L.mudTankZs[1] - 2]],
    ['Shale Shakers', [L.mudTankX, 6.2, L.shakerTankZ]],
    ["Driller's Cabin", [L.cabinPos[0], L.floorY + 4.0, L.cabinPos[2]]],
    ['Directional Driller (DD)', [L.ddOffice[0], 4.4, L.ddOffice[2]]],
    ['MWD / LWD Unit', [L.mwdUnit[0], 4.4, L.mwdUnit[2]]],
    ['Mud Engineer', [L.mudLab[0], 4.2, L.mudLab[2]]],
    ['Toolpusher Office', [-26, 4.2, 24]],
  ];
  for (const [text, pos] of staticLabels) {
    const lbl = makeLabel(text);
    lbl.position.fromArray(pos);
    group.add(lbl);
  }
  scene.add(group);

  // dynamic labels follow the hoisting assembly
  const dyn = new THREE.Group();
  dyn.name = 'HoistLabels';
  const tb = makeLabel('Travelling Block');
  tb.position.set(0, hoist.localBlockTop + 0.6, 0);
  const td = makeLabel('Top Drive');
  td.position.set(1.5, 3.2, 0.9);
  dyn.add(tb, td);
  hoist.group.add(dyn);

  let visible = true;
  const setVisible = (on) => {
    visible = on;
    group.visible = on;
    dyn.visible = on;
  };
  setVisible(true);

  return { group, dyn, setVisible, get visible() { return visible; } };
}
