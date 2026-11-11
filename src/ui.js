import { LAYOUT } from './layout.js';
import { CAMERA_PRESETS } from './scene.js';
import { MODES } from './animations.js';
import { setWireframe } from './materials.js';
import { runValidation } from './validation.js';
import { RACK_PICK_LIST } from './sim/rigState.js';

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

function slider(label, min, max, step, value, onInput, format = (v) => v.toFixed(1)) {
  const row = el('div', 'row');
  const lab = el('label', null, label);
  const input = el('input');
  input.type = 'range';
  input.min = min;
  input.max = max;
  input.step = step;
  input.value = value;
  const val = el('span', 'value', format(value));
  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    const applied = onInput(v);
    val.textContent = format(applied ?? v);
  });
  row.append(lab, input, val);
  return { row, input, val, format };
}

function select(label, options, onChange) {
  const row = el('div', 'row');
  row.append(el('label', null, label));
  const s = el('select');
  for (const o of options) {
    const opt = el('option', null, o.name);
    opt.value = o.id;
    s.append(opt);
  }
  s.addEventListener('change', () => onChange(s.value));
  row.append(s);
  return { row, select: s };
}

function checkbox(label, checked, onChange) {
  const lab = el('label', 'check');
  const input = el('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  lab.append(input, document.createTextNode(label));
  return lab;
}

function button(label, onClick, cls = 'btn') {
  const b = el('button', cls, label);
  b.addEventListener('click', onClick);
  return b;
}

/**
 * Dark control-room panel: rig controls, view controls, diagnostics.
 */
export function createUI({ animator, rig, cameraRig, labels, renderer }) {
  const root = document.getElementById('ui');
  root.innerHTML = '';
  const s = animator.state;

  const header = el('div', 'panel-header');
  header.append(el('h1', null, 'Rig Control'));
  const collapse = el('button', null, '–');
  header.append(collapse);
  root.append(header);
  const body = el('div', 'panel-body');
  root.append(body);
  collapse.addEventListener('click', () => {
    root.classList.toggle('collapsed');
    collapse.textContent = root.classList.contains('collapsed') ? '+' : '–';
  });

  /* ---------------- Rig controls ---------------- */
  const rigSec = el('div', 'section');
  rigSec.append(el('h2', null, 'Rig Controls'));
  const mode = select('Mode', MODES, (v) => {
    animator.setMode(v);
    sync();
  });
  const hoist = slider('Hoist position', LAYOUT.hoistMin, LAYOUT.hoistMax, 0.05, animator.hoistTarget, (v) => animator.setHoistTarget(v), (v) => `${v.toFixed(1)} m`);
  const rpm = slider('RPM set-point', 0, 200, 1, s.rpmSet, (v) => { animator.setRPM(v); return s.rpmSet; }, (v) => `${Math.round(v)} rpm`);
  const speed = slider('Sim speed', 0.25, 4, 0.25, animator.simSpeed, (v) => { animator.simSpeed = v; return v; }, (v) => `${v.toFixed(2)}×`);
  rigSec.append(mode.row, hoist.row, rpm.row, speed.row);

  const btnRot = button('Start rotation', () => { animator.toggleRotation(); sync(); });
  const btnPipe = button('Start pipe transfer', () => { animator.startTransfer(); sync(); });
  const btnPause = button('Pause', () => { animator.paused = !animator.paused; sync(); });
  const btnReset = button('Reset', () => { animator.reset(); sync(); });
  const btns = el('div', 'btn-row');
  btns.append(btnRot, btnPipe);
  const btns2 = el('div', 'btn-row');
  btns2.append(btnPause, btnReset);
  rigSec.append(btns, btns2);
  const opLine = el('div', 'status-line op', '');
  rigSec.append(opLine);
  const status = el('div', 'status-line', 'Ready.');
  rigSec.append(status);
  body.append(rigSec);

  animator.onStatus = (msg, level) => {
    status.textContent = msg;
    status.className = `status-line ${level === 'warn' ? 'warn' : level === 'ok' ? 'ok' : ''}`;
  };

  /* ---------------- View controls ---------------- */
  const viewSec = el('div', 'section');
  viewSec.append(el('h2', null, 'View'));
  const cam = select('Camera preset', CAMERA_PRESETS, (id) => {
    const p = CAMERA_PRESETS.find((c) => c.id === id);
    if (p) cameraRig.flyTo(p);
  });
  viewSec.append(cam.row);
  viewSec.append(checkbox('Show structural bracing', true, (on) => { rig.mast.bracing.visible = on; rig.sub.bracing.visible = on; }));
  viewSec.append(checkbox('Show drill string', true, (on) => { rig.string.group.visible = on; }));
  viewSec.append(checkbox('Show mud system', true, (on) => { rig.mud.group.visible = on; }));
  viewSec.append(checkbox('Show equipment labels', true, (on) => labels.setVisible(on)));
  viewSec.append(checkbox('Wireframe mode', false, (on) => setWireframe(on)));
  viewSec.append(checkbox('Shadows', true, (on) => { renderer.shadowMap.enabled = on; rig.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; }); }));
  body.append(viewSec);

  /* ---------------- Site activity ---------------- */
  const siteSec = el('div', 'section');
  siteSec.append(el('h2', null, 'Site Activity'));
  siteSec.append(checkbox('Traffic, livestock and tumbleweeds', true, (on) => {
    rig.site.enabled = on;
    rig.wildlife.group.visible = on;
  }));
  const callTruck = (kind, name) => {
    const ok = rig.traffic.call(kind, rig.site.time);
    siteLine.textContent = ok ? `${name} called: watch the access road.` : 'A truck is already on site; wait for it to leave.';
    siteLine.className = `status-line ${ok ? 'ok' : 'warn'}`;
  };
  const siteBtns = el('div', 'btn-row');
  siteBtns.append(button('Call water truck', () => callTruck('water', 'Water truck')), button('Call fuel truck', () => callTruck('fuel', 'Fuel truck')));
  siteSec.append(siteBtns);
  const siteLine = el('div', 'status-line', 'Trucks also arrive on their own every minute or two.');
  siteSec.append(siteLine);
  body.append(siteSec);

  /* ---------------- Diagnostics ---------------- */
  const diagSec = el('div', 'section diag');
  diagSec.append(el('h2', null, 'Diagnostics'));
  const fields = {};
  for (const [key, label] of [
    ['fps', 'FPS'], ['tris', 'Triangles'], ['calls', 'Draw calls'], ['hoist', 'Hoist position'], ['rpm', 'Drill string RPM'],
    ['mode', 'Mode'], ['string', 'String held by'], ['setback', 'Stands in setback'], ['rack', 'Joints left (catwalk row)'], ['conn', 'Connections / racked / singles'], ['traffic', 'Site traffic'],
  ]) {
    const row = el('div', 'row');
    const v = el('span', null, '–');
    row.append(el('span', null, label), v);
    fields[key] = v;
    diagSec.append(row);
  }
  const btnValidate = button('Run validation', () => {
    const results = runValidation(rig);
    const passed = results.filter((r) => r.pass).length;
    validationLine.textContent = `${passed}/${results.length} checks passed — details in the browser console (F12).`;
    validationLine.className = `status-line ${passed === results.length ? 'ok' : 'warn'}`;
  });
  const vrow = el('div', 'btn-row');
  vrow.append(btnValidate);
  diagSec.append(vrow);
  const validationLine = el('div', 'status-line', 'Validation runs automatically at start-up; see console.');
  diagSec.append(validationLine);
  body.append(diagSec);

  const hint = el('div');
  hint.id = 'hint';
  hint.textContent = 'Drag: orbit · Right-drag: pan · Wheel: zoom · Keys 1–9: camera presets';
  document.body.append(hint);

  /* ---------------- sync + per-frame diagnostics ---------------- */
  function sync() {
    const manual = !animator.busy && animator.mode === 'idle';
    btnRot.textContent = s.manualRotation ? 'Stop rotation' : 'Start rotation';
    btnRot.classList.toggle('active', s.manualRotation);
    btnRot.disabled = !manual;
    btnPipe.disabled = animator.busy && animator.mode === 'pipe';
    btnPause.textContent = animator.paused ? 'Resume' : 'Pause';
    btnPause.classList.toggle('active', animator.paused);
    hoist.input.disabled = !manual;
    if (document.activeElement !== mode.select) mode.select.value = animator.pending || animator.mode;
  }
  sync();

  let frames = 0;
  let acc = 0;
  let lastDiag = 0;
  function update(dt, now) {
    frames++;
    acc += dt;
    const manual = !animator.busy && animator.mode === 'idle';
    if (!manual || document.activeElement !== hoist.input) {
      hoist.input.value = manual ? animator.hoistTarget : s.q;
      hoist.val.textContent = hoist.format(manual ? animator.hoistTarget : s.q);
    }
    opLine.textContent = `▶ ${animator.operation}`;
    if (now - lastDiag > 250) {
      lastDiag = now;
      const fps = acc > 0 ? frames / acc : 0;
      frames = 0;
      acc = 0;
      const info = renderer.info.render;
      fields.fps.textContent = fps.toFixed(0);
      fields.tris.textContent = info.triangles.toLocaleString();
      fields.calls.textContent = info.calls.toString();
      fields.hoist.textContent = `${s.q.toFixed(2)} m`;
      fields.rpm.textContent = s.connected ? `${Math.round(s.rpm)}` : '0 (broken out)';
      fields.mode.textContent = MODES.find((m) => m.id === animator.mode)?.name ?? animator.mode;
      fields.string.textContent = s.connected ? (s.slips > 0.5 ? 'top drive + slips' : 'top drive') : s.stringInElevator ? 'elevator' : 'slips';
      fields.setback.textContent = `${s.setback.filter(Boolean).length} / ${s.setback.length}`;
      fields.rack.textContent = `${RACK_PICK_LIST.length - s.rackPicked}`;
      fields.conn.textContent = `${s.connections} / ${s.standsRacked} / ${s.singlesAdded}`;
      fields.traffic.textContent = rig.traffic.state.status;
      sync();
    }
  }

  return { update, sync, validationLine, setCameraPreset: (id) => { cam.select.value = id; } };
}
