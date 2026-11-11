import { LAYOUT } from './layout.js';
import { CAMERA_PRESETS } from './scene.js';
import { MODES } from './animations.js';
import { setWireframe } from './materials.js';
import { runValidation } from './validation.js';
import { RACK_PICK_LIST } from './sim/rigState.js';
import { formatTime } from './site/dayNight.js';

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
  const btnPipe = button('Build stands', () => { animator.startTransfer(); sync(); });
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
  const dn = rig.dayNight;
  const tod = slider('Time of day', 0, 24, 0.25, dn.state.time, (v) => { dn.setTime(v); return v; }, formatTime);
  viewSec.append(tod.row);
  viewSec.append(checkbox('Day / night cycle (24 h in 10 min)', dn.state.auto, (on) => { dn.state.auto = on; }));
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

  /* ---------------- Live telemetry ---------------- */
  const live = rig.live;
  const liveSec = el('div', 'section');
  liveSec.append(el('h2', null, 'Live Telemetry'));
  const urlInput = el('input', 'text');
  urlInput.type = 'text';
  urlInput.spellcheck = false;
  let savedUrl = null;
  try { savedUrl = localStorage.getItem('rigTelemetryUrl'); } catch { /* storage unavailable */ }
  urlInput.value = savedUrl || 'ws://localhost:8787';
  const urlRow = el('div', 'row');
  urlRow.append(urlInput);
  const btnConn = button('Connect', () => {
    if (live.client.state === 'disconnected') {
      const url = urlInput.value.trim();
      try { localStorage.setItem('rigTelemetryUrl', url); } catch { /* storage unavailable */ }
      live.client.connect(url);
      animator.setMode('live');
    } else {
      live.client.disconnect();
    }
    sync();
  });
  urlRow.append(btnConn);
  liveSec.append(urlRow);
  const liveLine = el('div', 'status-line', 'Not connected. Run "npm run telemetry" for a simulated rig feed, then Connect.');
  liveSec.append(liveLine);
  const tele = el('div', 'tele');
  const teleRows = {};
  for (const [key, label] of [['blockHeight', 'Block height'], ['rpm', 'String RPM'], ['slips', 'Slips'], ['hookload', 'Hookload'], ['wob', 'Weight on bit'], ['torque', 'Torque'], ['spp', 'Standpipe pressure'], ['flow', 'Flow in'], ['bitDepth', 'Bit depth'], ['holeDepth', 'Hole depth']]) {
    const row = el('div', 'row');
    const v = el('span', 'q-missing', '–');
    row.append(el('span', null, label), v);
    teleRows[key] = v;
    tele.append(row);
  }
  liveSec.append(tele);
  const flagBox = el('div', 'tele-flags');
  liveSec.append(flagBox);
  body.append(liveSec);

  function updateLive(now) {
    const c = live.client;
    btnConn.textContent = c.state === 'disconnected' ? 'Connect' : 'Disconnect';
    btnConn.classList.toggle('active', c.state !== 'disconnected');
    const inLive = animator.mode === 'live';
    const snap = inLive && live.driver.snap ? live.driver.snap : live.validator.snapshot(now);
    let text;
    let cls = '';
    if (c.state === 'disconnected') {
      text = c.lastError ? `Not connected. ${c.lastError}.` : 'Not connected. Run "npm run telemetry" for a simulated rig feed, then Connect.';
    } else if (c.state === 'connecting') {
      text = `Connecting to ${c.url}…`;
    } else if (c.state === 'retrying') {
      text = 'Connection closed — retrying…';
      cls = 'warn';
    } else if (snap.link === 'none') {
      text = 'Connected — waiting for the first valid message.';
    } else if (snap.link === 'live') {
      text = `LIVE  ${c.rate.toFixed(1)} msg/s · ${snap.stats.rejectedValues} values rejected · ${snap.stats.clampedValues} clamped · ${snap.stats.dropped + snap.stats.malformed} frames dropped`;
      cls = 'ok';
    } else {
      text = snap.link === 'stale' ? `STALE  no valid data for ${(snap.ageMs / 1000).toFixed(0)} s — holding` : `LOST  no data for ${(snap.ageMs / 1000).toFixed(0)} s — position held`;
      cls = 'warn';
    }
    if (c.state === 'open' && !inLive) text += ' Mode is not Live: the model is not following the feed.';
    liveLine.textContent = text;
    liveLine.className = `status-line ${cls}`;
    for (const [key, span] of Object.entries(teleRows)) {
      if (key === 'slips') {
        span.textContent = snap.link === 'none' ? '–' : `${snap.slips ? 'SET' : 'out'}${snap.slipsSource === 'reported' ? '' : ` (${snap.slipsSource})`}`;
        span.className = snap.link === 'none' ? 'q-missing' : snap.slipsSource === 'reported' ? 'q-good' : snap.slipsSource === 'inferred' ? 'q-clamped' : 'q-held';
        continue;
      }
      const ch = snap.channels[key];
      span.textContent = ch.value === null ? '–' : `${ch.value.toFixed(ch.digits)} ${ch.unit}`;
      span.className = `q-${ch.quality}`;
      span.title = ch.note || ch.quality;
    }
    const flags = [...snap.flags, ...live.driver.activeFlags(now)].slice(0, 6);
    flagBox.innerHTML = '';
    for (const f of flags) flagBox.append(el('div', `flag ${f.severity}`, f.text));
  }

  /* ---------------- Diagnostics ---------------- */
  const diagSec = el('div', 'section diag');
  diagSec.append(el('h2', null, 'Diagnostics'));
  const fields = {};
  for (const [key, label] of [
    ['fps', 'FPS'], ['tris', 'Triangles'], ['calls', 'Draw calls'], ['hoist', 'Hoist position'], ['rpm', 'Drill string RPM'],
    ['mode', 'Mode'], ['string', 'String held by'], ['setback', 'Stands in setback'], ['rack', 'Joints left (catwalk row)'], ['conn', 'Connections / racked / built'], ['traffic', 'Site traffic'],
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
      fields.conn.textContent = `${s.connections} / ${s.standsRacked} / ${s.standsBuilt}`;
      fields.traffic.textContent = rig.traffic.state.status;
      updateLive(now);
      if (document.activeElement !== tod.input) {
        tod.input.value = dn.state.time;
        tod.val.textContent = formatTime(dn.state.time);
      }
      sync();
    }
  }

  return { update, sync, validationLine, setCameraPreset: (id) => { cam.select.value = id; } };
}
