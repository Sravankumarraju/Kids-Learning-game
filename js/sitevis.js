// What a building site looks like for its saved state: ground, trenches, steel, footing, plinth,
// columns, brick walls, slabs and roofs, doors and windows, plaster and paint, garden.
// Everything is in plot-local coordinates (ground y = 0, front of the building faces +z).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Assets } from './assets.js';
import { canvasTexture, rng } from './util.js';
import * as B from './buildgeo.js';
import { PBR } from './machines.js';

export const ST = { survey: 0, clear: 1, dig: 2, steel: 3, footing: 4, plinth: 5, columns: 6, walls: 7, roof: 8, fittings: 9, finish: 10, handover: 11 };
const D = B.TRENCH_D, TW = B.TRENCH_W;
export const ROOF_PITCH = { tiles: 0.5, tin: 0.26 };
export const FLOOR_PATTERNS = [
  { id: 'chess', name: 'Chessboard', color: 0xffffff },
  { id: 'terracotta', name: 'Terracotta', color: 0xd88a5a },
  { id: 'marble', name: 'Marble', color: 0xf4f1ea },
];

// ---------- materials (shared) ----------
let MT = null;
const paintCache = new Map();
export function mats() {
  if (MT) return MT;
  const brickFace = canvasTexture(64, 32, (ctx, w, h) => {
    ctx.fillStyle = '#a8a39a'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(3, 3, w - 6, h - 6);
    const r = rng(9);
    for (let i = 0; i < 90; i++) { const c = 200 + r() * 55; ctx.fillStyle = `rgba(${c},${c * 0.95},${c * 0.9},0.5)`; ctx.fillRect(3 + r() * (w - 8), 3 + r() * (h - 8), 2, 2); }
  });
  const chess = canvasTexture(128, 128, (ctx, w, h) => {
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { ctx.fillStyle = (x + y) % 2 ? '#2a2a2a' : '#f2f0ea'; ctx.fillRect(x * 32, y * 32, 32, 32); }
    ctx.strokeStyle = 'rgba(120,120,120,0.6)'; for (let k = 0; k <= 4; k++) { ctx.strokeRect(k * 32, 0, 0.5, h); ctx.strokeRect(0, k * 32, w, 0.5); }
  }, { repeat: [1, 1] });
  MT = {
    soil: Assets.material('dry_ground', { repeat: [0.25, 0.25], color: 0xcfae86 }),
    pit: Assets.material('soil_wall', { repeat: [1, 1], side: THREE.BackSide, color: 0xc49a74 }),
    pitIn: Assets.material('soil_wall', { repeat: [1, 1], color: 0xc49a74 }),
    concrete: new THREE.MeshStandardMaterial({ color: 0xaaa69e, roughness: 0.92, normalMap: Assets.tex('plaster', 'nor', [0.5, 0.5]), normalScale: new THREE.Vector2(0.35, 0.35), roughnessMap: Assets.tex('concrete', 'rough', [0.5, 0.5]) }),
    wet: new THREE.MeshStandardMaterial({ color: 0x86847e, roughness: 0.15 }),
    brickWall: Assets.material('brick', { repeat: [0.55, 0.55] }),
    brickUnit: new THREE.MeshStandardMaterial({ map: brickFace, roughness: 0.85 }),
    plaster: new THREE.MeshStandardMaterial({ color: 0xe9e4da, roughness: 0.95, normalMap: Assets.tex('plaster', 'nor', [0.4, 0.4]), normalScale: new THREE.Vector2(0.5, 0.5) }),
    ply: Assets.material('planks', { repeat: [0.6, 0.6], color: 0xd9ab72 }),
    prop: new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.8 }),
    timber: Assets.material('planks', { repeat: [0.3, 1], color: 0xa8743f }),
    steel: PBR.rebar,
    dpc: new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.35 }),
    paving: Assets.material('paving', { repeat: [0.6, 0.6] }),
    lawn: Assets.material('grass', { repeat: [0.4, 0.4] }),
    floorTiles: Assets.material('floor_tiles', { repeat: [0.5, 0.5] }),
    chess: new THREE.MeshStandardMaterial({ map: chess, roughness: 0.25 }),
    ghost: new THREE.MeshBasicMaterial({ color: 0x5dff8a, transparent: true, opacity: 0.32, depthWrite: false }),
    hot: new THREE.MeshBasicMaterial({ color: 0xffe14c, transparent: true, opacity: 0.6, depthWrite: false }),
    string: new THREE.LineBasicMaterial({ color: 0xffffff }),
    peg: new THREE.MeshStandardMaterial({ color: 0xff5a1f, roughness: 0.5 }),
    tankBlack: new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.5 }),
    rock: new THREE.MeshStandardMaterial({ color: 0x8d877c, roughness: 0.95 }),
    gate: new THREE.MeshStandardMaterial({ color: 0x2c3e50, metalness: 0.7, roughness: 0.4 }),
  };
  return MT;
}
export function paintMat(hex) {
  if (!paintCache.has(hex)) {
    const m = mats().plaster.clone();
    m.color.set(hex);
    paintCache.set(hex, m);
  }
  return paintCache.get(hex);
}
export function roofMat(kind) {
  return kind === 'tin'
    ? Assets.material('tin_roof', { repeat: [0.5, 0.5], metalness: 0.6, roughness: 0.42, color: 0xb4c2cc, side: THREE.DoubleSide })
    : Assets.material('roof_tiles', { repeat: [0.45, 0.45], roughness: 0.8, side: THREE.DoubleSide });
}

// a box whose texture is scaled to its real size (1 texture unit per metre before the material repeat)
export function box(w, h, d, m, x = 0, y = 0, z = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]); }
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(x, y, z);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

// ---------- layout helpers ----------
export function wallPoint(w, s) { return [w.a[0] + w.dir[0] * s, w.a[1] + w.dir[1] * s]; }

// trench pieces under the walls, about 5 m each
export function trenchSegs(L) {
  const segs = [];
  for (const w of L.walls) {
    const n = Math.max(1, Math.round(w.len / 5.5));
    for (let k = 0; k < n; k++) {
      const a = (w.len * k) / n - (k === 0 ? TW / 2 : 0), b = (w.len * (k + 1)) / n + (k === n - 1 ? TW / 2 : 0);
      const [x, z] = wallPoint(w, (a + b) / 2);
      segs.push({ k: segs.length, w, x, z, len: b - a, yaw: w.yaw });
    }
  }
  return segs;
}

// every opening on every floor, with a key used in the saved progress
export function openings(L) {
  const out = [];
  for (let f = 0; f < L.floors; f++) {
    const ops = L.ops(f);
    for (const w of L.walls) ops[w.id].forEach((o, k) => {
      const [x, z] = wallPoint(w, o.s);
      out.push({ key: `${f}:${w.id}:${k}`, f, w, o, x, z, y: B.floorBase(f) + o.v, yaw: w.yaw });
    });
  }
  return out;
}

// the debris on an uncleared plot
export function debrisList(i) {
  const r = rng(500 + i * 7);
  const out = [];
  const kinds = ['bush', 'bush', 'bush', 'bush', 'rock', 'rock', 'rock', 'rock', 'bush', 'crate', 'barrel', 'rock', 'bush', 'tyre'];
  kinds.forEach((kind, k) => {
    let x, z, tries = 0;
    do { x = (r() - 0.5) * 20; z = (r() - 0.5) * 18; tries++; } while (tries < 20 && out.some((o) => Math.hypot(o.x - x, o.z - z) < 2.2));
    out.push({ k, kind, x, z, rot: r() * 6.28, s: 0.7 + r() * 0.6 });
  });
  return out;
}

export function gardenItems(L, proj) {
  const door = L.ops(0).front[0];
  const dx = L.walls[0].a[0] + door.s;
  const hw = L.hw, hd = L.hd;
  return [
    { id: 'path', name: 'Path', x: dx, z: (hd + 11) / 2, w: 1.6, d: 11 - hd, h: 0.12 },
    { id: 'wall', name: 'Boundary wall', x: 0, z: 0, w: 23.6, d: 21.6, h: 0.9 },
    { id: 'gate', name: 'Gate', x: dx, z: 10.8, w: 2.4, d: 0.4, h: 1.6 },
    { id: 'plant0', name: 'Mango sapling', x: -hw - 2, z: hd + 3.2, w: 1.4, d: 1.4, h: 1.6 },
    { id: 'plant1', name: 'Neem sapling', x: hw + 2, z: hd + 3.2, w: 1.4, d: 1.4, h: 1.6 },
    { id: 'plant2', name: 'Flower bush', x: -8.5, z: 8.5, w: 1.4, d: 1.4, h: 1.2 },
    { id: 'plant3', name: 'Flower bush', x: 8.5, z: 8.5, w: 1.4, d: 1.4, h: 1.2 },
    { id: 'board', name: 'Name board', x: dx < 0 ? dx + 2.4 : dx - 2.4, z: hd + 0.2, w: 2.2, d: 0.2, h: 0.6 },
  ].map((g) => ({ ...g, proj }));
}

// columns sized for the floor
export function columnSpots(L, f) {
  const y0 = B.floorBase(f);
  return L.cols.map(([x, z], k) => ({ k, x, z, y0, h: B.FLOOR_H }));
}

// ---------- geometry builders ----------
function cageGeometry(len, w, h, step) {
  const parts = [];
  for (const [dx, dy] of [[-w / 2, 0], [w / 2, 0], [-w / 2, h], [w / 2, h]]) {
    const g = new THREE.CylinderGeometry(0.012, 0.012, len, 5); g.rotateZ(Math.PI / 2); g.translate(0, dy, dx); parts.push(g);
  }
  for (let s = -len / 2 + 0.05; s <= len / 2; s += step) {
    for (const [a, b, c, d2] of [[-w / 2, 0, w / 2, 0], [-w / 2, h, w / 2, h], [-w / 2, 0, -w / 2, h], [w / 2, 0, w / 2, h]]) {
      const l = Math.hypot(c - a, d2 - b) || 0.01;
      const g = new THREE.CylinderGeometry(0.007, 0.007, l, 4);
      if (b === d2) g.rotateX(Math.PI / 2);
      g.translate(s, (b + d2) / 2, (a + c) / 2);
      parts.push(g);
    }
  }
  return mergeGeometries(parts);
}
function columnCage(h) {
  const parts = [];
  for (const [x, z] of [[-0.08, -0.08], [0.08, -0.08], [0.08, 0.08], [-0.08, 0.08]]) { const g = new THREE.CylinderGeometry(0.012, 0.012, h + 0.5, 5); g.translate(x, (h + 0.5) / 2, z); parts.push(g); }
  for (let y = 0.1; y < h + 0.4; y += 0.2) { const g = new THREE.TorusGeometry(0.115, 0.006, 3, 4); g.rotateX(Math.PI / 2); g.rotateY(Math.PI / 4); g.translate(0, y, 0); parts.push(g); }
  return mergeGeometries(parts);
}
const geoCache = {};
function cached(key, fn) { return geoCache[key] || (geoCache[key] = fn()); }

export function wallMesh(w, ops, y0, material) {
  const sh = B.wallShape(w, ops, B.FLOOR_H);
  const g = new THREE.ExtrudeGeometry(sh, { depth: B.WALL_T, bevelEnabled: false });
  const m = new THREE.Mesh(g, material);
  m.position.set(w.a[0] - w.out[0] * (B.WALL_T / 2), y0, w.a[1] - w.out[1] * (B.WALL_T / 2));
  m.rotation.y = w.yaw;
  m.castShadow = m.receiveShadow = true;
  return m;
}

// a pitched roof: gable walls, timber trusses and two roof planes that grow from eave to ridge
export function pitchedRoof(L, proj, top, M) {
  const pitch = ROOF_PITCH[proj.roof] || 0.4;
  const hw = L.hw, hd = L.hd, over = 0.6;
  const tan = Math.tan(pitch);
  const g = new THREE.Group();
  // gables
  const gables = new THREE.Group();
  for (const sx of [-1, 1]) {
    const shp = new THREE.Shape();
    shp.moveTo(-hd, 0); shp.lineTo(hd, 0); shp.lineTo(0, hd * tan); shp.closePath();
    const geo = new THREE.ExtrudeGeometry(shp, { depth: B.WALL_T, bevelEnabled: false });
    const m = new THREE.Mesh(geo, M.brickWall);
    m.rotation.y = Math.PI / 2;
    m.position.set(sx * hw - B.WALL_T / 2, top, 0);
    m.castShadow = m.receiveShadow = true;
    gables.add(m);
  }
  g.add(gables);
  // trusses
  const trusses = [];
  const n = Math.max(3, Math.round((2 * hw) / 2) + 1);
  for (let k = 0; k < n; k++) {
    const x = -hw + 0.3 + ((2 * hw - 0.6) * k) / (n - 1);
    const t = new THREE.Group();
    const chord = box(0.1, 0.14, 2 * hd + 0.2, M.timber, 0, 0.07, 0);
    t.add(chord);
    const raf = Math.hypot(hd + over, (hd + over) * tan);
    for (const sz of [-1, 1]) {
      const r = box(0.1, 0.14, raf, M.timber, 0, ((hd - over) * tan) / 2, (sz * (hd + over)) / 2);
      r.rotation.x = sz * pitch;
      t.add(r);
    }
    const king = box(0.1, hd * tan, 0.1, M.timber, 0, (hd * tan) / 2, 0);
    t.add(king);
    t.position.set(x, top, 0);
    t.userData.home = t.position.clone();
    g.add(t);
    trusses.push(t);
  }
  // roof planes (pivot at the eave so they can grow up the slope)
  const len = (hd + over) / Math.cos(pitch);
  const mat = roofMat(proj.roof);
  const covers = [];
  for (const sz of [1, -1]) {
    const half = new THREE.Group();
    half.rotation.y = sz > 0 ? 0 : Math.PI;
    const pivot = new THREE.Group();
    pivot.position.set(0, top - over * tan + 0.08, hd + over);
    pivot.rotation.x = pitch - Math.PI / 2; // local +y climbs to the ridge
    const geo = new THREE.PlaneGeometry(2 * hw + 1.0, len);
    geo.translate(0, len / 2, 0);
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = m.receiveShadow = true;
    pivot.add(m);
    half.add(pivot);
    g.add(half);
    covers.push(pivot);
  }
  // ridge cap
  const ridge = box(2 * hw + 1.0, 0.18, 0.4, proj.roof === 'tin' ? PBR.steel : mats().concrete, 0, top + hd * tan + 0.12, 0);
  g.add(ridge);
  return { g, gables, trusses, covers, ridge, tan, over };
}

// ---------- build the whole site from saved state ----------
export function buildSite(site, ps, game) {
  const M = mats();
  const root = site.root;
  for (const c of [...root.children]) { root.remove(c); }
  const h = site.h = { segCovers: {}, segFills: {}, segCages: {}, cols: {}, colShutters: {}, fits: {}, skins: {}, garden: {}, debris: {}, pegs: {}, ghosts: [] };
  const L = site.L, proj = site.proj;
  const st = ps.done ? 99 : ps.stage;
  const f0 = ps.done ? proj.floors - 1 : ps.floor || 0;
  const pr = ps.progress || {};
  const hw = L.hw, hd = L.hd;
  const add = (o) => { root.add(o); return o; };
  const pitOpen = st >= ST.dig && st <= ST.plinth;
  site.setHole(pitOpen ? [hw + TW / 2, hd + TW / 2] : null);
  if (!ps.unlocked) return h;

  // ---- ground ----
  if (st > ST.clear) {
    const shp = new THREE.Shape();
    shp.moveTo(-11.8, -10.8); shp.lineTo(11.8, -10.8); shp.lineTo(11.8, 10.8); shp.lineTo(-11.8, 10.8); shp.closePath();
    if (pitOpen) {
      const ho = new THREE.Path();
      const ex = hw + TW / 2, ez = hd + TW / 2;
      ho.moveTo(-ex, -ez); ho.lineTo(-ex, ez); ho.lineTo(ex, ez); ho.lineTo(ex, -ez); ho.closePath();
      shp.holes.push(ho);
    }
    const geo = new THREE.ShapeGeometry(shp);
    geo.rotateX(-Math.PI / 2);
    const ground = new THREE.Mesh(geo, st > ST.handover ? M.lawn : M.soil);
    ground.position.y = 0.03; ground.receiveShadow = true;
    h.ground = add(ground);
  }
  // ---- debris ----
  if (st <= ST.clear) {
    const cleared = new Set(pr.cleared || []);
    for (const d of debrisList(site.i)) {
      if (cleared.has(d.k)) continue;
      const o = new THREE.Group();
      o.position.set(d.x, 0, d.z); o.rotation.y = d.rot;
      if (d.kind === 'rock') {
        const m = new THREE.Mesh(cached('rock', () => new THREE.DodecahedronGeometry(0.55, 0)), M.rock);
        m.scale.set(d.s, d.s * 0.6, d.s * 0.9); m.position.y = 0.2; m.castShadow = true; o.add(m);
      } else if (d.kind === 'tyre') {
        const m = new THREE.Mesh(cached('tyre', () => new THREE.TorusGeometry(0.4, 0.15, 8, 16)), PBR.rubber);
        m.rotation.x = Math.PI / 2; m.position.y = 0.15; m.castShadow = true; o.add(m);
      } else {
        const id = d.kind === 'bush' ? 'wild_rooibos_bush' : d.kind === 'crate' ? 'wooden_crate_01' : 'barrel_03';
        const sc = d.kind === 'bush' ? 1.6 * d.s : 1;
        const stub = new THREE.Mesh(cached('stub', () => new THREE.SphereGeometry(0.6, 8, 6)), new THREE.MeshStandardMaterial({ color: 0x4f6b2a, roughness: 1 }));
        stub.visible = d.kind === 'bush'; stub.scale.set(d.s, d.s * 0.6, d.s); stub.position.y = 0.3; o.add(stub);
        Assets.model(id, sc).then((m) => { if (o.parent) { o.add(m); stub.visible = false; } }).catch(() => {});
      }
      o.userData = { debris: d };
      h.debris[d.k] = add(o);
    }
  }
  // ---- survey pegs and string lines ----
  const pegPts = [[-hw - 1, hd + 1], [hw + 1, hd + 1], [hw + 1, -hd - 1], [-hw - 1, -hd - 1]];
  h.pegPts = pegPts;
  if (st <= ST.footing) {
    const placed = st > ST.survey ? 4 : (pr.pegs || 0);
    for (let k = 0; k < placed; k++) h.pegs[k] = add(pegMesh(pegPts[k]));
    if (placed > 1) {
      const pts = [];
      for (let k = 0; k < placed; k++) pts.push(new THREE.Vector3(pegPts[k][0], 0.45, pegPts[k][1]));
      if (placed === 4) pts.push(pts[0].clone());
      h.strings = add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), M.string));
      // chalk outline of the walls
      if (placed === 4 && st >= ST.clear) {
        const o = [[-hw, hd], [hw, hd], [hw, -hd], [-hw, -hd], [-hw, hd]].map(([x, z]) => new THREE.Vector3(x, 0.06, z));
        add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(o), new THREE.LineBasicMaterial({ color: 0xfafafa })));
      }
    }
  }
  // ---- trench pit ----
  if (pitOpen) {
    const ex = hw + TW / 2, ez = hd + TW / 2, ix = hw - TW / 2, iz = hd - TW / 2;
    add(box(2 * ex, D, 2 * ez, M.pit, 0, -D / 2 + 0.03, 0)).castShadow = false;
    add(box(2 * ix, D, 2 * iz, M.pitIn, 0, -D / 2 + 0.02, 0));
    const top = new THREE.Mesh(new THREE.PlaneGeometry(2 * ix, 2 * iz), M.soil);
    top.rotation.x = -Math.PI / 2; top.position.y = 0.031; top.receiveShadow = true;
    const tuv = top.geometry.attributes.uv; for (let i = 0; i < tuv.count; i++) tuv.setXY(i, tuv.getX(i) * 2 * ix, tuv.getY(i) * 2 * iz);
    add(top);
    const dug = new Set(st > ST.dig ? site.segs.map((s) => s.k) : pr.dug || []);
    for (const s of site.segs) {
      if (!dug.has(s.k)) {
        const c = box(s.len, 0.08, TW + 0.02, M.soil, s.x, 0.0, s.z);
        c.rotation.y = s.yaw;
        h.segCovers[s.k] = add(c);
      }
      // steel cages
      const caged = st > ST.steel || (st === ST.steel && (pr.cages || []).includes(s.k));
      if (caged) h.segCages[s.k] = add(cageMesh(s));
      // footing concrete
      const fill = st > ST.footing ? B.FOOTING_H : st === ST.footing ? (pr.fill || {})[s.k] || 0 : 0;
      const fm = box(s.len, 1, TW, st === ST.footing ? M.wet : M.concrete, s.x, -D + 0.03, s.z);
      fm.rotation.y = s.yaw; fm.geometry.translate(0, 0.5, 0);
      fm.scale.y = Math.max(0.001, fill); fm.visible = fill > 0;
      h.segFills[s.k] = add(fm);
    }
    // heaps of dug soil beside the trenches; they go back in when the plinth is filled
    h.heaps = [];
    for (const s of site.segs) if (dug.has(s.k)) h.heaps.push(add(heapMesh(s, 1)));
    if (st === ST.plinth) setHeaps(h, 1 - (pr.backfill || 0));
  }
  // ---- plinth ----
  if (st === ST.plinth) {
    const ring = new THREE.Group();
    for (const w of L.walls) {
      const [x, z] = wallPoint(w, w.len / 2);
      const m = box(w.len + B.WALL_T + 0.1, 1, B.WALL_T + 0.12, M.brickWall, x, -D + B.FOOTING_H + 0.03, z);
      m.geometry.translate(0, 0.5, 0); m.rotation.y = w.yaw;
      ring.add(m);
    }
    ring.userData.h0 = D - B.FOOTING_H + B.PLINTH;
    h.plinthRing = add(ring);
    setPlinth(h, pr.plinth || 0);
    const fill = box(2 * (hw - B.WALL_T / 2 - 0.06), 1, 2 * (hd - B.WALL_T / 2 - 0.06), M.soil, 0, 0.03, 0);
    fill.geometry.translate(0, 0.5, 0);
    h.infill = add(fill);
    // backfill outside the plinth wall fills the trench
    const bf = new THREE.Group();
    for (const s of site.segs) { const c = box(s.len, 1, TW + 0.02, M.soil, s.x, -D + B.FOOTING_H + 0.03, s.z); c.geometry.translate(0, 0.5, 0); c.rotation.y = s.yaw; bf.add(c); }
    h.backfill = add(bf);
    setBackfill(h, pr.backfill || 0);
    h.dpc = add(box(2 * hw + 0.35, 0.03, 2 * hd + 0.35, M.dpc, 0, B.PLINTH + 0.03, 0));
    h.dpc.visible = !!pr.dpc;
  } else if (st > ST.plinth) {
    const pm = st > ST.finish ? paintMat('#8b5a4a') : M.concrete;
    add(box(2 * hw + 0.3, B.PLINTH + 0.05, 2 * hd + 0.3, pm, 0, (B.PLINTH + 0.05) / 2, 0));
  }
  // ---- floors ----
  const finished = st > ST.finish;
  const wallMat = finished ? paintMat(ps.colors?.walls || ps.design?.color || '#f3efe4') : M.brickWall;
  for (let f = 0; f < proj.floors; f++) {
    const s = f < f0 ? 99 : f === f0 ? st : -1;
    if (s < ST.columns) continue;
    const y0 = B.floorBase(f);
    // columns
    for (const c of columnSpots(L, f)) {
      const key = `${f}:${c.k}`;
      if (s > ST.columns) { add(box(B.COL, B.FLOOR_H, B.COL, finished ? wallMat : M.concrete, c.x, y0 + B.FLOOR_H / 2, c.z)); continue; }
      const cage = new THREE.Mesh(cached('ccage', () => columnCage(B.FLOOR_H)), M.steel);
      cage.position.set(c.x, y0, c.z); add(cage);
      const poured = (pr.cols || []).includes(c.k);
      const conc = box(B.COL, 1, B.COL, M.wet, c.x, y0, c.z);
      conc.geometry.translate(0, 0.5, 0); conc.scale.y = poured ? B.FLOOR_H : 0.001; conc.visible = poured;
      h.cols[c.k] = add(conc);
      const sh = new THREE.Group();
      for (const [dx, dz, w, d] of [[0, 0.16, 0.36, 0.03], [0, -0.16, 0.36, 0.03], [0.16, 0, 0.03, 0.36], [-0.16, 0, 0.03, 0.36]]) sh.add(box(w, B.FLOOR_H, d, M.ply, dx, B.FLOOR_H / 2, dz));
      sh.position.set(c.x, y0, c.z);
      h.colShutters[c.k] = add(sh);
      void key;
    }
    // walls
    const ops = L.ops(f);
    if (s > ST.walls) {
      for (const w of L.walls) add(wallMesh(w, ops[w.id], y0, wallMat));
    } else if (s === ST.walls) {
      const bs = B.brickSlots(L, f);
      h.brickSlots = bs;
      const im = new THREE.InstancedMesh(cached('brick', () => new THREE.BoxGeometry(B.BRICK.pitchL - 0.004, B.BRICK.pitchH - 0.003, B.BRICK.t)), M.brickUnit, bs.slots.length);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
      bs.slots.forEach((b, k) => {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), b.yaw);
        m4.compose(new THREE.Vector3(b.x, b.y, b.z), q, new THREE.Vector3(1, 1, 1));
        im.setMatrixAt(k, m4);
        col.setRGB(0.62 * b.shade, 0.25 * b.shade, 0.16 * b.shade, THREE.SRGBColorSpace);
        im.setColorAt(k, col);
      });
      im.castShadow = im.receiveShadow = true;
      im.count = Math.min(bs.slots.length, pr.bricks || 0);
      h.bricks = add(im);
      h.lintels = bs.lintels.map((l) => {
        const m = box(l.len, 0.15, B.WALL_T + 0.01, M.concrete, l.x, l.y, l.z);
        m.rotation.y = l.yaw; m.visible = false;
        return add(m);
      });
      setBricks(h, im.count);
    }
    // slab
    const top = f === proj.floors - 1;
    const slab = !top || proj.roof === 'flat';
    const yTop = y0 + B.FLOOR_H;
    if (s > ST.roof) {
      if (slab) {
        add(box(2 * hw + 0.3, B.SLAB_T, 2 * hd + 0.3, finished ? paintMat('#e8e2d6') : M.concrete, 0, yTop + B.SLAB_T / 2, 0));
        if (top) roofTop(add, L, yTop + B.SLAB_T, finished ? wallMat : M.concrete);
      } else {
        const r = pitchedRoof(L, proj, yTop, M);
        if (finished) r.gables.children.forEach((m) => { m.material = wallMat; });
        add(r.g);
      }
    } else if (s === ST.roof) {
      const rp = pr.roof || {};
      if (slab) {
        const deck = new THREE.Group();
        deck.add(box(2 * hw + 0.3, 0.04, 2 * hd + 0.3, M.ply, 0, yTop - 0.02, 0));
        for (let x = -hw + 0.8; x < hw; x += 1.4) for (let z = -hd + 0.8; z < hd; z += 1.4) deck.add(box(0.08, B.FLOOR_H, 0.08, M.prop, x, y0 + B.FLOOR_H / 2, z));
        deck.visible = !!rp.deck;
        h.deck = add(deck);
        const mesh = new THREE.Group();
        for (let x = -hw; x <= hw + 0.01; x += 0.3) mesh.add(box(0.016, 0.016, 2 * hd + 0.2, M.steel, x, yTop + 0.05, 0));
        for (let z = -hd; z <= hd + 0.01; z += 0.3) mesh.add(box(2 * hw + 0.2, 0.016, 0.016, M.steel, 0, yTop + 0.07, z));
        mesh.visible = !!rp.mesh;
        h.slabMesh = add(mesh);
        const sl = box(2 * hw + 0.3, B.SLAB_T, 2 * hd + 0.3, M.wet, -hw - 0.15, yTop + B.SLAB_T / 2, 0);
        sl.geometry.translate(hw + 0.15, 0, 0);
        h.slab = add(sl);
        setSlab(h, rp.pour || 0);
      } else {
        const r = pitchedRoof(L, proj, yTop, M);
        h.pitched = r;
        add(r.g);
        r.gables.children.forEach((m) => { m.scale.y = 1; });
        r.gables.visible = !!rp.gables || (rp.gablesK || 0) > 0;
        r.gables.children.forEach((m) => { m.scale.y = Math.max(0.001, rp.gablesK ?? (rp.gables ? 1 : 0)); });
        const placed = new Set(rp.trusses || []);
        r.trusses.forEach((t, k) => { t.visible = placed.has(k); });
        setCover(h, rp.cover || 0);
      }
    }
  }
  // ---- doors and windows ----
  if (st >= ST.fittings) {
    const done = st > ST.fittings ? null : new Set(pr.fit || []);
    for (const op of openings(L)) {
      if (done && !done.has(op.key)) continue;
      h.fits[op.key] = add(fittingAt(op));
    }
  }
  // ---- plaster and paint skins (in the finish stage) ----
  if (st === ST.finish) {
    for (let f = 0; f < proj.floors; f++) {
      const ops = L.ops(f);
      for (const w of L.walls) {
        const key = `${f}:${w.id}`;
        const geo = B.skinGeometry(w, ops[w.id], B.FLOOR_H);
        const mask = B.makeMask(w, B.FLOOR_H);
        const plastered = (pr.plaster || []).includes(key), painted = (pr.paint || []).includes(key);
        const m = new THREE.MeshStandardMaterial({ color: 0xe9e4da, roughness: 0.95, alphaMap: mask.tex, alphaTest: 0.5, normalMap: M.plaster.normalMap, normalScale: new THREE.Vector2(0.5, 0.5) });
        const skin = new THREE.Mesh(geo, m);
        B.placeSkin(skin, w, B.floorBase(f), 0.012);
        skin.receiveShadow = true;
        skin.userData = { skin: key, mask, w, f };
        if (plastered) B.fillMask(mask);
        if (painted) m.color.set(ps.colors?.walls || ps.design?.color || '#f3efe4');
        h.skins[key] = add(skin);
      }
    }
  }
  // ---- handover: floors and garden ----
  if (st >= ST.handover) {
    const pat = FLOOR_PATTERNS.find((p) => p.id === (pr.floorPat || ps.colors?.floor)) || (st > ST.handover ? FLOOR_PATTERNS[2] : null);
    if (pat) h.floor = add(floorMesh(L, pat));
    const placed = st > ST.handover ? null : new Set(pr.garden || []);
    for (const gi of gardenItems(L, proj)) {
      if (placed && !placed.has(gi.id)) continue;
      h.garden[gi.id] = add(gardenMesh(gi, ps, L));
    }
    if (st > ST.handover) {
      const lg = new THREE.PlaneGeometry(22.8, 10.6 - hd);
      const luv = lg.attributes.uv; for (let i = 0; i < luv.count; i++) luv.setXY(i, luv.getX(i) * 22.8, luv.getY(i) * (10.6 - hd));
      const lawn = new THREE.Mesh(lg, M.lawn);
      lawn.rotation.x = -Math.PI / 2; lawn.position.set(0, 0.045, (hd + 0.6 + 11.2) / 2 - 0.1); lawn.receiveShadow = true;
      add(lawn);
    }
  }
  void game;
  return h;
}

// ---------- small builders and setters used while working ----------
export function pegMesh([x, z]) {
  const g = new THREE.Group();
  const M = mats();
  const p = new THREE.Mesh(cached('peg', () => new THREE.CylinderGeometry(0.04, 0.03, 0.7, 6)), M.peg);
  p.position.y = 0.35; p.castShadow = true; g.add(p);
  g.position.set(x, 0, z);
  return g;
}
export function cageMesh(s) {
  const geo = cached(`cage${s.len.toFixed(2)}`, () => cageGeometry(s.len - 0.1, 0.5, 0.35, 0.15));
  const m = new THREE.Mesh(geo, mats().steel);
  m.position.set(s.x, -D + 0.1, s.z);
  m.rotation.y = s.yaw;
  m.castShadow = true;
  return m;
}
export function heapPos(s) {
  const out = s.w.out, dir = s.w.dir;
  return [s.x + out[0] * 3.2 + dir[0] * 1.2, s.z + out[1] * 3.2 + dir[1] * 1.2];
}
export function heapMesh(s, k) {
  const [x, z] = heapPos(s);
  const m = new THREE.Mesh(cached('heap', () => new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)), mats().soil);
  m.position.set(x, 0, z);
  m.scale.set(1.05 * Math.max(0.4, k), 0.55 * k, 0.95 * Math.max(0.4, k));
  m.userData = { seg: s.k, base: m.scale.clone() };
  m.castShadow = m.receiveShadow = true;
  return m;
}
export function setHeaps(h, k) {
  for (const m of h.heaps || []) { m.scale.y = Math.max(0.01, 0.55 * k); m.visible = k > 0.02; }
}
export function setPlinth(h, k) {
  if (!h.plinthRing) return;
  const H = h.plinthRing.userData.h0;
  h.plinthRing.children.forEach((m) => { m.scale.y = Math.max(0.001, H * k); });
}
export function setBackfill(h, k) {
  if (h.backfill) h.backfill.children.forEach((m) => { m.scale.y = Math.max(0.001, (D - B.FOOTING_H) * k); m.visible = k > 0; });
  if (h.infill) { h.infill.scale.y = Math.max(0.001, (B.PLINTH - 0.06) * k); h.infill.visible = k > 0; }
}
export function setBricks(h, n) {
  if (!h.bricks) return;
  h.bricks.count = n;
  const courses = h.brickSlots.courses;
  const total = h.brickSlots.slots.length;
  const course = total ? Math.floor((n / total) * courses) : 0;
  h.lintels.forEach((m, k) => { m.visible = course >= h.brickSlots.lintels[k].atCourse; });
}
export function setSlab(h, k) {
  if (!h.slab) return;
  h.slab.scale.x = Math.max(0.001, k);
  h.slab.visible = k > 0;
}
export function setCover(h, k) {
  if (!h.pitched) return;
  h.pitched.covers.forEach((c) => { c.scale.y = Math.max(0.001, k); c.visible = k > 0; });
  h.pitched.ridge.visible = k >= 1;
}
export function fittingAt(op) {
  const g = B.fitting(op.o);
  g.position.set(op.x, op.y, op.z);
  g.rotation.y = op.yaw;
  return g;
}
function roofTop(add, L, y, material) {
  const hw = L.hw + 0.15, hd = L.hd + 0.15;
  add(box(2 * hw, 0.9, 0.15, material, 0, y + 0.45, hd - 0.075));
  add(box(2 * hw, 0.9, 0.15, material, 0, y + 0.45, -hd + 0.075));
  add(box(0.15, 0.9, 2 * hd, material, hw - 0.075, y + 0.45, 0));
  add(box(0.15, 0.9, 2 * hd, material, -hw + 0.075, y + 0.45, 0));
  // black water tank on the terrace, a familiar Indian rooftop sight
  const t = new THREE.Mesh(cached('tank', () => new THREE.CylinderGeometry(0.55, 0.55, 1.1, 18)), mats().tankBlack);
  t.position.set(L.hw - 1.4, y + 0.85, -L.hd + 1.4); t.castShadow = true; add(t);
  add(box(1.4, 0.3, 1.4, mats().concrete, L.hw - 1.4, y + 0.15, -L.hd + 1.4));
}
function floorMesh(L, pat) {
  const M = mats();
  const w = 2 * (L.hw - B.WALL_T / 2), d = 2 * (L.hd - B.WALL_T / 2);
  const m = pat.id === 'chess' ? M.chess : M.floorTiles.clone();
  if (pat.id !== 'chess') m.color.set(pat.color);
  const geo = new THREE.PlaneGeometry(w, d);
  const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w * (pat.id === 'chess' ? 0.5 : 1), uv.getY(i) * d * (pat.id === 'chess' ? 0.5 : 1));
  const mesh = new THREE.Mesh(geo, m);
  mesh.rotation.x = -Math.PI / 2; mesh.position.y = B.PLINTH + 0.06; mesh.receiveShadow = true;
  return mesh;
}
export function gardenMesh(gi, ps, L) {
  const M = mats();
  const g = new THREE.Group();
  const wallC = paintMat(ps.colors?.walls || ps.design?.color || '#f3efe4');
  if (gi.id === 'path') {
    g.add(box(gi.w, gi.h, gi.d, M.paving, gi.x, gi.h / 2, gi.z));
  } else if (gi.id === 'wall') {
    const gx = gi.proj ? gardenItems(L, gi.proj)[2].x : 0;
    const seg = (x0, x1, z) => { if (x1 - x0 > 0.1) g.add(box(x1 - x0, 0.9, 0.2, wallC, (x0 + x1) / 2, 0.45, z)); };
    seg(-11.8, gx - 1.3, 10.8); seg(gx + 1.3, 11.8, 10.8); seg(-11.8, 11.8, -10.8);
    g.add(box(0.2, 0.9, 21.6, wallC, -11.8, 0.45, 0), box(0.2, 0.9, 21.6, wallC, 11.8, 0.45, 0));
  } else if (gi.id === 'gate') {
    for (const sx of [-1, 1]) g.add(box(0.4, 1.6, 0.4, wallC, gi.x + sx * 1.35, 0.8, gi.z));
    for (let k = 0; k < 9; k++) g.add(box(0.04, 1.2, 0.04, M.gate, gi.x - 1.0 + k * 0.25, 0.7, gi.z));
    g.add(box(2.2, 0.06, 0.06, M.gate, gi.x, 1.25, gi.z), box(2.2, 0.06, 0.06, M.gate, gi.x, 0.2, gi.z));
  } else if (gi.id === 'board') {
    const tex = canvasTexture(256, 64, (ctx, w, h) => {
      ctx.fillStyle = '#1d3b5c'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#f2c21c'; ctx.lineWidth = 4; ctx.strokeRect(3, 3, w - 6, h - 6);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 30px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(gi.proj.name.toUpperCase(), w / 2, h / 2, w - 16);
    });
    const b = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.55), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }));
    b.position.set(gi.x, 2.75, gi.z + 0.02);
    g.add(b);
  } else if (gi.id === 'plant0' || gi.id === 'plant1') {
    // a young tree inside a round brick tree-guard, as planted along Indian streets
    const leaf = new THREE.MeshStandardMaterial({ color: gi.id === 'plant0' ? 0x3f8f2f : 0x4f9a3a, roughness: 0.85 });
    const trunk = new THREE.Mesh(cached('trunk', () => new THREE.CylinderGeometry(0.07, 0.1, 1.8, 7)), M.prop);
    trunk.position.set(gi.x, 0.9, gi.z); trunk.castShadow = true; g.add(trunk);
    for (const [dx, dy, dz, r] of [[0, 2.0, 0, 0.75], [0.35, 1.7, 0.2, 0.55], [-0.3, 1.75, -0.2, 0.55], [0, 2.45, 0.1, 0.5]]) {
      const f = new THREE.Mesh(cached('leafball', () => new THREE.IcosahedronGeometry(1, 1)), leaf);
      f.position.set(gi.x + dx, dy, gi.z + dz); f.scale.setScalar(r); f.castShadow = true; g.add(f);
    }
    const ring = new THREE.Mesh(cached('guard', () => new THREE.CylinderGeometry(0.55, 0.55, 0.9, 16, 1, true)), new THREE.MeshStandardMaterial({ map: mats().brickWall.map, color: 0xffffff, side: THREE.DoubleSide, roughness: 0.9 }));
    ring.position.set(gi.x, 0.45, gi.z); ring.castShadow = true; g.add(ring);
  } else {
    // a flowering bush: green mound dotted with blossoms
    const bush = new THREE.Mesh(cached('leafball', () => new THREE.IcosahedronGeometry(1, 1)), new THREE.MeshStandardMaterial({ color: 0x3d7f2c, roughness: 0.9 }));
    bush.position.set(gi.x, 0.45, gi.z); bush.scale.set(0.8, 0.55, 0.8); bush.castShadow = true; g.add(bush);
    const cols = [0xff4f8b, 0xffd23f, 0xff7a2f];
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2 + gi.x, r = 0.45 + (k % 3) * 0.15;
      const fl = new THREE.Mesh(cached('blossom', () => new THREE.SphereGeometry(0.07, 6, 4)), new THREE.MeshStandardMaterial({ color: cols[k % 3], roughness: 0.6 }));
      fl.position.set(gi.x + Math.cos(a) * r, 0.55 + (k % 4) * 0.1, gi.z + Math.sin(a) * r);
      g.add(fl);
    }
    g.add(box(1.4, 0.08, 1.4, M.soil, gi.x, 0.05, gi.z));
  }
  return g;
}
