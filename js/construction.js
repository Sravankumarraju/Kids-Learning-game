// House construction: 8 visible stages on each plot, interactive excavator, mixer, crane, snapping parts, painting, garden.
import * as THREE from 'three';
import { canvasTexture, rng, clamp, mergeGeos, part, mat } from './util.js';
import { M, box, cyl, makeExcavator, makeCrane, makeMixer } from './models.js';
import { STAGES, PAINT_COLORS, CARGO, BUILDING_TYPES } from './data.js';
import * as L from './logic.js';

const SLAB_Y = 0.2, WALL_H = 3.2;
// layout of the building currently being handled (set by useLayout for each plot's design)
let RIDGE = 1.8, PIT, EXC_POS, SPOIL, WALLS, FITTINGS, ROOFS, GARDEN, DESIGN, TYPE;
const CRANE_POS = new THREE.Vector3(14, 0, 2);
const STACK = new THREE.Vector3(3, 0, 15.5);

// ---------- textures ----------
const TEX = {};
function textures() {
  if (TEX.brick) return TEX;
  TEX.brick = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#cfc5b4'; ctx.fillRect(0, 0, w, h);
    const r = rng(5);
    const rows = 13, bw = w / 4, bh = h / rows;
    for (let y = 0; y < rows; y++) for (let x = -1; x < 5; x++) {
      const ox = (y % 2) * bw / 2;
      const c = 150 + r() * 40;
      ctx.fillStyle = `rgb(${c},${c * 0.42},${c * 0.3})`;
      ctx.fillRect(x * bw + ox + 2, y * bh + 2, bw - 4, bh - 4);
    }
  }, { repeat: [1, 1] });
  TEX.plaster = canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
    const r = rng(8);
    for (let i = 0; i < 700; i++) { const g = 225 + r() * 30; ctx.fillStyle = `rgb(${g},${g},${g})`; ctx.fillRect(r() * w, r() * h, 2, 2); }
  }, { repeat: [1, 1] });
  TEX.tiles = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#7a2e1a'; ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const g = ctx.createLinearGradient(0, y * 32, 0, y * 32 + 32);
      g.addColorStop(0, '#d0703c'); g.addColorStop(1, '#8e3a20');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(x * 32 + 16 + (y % 2) * 16, y * 32 + 18, 15, 16, 0, 0, Math.PI * 2); ctx.fill();
    }
  }, { repeat: [11, 5] });
  TEX.tin = canvasTexture(128, 128, (ctx, w, h) => {
    for (let x = 0; x < w; x += 8) { ctx.fillStyle = x % 16 ? '#d8d8d8' : '#ffffff'; ctx.fillRect(x, 0, 8, h); }
  }, { repeat: [12, 1] });
  TEX.concrete = canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
    const r = rng(12);
    for (let i = 0; i < 500; i++) { const g = 200 + r() * 55; ctx.fillStyle = `rgb(${g},${g},${g})`; ctx.fillRect(r() * w, r() * h, 2, 2); }
  }, { repeat: [3, 3] });
  return TEX;
}

// ---------- building layout (local to plot, front faces +z), derived from the chosen design ----------
export const DEFAULT_DESIGN = { type: 'house', roof: 'tiles', color: PAINT_COLORS[0].hex };
function useLayout(design) {
  DESIGN = { ...DEFAULT_DESIGN, ...(design || {}) };
  TYPE = BUILDING_TYPES.find((b) => b.id === DESIGN.type) || BUILDING_TYPES[0];
  const W = TYPE.w, D = TYPE.d, hw = W / 2, hd = D / 2;
  const gable = DESIGN.roof !== 'flat';
  RIDGE = gable ? hd * 0.45 : 0;
  // front wall: door (wide shutter for the shop, centred for the clinic) and windows
  const doorW = TYPE.id === 'shop' ? 2.2 : 1.1, doorH = TYPE.id === 'shop' ? 2.4 : 2.1;
  const doorU = TYPE.id === 'clinic' ? 0 : -hw + 2.4;
  const front = [{ type: 'door', u: doorU, v: 0.05, w: doorW, h: doorH }];
  for (let u = -hw + 1.4; u + 0.7 < hw - 0.5; u += 2.6) {
    if (Math.abs(u - doorU) < doorW / 2 + 1.0) continue;
    front.push({ type: 'window', u, v: 1.0, w: 1.4, h: 1.2 });
  }
  const nb = Math.max(2, Math.floor((W - 2) / 3));
  const back = [];
  for (let k = 0; k < nb; k++) back.push({ type: 'window', u: -hw + ((k + 0.5) * W) / nb, v: 1.0, w: 1.4, h: 1.2 });
  const side = [{ type: 'window', u: 0, v: 1.0, w: 1.4, h: 1.2 }];
  const hole = (h) => [h.u - h.w / 2, h.v, h.u + h.w / 2, h.v + h.h];
  WALLS = [
    { id: 'front', pos: [0, SLAB_Y, hd - 0.12], rot: 0, w: W, gable: false, open: front },
    { id: 'back', pos: [0, SLAB_Y, -hd + 0.12], rot: Math.PI, w: W, gable: false, open: back },
    { id: 'left', pos: [-hw + 0.12, SLAB_Y, 0], rot: -Math.PI / 2, w: D - 0.5, gable, open: side },
    { id: 'right', pos: [hw - 0.12, SLAB_Y, 0], rot: Math.PI / 2, w: D - 0.5, gable, open: side },
  ];
  for (const w of WALLS) w.holes = w.open.map(hole);
  FITTINGS = [];
  for (const w of WALLS) w.open.forEach((h, k) => FITTINGS.push({ id: `${w.id}${k}`, type: h.type, wall: w.id, u: h.u, v: h.v, w: h.w - 0.04, h: h.h - 0.04 }));
  if (gable) {
    const run = hd + 0.6, slope = RIDGE / hd;
    const len = Math.hypot(run, slope * run);
    const y = SLAB_Y + WALL_H + RIDGE - (slope * run) / 2 + 0.1;
    ROOFS = [
      { id: 'roofF', pos: [0, y, run / 2], rotX: Math.atan(slope), size: [W + 1.4, 0.16, len] },
      { id: 'roofB', pos: [0, y, -run / 2], rotX: -Math.atan(slope), size: [W + 1.4, 0.16, len] },
    ];
  } else {
    const half = hd + 0.3;
    ROOFS = [
      { id: 'roofF', pos: [0, SLAB_Y + WALL_H + 0.13, half / 2], rotX: 0, size: [W + 0.6, 0.26, half] },
      { id: 'roofB', pos: [0, SLAB_Y + WALL_H + 0.13, -half / 2], rotX: 0, size: [W + 0.6, 0.26, half] },
    ];
  }
  PIT = { hx: hw + 0.4, hz: hd + 0.4, depth: 1.3 };
  EXC_POS = new THREE.Vector3(-(PIT.hx + 3.1), 0, 0);
  SPOIL = new THREE.Vector3(EXC_POS.x, 0, -8.5);
  const gl = doorU - 1, gr = doorU + 1;
  GARDEN = [
    { id: 'fenceB', kind: 'fence', pos: [0, 0, -10.6], rot: 0, len: 23 },
    { id: 'fenceL', kind: 'fence', pos: [-11.5, 0, 0], rot: Math.PI / 2, len: 21 },
    { id: 'fenceR', kind: 'fence', pos: [11.5, 0, 0], rot: Math.PI / 2, len: 21 },
    { id: 'fenceFL', kind: 'fence', pos: [(-11.5 + gl) / 2, 0, 10.6], rot: 0, len: gl + 11.5 },
    { id: 'fenceFR', kind: 'fence', pos: [(gr + 11.5) / 2, 0, 10.6], rot: 0, len: 11.5 - gr },
    { id: 'path', kind: 'path', pos: [doorU, 0, (hd + 10.6) / 2], rot: 0, len: 10.6 - hd },
    { id: 'plant1', kind: 'plant', pos: [-9, 0, 8], rot: 0 },
    { id: 'plant2', kind: 'plant', pos: [9, 0, 8], rot: 0 },
    { id: 'plant3', kind: 'plant', pos: [9, 0, -8.5], rot: 1 },
  ];
}
useLayout(DEFAULT_DESIGN);

function wallGeometry(wd) {
  const hw = wd.w / 2;
  const sh = new THREE.Shape();
  sh.moveTo(-hw, 0); sh.lineTo(hw, 0); sh.lineTo(hw, WALL_H);
  if (wd.gable) sh.lineTo(0, WALL_H + RIDGE);
  sh.lineTo(-hw, WALL_H); sh.closePath();
  for (const [u0, v0, u1, v1] of wd.holes) {
    const h = new THREE.Path();
    h.moveTo(u0, v0); h.lineTo(u1, v0); h.lineTo(u1, v1); h.lineTo(u0, v1); h.closePath();
    sh.holes.push(h);
  }
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.24, bevelEnabled: false });
  g.translate(0, 0, -0.12);
  return g;
}
function fittingGeometry(f) {
  const l = [];
  if (f.type === 'door') {
    box(l, '#6b3f22', f.w, f.h, 0.08, 0, 0, 0);
    box(l, '#8a5530', f.w * 0.8, f.h * 0.4, 0.1, 0, f.h * 0.2, 0);
    box(l, '#8a5530', f.w * 0.8, f.h * 0.35, 0.1, 0, -f.h * 0.25, 0);
    box(l, '#d4b04a', 0.08, 0.08, 0.16, f.w * 0.35, -0.05, 0);
  } else {
    box(l, '#f2efe6', f.w, 0.08, 0.3, 0, -f.h / 2, 0);
    box(l, '#f2efe6', f.w, 0.08, 0.3, 0, f.h / 2, 0);
    box(l, '#f2efe6', 0.08, f.h, 0.3, -f.w / 2, 0, 0);
    box(l, '#f2efe6', 0.08, f.h, 0.3, f.w / 2, 0, 0);
    box(l, '#f2efe6', 0.06, f.h, 0.2, 0, 0, 0);
    for (let k = 1; k < 4; k++) box(l, '#3a3a3a', 0.03, f.h, 0.03, -f.w / 2 + (k * f.w) / 4, 0, 0.1);
    box(l, '#8fb8cc', f.w - 0.1, f.h - 0.1, 0.02, 0, 0, -0.04);
  }
  return mergeGeos(l);
}
function gardenGeometry(gd) {
  const l = [];
  if (gd.kind === 'fence') {
    const n = Math.round(gd.len / 1.2);
    for (let i = 0; i <= n; i++) box(l, '#f1ede2', 0.12, 1.1, 0.12, -gd.len / 2 + (i * gd.len) / n, 0.55, 0);
    box(l, '#2f8f5a', gd.len, 0.1, 0.06, 0, 0.85, 0);
    box(l, '#2f8f5a', gd.len, 0.1, 0.06, 0, 0.4, 0);
  } else if (gd.kind === 'path') {
    const n = Math.max(1, Math.floor(gd.len));
    for (let i = 0; i < n; i++) box(l, i % 2 ? '#bdb6a6' : '#a8a090', 1.4, 0.12, 0.85, (i % 2) * 0.1, 0.06, -gd.len / 2 + 0.5 + i);
  } else {
    cyl(l, '#7a4a2a', 0.5, 0.42, 0.45, 0, 0.22, 0, 0, 0, 0, 10);
    cyl(l, '#5b3a22', 0.06, 0.09, 1.6, 0, 1.2, 0, 0, 0, 0, 6);
    l.push(part(new THREE.IcosahedronGeometry(0.9, 1), '#3f8f34', mat(0, 2.2, 0, 0, 0, 0, 1, 0.85, 1)));
    for (let k = 0; k < 6; k++) l.push(part(new THREE.IcosahedronGeometry(0.13, 0), ['#f29a1a', '#e8452e', '#f5c518'][k % 3], mat(Math.cos(k) * 0.55, 0.5, Math.sin(k) * 0.55)));
  }
  return mergeGeos(l);
}

const ghostMat = new THREE.MeshBasicMaterial({ color: 0x4cff8a, transparent: true, opacity: 0.28, depthWrite: false });
const ghostHot = new THREE.MeshBasicMaterial({ color: 0xffe14c, transparent: true, opacity: 0.45, depthWrite: false });

export class Construction {
  constructor(game) {
    this.game = game;
    this.world = game.world;
    this.town = game.town;
    this.terrain = game.terrain;
    this.audio = game.audio;
    textures();
    this.sites = this.town.plots.map((p) => {
      const g = new THREE.Group();
      g.position.set(p.x, p.y, p.z);
      game.scene.add(g);
      return { plot: p, g, parts: {} };
    });
    this.excavator = makeExcavator();
    this.crane = makeCrane(19, 26);
    this.mixer = makeMixer();
    for (const m of [this.excavator, this.crane, this.mixer]) { m.visible = false; game.scene.add(m); m.traverse((o) => { if (o.isMesh) o.castShadow = true; }); }
    this.exc = { swing: 0, boom: -0.6, stick: 1.4, bucket: 0.6, full: false };
    this.cr = { th: Math.PI * 0.85, r: 12, h: 12, carrying: null };
    this.session = null;
    this.pickables = [];
    this.pad = {};
    this.selectedFitting = null;
    this.paintColor = PAINT_COLORS[0].hex;
    this.raycaster = new THREE.Raycaster();
    this.particles = [];
  }

  get state() { return this.game.state; }
  local(i, x, y, z) { const p = this.sites[i].plot; return new THREE.Vector3(p.x + x, p.y + y, p.z + z); }

  // ---------- persistent visuals ----------
  refreshAll() { this.sites.forEach((_, i) => this.refreshPlot(i)); this.placeMachines(); }

  wallMaterial(i, id) {
    const ps = this.state.plots[i];
    const col = (ps.colors || {})[id];
    const key = `${i}:${id}`;
    this._wm ||= {};
    let m = this._wm[key];
    if (!m) { m = this._wm[key] = new THREE.MeshStandardMaterial({ map: TEX.brick, roughness: 0.9 }); }
    if (col) { m.map = TEX.plaster; m.color.set(col); } else { m.map = TEX.brick; m.color.set(0xffffff); }
    m.needsUpdate = true;
    return m;
  }

  applyLayout(i) { useLayout(this.state.plots[i] && this.state.plots[i].design); }
  restoreLayout() { if (this.session) this.applyLayout(this.session.i); }

  refreshPlot(i) {
    this.applyLayout(i);
    try { this._refreshPlot(i); } finally { this.restoreLayout(); }
  }

  _refreshPlot(i) {
    const site = this.sites[i];
    const ps = this.state.plots[i];
    const g = site.g;
    while (g.children.length) g.remove(g.children[0]);
    site.parts = {};
    const st = ps.stage, pr = ps.progress || {};
    const p = site.plot;
    this.town.setPlotLocked(i, !ps.unlocked);
    // dirt pad
    const pad = new THREE.Mesh(new THREE.BoxGeometry(24, 0.1, 22), new THREE.MeshLambertMaterial({ color: st >= 8 ? 0x6aa046 : 0x8a7050 }));
    pad.position.y = 0.0;
    pad.receiveShadow = true;
    g.add(pad);
    if (!ps.unlocked) { this.terrain.setHole(i, 0, 0, 0, 0); return; }
    // stage 0: debris
    if (st === 0) {
      const r = rng(100 + i);
      const cleared = pr.cleared || [];
      for (let k = 0; k < 7; k++) {
        if (cleared.includes(k)) continue;
        const x = (r() - 0.5) * 18, z = (r() - 0.5) * 16;
        const kind = k % 3;
        let m;
        if (kind === 0) m = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 1), new THREE.MeshLambertMaterial({ color: 0x4f7a2e }));
        else if (kind === 1) m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.8, 0), new THREE.MeshLambertMaterial({ color: 0x8a8580 }));
        else m = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 1.0), new THREE.MeshLambertMaterial({ color: 0x8a6a45 }));
        m.position.set(x, kind === 0 ? 0.7 : 0.5, z);
        m.rotation.y = r() * 6;
        m.castShadow = true;
        m.userData.debris = k;
        g.add(m);
        site.parts['debris' + k] = m;
      }
    }
    // pit
    if (st >= 1) {
      const scoops = st >= 2 ? 4 : (pr.scoops || 0);
      const depth = Math.max(0.15, (PIT.depth * scoops) / 4);
      const pit = new THREE.Mesh(new THREE.BoxGeometry(PIT.hx * 2, depth, PIT.hz * 2), new THREE.MeshLambertMaterial({ color: 0x5e4630, side: THREE.BackSide }));
      pit.position.y = -depth / 2 + 0.06;
      pit.receiveShadow = true;
      g.add(pit);
      this.terrain.setHole(i, p.x - PIT.hx, p.z - PIT.hz, p.x + PIT.hx, p.z + PIT.hz);
      pad.geometry = makePadWithHole(PIT);
      if (st < 3) {
        const sp = new THREE.Mesh(new THREE.ConeGeometry(3.2, 2.4, 12), new THREE.MeshLambertMaterial({ color: 0x6b4a2e }));
        sp.position.copy(SPOIL);
        const k = Math.max(0.15, scoops / 4);
        sp.scale.set(k, k, k); sp.position.y = 1.2 * k;
        g.add(sp);
        site.parts.spoil = sp;
      }
    } else this.terrain.setHole(i, 0, 0, 0, 0);
    // slab
    if (st >= 2) {
      const prog = st >= 3 ? 1 : (pr.pour || 0);
      const slab = new THREE.Mesh(new THREE.BoxGeometry(10.8, 1, 8.8), new THREE.MeshLambertMaterial({ color: 0xa7a59e }));
      const top = -PIT.depth + (PIT.depth + SLAB_Y) * prog;
      slab.scale.y = Math.max(0.01, top + PIT.depth);
      slab.position.y = -PIT.depth + slab.scale.y / 2;
      slab.receiveShadow = true; slab.castShadow = true;
      g.add(slab);
      site.parts.slab = slab;
    }
    // walls
    const placedWalls = st > 3 ? WALLS.map((w) => w.id) : st === 3 ? pr.walls || [] : [];
    for (const wd of WALLS) {
      if (!placedWalls.includes(wd.id)) continue;
      const m = new THREE.Mesh(wallGeometry(wd), this.wallMaterial(i, wd.id));
      m.position.set(...wd.pos); m.rotation.y = wd.rot;
      m.castShadow = true; m.receiveShadow = true;
      m.userData.wall = wd.id;
      g.add(m);
      site.parts['wall_' + wd.id] = m;
    }
    // roof
    const placedRoof = st > 4 ? ROOFS.map((r) => r.id) : st === 4 ? pr.roof || [] : [];
    for (const rd of ROOFS) {
      if (!placedRoof.includes(rd.id)) continue;
      g.add(this.roofMesh(rd));
    }
    // fittings
    const placedFit = st > 5 ? FITTINGS.map((f) => f.id) : st === 5 ? pr.fittings || [] : [];
    for (const f of FITTINGS) if (placedFit.includes(f.id)) g.add(this.fittingMesh(f));
    // garden
    const placedGarden = st > 7 ? GARDEN.map((q) => q.id) : st === 7 ? pr.garden || [] : [];
    for (const gd of GARDEN) if (placedGarden.includes(gd.id)) g.add(this.gardenMesh(gd));
    if (st >= 8) this.addExtras(g, i);
  }

  roofMaterial() {
    if (DESIGN.roof === 'tin') return new THREE.MeshStandardMaterial({ map: TEX.tin, color: 0x4f9a72, roughness: 0.5, metalness: 0.3 });
    if (DESIGN.roof === 'flat') return new THREE.MeshStandardMaterial({ map: TEX.concrete, color: 0xc9c4b8, roughness: 0.9 });
    return new THREE.MeshStandardMaterial({ map: TEX.tiles, roughness: 0.8 });
  }

  // finishing touches that make each building type different
  addExtras(g, i) {
    const W = TYPE.w, D = TYPE.d, hw = W / 2, hd = D / 2;
    const top = SLAB_Y + WALL_H;
    const l = [];
    if (TYPE.extra === 'awning') {
      for (let k = 0; k < 8; k++) box(l, k % 2 ? '#f2efe6' : '#d61f3c', W / 8, 0.08, 1.6, -hw + W / 16 + (k * W) / 8, top - 0.6, hd + 0.75, 0.3);
    }
    if (TYPE.extra === 'flag') {
      cyl(l, '#d8d8d8', 0.06, 0.08, 7, hw + 2, 3.5, hd + 3, 0, 0, 0, 8);
      box(l, '#f29a1a', 0.04, 0.35, 1.5, hw + 2, 6.5, hd + 3.8);
      box(l, '#ffffff', 0.04, 0.35, 1.5, hw + 2, 6.15, hd + 3.8);
      box(l, '#2f8f3a', 0.04, 0.35, 1.5, hw + 2, 5.8, hd + 3.8);
    }
    if (DESIGN.roof === 'flat') {
      box(l, '#d8d2c4', W + 0.6, 0.6, 0.15, 0, top + 0.5, hd + 0.3);
      box(l, '#d8d2c4', W + 0.6, 0.6, 0.15, 0, top + 0.5, -hd - 0.3);
      box(l, '#d8d2c4', 0.15, 0.6, D + 0.6, -hw - 0.3, top + 0.5, 0);
      box(l, '#d8d2c4', 0.15, 0.6, D + 0.6, hw + 0.3, top + 0.5, 0);
      cyl(l, '#222', 0.6, 0.6, 1.1, hw - 1.2, top + 0.8, -hd + 1.2, 0, 0, 0, 12); // water tank
    }
    if (l.length) { const m = new THREE.Mesh(mergeGeos(l), M.vc); m.castShadow = true; g.add(m); }
    const labels = { house: ['HOME', 'घर', '#2f8f5a'], shop: ['GENERAL STORE', 'किराना दुकान', '#d61f3c'], school: ['SCHOOL', 'विद्यालय', '#b5482f'], clinic: ['CLINIC', 'दवाखाना', '#2f6db5'] };
    const [en, hi, col] = labels[TYPE.id] || labels.house;
    const s = this.town.sign(en, hi, TYPE.id === 'house' ? 2.4 : 4, TYPE.id === 'house' ? 0.8 : 1.1, col);
    s.position.set(TYPE.id === 'house' ? hw * 0.5 : 0, TYPE.id === 'house' ? SLAB_Y + 2.7 : top - 0.15, hd + 0.05);
    g.add(s);
    if (TYPE.extra === 'cross') {
      const c = new THREE.Group();
      const red = new THREE.MeshBasicMaterial({ color: 0xe02020 });
      const a = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.35, 0.06), red), b = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.2, 0.06), red);
      const bg = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 0.04), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      a.position.z = b.position.z = 0.04;
      c.add(bg, a, b);
      c.position.set(hw - 1.6, SLAB_Y + 2.4, hd + 0.08);
      g.add(c);
    }
  }

  roofMesh(rd) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(...rd.size), this.roofMaterial());
    m.position.set(...rd.pos); m.rotation.x = rd.rotX;
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }
  fittingTransform(f, obj) {
    const wd = WALLS.find((w) => w.id === f.wall);
    const o = new THREE.Object3D();
    o.position.set(...wd.pos); o.rotation.y = wd.rot;
    o.updateMatrix();
    const p = new THREE.Vector3(f.u, f.v + f.h / 2, 0).applyMatrix4(o.matrix);
    obj.position.copy(p); obj.rotation.y = wd.rot;
    return obj;
  }
  fittingMesh(f) {
    const m = new THREE.Mesh(fittingGeometry(f), M.vc);
    m.castShadow = true;
    return this.fittingTransform(f, m);
  }
  gardenMesh(gd) {
    const m = new THREE.Mesh(gardenGeometry(gd), M.vc);
    m.position.set(...gd.pos); m.rotation.y = gd.rot;
    m.castShadow = true;
    return m;
  }

  // machines live at the plot currently under construction
  placeMachines() {
    const ai = this.session ? this.session.i : L.activePlot(this.state);
    if (ai >= 0) this.applyLayout(ai);
    const st = ai >= 0 ? this.state.plots[ai].stage : -1;
    this.excavator.visible = st === 1;
    this.mixer.visible = st === 2;
    this.crane.visible = st === 3 || st === 4;
    if (ai < 0) return;
    const p = this.sites[ai].plot;
    this.excavator.position.set(p.x + EXC_POS.x, p.y, p.z + EXC_POS.z);
    this.excavator.rotation.y = Math.PI / 2;
    this.mixer.position.set(p.x, p.y, p.z + 15);
    this.crane.position.set(p.x + CRANE_POS.x, p.y, p.z + CRANE_POS.z);
    this.applyExc(); this.applyCrane();
    this.restoreLayout();
  }

  applyExc() {
    const u = this.excavator.userData, e = this.exc;
    u.upper.rotation.y = e.swing;
    u.boom.rotation.x = e.boom;
    u.stick.rotation.x = e.stick;
    u.bucket.rotation.x = e.bucket;
    u.dirt.visible = e.full;
  }
  hookPos(v = new THREE.Vector3()) {
    const c = this.cr;
    return v.set(Math.cos(c.th) * c.r, c.h, Math.sin(c.th) * c.r).add(this.crane.position);
  }
  applyCrane() {
    const u = this.crane.userData, c = this.cr;
    u.top.rotation.y = -c.th;
    u.trolley.position.x = c.r;
    const hp = this.hookPos();
    u.hook.position.copy(hp).sub(this.crane.position);
    const top = new THREE.Vector3(Math.cos(c.th) * c.r, u.height + 0.3, Math.sin(c.th) * c.r);
    const pos = u.cable.geometry.attributes.position;
    pos.setXYZ(0, top.x, top.y, top.z);
    pos.setXYZ(1, u.hook.position.x, u.hook.position.y + 0.6, u.hook.position.z);
    pos.needsUpdate = true;
    u.cable.geometry.computeBoundingSphere();
    if (c.carrying) {
      const obj = c.carrying.obj;
      obj.position.copy(hp).sub(this.sites[this.session.i].g.position);
      obj.position.y -= c.carrying.hang;
    }
  }

  // ---------- session ----------
  canEnter(i) {
    const ps = this.state.plots[i];
    return ps && ps.unlocked && !ps.done;
  }

  enter(i) {
    this.session = { i, auto: null, t: 0 };
    this.applyLayout(i);
    this.paintColor = DESIGN.color || this.paintColor;
    this.cr.carrying = null;
    this.exc.full = false;
    this.refreshPlot(i);
    this.placeMachines();
    this.setupStage();
    const p = this.sites[i].plot;
    const ob = this.game.rig.orbit;
    ob.center.set(p.x, p.y + 2, p.z);
    ob.yaw = 0.5; ob.pitch = 0.6; ob.dist = 42;
  }

  exit() {
    if (!this.session) return;
    if (this.cr.carrying) this.returnCarried();
    this.clearGhosts();
    this.session = null;
    this.game.ui.buildPanel(null);
    this.refreshAll();
  }

  clearGhosts() {
    const site = this.session && this.sites[this.session.i];
    for (const p of this.pickables) if (p.userData.temp && p.parent) p.parent.remove(p);
    this.pickables = [];
    if (site) for (const k in site.parts) if (site.parts[k].userData.temp) delete site.parts[k];
  }

  stageIdx() { return this.state.plots[this.session.i].stage; }
  progress() { const ps = this.state.plots[this.session.i]; ps.progress ||= {}; return ps.progress; }

  setupStage() {
    this.clearGhosts();
    const i = this.session.i, ps = this.state.plots[i], site = this.sites[i];
    const st = ps.stage, pr = this.progress();
    this.session.auto = null;
    this.selectedFitting = null;
    if (st >= STAGES.length) { this.game.ui.buildPanel(this.panelInfo()); return; }
    const ready = L.canWorkStage(ps, st, this.state.rules.realMaterials);
    if (ready) {
      if (st === 0) for (const k in site.parts) if (k.startsWith('debris')) this.pickables.push(site.parts[k]);
      if (st === 3 || st === 4) this.spawnCraneParts();
      if (st === 5) {
        for (const f of FITTINGS) if (!(pr.fittings || []).includes(f.id)) {
          const gm = this.fittingTransform(f, new THREE.Mesh(new THREE.BoxGeometry(f.w, f.h, 0.4), ghostMat));
          gm.userData = { temp: true, fitting: f };
          site.g.add(gm); this.pickables.push(gm);
        }
      }
      if (st === 6) for (const wd of WALLS) { const m = site.parts['wall_' + wd.id]; if (m) this.pickables.push(m); }
      if (st === 7) {
        for (const gd of GARDEN) if (!(pr.garden || []).includes(gd.id)) {
          const gm = new THREE.Mesh(gd.kind === 'fence' ? new THREE.BoxGeometry(gd.len, 1.1, 0.4) : gd.kind === 'path' ? new THREE.BoxGeometry(1.5, 0.3, gd.len) : new THREE.CylinderGeometry(0.9, 0.9, 2.4, 10), ghostMat);
          gm.position.set(gd.pos[0], gd.kind === 'plant' ? 1.2 : gd.kind === 'fence' ? 0.55 : 0.15, gd.pos[2]);
          gm.rotation.y = gd.rot;
          gm.userData = { temp: true, garden: gd };
          site.g.add(gm); this.pickables.push(gm);
        }
      }
    }
    this.game.ui.buildPanel(this.panelInfo());
  }

  spawnCraneParts() {
    const i = this.session.i, site = this.sites[i], pr = this.progress();
    const st = this.stageIdx();
    const list = st === 3 ? WALLS.filter((w) => !(pr.walls || []).includes(w.id)) : ROOFS.filter((r) => !(pr.roof || []).includes(r.id));
    this.craneParts = [];
    list.forEach((d, k) => {
      const obj = st === 3 ? new THREE.Mesh(wallGeometry(d), this.wallMaterial(i, d.id)) : this.roofMesh(d);
      obj.castShadow = true;
      // lying flat in a stack
      obj.position.set(STACK.x, 0.25 + k * 0.32, STACK.z);
      obj.rotation.set(st === 3 ? -Math.PI / 2 : 0, 0, 0);
      obj.userData = { temp: true, craneDef: d, stackIdx: k };
      site.g.add(obj);
      // ghost at target
      const ghost = st === 3 ? new THREE.Mesh(wallGeometry(d), ghostMat) : new THREE.Mesh(new THREE.BoxGeometry(...d.size), ghostMat);
      if (st === 3) { ghost.position.set(...d.pos); ghost.rotation.y = d.rot; } else { ghost.position.set(...d.pos); ghost.rotation.x = d.rotX; }
      ghost.userData = { temp: true, ghostFor: d.id };
      site.g.add(ghost);
      this.pickables.push(obj, ghost);
      this.craneParts.push({ def: d, obj, ghost, placed: false, isWall: st === 3 });
    });
  }

  panelInfo() {
    const i = this.session.i, ps = this.state.plots[i], st = ps.stage;
    const info = { plot: i, stage: st, total: STAGES.length, building: TYPE.name, name: st < STAGES.length ? STAGES[st].name : `${TYPE.name} complete!`, needs: [], hint: '', buttons: [], pad: null, palette: null, parts: null };
    if (st >= STAGES.length) { info.hint = `This ${TYPE.name.toLowerCase()} is finished! Tap Home to build on another plot, or go for a drive.`; return info; }
    const need = STAGES[st].need;
    if (this.state.rules.realMaterials) for (const k in need) info.needs.push({ k, name: CARGO[k].name, have: ps.site[k] || 0, need: need[k], color: CARGO[k].color });
    const ready = L.canWorkStage(ps, st, this.state.rules.realMaterials);
    const assisted = this.game.settings.assisted;
    if (!ready) {
      info.hint = 'This stage needs more materials. Load them at the warehouse with the truck and unload them here.';
      return info;
    }
    const pr = ps.progress || {};
    switch (st) {
      case 0: info.hint = 'Tap the bushes, rocks and junk to clear the plot.'; info.buttons.push({ id: 'auto', label: 'Clear all for me' }); break;
      case 1:
        info.hint = this.exc.full ? 'Swing to the brown spoil pile and dump the bucket.' : `Swing to the pit, lower the boom and curl the bucket to dig. Scoops: ${pr.scoops || 0}/4`;
        info.pad = 'excavator';
        info.buttons.push({ id: 'auto', label: assisted ? 'Dig for me' : 'Auto dig' });
        break;
      case 2: info.hint = `Hold "Pour" to fill the foundation with concrete. ${Math.round((pr.pour || 0) * 100)}%`; info.buttons.push({ id: 'pour', label: 'Hold to pour', hold: true }); if (assisted) info.buttons.push({ id: 'auto', label: 'Pour for me' }); break;
      case 3: case 4: {
        const what = st === 3 ? 'wall panel' : 'roof half';
        info.hint = this.cr.carrying ? `Move the ${what} over its green outline and lower it. Press Grab/Release to set it down.` : `Move the hook over the stack, lower it and press Grab to lift a ${what}.`;
        info.pad = 'crane';
        info.buttons.push({ id: 'auto', label: assisted ? 'Place one for me' : 'Auto place one' });
        break;
      }
      case 5:
        info.hint = this.selectedFitting ? `Now tap a glowing ${this.selectedFitting} slot on the walls.` : 'Pick a door or window, then tap where it goes.';
        info.parts = [{ id: 'door', label: 'Door' }, { id: 'window', label: 'Window' }];
        info.selected = this.selectedFitting;
        if (assisted) info.buttons.push({ id: 'auto', label: 'Fit all for me' });
        break;
      case 6:
        info.hint = 'Choose a colour, then tap each wall to paint it.';
        info.palette = PAINT_COLORS; info.paintColor = this.paintColor;
        info.buttons.push({ id: 'auto', label: 'Paint all walls' });
        break;
      case 7: info.hint = 'Tap the green outlines to build the fence, path and plant saplings.'; info.buttons.push({ id: 'auto', label: 'Finish garden for me' }); break;
    }
    return info;
  }

  onButton(id, down = true) {
    if (!this.session) return;
    if (id === 'pour') { this.pad.pour = down; return; }
    if (!down) return;
    if (id === 'auto') this.startAuto();
    else if (id === 'grab') this.craneGrab();
    else if (id.startsWith('part:')) { this.selectedFitting = id.slice(5); this.game.ui.buildPanel(this.panelInfo()); this.audio.play('click'); }
    else if (id.startsWith('color:')) { this.paintColor = id.slice(6); this.game.ui.buildPanel(this.panelInfo()); this.audio.play('click'); }
  }
  setPad(name, v) { this.pad[name] = v; }

  startAuto() {
    const st = this.stageIdx();
    if (!L.canWorkStage(this.state.plots[this.session.i], st, this.state.rules.realMaterials)) return;
    this.session.auto = { st, step: 0, t: 0 };
  }

  // ---------- picking ----------
  pick(raycaster) {
    if (!this.session || !this.pickables.length) return false;
    const hits = raycaster.intersectObjects(this.pickables, false);
    if (!hits.length) return false;
    this.handlePick(hits[0].object);
    return true;
  }
  handlePick(obj) {
    const st = this.stageIdx();
    const ud = obj.userData;
    const pr = this.progress();
    if (st === 0 && ud.debris !== undefined) this.clearDebris(obj);
    else if (st === 5 && ud.fitting) {
      const f = ud.fitting;
      const assisted = this.game.settings.assisted;
      if (!this.selectedFitting && !assisted) { this.game.ui.toast('First pick a Door or Window from the panel.'); this.audio.play('error'); return; }
      if (this.selectedFitting && this.selectedFitting !== f.type) { this.game.ui.toast(`That opening needs a ${f.type}.`); this.audio.play('error'); return; }
      this.installFitting(obj);
    } else if (st === 6 && ud.wall) this.paintWall(ud.wall);
    else if (st === 7 && ud.garden) this.placeGarden(obj);
    else if ((st === 3 || st === 4) && (ud.craneDef || ud.ghostFor) && !this.cr.carrying) {
      // tapping a part or outline in assisted mode starts the crane helper
      if (this.game.settings.assisted) this.startAuto();
      else this.game.ui.toast('Use the crane controls, or switch on Helper mode in Settings.');
    }
    void pr;
  }

  clearDebris(obj) {
    const pr = this.progress();
    pr.cleared ||= [];
    if (pr.cleared.includes(obj.userData.debris)) return;
    pr.cleared.push(obj.userData.debris);
    this.pickables = this.pickables.filter((p) => p !== obj);
    this.audio.play('rustle');
    this.animate(obj, 0.4, (k) => { obj.scale.setScalar(1 - k); obj.position.y += 0.02; }, () => obj.parent && obj.parent.remove(obj));
    this.puff(obj.getWorldPosition(new THREE.Vector3()), 0x9a8a6a);
    if (pr.cleared.length >= 7) this.finishStage();
    else this.game.save();
  }

  installFitting(ghost) {
    const f = ghost.userData.fitting, pr = this.progress();
    pr.fittings ||= [];
    if (pr.fittings.includes(f.id)) return;
    pr.fittings.push(f.id);
    this.pickables = this.pickables.filter((p) => p !== ghost);
    ghost.parent.remove(ghost);
    const m = this.fittingMesh(f);
    const site = this.sites[this.session.i];
    site.g.add(m);
    const target = m.position.clone();
    m.position.add(new THREE.Vector3(0, 3, 0));
    this.animate(m, 0.45, (k) => m.position.lerpVectors(target.clone().add(new THREE.Vector3(0, 3, 0)), target, k * k), () => this.audio.play('snap'));
    if (pr.fittings.length >= FITTINGS.length) setTimeout(() => this.finishStage(5), 500);
    else { this.game.save(); this.game.ui.buildPanel(this.panelInfo()); }
  }

  paintWall(id) {
    const i = this.session.i, ps = this.state.plots[i], pr = this.progress();
    pr.painted ||= [];
    ps.colors ||= {};
    const mtl = this._wm[`${i}:${id}`];
    const from = mtl.color.clone();
    ps.colors[id] = this.paintColor;
    const to = new THREE.Color(this.paintColor);
    mtl.map = TEX.plaster; mtl.needsUpdate = true;
    this.game.machineAudio.spray = true;
    this.animate(mtl, 0.8, (k) => mtl.color.lerpColors(from.equals(new THREE.Color(1, 1, 1)) ? new THREE.Color(0.85, 0.5, 0.4) : from, to, k), () => { this.game.machineAudio.spray = false; });
    const wd = WALLS.find((w) => w.id === id);
    this.puff(this.local(i, wd.pos[0], 2, wd.pos[2]), to.getHex());
    if (!pr.painted.includes(id)) pr.painted.push(id);
    if (pr.painted.length >= WALLS.length) setTimeout(() => this.finishStage(6), 900);
    else this.game.save();
  }

  placeGarden(ghost) {
    const gd = ghost.userData.garden, pr = this.progress();
    pr.garden ||= [];
    if (pr.garden.includes(gd.id)) return;
    pr.garden.push(gd.id);
    this.pickables = this.pickables.filter((p) => p !== ghost);
    ghost.parent.remove(ghost);
    const m = this.gardenMesh(gd);
    this.sites[this.session.i].g.add(m);
    this.animate(m, 0.5, (k) => m.scale.set(1, Math.max(0.01, k), 1), () => this.audio.play('snap'));
    if (pr.garden.length >= GARDEN.length) setTimeout(() => this.finishStage(7), 600);
    else this.game.save();
  }

  finishStage(expected) {
    if (!this.session) return;
    const i = this.session.i;
    const st = this.state.plots[i].stage;
    if (expected !== undefined && st !== expected) return;
    const res = L.completeStage(this.state, i, st);
    if (!res) { this.game.ui.toast('Something is missing for this stage.'); return; }
    this.game.onStageComplete(i, res);
    this.cr.carrying = null;
    this.refreshPlot(i);
    this.placeMachines();
    this.setupStage();
  }

  returnCarried() {
    const c = this.cr.carrying;
    if (!c) return;
    c.obj.position.set(STACK.x, 0.25 + c.stackIdx * 0.32, STACK.z);
    c.obj.rotation.set(c.isWall ? -Math.PI / 2 : 0, 0, 0);
    this.cr.carrying = null;
  }

  craneGrab() {
    const st = this.stageIdx();
    if (st !== 3 && st !== 4) return;
    const site = this.sites[this.session.i];
    const hook = this.hookPos().sub(site.g.position);
    if (this.cr.carrying) {
      const c = this.cr.carrying;
      const d = c.def;
      const target = new THREE.Vector3(...d.pos);
      const bottom = c.obj.position.y;
      const horiz = Math.hypot(c.obj.position.x - target.x, c.obj.position.z - target.z);
      if (horiz < 3.2 && bottom < target.y + 3.2) {
        // snap into place
        const from = c.obj.position.clone();
        const obj = c.obj;
        this.cr.carrying = null;
        this.animate(obj, 0.5, (k) => obj.position.lerpVectors(from, target, k), () => {
          this.audio.play('snap');
          const pr = this.progress();
          const key = st === 3 ? 'walls' : 'roof';
          pr[key] ||= [];
          if (!pr[key].includes(d.id)) pr[key].push(d.id);
          const cp = this.craneParts.find((p) => p.def.id === d.id);
          if (cp) { cp.placed = true; cp.ghost.parent && cp.ghost.parent.remove(cp.ghost); }
          this.pickables = this.pickables.filter((p) => p !== obj && p !== cp?.ghost);
          const need = st === 3 ? WALLS.length : ROOFS.length;
          if (pr[key].length >= need) this.finishStage(st);
          else { this.game.save(); this.game.ui.buildPanel(this.panelInfo()); }
        });
        if (st === 3) obj.rotation.set(0, d.rot, 0); else obj.rotation.set(d.rotX, 0, 0);
      } else {
        this.game.ui.toast('Not over the outline - the part goes back to the stack.');
        this.returnCarried();
        this.audio.play('error');
      }
      this.game.ui.buildPanel(this.panelInfo());
      return;
    }
    // try to pick the top unplaced part of the stack
    const avail = (this.craneParts || []).filter((p) => !p.placed);
    if (!avail.length) return;
    const top = avail.reduce((a, b) => (a.obj.position.y > b.obj.position.y ? a : b));
    const pp = top.obj.position;
    if (Math.hypot(hook.x - pp.x, hook.z - pp.z) < 3 && hook.y < pp.y + 3.2) {
      this.cr.carrying = { obj: top.obj, def: top.def, hang: top.isWall ? WALL_H + (top.def.gable ? RIDGE : 0) + 0.9 : 1.0, stackIdx: top.obj.userData.stackIdx, isWall: top.isWall };
      if (top.isWall) top.obj.rotation.set(0, top.def.rot, 0); else top.obj.rotation.set(top.def.rotX, 0, 0);
      this.audio.play('clank');
      this.applyCrane();
      this.game.ui.buildPanel(this.panelInfo());
    } else {
      this.game.ui.toast('Lower the hook right above the stack of parts first.');
      this.audio.play('error');
    }
  }

  // ---------- per-frame ----------
  update(dt, keys) {
    this.updateAnims(dt);
    const ma = this.game.machineAudio;
    ma.hyd = 0; ma.crane = 0; ma.pour = false;
    ma.idle = this.session && (this.excavator.visible || this.mixer.visible || this.crane.visible);
    // mixer drum always turns when visible
    if (this.mixer.visible) this.mixer.userData.drum.rotation.z += dt * (this.pad.pour ? 4 : 1);
    if (!this.session) return;
    const st = this.stageIdx();
    const ps = this.state.plots[this.session.i];
    if (!L.canWorkStage(ps, st, this.state.rules.realMaterials)) return;
    const k = (code) => keys.has(code);
    const auto = this.session.auto;
    if (st === 0 && auto) {
      auto.t -= dt;
      if (auto.t <= 0) {
        auto.t = 0.35;
        const next = this.pickables.find((p) => p.userData.debris !== undefined);
        if (next) this.clearDebris(next);
      }
    }
    if (st === 1) this.updateExcavator(dt, k, auto);
    if (st === 2) {
      const pr = this.progress();
      const pouring = this.pad.pour || k('Space') || (auto && auto.st === 2);
      if (pouring) {
        pr.pour = Math.min(1, (pr.pour || 0) + dt / 6);
        ma.pour = true;
        const slab = this.sites[this.session.i].parts.slab;
        const top = -PIT.depth + (PIT.depth + SLAB_Y) * pr.pour;
        if (slab) { slab.scale.y = Math.max(0.01, top + PIT.depth); slab.position.y = -PIT.depth + slab.scale.y / 2; }
        else this.refreshPlot(this.session.i);
        this._pourUi = (this._pourUi || 0) + dt;
        if (this._pourUi > 0.25) { this._pourUi = 0; this.game.ui.buildPanel(this.panelInfo()); }
        if (Math.random() < dt * 10) this.puff(this.local(this.session.i, (Math.random() - 0.5) * 8, top + 0.2, (Math.random() - 0.5) * 6), 0xa7a59e, 0.6);
        if (pr.pour >= 1) { this.pad.pour = false; this.finishStage(2); }
      }
    }
    if (st === 3 || st === 4) this.updateCrane(dt, k, auto);
    if (auto && (st === 5 || st === 6 || st === 7)) {
      auto.t -= dt;
      if (auto.t <= 0) {
        auto.t = 0.45;
        if (st === 5) { const g = this.pickables.find((p) => p.userData.fitting); if (g) { this.selectedFitting = g.userData.fitting.type; this.installFitting(g); } }
        if (st === 6) { const pr = this.progress(); const w = WALLS.find((x) => !(pr.painted || []).includes(x.id)); if (w) this.paintWall(w.id); }
        if (st === 7) { const g = this.pickables.find((p) => p.userData.garden); if (g) this.placeGarden(g); }
      }
    }
  }

  updateExcavator(dt, k, auto) {
    const e = this.exc, rate = 0.8;
    const before = [e.swing, e.boom, e.stick, e.bucket];
    if (auto) {
      const seq = [
        { swing: 0, boom: -0.5, stick: 1.2, bucket: -0.2 },
        { swing: 0, boom: 0.25, stick: 1.6, bucket: -0.3 },
        { swing: 0, boom: 0.25, stick: 1.6, bucket: 1.3 },
        { swing: 0, boom: -0.6, stick: 1.3, bucket: 1.3 },
        { swing: Math.PI / 2, boom: -0.6, stick: 1.3, bucket: 1.3 },
        { swing: Math.PI / 2, boom: -0.25, stick: 1.2, bucket: 1.3 },
        { swing: Math.PI / 2, boom: -0.25, stick: 1.2, bucket: -1.1 },
      ];
      const tgt = seq[auto.step % seq.length];
      let done = true;
      for (const key of ['swing', 'boom', 'stick', 'bucket']) {
        const d = tgt[key] - e[key];
        if (Math.abs(d) > 0.01) done = false;
        e[key] += clamp(d, -rate * 1.5 * dt, rate * 1.5 * dt);
      }
      if (done) auto.step++;
    } else {
      const p = this.pad;
      if (k('KeyA') || p.swingL) e.swing += rate * dt;
      if (k('KeyD') || p.swingR) e.swing -= rate * dt;
      if (k('KeyW') || p.boomUp) e.boom -= rate * 0.6 * dt;
      if (k('KeyS') || p.boomDown) e.boom += rate * 0.6 * dt;
      if (k('KeyQ') || p.stickOut) e.stick -= rate * dt;
      if (k('KeyE') || p.stickIn) e.stick += rate * dt;
      if (k('KeyR') || p.curl) e.bucket += rate * 1.4 * dt;
      if (k('KeyF') || p.dump) e.bucket -= rate * 1.4 * dt;
    }
    e.boom = clamp(e.boom, -0.9, 0.6);
    e.stick = clamp(e.stick, 0.2, 2.2);
    e.bucket = clamp(e.bucket, -1.2, 1.6);
    const moved = Math.abs(before[0] - e.swing) + Math.abs(before[1] - e.boom) + Math.abs(before[2] - e.stick) + Math.abs(before[3] - e.bucket);
    this.game.machineAudio.hyd = Math.min(1, moved / dt / 1.2);
    this.applyExc();
    // dig / dump rules
    const tip = this.excavator.userData.tip.getWorldPosition(new THREE.Vector3());
    const site = this.sites[this.session.i];
    const lp = tip.clone().sub(site.g.position);
    const pr = this.progress();
    if (!e.full && Math.abs(lp.x) < PIT.hx - 0.2 && Math.abs(lp.z) < PIT.hz - 0.2 && lp.y < 0.3 && e.bucket > 0.6) {
      e.full = true;
      this.audio.play('dig');
      this.puff(tip, 0x6b4a2e);
      this.game.ui.buildPanel(this.panelInfo());
    }
    if (e.full && Math.hypot(lp.x - SPOIL.x, lp.z - SPOIL.z) < 4.5 && e.bucket < -0.4) {
      e.full = false;
      pr.scoops = (pr.scoops || 0) + 1;
      this.audio.play('thud');
      this.puff(tip, 0x6b4a2e);
      if (this.session.auto) this.session.auto.step = 0;
      if (pr.scoops >= 4) { this.finishStage(1); return; }
      this.refreshPlot(this.session.i);
      this.game.save();
      this.game.ui.buildPanel(this.panelInfo());
    }
  }

  updateCrane(dt, k, auto) {
    const c = this.cr;
    const before = [c.th, c.r, c.h];
    const site = this.sites[this.session.i];
    if (auto) this.craneAuto(dt, auto, site);
    else {
      const p = this.pad;
      if (k('KeyA') || p.slewL) c.th += 0.45 * dt;
      if (k('KeyD') || p.slewR) c.th -= 0.45 * dt;
      if (k('KeyW') || p.out) c.r += 4 * dt;
      if (k('KeyS') || p.in) c.r -= 4 * dt;
      if (k('KeyQ') || p.up) c.h += 3 * dt;
      if (k('KeyE') || p.down) c.h -= 3 * dt;
    }
    c.r = clamp(c.r, 3, 25);
    c.h = clamp(c.h, (c.carrying ? c.carrying.hang : 0) + 0.3, 17);
    const moved = Math.abs(before[0] - c.th) * 10 + Math.abs(before[1] - c.r) + Math.abs(before[2] - c.h);
    this.game.machineAudio.crane = Math.min(1, moved / dt / 3);
    this.applyCrane();
  }

  // hook coordinates in crane polar form for a plot-local point
  polarFor(local) {
    const cp = this.crane.position.clone().sub(this.sites[this.session.i].g.position);
    const dx = local.x - cp.x, dz = local.z - cp.z;
    return { th: Math.atan2(dz, dx), r: Math.hypot(dx, dz) };
  }

  craneAuto(dt, auto, site) {
    const c = this.cr;
    const moveTo = (th, r, h) => {
      let dth = th - c.th;
      while (dth > Math.PI) dth -= Math.PI * 2;
      while (dth < -Math.PI) dth += Math.PI * 2;
      c.th += clamp(dth, -0.7 * dt, 0.7 * dt);
      c.r += clamp(r - c.r, -6 * dt, 6 * dt);
      c.h += clamp(h - c.h, -5 * dt, 5 * dt);
      return Math.abs(dth) < 0.01 && Math.abs(r - c.r) < 0.05 && Math.abs(h - c.h) < 0.05;
    };
    const safe = 15;
    const avail = (this.craneParts || []).filter((p) => !p.placed);
    if (!avail.length) { this.session.auto = null; return; }
    if (auto.step === 0) { if (moveTo(c.th, c.r, safe)) auto.step = 1; }
    else if (auto.step === 1) {
      if (c.carrying) { auto.step = 3; return; }
      const top = avail.reduce((a, b) => (a.obj.position.y > b.obj.position.y ? a : b));
      const pol = this.polarFor(top.obj.position);
      if (moveTo(pol.th, pol.r, safe)) auto.step = 2;
    } else if (auto.step === 2) {
      const top = avail.reduce((a, b) => (a.obj.position.y > b.obj.position.y ? a : b));
      if (moveTo(c.th, c.r, top.obj.position.y + 1.2)) { this.craneGrab(); auto.step = 3; }
    } else if (auto.step === 3) {
      if (moveTo(c.th, c.r, safe)) auto.step = 4;
    } else if (auto.step === 4) {
      const d = c.carrying.def;
      const pol = this.polarFor(new THREE.Vector3(...d.pos));
      if (moveTo(pol.th, pol.r, safe)) auto.step = 5;
    } else if (auto.step === 5) {
      const d = c.carrying.def;
      if (moveTo(c.th, c.r, d.pos[1] + c.carrying.hang + 0.6)) { this.craneGrab(); auto.step = 6; auto.t = 0.8; }
    } else if (auto.step === 6) {
      auto.t -= dt;
      if (auto.t <= 0) this.session.auto = null;
    }
  }

  // ---------- small animation helpers ----------
  animate(obj, dur, fn, done) { (this.anims ||= []).push({ t: 0, dur, fn, done }); }
  updateAnims(dt) {
    if (!this.anims) return;
    for (const a of this.anims) {
      a.t += dt;
      const k = Math.min(1, a.t / a.dur);
      a.fn(k);
      if (k >= 1 && !a.finished) { a.finished = true; a.done && a.done(); }
    }
    this.anims = this.anims.filter((a) => !a.finished);
    for (const p of this.particles) {
      p.life -= dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.vel.y -= 4 * dt;
      p.mesh.material.opacity = Math.max(0, p.life);
      if (p.life <= 0) this.game.scene.remove(p.mesh);
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }
  puff(pos, color, n = 1) {
    const count = Math.round(8 * n);
    for (let k = 0; k < count; k++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.25, 0), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 }));
      m.position.copy(pos);
      this.game.scene.add(m);
      this.particles.push({ mesh: m, vel: new THREE.Vector3((Math.random() - 0.5) * 4, 2 + Math.random() * 3, (Math.random() - 0.5) * 4), life: 0.9 });
    }
  }
}

const _padHoles = {};
function makePadWithHole(PIT) {
  const key = `${PIT.hx}:${PIT.hz}`;
  if (_padHoles[key]) return _padHoles[key];
  const sh = new THREE.Shape();
  sh.moveTo(-12, -11); sh.lineTo(12, -11); sh.lineTo(12, 11); sh.lineTo(-12, 11); sh.closePath();
  const h = new THREE.Path();
  h.moveTo(-PIT.hx, -PIT.hz); h.lineTo(PIT.hx, -PIT.hz); h.lineTo(PIT.hx, PIT.hz); h.lineTo(-PIT.hx, PIT.hz); h.closePath();
  sh.holes.push(h);
  const g = new THREE.ShapeGeometry(sh);
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0.06, 0);
  _padHoles[key] = g;
  return g;
}
