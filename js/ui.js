// DOM interface: compact HUD, collapsible panel dock, camera picker, scenic mode, toasts, dialogs.
import { CARGO, MATERIALS, STAGES, TRUCK_PRICE, TRUCK_CAPACITY } from './data.js';
import { TRAIN_VIEWS, VEHICLE_VIEWS } from './cameras.js';
import * as L from './logic.js';
import { fmtDist, fmtTime } from './util.js';

const $ = (id) => document.getElementById(id);
const UI_KEY = 'bmt-ui';

export class UI {
  constructor(game) {
    this.game = game;
    this.prefs = { panelsOpen: false, tab: 'missions' };
    try { Object.assign(this.prefs, JSON.parse(localStorage.getItem(UI_KEY) || '{}')); } catch { /* ignore */ }
    this.scenic = false;
    this.camMenuOpen = false;
    this.bind();
    this.setPanels(this.prefs.panelsOpen, false);
    this.selectTab(this.prefs.tab);
  }
  savePrefs() { try { localStorage.setItem(UI_KEY, JSON.stringify(this.prefs)); } catch { /* ignore */ } }

  bind() {
    const g = this.game;
    $('btnCam').addEventListener('click', () => this.toggleCamMenu());
    $('btnPanels').addEventListener('click', () => this.setPanels(!this.prefs.panelsOpen));
    $('btnScenic').addEventListener('click', () => this.setScenic(true));
    $('btnHome').addEventListener('click', () => g.goHome());
    $('guideHide').addEventListener('click', () => { this.guideHidden = true; $('guide').hidden = true; $('guideShow').hidden = false; });
    $('guideShow').addEventListener('click', () => { this.guideHidden = false; $('guide').hidden = false; $('guideShow').hidden = true; });
    $('scenicRestore').addEventListener('click', () => this.setScenic(false));
    document.querySelectorAll('#dock [data-tab]').forEach((b) => b.addEventListener('click', () => this.selectTab(b.dataset.tab)));
    $('dockClose').addEventListener('click', () => this.setPanels(false));
    // train controls
    const thr = $('throttle');
    thr.addEventListener('input', () => { g.input.throttle = thr.value / 100; });
    this.hold($('brakeBtn'), (v) => { g.input.brakeHeld = v; });
    this.hold($('hornBtn'), (v) => g.setHorn(v));
    $('dirBtn').addEventListener('click', () => g.toggleDirection());
    $('lightBtn').addEventListener('click', () => g.toggleLights());
    $('assistBtn').addEventListener('click', () => g.toggleAssist());
    // vehicle controls
    this.hold($('vLeft'), (v) => { g.input.vSteerL = v; });
    this.hold($('vRight'), (v) => { g.input.vSteerR = v; });
    this.hold($('vGas'), (v) => { g.input.vGas = v; });
    this.hold($('vRev'), (v) => { g.input.vRev = v; });
    this.hold($('vHorn'), (v) => g.setHorn(v));
    $('vRecover').addEventListener('click', () => g.recoverVehicle());
    $('actionBtn').addEventListener('click', () => g.doAction());
  }

  hold(el, fn) {
    const on = (e) => { e.preventDefault(); el.classList.add('down'); fn(true); el.setPointerCapture?.(e.pointerId); };
    const off = () => { el.classList.remove('down'); fn(false); };
    el.addEventListener('pointerdown', on);
    el.addEventListener('pointerup', off);
    el.addEventListener('pointercancel', off);
    el.addEventListener('lostpointercapture', off);
    el.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); fn(true); } });
    el.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') fn(false); });
  }

  // ---------- panels ----------
  setPanels(open, save = true) {
    this.prefs.panelsOpen = open;
    $('dock').hidden = !open;
    $('btnPanels').setAttribute('aria-expanded', String(open));
    $('btnPanels').classList.toggle('active', open);
    if (save) this.savePrefs();
    if (open) this.renderPanel();
  }
  selectTab(tab) {
    this.prefs.tab = tab;
    document.querySelectorAll('#dock [data-tab]').forEach((b) => { b.classList.toggle('active', b.dataset.tab === tab); b.setAttribute('aria-selected', String(b.dataset.tab === tab)); });
    this.savePrefs();
    this.renderPanel();
  }
  openTab(tab) { this.setPanels(true); this.selectTab(tab); }

  renderPanel() {
    if (!this.prefs.panelsOpen) return;
    const body = $('panelBody');
    const g = this.game, s = g.state;
    const tab = this.prefs.tab;
    if (tab === 'map') { body.innerHTML = '<canvas id="mapCanvas" width="600" height="440" aria-label="Route map"></canvas><p class="small">Yellow: stations · Blue: river · Green dot: you · Flag: destination</p>'; this.drawMap(); return; }
    if (tab === 'missions') {
      const a = s.missions.active;
      let h = '';
      if (a) {
        const def = L.missionDef(s, a.id);
        h += `<div class="card active"><div class="card-h">Current: ${def.title}</div><p>${def.desc}</p><ol class="stops">`;
        def.stops.forEach((st, i) => { h += `<li class="${i < a.stopIdx ? 'done' : i === a.stopIdx ? 'now' : ''}">Load ${goods(st.load)} at <b>${L.stationName(st.st)}</b></li>`; });
        h += `<li class="${a.stopIdx >= def.stops.length ? 'now' : ''}">Unload at <b>${L.stationName(def.dest)}</b> goods yard</li></ol><div class="reward">Reward: ${def.coins} coins</div></div>`;
      }
      h += '<h3>Mission board</h3>';
      const av = L.availableMissions(s).filter((m) => !a || m.id !== a.id);
      if (!av.length) h += '<p class="small">No other missions right now. Finish the current one first.</p>';
      for (const m of av) h += `<div class="card"><div class="card-h">${m.title}</div><p>${m.desc}</p><div class="row"><span class="reward">${m.coins} coins</span><button class="btn" data-start="${m.id}">${a ? 'Switch' : 'Start'}</button></div></div>`;
      h += `<p class="small">Completed deliveries: ${s.stats.deliveries}</p>`;
      body.innerHTML = h;
      body.querySelectorAll('[data-start]').forEach((b) => b.addEventListener('click', () => g.startMission(b.dataset.start)));
      return;
    }
    if (tab === 'garage') {
      const ai = L.activePlot(s);
      let h = '<h3>Choose</h3><div class="vehicles">';
      h += `<div class="vcard"><div class="vname">🚂 Trains</div><div class="small">Goods, express, local shuttle or heritage steam.</div><button class="btn" data-pick="train">Choose</button></div>`;
      h += `<div class="vcard"><div class="vname">🚙 Vehicles</div><div class="small">Car, jeep, auto-rickshaw, truck or tractor.</div><button class="btn" data-pick="drive">Choose</button></div>`;
      h += `<div class="vcard"><div class="vname">🏗️ Buildings</div><div class="small">House, shop, school or clinic.</div><button class="btn" data-pick="build">Choose</button></div>`;
      h += '</div><h3>Warehouse stock</h3>' + invTable(s.warehouse);
      h += `<h3>Truck load (${L.truckLoad(s)}/${TRUCK_CAPACITY})</h3>` + invTable(s.vehicles.truckCargo);
      h += '<h3>Building plots</h3>';
      s.plots.forEach((p, i) => {
        const status = p.done ? 'Finished' : `Stage ${p.stage + 1}/8: ${STAGES[p.stage].name}`;
        h += `<div class="card"><div class="row"><b>Plot ${i + 1}</b><span>${status}</span></div>`;
        if (p.unlocked && !p.done) h += `<div class="small">On site: ${goodsInline(p.site) || 'nothing yet'}</div>`;
        h += '</div>';
      });
      h += `<p class="small">Town level: ${s.housesBuilt} ${s.housesBuilt === 1 ? 'house' : 'houses'} built${ai >= 0 ? ` · Next: Plot ${ai + 1}` : ''}</p>`;
      body.innerHTML = h;
      body.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => { this.setPanels(false); this.pick(b.dataset.pick); }));
      body.querySelectorAll('[data-buy]').forEach((b) => b.addEventListener('click', () => g.buyTruck()));
      body.querySelectorAll('[data-plot]').forEach((b) => b.addEventListener('click', () => g.buyPlot(Number(b.dataset.plot))));
      return;
    }
    if (tab === 'camera') {
      const views = g.mode === 'train' ? TRAIN_VIEWS : VEHICLE_VIEWS;
      const cur = g.rig.currentView;
      let h = '<h3>Camera view</h3><div class="list">';
      views.forEach((v, i) => { h += `<button class="btn wide ${v.id === cur ? 'active' : ''}" data-view="${v.id}">${i + 1}. ${v.label}</button>`; });
      h += '</div>';
      if (g.mode === 'train') h += `<label class="toggle"><input type="checkbox" id="autoFrame" ${g.rig.autoFrame ? 'checked' : ''}> Auto-frame the whole train in side views</label>`;
      h += '<p class="small">Shortcut: press C, then 1-6. Number keys also switch views directly.</p>';
      body.innerHTML = h;
      body.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => { g.setView(b.dataset.view); this.renderPanel(); }));
      const af = $('autoFrame');
      if (af) af.addEventListener('change', () => { g.rig.autoFrame = af.checked; });
      return;
    }
    if (tab === 'settings') {
      const st = g.settings;
      body.innerHTML = `
        <h3>Graphics</h3>
        <div class="seg" role="radiogroup" aria-label="Graphics quality">${['low', 'medium', 'high'].map((q) => `<button class="btn ${st.quality === q ? 'active' : ''}" data-q="${q}" role="radio" aria-checked="${st.quality === q}">${q[0].toUpperCase() + q.slice(1)}</button>`).join('')}</div>
        <label class="toggle"><input type="checkbox" id="setShadows" ${st.shadows ? 'checked' : ''}> Soft shadows</label>
        <h3>Sound</h3>
        <label class="slider">Music <input type="range" id="setMusic" min="0" max="100" value="${Math.round(st.music * 100)}"></label>
        <label class="slider">Effects <input type="range" id="setSfx" min="0" max="100" value="${Math.round(st.sfx * 100)}"></label>
        <h3>Play</h3>
        <label class="toggle"><input type="checkbox" id="setAssisted" ${st.assisted ? 'checked' : ''}> Helper mode for construction (younger players)</label>
        <label class="toggle"><input type="checkbox" id="setReal" ${g.state.rules.realMaterials ? 'checked' : ''}> Real materials: buildings need goods delivered by train and truck</label>
        <label class="toggle"><input type="checkbox" id="setFast" ${st.timeScale > 1 ? 'checked' : ''}> Faster journeys (2× simulation speed)</label>
        <h3>Controls</h3>
        <div class="small keys">
          <b>Train:</b> W/S or ↑/↓ throttle · Space brake · R forward/reverse (when stopped) · H horn · L lights · P driving assist<br>
          <b>Car/Truck:</b> W/A/S/D or arrows · Space brake · H horn · R recover<br>
          <b>Excavator:</b> A/D swing · W/S boom · Q/E arm · R/F bucket<br>
          <b>Crane:</b> A/D turn · W/S trolley · Q/E hook up/down · Space grab/release<br>
          <b>Everywhere:</b> E or Enter action · C camera · O panels · U scenic mode · Esc close
        </div>
        <h3>Progress</h3>
        <button class="btn danger" id="resetBtn">Reset all progress…</button>
        <p class="small">Progress saves automatically in this browser. No account, ads or purchases.</p>`;
      body.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => { g.applySettings({ quality: b.dataset.q }); this.renderPanel(); }));
      $('setShadows').addEventListener('change', (e) => g.applySettings({ shadows: e.target.checked }));
      $('setMusic').addEventListener('input', (e) => g.applySettings({ music: e.target.value / 100 }));
      $('setSfx').addEventListener('input', (e) => g.applySettings({ sfx: e.target.value / 100 }));
      $('setAssisted').addEventListener('change', (e) => g.applySettings({ assisted: e.target.checked }));
      $('setReal').addEventListener('change', (e) => { g.state.rules.realMaterials = e.target.checked; g.save(); g.construction.refreshAll(); });
      $('setFast').addEventListener('change', (e) => g.applySettings({ timeScale: e.target.checked ? 2 : 1 }));
      $('resetBtn').addEventListener('click', () => this.confirm('Reset all progress?', 'Coins, deliveries, vehicles and houses will be erased. This cannot be undone.', 'Reset', () => g.resetProgress()));
    }
  }

  drawMap() {
    const cv = $('mapCanvas');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const g = this.game, tr = g.track;
    const W = cv.width, H = cv.height;
    const sc = Math.min(W / 5000, H / 3300), ox = W / 2, oz = H / 2;
    const P = (x, z) => [ox + x * sc, oz + z * sc];
    ctx.fillStyle = '#cfe0b0'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#5aa0d8'; ctx.lineWidth = 5; ctx.beginPath();
    g.terrain.river.forEach(([x, z], i) => { const [a, b] = P(x, z); i ? ctx.lineTo(a, b) : ctx.moveTo(a, b); });
    ctx.stroke();
    ctx.strokeStyle = '#8a7a66'; ctx.lineWidth = 2;
    for (const r of g.world.roads) { ctx.beginPath(); r.pts.forEach(([x, z], i) => { const [a, b] = P(x, z); i ? ctx.lineTo(a, b) : ctx.moveTo(a, b); }); ctx.stroke(); }
    ctx.strokeStyle = '#3a3a3a'; ctx.lineWidth = 3; ctx.beginPath();
    for (let k = 0; k <= tr.n; k += 20) { const [a, b] = P(tr.px[k], tr.pz[k]); k ? ctx.lineTo(a, b) : ctx.moveTo(a, b); }
    ctx.closePath(); ctx.stroke();
    const tc = g.terrain.townCenter;
    { const [a, b] = P(tc.x, tc.z); ctx.fillStyle = 'rgba(200,120,60,0.35)'; ctx.beginPath(); ctx.arc(a, b, 300 * sc, 0, 7); ctx.fill(); ctx.fillStyle = '#5a3a20'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('Mitrapur town', a, b); }
    const obj = g.currentObjectiveStation();
    for (const st of g.world.stations) {
      const [a, b] = P(st.x, st.z);
      ctx.fillStyle = '#f7d117'; ctx.strokeStyle = '#111'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.rect(a - 5, b - 5, 10, 10); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#111'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(st.name, a, b - 9);
      if (obj === st.id) { ctx.fillStyle = '#d61f1f'; ctx.beginPath(); ctx.moveTo(a + 8, b - 22); ctx.lineTo(a + 8, b - 6); ctx.lineTo(a + 20, b - 18); ctx.fill(); }
    }
    const tp = g.train.loco.position;
    const [ta, tb] = P(tp.x, tp.z);
    ctx.fillStyle = '#9c2219'; ctx.beginPath(); ctx.arc(ta, tb, 6, 0, 7); ctx.fill();
    if (g.vehicle) { const [va, vb] = P(g.vehicle.x, g.vehicle.z); ctx.fillStyle = '#1aa04a'; ctx.beginPath(); ctx.arc(va, vb, 5, 0, 7); ctx.fill(); }
    else { ctx.strokeStyle = '#1aa04a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(ta, tb, 9, 0, 7); ctx.stroke(); }
    ctx.fillStyle = '#333'; ctx.font = '11px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(`Route length ${(tr.L / 1000).toFixed(1)} km (fictional)`, 8, H - 8);
  }

  // ---------- camera menu ----------
  toggleCamMenu(force) {
    const open = force ?? !this.camMenuOpen;
    this.camMenuOpen = open;
    const menu = $('camMenu');
    $('btnCam').setAttribute('aria-expanded', String(open));
    if (!open) { menu.hidden = true; return; }
    const g = this.game;
    const views = g.mode === 'train' ? TRAIN_VIEWS : g.mode === 'build' ? [] : VEHICLE_VIEWS;
    if (!views.length) { menu.hidden = true; this.camMenuOpen = false; this.toast('Drag to look around the building site. Scroll or pinch to zoom.'); return; }
    menu.innerHTML = views.map((v, i) => `<li role="option" tabindex="-1" data-view="${v.id}" aria-selected="${v.id === g.rig.currentView}">${i + 1}. ${v.label}</li>`).join('');
    menu.hidden = false;
    const items = [...menu.querySelectorAll('li')];
    items.forEach((li) => li.addEventListener('click', () => { g.setView(li.dataset.view); this.toggleCamMenu(false); $('btnCam').focus(); }));
    const cur = Math.max(0, items.findIndex((li) => li.dataset.view === g.rig.currentView));
    items[cur].focus();
    menu.onkeydown = (e) => {
      const idx = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); items[(idx + 1) % items.length].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); items[(idx - 1 + items.length) % items.length].focus(); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); document.activeElement.click(); }
      else if (e.key === 'Escape') { e.preventDefault(); this.toggleCamMenu(false); $('btnCam').focus(); }
      else if (/^[1-6]$/.test(e.key) && items[+e.key - 1]) { e.preventDefault(); items[+e.key - 1].click(); }
      e.stopPropagation();
    };
  }

  setScenic(on) {
    this.scenic = on;
    document.body.classList.toggle('scenic', on);
    $('scenicRestore').hidden = !on;
    if (on) { this.toggleCamMenu(false); $('scenicRestore').focus(); }
  }

  // ---------- mode specific ----------
  setMode(mode) {
    $('trainCtl').hidden = mode !== 'train';
    $('carCtl').hidden = !['car', 'suv', 'auto', 'truck', 'tractor'].includes(mode);
    $('buildPanel').hidden = mode !== 'build';
    document.body.dataset.mode = mode;
    if (this.camMenuOpen) this.toggleCamMenu(false);
    this.renderPanel();
  }

  setAction(label, enabled = true) {
    const b = $('actionBtn');
    if (!label) { b.hidden = true; this.actionLabel = null; return; }
    if (label !== this.actionLabel) { b.textContent = label; this.actionLabel = label; }
    b.hidden = false;
    b.disabled = !enabled;
  }

  update() {
    const g = this.game, s = g.state, tr = g.train;
    $('coinVal').textContent = s.coins;
    if (g.mode === 'train') {
      const kmh = Math.round(tr.kmh);
      $('speedVal').textContent = kmh;
      const arc = $('speedArc');
      arc.setAttribute('stroke-dasharray', `${Math.min(1, kmh / 80) * 150} 200`);
      const thr = $('throttle');
      if (tr.assist) thr.value = Math.round(tr.throttle * 100);
      $('thrVal').textContent = `${Math.round(tr.throttle * 100)}%`;
      $('brakeBtn').classList.toggle('on', tr.brake > 0.05);
      $('dirBtn').textContent = tr.dir > 0 ? 'FWD' : 'REV';
      $('dirBtn').classList.toggle('rev', tr.dir < 0);
      $('dirBtn').disabled = !tr.stopped;
      $('lightBtn').classList.toggle('active', tr.lightsOn);
      $('lightBtn').setAttribute('aria-pressed', String(tr.lightsOn));
      $('assistBtn').classList.toggle('active', tr.assist);
      $('assistBtn').setAttribute('aria-pressed', String(tr.assist));
      thr.disabled = tr.assist;
    } else if (g.vehicle) {
      $('vSpeed').textContent = Math.round(Math.abs(g.vehicle.speed) * 3.6);
      $('vRecover').classList.toggle('pulse', !!g.vehicle.stuck);
    }
    const o = g.objective;
    if (g.guide) this.setGuide(g.guide.who, g.guide.text);
    if (this.guideHidden) $('guide').hidden = true;
    $('objTitle').textContent = o.title;
    $('objSub').textContent = o.sub || '';
    $('objective').classList.toggle('ready', !!o.ready);
    if (this.prefs.panelsOpen && this.prefs.tab === 'map') this.drawMap();
  }

  toast(msg, kind = '') {
    const t = document.createElement('div');
    t.className = `toast ${kind}`;
    t.setAttribute('role', 'status');
    t.textContent = msg;
    $('toasts').appendChild(t);
    while ($('toasts').children.length > 3) $('toasts').firstChild.remove();
    setTimeout(() => t.classList.add('out'), 3800);
    setTimeout(() => t.remove(), 4400);
  }

  confirm(title, text, okLabel, onOk) {
    const m = $('modal');
    m.innerHTML = `<div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlgT"><h2 id="dlgT">${title}</h2><p>${text}</p><div class="row"><button class="btn" id="dlgNo">Cancel</button><button class="btn danger" id="dlgYes">${okLabel}</button></div></div>`;
    m.hidden = false;
    $('dlgNo').focus();
    const close = () => { m.hidden = true; m.innerHTML = ''; };
    $('dlgNo').onclick = close;
    $('dlgYes').onclick = () => { close(); onOk(); };
    m.onkeydown = (e) => { if (e.key === 'Escape') close(); e.stopPropagation(); };
  }

  celebrate(title, lines) {
    const m = $('modal');
    m.innerHTML = `<div class="dialog celebrate" role="dialog" aria-modal="true" aria-labelledby="celT"><div class="burst">★</div><h2 id="celT">${title}</h2>${lines.map((l) => `<p>${l}</p>`).join('')}<div class="row"><button class="btn primary" id="celOk">Great!</button></div></div>`;
    m.hidden = false;
    $('celOk').focus();
    $('celOk').onclick = () => { m.hidden = true; m.innerHTML = ''; };
    m.onkeydown = (e) => { if (e.key === 'Escape' || e.key === 'Enter') { m.hidden = true; m.innerHTML = ''; } e.stopPropagation(); };
  }

  truckLoadDialog(suggest, onLoad) {
    const g = this.game, s = g.state;
    const req = { ...suggest };
    const m = $('modal');
    const render = () => {
      const total = MATERIALS.reduce((a, k) => a + (req[k] || 0), 0) + L.truckLoad(s);
      m.innerHTML = `<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="tlT"><h2 id="tlT">Load the truck</h2>
        <p class="small">Choose materials from the warehouse. Capacity ${total}/${TRUCK_CAPACITY}.</p>
        <table class="inv">${MATERIALS.filter((k) => k !== 'produce').map((k) => `<tr><td><span class="sw" style="background:${CARGO[k].color}"></span>${CARGO[k].name}</td><td class="small">in stock ${s.warehouse[k]}</td>
          <td><button class="btn sm" data-d="${k}" aria-label="less ${CARGO[k].name}">−</button> <b>${req[k] || 0}</b> <button class="btn sm" data-u="${k}" aria-label="more ${CARGO[k].name}">+</button></td></tr>`).join('')}</table>
        <div class="row"><button class="btn" id="tlNo">Cancel</button><button class="btn primary" id="tlYes" ${total === L.truckLoad(s) ? 'disabled' : ''}>Load truck</button></div></div>`;
      m.querySelectorAll('[data-u]').forEach((b) => b.onclick = () => { const k = b.dataset.u; if ((req[k] || 0) < s.warehouse[k] && total < TRUCK_CAPACITY) req[k] = (req[k] || 0) + 1; render(); });
      m.querySelectorAll('[data-d]').forEach((b) => b.onclick = () => { const k = b.dataset.d; req[k] = Math.max(0, (req[k] || 0) - 1); render(); });
      $('tlNo').onclick = () => { m.hidden = true; };
      $('tlYes').onclick = () => { m.hidden = true; onLoad(req); };
    };
    // clamp suggestion to stock and capacity
    let space = TRUCK_CAPACITY - L.truckLoad(s);
    for (const k of MATERIALS) { req[k] = Math.max(0, Math.min(req[k] || 0, s.warehouse[k], space)); space -= req[k]; }
    m.hidden = false;
    render();
    m.onkeydown = (e) => { if (e.key === 'Escape') m.hidden = true; e.stopPropagation(); };
    $('tlYes')?.focus();
  }

  // ---------- construction panel ----------
  // A small stage card (collapsible) plus a separate compact gamepad for the excavator / crane,
  // so the building site stays visible on tablets and phones.
  buildPanel(info) {
    const el = $('buildPanel');
    if (!info) { el.innerHTML = ''; this.buildPad(null); return; }
    const g = this.game;
    if (this.prefs.bpMini === undefined) this.prefs.bpMini = innerWidth < 1000 || innerHeight < 700;
    const mini = this.prefs.bpMini;
    el.classList.toggle('mini', mini);
    let h = `<div class="bp-head"><span class="bp-stage">${info.building || 'Plot'} · Stage ${Math.min(info.stage + 1, info.total)}/${info.total}</span>
      <button class="btn sm" id="bpMini" aria-expanded="${!mini}" aria-label="${mini ? 'Show more' : 'Show less'}">${mini ? '▴' : '▾'}</button><button class="btn sm" id="bpExit">Exit</button></div>`;
    h += `<div class="bp-name">${info.name}</div>`;
    h += `<div class="bp-steps">${STAGES.map((st, i) => `<span class="${i < info.stage ? 'done' : i === info.stage ? 'now' : ''}" title="${st.name}"></span>`).join('')}</div>`;
    if (info.needs.length) h += `<div class="bp-needs">${info.needs.map((n) => `<span class="need ${n.have >= n.need ? 'ok' : 'miss'}"><span class="sw" style="background:${n.color}"></span>${n.name} ${Math.min(n.have, n.need)}/${n.need}</span>`).join('')}</div>`;
    h += `<p class="bp-hint">${info.hint}</p>`;
    if (info.palette) h += `<div class="palette">${info.palette.map((c) => `<button class="swatch ${c.hex === info.paintColor ? 'active' : ''}" style="background:${c.hex}" data-b="color:${c.hex}" aria-label="${c.name}" title="${c.name}"></button>`).join('')}</div>`;
    if (info.parts) h += `<div class="row">${info.parts.map((p) => `<button class="btn ${info.selected === p.id ? 'active' : ''}" data-b="part:${p.id}">${p.label}</button>`).join('')}</div>`;
    if (info.buttons.length) h += `<div class="row bp-acts">${info.buttons.map((b) => `<button class="btn ${b.hold ? 'primary' : ''}" data-b="${b.id}" ${b.hold ? 'data-hold="1"' : ''}>${b.label}</button>`).join('')}</div>`;
    el.innerHTML = h;
    $('bpExit').onclick = () => g.exitBuild();
    $('bpMini').onclick = () => { this.prefs.bpMini = !mini; this.savePrefs(); this.buildPanel(info); };
    el.querySelectorAll('[data-b]').forEach((b) => {
      if (b.dataset.hold) this.hold(b, (v) => g.construction.onButton(b.dataset.b, v));
      else b.onclick = () => g.construction.onButton(b.dataset.b, true);
    });
    this.buildPad(info.pad);
  }

  // compact gamepad in the bottom-right corner; rebuilt only when the machine changes so held buttons keep working
  buildPad(kind) {
    let pad = $('buildPad');
    if (!pad) { pad = document.createElement('div'); pad.id = 'buildPad'; $('hud').appendChild(pad); }
    if (!kind) { pad.hidden = true; pad.innerHTML = ''; this._padKind = null; return; }
    pad.hidden = false;
    if (this._padKind === kind) return;
    this._padKind = kind;
    const g = this.game;
    const B = (id, icon, label, key) => `<button class="padbtn" data-pad="${id}" aria-label="${label} (key ${key})"><b>${icon}</b><small>${label}</small></button>`;
    pad.innerHTML = kind === 'excavator'
      ? `<div class="pad-title">Excavator</div><div class="padgrid">
          ${B('swingL', '⟲', 'Swing', 'A')}${B('boomUp', '▲', 'Boom up', 'W')}${B('stickOut', '↗', 'Arm out', 'Q')}${B('curl', '⤵', 'Dig', 'R')}
          ${B('swingR', '⟳', 'Swing', 'D')}${B('boomDown', '▼', 'Boom down', 'S')}${B('stickIn', '↙', 'Arm in', 'E')}${B('dump', '⤴', 'Dump', 'F')}</div>`
      : `<div class="pad-title">Crane</div><div class="padgrid">
          ${B('slewL', '⟲', 'Turn', 'A')}${B('out', '→', 'Out', 'W')}${B('up', '▲', 'Hook up', 'Q')}
          ${B('slewR', '⟳', 'Turn', 'D')}${B('in', '←', 'In', 'S')}${B('down', '▼', 'Hook down', 'E')}</div>
          <button class="btn primary grabbtn" data-grab="1">✋ Grab / Release</button>`;
    pad.querySelectorAll('[data-pad]').forEach((b) => this.hold(b, (v) => g.construction.setPad(b.dataset.pad, v)));
    const grab = pad.querySelector('[data-grab]');
    if (grab) grab.onclick = () => g.construction.onButton('grab', true);
  }
}

function padHtml(list) {
  return `<div class="pad">${list.map(([id, label, key]) => `<button class="btn padbtn" data-pad="${id}" aria-label="${label} (key ${key})">${label}<kbd>${key}</kbd></button>`).join('')}</div>`;
}
function goods(load) { return Object.keys(load).map((k) => `${load[k]} ${CARGO[k].name.toLowerCase()}`).join(' + '); }
function goodsInline(inv) { return MATERIALS.filter((k) => inv[k] > 0).map((k) => `${inv[k]} ${CARGO[k].name.toLowerCase()}`).join(', '); }
function invTable(inv) {
  return `<table class="inv">${MATERIALS.map((k) => `<tr><td><span class="sw" style="background:${CARGO[k].color}"></span>${CARGO[k].name}</td><td><b>${inv[k] || 0}</b></td></tr>`).join('')}</table>`;
}
function vcard(id, name, desc, unlocked, current, buy = false) {
  return `<div class="vcard ${unlocked ? '' : 'locked'} ${current ? 'current' : ''}"><div class="vname">${name}</div><div class="small">${desc}</div>
    ${current ? '<span class="tag">Driving</span>' : unlocked ? `<button class="btn" data-drive="${id}">Drive</button>` : buy ? '<button class="btn primary" data-buy="1">Buy truck</button>' : '<span class="tag">Locked</span>'}</div>`;
}
export { goods };

// ---------------- home hub, name entry and pickers ----------------
const ICONS = {
  goods: '🚂', express: '🚄', local: '🚆', steam: '🚂',
  car: '🚗', suv: '🚙', auto: '🛺', truck: '🚚', tractor: '🚜',
  house: '🏠', shop: '🏪', school: '🏫', clinic: '🏥',
};
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function installHub(UIClass) {
  const P = UIClass.prototype;

  P.overlay = function (html) {
    const o = document.getElementById('overlay');
    o.innerHTML = html;
    o.hidden = false;
    document.getElementById('hud').hidden = true;
    return o;
  };
  P.closeOverlay = function () {
    const o = document.getElementById('overlay');
    o.hidden = true; o.innerHTML = '';
    document.getElementById('hud').hidden = false;
  };
  P.overlayOpen = function () { return !document.getElementById('overlay').hidden; };

  P.askName = function (onDone) {
    const g = this.game;
    const o = this.overlay(`<div class="sheet" role="dialog" aria-labelledby="nmT" style="max-width:520px;text-align:center">
      <div style="font-size:56px">👷</div>
      <h1 id="nmT">Namaste! What's your name?</h1>
      <p class="lead">I'm the Station Master. I'll guide you around Mitrapur.</p>
      <input id="nameIn" class="name-input" maxlength="16" autocomplete="off" placeholder="Type your name" value="${esc(g.state.player.name || '')}">
      <h2 style="margin-top:18px">How old are you?</h2>
      <div class="chips" style="justify-content:center" role="radiogroup" aria-label="Age">
        <button class="chip-btn big-chip" data-age="3-5">3–5</button><button class="chip-btn big-chip" data-age="6-7">6–7</button><button class="chip-btn big-chip" data-age="8-10">8–10</button></div>
      <div class="foot" style="justify-content:center"><button class="btn primary big" id="nameOk">Let's go!</button></div>
    </div>`);
    const inp = o.querySelector('#nameIn');
    inp.focus();
    const L = g.state.learn;
    let age = L.age || '6-7';
    const mark = () => o.querySelectorAll('[data-age]').forEach((b) => b.classList.toggle('sel', b.dataset.age === age));
    mark();
    o.querySelectorAll('[data-age]').forEach((b) => b.onclick = () => { age = b.dataset.age; mark(); g.audio.play('click'); });
    const ok = () => {
      const n = inp.value.trim().replace(/\s+/g, ' ').slice(0, 16);
      if (!n) { inp.focus(); inp.placeholder = 'Please type a name'; return; }
      g.state.player.name = n;
      if (L.age !== age) { L.age = age; L.levels = {}; }
      g.save();
      setTimeout(onDone, 0); // let the Enter key finish before the next screen takes focus
    };
    o.querySelector('#nameOk').onclick = ok;
    inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); ok(); } };
  };

  P.showHome = function () {
    const g = this.game, s = g.state;
    const name = esc(s.player.name || 'Driver');
    const done = s.plots.filter((p) => p.done).length;
    const o = this.overlay(`<div class="sheet" role="dialog" aria-labelledby="hmT">
      <h1 id="hmT">Hello, ${name}! 👋</h1>
      <p class="lead">What would you like to do? Everything is open — pick anything, any time.</p>
      <div class="cards home-cards">
        <button class="card-big" data-go="train"><span class="ico">🚂</span><span class="nm">Drive a Train</span><span class="ds">Goods, express, local or steam</span></button>
        <button class="card-big" data-go="drive"><span class="ico">🚙</span><span class="nm">Drive a Vehicle</span><span class="ds">Car, jeep, auto-rickshaw, truck or tractor</span></button>
        <button class="card-big" data-go="build"><span class="ico">🏗️</span><span class="nm">Build Something</span><span class="ds">House, shop, school or clinic</span></button>
        <button class="card-big" data-go="learn"><span class="ico">🧩</span><span class="nm">Learning Games</span><span class="ds">Colours, shapes, letters, numbers and memory</span></button>
      </div>
      <div class="stats-row"><span>🪙 ${s.coins} coins</span><span>📦 ${s.stats.deliveries} deliveries</span><span>🧍 ${s.passenger.served} passengers</span><span>🏘️ ${done} buildings</span></div>
      <div class="foot">${g.mode && g.started ? '<button class="btn" id="hmBack">Back to the game</button>' : '<span></span>'}<span class="row" style="margin:0"><button class="btn" id="hmParent">👪 Grown-ups</button><button class="btn" id="hmName">Change name</button></span></div>
    </div>`);
    o.querySelectorAll('[data-go]').forEach((b) => b.onclick = () => {
      g.audio.play('click');
      if (b.dataset.go === 'learn') { this.closeOverlay(); g.learn.openPicker(() => this.showHome()); } else this.pick(b.dataset.go);
    });
    o.querySelector('#hmParent').onclick = () => { this.closeOverlay(); g.learn.openParentGate(() => this.showHome()); };
    const back = o.querySelector('#hmBack');
    if (back) back.onclick = () => this.closeOverlay();
    o.querySelector('#hmName').onclick = () => this.askName(() => this.showHome());
    o.querySelector('[data-go]').focus();
  };

  P.pick = function (kind, opts = {}) {
    const g = this.game, s = g.state;
    const D = g.data;
    let sel;
    const render = () => {
      let h = '', title = '', go = "Let's go!";
      if (kind === 'train') {
        title = 'Choose your train';
        const t = D.TRAIN_TYPES.find((x) => x.id === sel.type);
        h += `<div class="cards">${D.TRAIN_TYPES.map((x) => `<button class="card-big ${x.id === sel.type ? 'sel' : ''}" data-type="${x.id}"><span class="ico">${ICONS[x.id]}</span><span class="nm">${x.name}</span><span class="ds">${x.desc}</span><span class="ds">Top speed ${Math.round(x.vmax * 3.6)} km/h${x.fare ? ` · ${x.fare} coins per passenger` : ''}</span></button>`).join('')}</div>`;
        h += `<h2>Paint scheme</h2><div class="swatch-row">${t.liveries.map((l, i) => `<button data-liv="${i}" class="${i === sel.livery ? 'sel' : ''}" style="background:${l.body}" aria-label="${l.name}" title="${l.name}"><i style="background:${l.band};inset:15px"></i></button>`).join('')}</div>`;
        if (t.cars.length > 1) h += `<h2>${t.id === 'local' ? 'Number of cars' : 'Number of coaches'}</h2><div class="chips">${t.cars.map((n) => `<button class="chip-btn ${n === sel.cars ? 'sel' : ''}" data-cars="${n}">${n}</button>`).join('')}</div>`;
        go = t.service === 'passenger' ? 'Start passenger service' : 'Start goods run';
      } else if (kind === 'drive') {
        title = 'Choose your vehicle';
        h += `<div class="cards">${D.VEHICLE_TYPES.map((x) => `<button class="card-big ${x.id === sel.type ? 'sel' : ''}" data-type="${x.id}"><span class="ico">${ICONS[x.id]}</span><span class="nm">${x.name}</span><span class="ds">${x.desc}</span></button>`).join('')}</div>`;
        h += `<h2>Colour</h2><div class="swatch-row">${D.VEHICLE_COLORS.map((c, i) => `<button data-col="${i}" class="${i === sel.color ? 'sel' : ''}" style="background:${c.hex}" aria-label="${c.name}" title="${c.name}"></button>`).join('')}</div>`;
        go = 'Start driving';
      } else {
        title = 'What shall we build?';
        const plot = s.plots[sel.plot];
        const locked = plot.stage > 0 || plot.done;
        h += `<h2>Plot</h2><div class="chips">${s.plots.map((p, i) => {
          const tn = p.design ? D.BUILDING_TYPES.find((b) => b.id === p.design.type)?.name : '';
          const st = p.done ? `✔ ${tn}` : p.stage > 0 ? `${tn}: stage ${p.stage + 1}/8` : 'empty';
          return `<button class="chip-btn ${i === sel.plot ? 'sel' : ''}" data-plot="${i}">Plot ${i + 1} · ${st}</button>`;
        }).join('')}</div>`;
        if (plot.done) h += '<p class="lead" style="margin-top:10px">This plot is finished. Pick another plot.</p>';
        else if (locked) h += '<p class="lead" style="margin-top:10px">Building has started here, so the design is set. Press Continue to keep building.</p>';
        h += `<h2>Building</h2><div class="cards">${D.BUILDING_TYPES.map((x) => `<button class="card-big ${x.id === sel.type ? 'sel' : ''}" data-type="${x.id}" ${locked ? 'disabled' : ''}><span class="ico">${ICONS[x.id]}</span><span class="nm">${x.name}</span><span class="ds">${x.desc}</span></button>`).join('')}</div>`;
        h += `<h2>Roof</h2><div class="chips">${D.ROOF_STYLES.map((r) => `<button class="chip-btn ${r.id === sel.roof ? 'sel' : ''}" data-roof="${r.id}" ${locked ? 'disabled' : ''}>${r.name}</button>`).join('')}</div>`;
        h += `<h2>Wall colour</h2><div class="swatch-row">${D.PAINT_COLORS.map((c) => `<button data-wall="${c.hex}" class="${c.hex === sel.color ? 'sel' : ''}" style="background:${c.hex}" aria-label="${c.name}" title="${c.name}" ${locked ? 'disabled' : ''}></button>`).join('')}</div>`;
        h += `<label class="toggle" style="margin-top:14px"><input type="checkbox" id="realMat" ${s.rules.realMaterials ? 'checked' : ''}> Use real materials (deliver them by goods train and truck first)</label>`;
        go = plot.done ? 'Plot finished' : locked ? 'Continue building' : 'Start building';
      }
      const o = this.overlay(`<div class="sheet" role="dialog" aria-label="${title}"><h1>${title}</h1>${h}
        <div class="foot"><button class="btn" id="pkBack">← Back</button><button class="btn primary big" id="pkGo" ${kind === 'build' && s.plots[sel.plot].done ? 'disabled' : ''}>${go}</button></div></div>`);
      o.querySelectorAll('[data-type]').forEach((b) => b.onclick = () => {
        sel.type = b.dataset.type;
        if (kind === 'train') { const t = D.TRAIN_TYPES.find((x) => x.id === sel.type); sel.livery = 0; sel.cars = t.cars[Math.floor(t.cars.length / 2)]; }
        if (kind === 'build') sel.roof = D.BUILDING_TYPES.find((x) => x.id === sel.type).roof;
        g.audio.play('click'); render();
      });
      o.querySelectorAll('[data-liv]').forEach((b) => b.onclick = () => { sel.livery = +b.dataset.liv; g.audio.play('click'); render(); });
      o.querySelectorAll('[data-cars]').forEach((b) => b.onclick = () => { sel.cars = +b.dataset.cars; g.audio.play('click'); render(); });
      o.querySelectorAll('[data-col]').forEach((b) => b.onclick = () => { sel.color = +b.dataset.col; g.audio.play('click'); render(); });
      o.querySelectorAll('[data-roof]').forEach((b) => b.onclick = () => { sel.roof = b.dataset.roof; g.audio.play('click'); render(); });
      o.querySelectorAll('[data-wall]').forEach((b) => b.onclick = () => { sel.color = b.dataset.wall; g.audio.play('click'); render(); });
      o.querySelectorAll('[data-plot]').forEach((b) => b.onclick = () => {
        sel.plot = +b.dataset.plot;
        const d = s.plots[sel.plot].design;
        if (d) Object.assign(sel, d);
        g.audio.play('click'); render();
      });
      const rm = o.querySelector('#realMat');
      if (rm) rm.onchange = () => { s.rules.realMaterials = rm.checked; g.save(); };
      o.querySelector('#pkBack').onclick = () => this.showHome();
      o.querySelector('#pkGo').onclick = () => {
        this.closeOverlay();
        if (kind === 'train') g.chooseTrain({ ...sel });
        else if (kind === 'drive') g.chooseVehicle({ ...sel });
        else g.chooseBuild(sel.plot, { type: sel.type, roof: sel.roof, color: sel.color });
      };
      o.querySelector('#pkGo').focus();
    };
    if (kind === 'train') sel = { ...s.choice.train };
    else if (kind === 'drive') sel = { ...s.choice.vehicle };
    else {
      const first = opts.plot ?? Math.max(0, s.plots.findIndex((p) => !p.done));
      const d = s.plots[first].design || { type: 'house', roof: 'tiles', color: D.PAINT_COLORS[0].hex };
      sel = { plot: first, ...d };
    }
    render();
  };

  P.setGuide = function (who, text) {
    if (text === this._guideText && who === this._guideWho) return;
    this._guideText = text; this._guideWho = who;
    const el = document.getElementById('guide');
    document.getElementById('guideWho').textContent = who;
    document.getElementById('guideText').textContent = text;
    if (!text) { el.hidden = true; document.getElementById('guideShow').hidden = true; return; }
    // a new message always pops the bubble back open
    this.guideHidden = false;
    el.hidden = false;
    document.getElementById('guideShow').hidden = true;
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  };
}

installHub(UI);
