// Countryside scenery: trees, coconut palms, paddy fields, villages, kilns, silos, factories, flower fields.
// Everything is instanced and grouped into tiles so distant tiles can be hidden.
import * as THREE from 'three';
import { part, mat, mergeGeos, canvasTexture, rng, smoothstep, fbm, clamp } from './util.js';
import { M, box, cyl, beam, cargoGeometry } from './models.js';
import { WATER_LEVEL, RIVER_HALF } from './terrain.js';

const TILE = 600;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

function blob(r, color, x, y, z, sx = 1, sy = 1, sz = 1, detail = 1) {
  return part(new THREE.IcosahedronGeometry(r, detail), color, mat(x, y, z, 0, 0, 0, sx, sy, sz));
}

function makeTreeGeos() {
  const G = {};
  {
    const l = [];
    cyl(l, '#5b4030', 0.22, 0.34, 3.2, 0, 1.6, 0, 0, 0, 0, 7);
    l.push(blob(2.4, '#3f7a2c', 0, 4.6, 0, 1.2, 0.85, 1.2));
    l.push(blob(1.8, '#4d8a34', 1.3, 5.4, 0.4, 1, 0.8, 1, 0));
    l.push(blob(1.7, '#36702a', -1.1, 5.2, -0.6, 1, 0.8, 1, 0));
    G.round = mergeGeos(l);
  }
  {
    const l = [];
    cyl(l, '#6a5240', 0.25, 0.4, 7.5, 0, 3.75, 0, 0, 0, 0, 7);
    l.push(blob(2.2, '#2f5f22', 0, 8.0, 0, 1, 1.25, 1));
    l.push(blob(1.9, '#3a6e28', 0.3, 10.4, 0.2, 1, 1.1, 1, 0));
    l.push(blob(1.4, '#2b5a20', -0.2, 12.2, 0, 1, 1.1, 1, 0));
    G.tall = mergeGeos(l);
  }
  {
    // coconut palm: bent trunk + drooping fronds
    const l = [];
    const segs = 7, H = 10;
    for (let i = 0; i < segs; i++) {
      const y0 = (i / segs) * H, y1 = ((i + 1) / segs) * H;
      const bend = (y) => 0.025 * y * y;
      beam(l, i % 2 ? '#7b6550' : '#6c5845', V(bend(y0), y0, 0), V(bend(y1), y1, 0), 0.42 - i * 0.03, true);
    }
    const tx = 0.025 * H * H, ty = H;
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      const g = new THREE.PlaneGeometry(1.1, 5, 1, 5);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i) + 2.5; // 0..5 along leaf
        const w = Math.sin((y / 5) * Math.PI) * 0.9 + 0.1;
        p.setX(i, p.getX(i) * w);
        p.setZ(i, -0.06 * y * y);
        p.setY(i, y);
      }
      g.rotateX(-Math.PI / 2 + 0.55);
      g.rotateY(a);
      g.translate(tx, ty, 0);
      g.computeVertexNormals();
      l.push(part(g, k % 2 ? '#4f8a2c' : '#5f9a34'));
    }
    for (let k = 0; k < 4; k++) l.push(blob(0.22, '#7a6a2a', tx + Math.cos(k * 1.6) * 0.35, ty - 0.35, Math.sin(k * 1.6) * 0.35, 1, 1, 1, 0));
    G.palm = mergeGeos(l);
  }
  {
    const l = [];
    cyl(l, '#7e8a4a', 0.15, 0.2, 1.8, 0, 0.9, 0, 0, 0, 0, 6);
    for (let k = 0; k < 6; k++) {
      const g = new THREE.PlaneGeometry(0.7, 2.4, 1, 3);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const y = p.getY(i) + 1.2; p.setY(i, y); p.setZ(i, -0.12 * y * y); }
      g.rotateX(-0.5); g.rotateY((k / 6) * Math.PI * 2); g.translate(0, 1.7, 0);
      g.computeVertexNormals();
      l.push(part(g, '#6aa83a'));
    }
    G.banana = mergeGeos(l);
  }
  G.bush = mergeGeos([blob(1.2, '#4a7a30', 0, 0.6, 0, 1.3, 0.7, 1.1, 0), blob(0.9, '#558a36', 0.8, 0.5, 0.3, 1, 0.7, 1, 0)]);
  G.rock = mergeGeos([part(new THREE.DodecahedronGeometry(1, 0), '#8a8580', mat(0, 0.3, 0, 0, 0, 0, 1.4, 0.8, 1.1))]);
  {
    const l = [];
    cyl(l, '#d8b85a', 1.6, 1.8, 1.6, 0, 0.8, 0, 0, 0, 0, 10);
    l.push(part(new THREE.ConeGeometry(1.8, 1.8, 10), '#c9a84a', mat(0, 2.5, 0)));
    G.hay = mergeGeos(l);
  }
  {
    const l = [];
    box(l, '#f2efe8', 0.8, 0.8, 1.8, 0, 1.15, 0);
    box(l, '#f2efe8', 0.5, 0.5, 0.6, 0, 1.45, 1.1);
    box(l, '#d9b8a8', 0.3, 0.25, 0.25, 0, 1.3, 1.45);
    for (const [x, z] of [[-0.28, 0.7], [0.28, 0.7], [-0.28, -0.7], [0.28, -0.7]]) box(l, '#e6e1d8', 0.16, 0.8, 0.16, x, 0.4, z);
    box(l, '#888', 0.08, 0.3, 0.08, -0.2, 1.8, 1.0, 0, 0, 0.5);
    box(l, '#888', 0.08, 0.3, 0.08, 0.2, 1.8, 1.0, 0, 0, -0.5);
    G.cow = mergeGeos(l);
  }
  return G;
}

export class Scenery {
  constructor(world) {
    this.world = world;
    this.track = world.track;
    this.terrain = world.terrain;
    this.geos = makeTreeGeos();
    this.inst = new Map(); // tileKey -> {type -> {m:[], c:[]}}
    this.houses = new Map();
    this.fields = [];
    this.rand = rng(4242);
    this.density = 1;
  }

  add(type, x, z, yaw, sc, color, y = null, yScale = 1) {
    const key = `${Math.floor(x / TILE)},${Math.floor(z / TILE)}`;
    let t = this.inst.get(key);
    if (!t) { t = {}; this.inst.set(key, t); }
    if (!t[type]) t[type] = { m: [], c: [] };
    const yy = y == null ? this.terrain.heightAt(x, z) - 0.15 : y;
    t[type].m.push(mat(x, yy, z, 0, yaw, 0, sc, sc * yScale, sc));
    t[type].c.push(color || new THREE.Color().setRGB(1, 1, 1, THREE.SRGBColorSpace));
  }

  // simple rural / town house; registers obstacles
  addHouse(x, z, yaw, w, d, h, color, roof = 'gable', tank = false) {
    const y = this.terrain.heightAt(x, z) - 0.2;
    const key = `${Math.floor(x / TILE)},${Math.floor(z / TILE)}`;
    let t = this.houses.get(key);
    if (!t) { t = { body: [], roof: [], flat: [], tank: [] }; this.houses.set(key, t); }
    t.body.push({ m: mat(x, y, z, 0, yaw, 0, w, h, d), c: new THREE.Color(color) });
    const r = this.rand;
    if (roof === 'gable') {
      const rc = new THREE.Color().setHSL(0.03 + r() * 0.03, 0.55, 0.35 + r() * 0.1, THREE.SRGBColorSpace);
      t.roof.push({ m: mat(x, y + h, z, 0, yaw, 0, w + 0.6, 1.2 + w * 0.12, d + 0.6), c: rc });
    } else {
      t.flat.push({ m: mat(x, y + h, z, 0, yaw, 0, w + 0.2, 0.5, d + 0.2), c: new THREE.Color(color).multiplyScalar(0.92) });
      if (tank) t.tank.push({ m: mat(x + w * 0.2, y + h + 0.5, z, 0, 0, 0, 1, 1, 1), c: new THREE.Color().setRGB(0.15, 0.15, 0.15, THREE.SRGBColorSpace) });
    }
    this.world.addBoxObstacle(x, z, w / 2 + 0.3, d / 2 + 0.3, yaw, y + h + 2);
  }

  isFree(x, z, opts = {}) {
    const w = this.world;
    const nt = this.track.nearest(x, z, 80);
    if (nt.d < (opts.track ?? 14)) return false;
    if (this.terrain.riverDist(x, z) < RIVER_HALF + (opts.river ?? 5)) return false;
    if (w.roadDist(x, z, 20).d < (opts.road ?? 4)) return false;
    const tc = this.terrain.townCenter;
    if (!opts.town && Math.hypot(x - tc.x, z - tc.z) < 370) return false;
    for (const st of w.stations) {
      if (Math.hypot(x - st.x, z - st.z) < (opts.station ?? 120) && nt.side < 0 && nt.d < 60) return false;
    }
    for (const f of this.fields) if (Math.abs(x - f.x) < f.hw + 2 && Math.abs(z - f.z) < f.hd + 2) return false;
    if (this.reserved) for (const r of this.reserved) if (Math.hypot(x - r.x, z - r.z) < r.r) return false;
    return { nt };
  }
  reserve(x, z, r) { (this.reserved ||= []).push({ x, z, r }); }

  framePos(st, ds, lat) {
    const o = this.track.sample(st.s + ds, {});
    return { x: o.x + o.nx * lat, z: o.z + o.nz * lat, yaw: Math.atan2(o.tx, o.tz) };
  }

  // ----- regional features -----
  village(st, ds, lat, n, radius, opts = {}) {
    const c = this.framePos(st, ds, lat);
    const r = this.rand;
    const colors = ['#f3efe4', '#e9d8b6', '#a9cfe6', '#efc0c8', '#f2d27a', '#c6e2b5', '#e8b98a', '#ffffff'];
    let placed = 0;
    this.reserve(c.x, c.z, radius * 0.4);
    for (let tries = 0; tries < n * 6 && placed < n; tries++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * radius;
      const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
      if (!this.isFree(x, z, { track: 30, road: 6 })) continue;
      const nrm = this.terrain.normalAt(x, z);
      if (nrm.y < 0.95) continue;
      const w = 5 + r() * 4, dd = 5 + r() * 3, h = 3 + r() * 1.5;
      const yaw = c.yaw + Math.round(r() * 4) * (Math.PI / 2) + (r() - 0.5) * 0.2;
      const flat = r() < (opts.flat ?? 0.35);
      this.addHouse(x, z, yaw, w, dd, h, colors[Math.floor(r() * colors.length)], flat ? 'flat' : 'gable', flat && r() < 0.6);
      placed++;
      if (r() < 0.3) this.add('cow', x + 6, z + 3, r() * 6, 1, new THREE.Color(r() < 0.5 ? 1 : 0.7, r() < 0.5 ? 1 : 0.55, r() < 0.5 ? 1 : 0.4));
      if (r() < 0.5) this.add(opts.palms ? 'palm' : 'round', x - 7, z - 5, r() * 6, 0.8 + r() * 0.4, new THREE.Color().setHSL(0.28, 0.4, 0.45 + r() * 0.2, THREE.SRGBColorSpace));
    }
    // a small temple
    if (opts.temple !== false) {
      const t = this.framePos(st, ds + radius * 0.3, lat);
      if (this.isFree(t.x, t.z, { track: 30 })) this.temple(t.x, t.z, t.yaw, 0.8);
    }
  }

  temple(x, z, yaw, s = 1) {
    const l = [];
    box(l, '#efe9dc', 6 * s, 3 * s, 6 * s, 0, 1.5 * s, 0);
    for (let k = 0; k < 5; k++) {
      const w = (5 - k * 0.9) * s;
      box(l, k % 2 ? '#f7f1e3' : '#e8dcc0', w, 1.4 * s, w, 0, (3.7 + k * 1.3) * s, 0);
    }
    cyl(l, '#e0a21b', 0.3 * s, 0.5 * s, 1.2 * s, 0, 10.5 * s, 0, 0, 0, 0, 8);
    box(l, '#e86a1a', 0.05, 1.0 * s, 1.4 * s, 0.75 * s, 11.6 * s, 0);
    box(l, '#6a4a3a', 1.5 * s, 2.0 * s, 0.1, 0, 1.0 * s, 3.02 * s);
    const m = new THREE.Mesh(mergeGeos(l), M.vc);
    m.position.set(x, this.terrain.heightAt(x, z) - 0.1, z);
    m.rotation.y = yaw;
    m.castShadow = true;
    this.world.addTile(m, x, z);
    this.world.addBoxObstacle(x, z, 3.5 * s, 3.5 * s, yaw, m.position.y + 12 * s);
  }

  paddy(st, ds0, ds1, lat0, lat1, sizeMin = 28, sizeMax = 48) {
    const r = this.rand;
    for (let ds = ds0; ds < ds1; ds += sizeMax + 4) {
      for (let lat = lat0; lat0 < lat1 ? lat < lat1 : lat > lat1; lat += (lat0 < lat1 ? 1 : -1) * (sizeMax * 0.8 + 3)) {
        const p = this.framePos(st, ds + r() * 6, lat);
        const hw = (sizeMin + r() * (sizeMax - sizeMin)) / 2, hd = (sizeMin + r() * (sizeMax - sizeMin)) / 2 * 0.8;
        // all corners must be clear and fairly flat
        let ok = true, ys = [];
        for (const [cx, cz] of [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd], [0, 0]]) {
          const x = p.x + cx, z = p.z + cz;
          if (!this.isFree(x, z, { track: 16, road: 5 })) { ok = false; break; }
          ys.push(this.terrain.heightAt(x, z));
        }
        if (!ok) continue;
        const ymin = Math.min(...ys), ymax = Math.max(...ys);
        if (ymax - ymin > 1.2) continue;
        this.fields.push({ x: p.x, z: p.z, hw, hd });
        const flooded = r() < 0.3;
        const col = flooded ? new THREE.Color().setRGB(0.42, 0.6, 0.55, THREE.SRGBColorSpace) : new THREE.Color().setHSL(0.2 + r() * 0.07, 0.42, 0.34 + r() * 0.1, THREE.SRGBColorSpace);
        this.add('field', p.x, p.z, 0, 1, col, ymax + 0.12, 1);
        const last = this.inst.get(`${Math.floor(p.x / TILE)},${Math.floor(p.z / TILE)}`).field;
        last.m[last.m.length - 1] = mat(p.x, ymax - 0.25, p.z, 0, 0, 0, hw * 2, 0.4 + (ymax - ymin), hd * 2);
        this.add('bund', p.x, p.z, 0, 1, new THREE.Color().setRGB(0.45, 0.36, 0.25, THREE.SRGBColorSpace), ymax - 0.3);
        const lb = this.inst.get(`${Math.floor(p.x / TILE)},${Math.floor(p.z / TILE)}`).bund;
        lb.m[lb.m.length - 1] = mat(p.x, ymax - 0.32 - (ymax - ymin), p.z, 0, 0, 0, hw * 2 + 1.0, 0.4 + (ymax - ymin), hd * 2 + 1.0);
      }
    }
  }

  flowerFields(st, ds0, ds1, lat0, lat1) {
    const r = this.rand;
    const cols = ['#f29a1a', '#f5c518', '#e8452e', '#f7f2e8', '#d94f9a'];
    for (let ds = ds0; ds < ds1; ds += 30) for (let lat = lat0; lat > lat1; lat -= 24) {
      const p = this.framePos(st, ds, lat);
      if (!this.isFree(p.x, p.z, { track: 18 })) continue;
      const y = this.terrain.heightAt(p.x, p.z);
      const c = new THREE.Color(cols[Math.floor(r() * cols.length)]);
      for (let row = 0; row < 8; row++) {
        const off = (row - 3.5) * 2.4;
        this.add('flowerRow', p.x + Math.cos(p.yaw) * off, p.z - Math.sin(p.yaw) * off, p.yaw, 1, c, y - 0.1);
      }
      this.fields.push({ x: p.x, z: p.z, hw: 12, hd: 12 });
    }
  }

  kilns(st) {
    const r = this.rand;
    const smokes = [];
    for (let k = 0; k < 3; k++) {
      const p = this.framePos(st, -60 + k * 70, -95 - (k % 2) * 30);
      const y = this.terrain.heightAt(p.x, p.z);
      const l = [];
      box(l, '#9c4a32', 30, 3, 14, 0, 1.5, 0);
      box(l, '#7c3a28', 26, 0.6, 10, 0, 3.3, 0);
      cyl(l, '#a8503a', 1.1, 1.8, 26, 0, 13, 0, 0, 0, 0, 12);
      cyl(l, '#3a2a22', 1.15, 1.15, 0.8, 0, 26, 0, 0, 0, 0, 12);
      const m = new THREE.Mesh(mergeGeos(l), M.vc);
      m.position.set(p.x, y - 0.2, p.z); m.rotation.y = p.yaw;
      m.castShadow = true; m.receiveShadow = true;
      this.world.addTile(m, p.x, p.z);
      this.world.addBoxObstacle(p.x, p.z, 15, 7, p.yaw, y + 26);
      this.reserve(p.x, p.z, 22);
      smokes.push(new THREE.Vector3(p.x, y + 26.5, p.z));
      for (let j = 0; j < 10; j++) {
        const q = this.framePos(st, -70 + k * 70 + (j % 5) * 6, -60 - Math.floor(j / 5) * 6);
        if (!this.isFree(q.x, q.z, { track: 20 })) continue;
        const b = new THREE.Mesh(cargoGeometry('bricks', 2.4, 4.5), M.vc);
        b.position.set(q.x, this.terrain.heightAt(q.x, q.z), q.z); b.rotation.y = q.yaw;
        b.castShadow = true;
        this.world.addTile(b, q.x, q.z);
      }
    }
    this.smoke(smokes, 0x8a8580);
  }

  smoke(points, color) {
    const tex = canvasTexture(64, 64, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,0.8)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    });
    const parts = [];
    for (const p of points) {
      for (let i = 0; i < 9; i++) {
        const sm = new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, opacity: 0.5 });
        const sp = new THREE.Sprite(sm);
        sp.userData = { base: p, ph: i / 9 };
        this.world.group.add(sp);
        parts.push(sp);
      }
    }
    this.world.anim.push((dt, t) => {
      for (const sp of parts) {
        const ph = (t * 0.06 + sp.userData.ph) % 1;
        const b = sp.userData.base;
        sp.position.set(b.x + ph * 18, b.y + ph * 22, b.z + ph * 6);
        const s = 3 + ph * 16;
        sp.scale.set(s, s, 1);
        sp.material.opacity = 0.45 * (1 - ph);
      }
    });
  }

  cementWorks(st) {
    const p0 = this.framePos(st, 30, -90);
    const y = this.terrain.heightAt(p0.x, p0.z);
    const l = [];
    for (let k = 0; k < 3; k++) {
      cyl(l, '#d8d6cf', 4, 4, 20, -10 + k * 10, 12, 0, 0, 0, 0, 16);
      l.push(part(new THREE.ConeGeometry(4, 3, 16), '#bdbbb4', mat(-10 + k * 10, 23.5, 0)));
      l.push(part(new THREE.ConeGeometry(4, 3, 16), '#a9a7a0', mat(-10 + k * 10, 0.5, 0, Math.PI)));
      for (const sx of [-1, 1]) box(l, '#666', 0.4, 2, 0.4, -10 + k * 10 + sx * 3, 1, 0);
    }
    box(l, '#c9c6bc', 30, 0.6, 9, 0, 2.2, 0);
    box(l, '#b8b5ab', 16, 12, 12, 6, 6, 16);
    box(l, '#8d2a22', 16.4, 0.6, 12.4, 6, 12.3, 16);
    cyl(l, '#c9c6bc', 1.2, 1.6, 32, 16, 16, 20, 0, 0, 0, 12);
    beam(l, '#777', V(10, 22, 0), V(30, 4, -30), 1.2);
    const m = new THREE.Mesh(mergeGeos(l), M.vc);
    m.position.set(p0.x, y - 0.2, p0.z); m.rotation.y = p0.yaw;
    m.castShadow = true; m.receiveShadow = true;
    this.world.addTile(m, p0.x, p0.z);
    this.world.addBoxObstacle(p0.x, p0.z, 22, 22, p0.yaw, y + 32);
    this.reserve(p0.x, p0.z, 40);
    this.smoke([new THREE.Vector3(p0.x, y + 32, p0.z)], 0xcfcfca);
    // quarry rocks on hills
    const r = this.rand;
    for (let i = 0; i < 160; i++) {
      const p = this.framePos(st, (r() - 0.5) * 700, -140 - r() * 400);
      if (!this.isFree(p.x, p.z, { track: 25 })) continue;
      this.add('rock', p.x, p.z, r() * 6, 1 + r() * 3, new THREE.Color().setHSL(0.1, 0.05, 0.55 + r() * 0.2, THREE.SRGBColorSpace));
    }
  }

  factories(st) {
    for (let k = 0; k < 3; k++) {
      const p = this.framePos(st, -70 + k * 55, -80 - (k % 2) * 25);
      const y = this.terrain.heightAt(p.x, p.z);
      const l = [];
      box(l, '#d9d4c7', 34, 8, 18, 0, 4, 0);
      for (let i = 0; i < 5; i++) {
        const sh = new THREE.Shape();
        sh.moveTo(0, 0); sh.lineTo(6.8, 0); sh.lineTo(6.8, 0.3); sh.lineTo(0, 3); sh.closePath();
        const g = new THREE.ExtrudeGeometry(sh, { depth: 18, bevelEnabled: false });
        g.deleteAttribute('uv');
        g.translate(-17 + i * 6.8, 8, -9);
        l.push(part(g, i % 2 ? '#5f8fa8' : '#6a9ab2'));
      }
      cyl(l, '#9c4a32', 0.9, 1.3, 26, 14, 13, 6, 0, 0, 0, 10);
      box(l, ['#2f6db5', '#e0a21b', '#3d9b56'][k], 34.2, 1.2, 0.2, 0, 6.5, 9.05);
      const m = new THREE.Mesh(mergeGeos(l), M.vc);
      m.position.set(p.x, y - 0.2, p.z); m.rotation.y = p.yaw;
      m.castShadow = true; m.receiveShadow = true;
      this.world.addTile(m, p.x, p.z);
      this.world.addBoxObstacle(p.x, p.z, 17, 9, p.yaw, y + 26);
      this.reserve(p.x, p.z, 24);
    }
  }

  timberDepot(st) {
    const r = this.rand;
    for (let k = 0; k < 8; k++) {
      const p = this.framePos(st, -40 + k * 12, -48 - (k % 3) * 9);
      if (!this.isFree(p.x, p.z, { track: 20 })) continue;
      const m = new THREE.Mesh(cargoGeometry('timber', 3.2, 9), M.vc);
      m.position.set(p.x, this.terrain.heightAt(p.x, p.z), p.z);
      m.rotation.y = p.yaw + (r() - 0.5) * 0.2;
      m.castShadow = true;
      this.world.addTile(m, p.x, p.z);
      this.world.addBoxObstacle(p.x, p.z, 1.8, 4.8, m.rotation.y, m.position.y + 3);
      this.reserve(p.x, p.z, 7);
    }
  }

  // ----- trees over the whole map -----
  scatterTrees() {
    const t = this.terrain, w = this.world, r = this.rand;
    const step = 15;
    for (let x = -3500; x < 3500; x += step) for (let z = -2500; z < 2500; z += step) {
      const px = x + (r() - 0.5) * step * 0.9, pz = z + (r() - 0.5) * step * 0.9;
      const forest = t.regionWeight('VNG', px, pz, 1000);
      const palmy = t.regionWeight('DHN', px, pz, 650) + t.regionWeight('RGP', px, pz, 700) * 1.2;
      const rn = Math.hypot(px / 2000, pz / 1250);
      let dens = 0.02 + 0.045 * clamp(fbm(t.n3, px / 300, pz / 300, 2) + 0.2, 0, 1) + forest * 0.8 + palmy * 0.12;
      dens += smoothstep(1.3, 1.6, rn) * 0.08;
      const rd = t.riverDist(px, pz);
      if (rd < RIVER_HALF + 60) dens += 0.08;
      if (r() > dens) continue;
      const ok = this.isFree(px, pz, { track: 12, road: 3, river: 4 });
      if (!ok) continue;
      // keep the default left-side camera view open: thin out the band on the left of the line
      // (only low bushes there so trees never block the train)
      const leftBand = ok.nt.d < 90 && ok.nt.side > 0;
      if (leftBand && r() > 0.3) continue;
      const y = t.heightAt(px, pz);
      if (y < WATER_LEVEL + 0.4) continue;
      let type;
      const q = r();
      if (forest > 0.35 && q < 0.85) type = q < 0.55 ? 'tall' : 'round';
      else if (palmy > 0.25 && q < 0.6) type = 'palm';
      else if (rd < RIVER_HALF + 60 && q < 0.4) type = 'palm';
      else if (q < 0.12) type = 'banana';
      else if (q < 0.35) type = 'bush';
      else type = 'round';
      if (leftBand) type = 'bush';
      const sc = type === 'bush' ? 0.7 + r() * 0.6 : 0.75 + r() * 0.55;
      const col = new THREE.Color().setHSL(0.22 + r() * 0.1, 0.25 + r() * 0.2, 0.75 + r() * 0.25, THREE.SRGBColorSpace);
      this.add(type, px, pz, r() * Math.PI * 2, sc, col);
      const top = y + { tall: 14, round: 7, palm: 11, banana: 3, bush: 1.5 }[type] * sc;
      if (type !== 'bush') w.addCircleObstacle(px, pz, type === 'palm' ? 0.4 : 0.6, top, true);
    }
  }

  // ----- finalize instanced meshes -----
  build() {
    const G = this.geos;
    const fieldGeo = new THREE.BoxGeometry(1, 1, 1);
    fieldGeo.translate(0, 0.5, 0);
    const flowerGeo = new THREE.BoxGeometry(1.4, 0.7, 22);
    flowerGeo.translate(0, 0.35, 0);
    const mats = {
      std: new THREE.MeshLambertMaterial({ vertexColors: true }),
      leaf: new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
      field: new THREE.MeshLambertMaterial({ color: 0xffffff }),
      fieldShiny: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, map: canvasTexture(64, 64, (ctx, w, h) => {
        // rows of rice seedlings
        ctx.fillStyle = '#d8d8d8'; ctx.fillRect(0, 0, w, h);
        for (let y = 0; y < h; y += 4) { ctx.fillStyle = y % 8 ? '#ffffff' : '#b0b0b0'; ctx.fillRect(0, y, w, 2); }
      }, { repeat: [6, 6] }) }),
    };
    const geoFor = { round: G.round, tall: G.tall, palm: G.palm, banana: G.banana, bush: G.bush, rock: G.rock, hay: G.hay, cow: G.cow, field: fieldGeo, bund: fieldGeo, flowerRow: flowerGeo };
    const matFor = { palm: mats.leaf, banana: mats.leaf, field: mats.fieldShiny, bund: mats.field, flowerRow: mats.field };
    const shadowTypes = new Set(['round', 'tall', 'palm', 'banana', 'cow', 'hay']);
    this.instanced = [];
    for (const [key, t] of this.inst) {
      const [ix, iz] = key.split(',').map(Number);
      const g = new THREE.Group();
      for (const type in t) {
        const d = t[type];
        // shuffle so lowering the density removes trees evenly instead of a whole area
        for (let i = d.m.length - 1; i > 0; i--) {
          const j = Math.floor(this.rand() * (i + 1));
          [d.m[i], d.m[j]] = [d.m[j], d.m[i]]; [d.c[i], d.c[j]] = [d.c[j], d.c[i]];
        }
        const im = new THREE.InstancedMesh(geoFor[type], matFor[type] || mats.std, d.m.length);
        d.m.forEach((m, i) => { im.setMatrixAt(i, m); im.setColorAt(i, d.c[i]); });
        im.castShadow = shadowTypes.has(type);
        im.receiveShadow = type === 'field' || type === 'bund';
        im.computeBoundingSphere();
        im.userData.full = d.m.length;
        im.userData.scalable = ['round', 'tall', 'palm', 'banana', 'bush', 'rock'].includes(type);
        im.userData.cx = (ix + 0.5) * TILE; im.userData.cz = (iz + 0.5) * TILE;
        g.add(im);
        this.instanced.push(im);
      }
      this.world.addTile(g, (ix + 0.5) * TILE, (iz + 0.5) * TILE);
      this.world.tiles[this.world.tiles.length - 1].big = TILE * 0.7;
    }
    // houses
    const wallTex = canvasTexture(128, 128, (ctx, w, h) => {
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#3a3330';
      ctx.fillRect(18, 40, 24, 26); ctx.fillRect(86, 40, 24, 26);
      ctx.fillStyle = '#5a3a28'; ctx.fillRect(52, 62, 24, 66);
      ctx.fillStyle = '#d0c8b8'; ctx.fillRect(0, 118, w, 10);
    });
    const bodyGeo = new THREE.BoxGeometry(1, 1, 1); bodyGeo.translate(0, 0.5, 0);
    const roofGeo = (() => {
      const sh = new THREE.Shape();
      sh.moveTo(-0.5, 0); sh.lineTo(0.5, 0); sh.lineTo(0, 1); sh.closePath();
      const g = new THREE.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false });
      g.translate(0, 0, -0.5);
      return g;
    })();
    const flatGeo = new THREE.BoxGeometry(1, 1, 1); flatGeo.translate(0, 0.5, 0);
    const tankGeo = new THREE.CylinderGeometry(0.6, 0.6, 1.1, 12);
    const hm = {
      body: new THREE.MeshLambertMaterial({ map: wallTex }),
      roof: new THREE.MeshLambertMaterial({ color: 0xffffff }),
      flat: new THREE.MeshLambertMaterial({ color: 0xffffff }),
      tank: new THREE.MeshLambertMaterial({ color: 0xffffff }),
    };
    const hg = { body: bodyGeo, roof: roofGeo, flat: flatGeo, tank: tankGeo };
    for (const [key, t] of this.houses) {
      const [ix, iz] = key.split(',').map(Number);
      const g = new THREE.Group();
      for (const k in t) {
        if (!t[k].length) continue;
        const im = new THREE.InstancedMesh(hg[k], hm[k], t[k].length);
        t[k].forEach((d, i) => { im.setMatrixAt(i, d.m); im.setColorAt(i, d.c); });
        im.castShadow = true; im.receiveShadow = true;
        im.computeBoundingSphere();
        g.add(im);
      }
      this.world.addTile(g, (ix + 0.5) * TILE, (iz + 0.5) * TILE);
      this.world.tiles[this.world.tiles.length - 1].big = TILE * 0.7;
    }
  }

  setDensity(d) {
    this.density = d;
    this.updateLOD(null, true);
  }

  // distance-based detail: far tiles draw only a fraction of their (shuffled) instances
  updateLOD(cam, force = false) {
    if (cam && !force) {
      if (this._lodPos && Math.hypot(cam.x - this._lodPos.x, cam.z - this._lodPos.z) < 40) return;
      this._lodPos = { x: cam.x, z: cam.z };
    }
    for (const im of this.instanced || []) {
      if (!im.userData.scalable) continue;
      let k = this.density;
      if (cam) {
        const d = Math.hypot(cam.x - im.userData.cx, cam.z - im.userData.cz);
        if (d > 1500) k *= 0.3; else if (d > 900) k *= 0.55;
      }
      im.count = Math.max(0, Math.floor(im.userData.full * k));
    }
  }
}
