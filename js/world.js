// Railway infrastructure: ballast, sleepers, rails, overhead wires, stations, bridges, river, roads, level crossings, signals.
import * as THREE from 'three';
import { part, mat, mergeGeos, canvasTexture, rng, SpatialHash, clamp, smoothstep, lerp } from './util.js';
import { M, box, cyl, beam, cargoGeometry } from './models.js';
import { RAIL_TOP } from './track.js';
import { WATER_LEVEL, RIVER_HALF } from './terrain.js';
import { CARGO } from './data.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const STOP_AHEAD = 47; // loco head stop point ahead of station centre

export class World {
  constructor(scene, track, terrain) {
    this.scene = scene;
    this.track = track;
    this.terrain = terrain;
    this.stations = terrain.stations;
    this.vehObs = new SpatialHash(20);
    this.camObs = new SpatialHash(25);
    this.roads = [];
    this.roadHash = new SpatialHash(40);
    this.tiles = []; // {obj, x, z} distance-culled groups
    this.crossings = [];
    this.signals = [];
    this.anim = [];
    this.group = new THREE.Group();
    scene.add(this.group);
  }

  // matrix in the track frame: local x = left, y = up, z = forward
  frameMat(s, lat = 0, y = 0, rotY = 0, useTrackY = true) {
    const o = this.track.sample(s, {});
    const a = Math.atan2(o.tx, o.tz) + rotY;
    const by = useTrackY ? o.y : this.terrain.heightAt(o.x + o.nx * lat, o.z + o.nz * lat);
    return mat(o.x + o.nx * lat, by + y, o.z + o.nz * lat, 0, a, 0);
  }
  placeObj(obj, s, lat, y = 0, rotY = 0) {
    const o = this.track.sample(s, {});
    obj.position.set(o.x + o.nx * lat, o.y + y, o.z + o.nz * lat);
    obj.rotation.set(0, Math.atan2(o.tx, o.tz) + rotY, 0);
    return obj;
  }
  addTile(obj, x, z) {
    this.group.add(obj);
    this.tiles.push({ obj, x, z });
  }
  addBoxObstacle(x, z, hx, hz, rot, top) {
    const c = Math.cos(rot), s = Math.sin(rot);
    const item = { type: 'box', x, z, hx, hz, c, s, top };
    const r = Math.hypot(hx, hz);
    this.vehObs.insert(x, z, item, r);
    this.camObs.insert(x, z, { x, z, r, top }, r);
    return item;
  }
  addCircleObstacle(x, z, r, top, vehicle = true) {
    if (vehicle) this.vehObs.insert(x, z, { type: 'circle', x, z, r }, r);
    this.camObs.insert(x, z, { x, z, r: r * 3, top }, r * 3);
  }
  obstacleTop(x, z, pad = 1.5) {
    let top = -Infinity;
    this.camObs.query(x, z, pad + 8, (o) => {
      if (o.top > top && Math.hypot(x - o.x, z - o.z) < o.r + pad) top = o.top;
    });
    return top;
  }

  build() {
    this.buildTrackBed();
    this.buildOHE();
    this.buildRiver();
    this.buildBridges();
    for (const st of this.stations) this.buildStation(st);
    this.buildStopZone();
  }

  // ---------------- track ----------------
  buildTrackBed() {
    const tr = this.track;
    const ballastTex = canvasTexture(128, 128, (ctx, w, h) => {
      ctx.fillStyle = '#8a8377'; ctx.fillRect(0, 0, w, h);
      const r = rng(3);
      for (let i = 0; i < 900; i++) {
        const g = 90 + r() * 100;
        ctx.fillStyle = `rgb(${g},${g * 0.96},${g * 0.9})`;
        ctx.beginPath(); ctx.ellipse(r() * w, r() * h, 1.5 + r() * 3, 1 + r() * 2.5, r() * 3, 0, 7); ctx.fill();
      }
    }, { repeat: [1, 1] });
    const bMat = new THREE.MeshLambertMaterial({ map: ballastTex, vertexColors: true });
    const railMat = M.vcMetal;
    const sleeperGeo = mergeGeos([part(new THREE.BoxGeometry(2.75, 0.18, 0.26), '#7d776c'), part(new THREE.BoxGeometry(0.3, 0.05, 0.3), '#3a3a3a', mat(0.84, 0.11, 0)), part(new THREE.BoxGeometry(0.3, 0.05, 0.3), '#3a3a3a', mat(-0.84, 0.11, 0))]);
    const chunk = 500;
    const g = 1.676 / 2;
    const railProfile = [];
    for (const c of [g, -g]) {
      railProfile.push({ pts: [[c + 0.07, 0.04], [c + 0.07, 0.07]], color: '#4a4038' });
      railProfile.push({ pts: [[c + 0.07, 0.07], [c + 0.018, 0.1], [c + 0.018, 0.18], [c + 0.036, 0.19], [c + 0.036, RAIL_TOP]], color: '#5a4b40' });
      railProfile.push({ pts: [[c + 0.036, RAIL_TOP], [c - 0.036, RAIL_TOP]], color: '#d6d6d2' });
      railProfile.push({ pts: [[c - 0.036, RAIL_TOP], [c - 0.036, 0.19], [c - 0.018, 0.18], [c - 0.018, 0.1], [c - 0.07, 0.07]], color: '#5a4b40' });
    }
    const ballastProfile = [{ pts: [[3.7, -0.62], [1.95, -0.02], [-1.95, -0.02], [-3.7, -0.62]], color: '#ffffff' }];
    const o = {};
    for (let s0 = 0; s0 < tr.L; s0 += chunk) {
      const s1 = Math.min(tr.L, s0 + chunk);
      const grp = new THREE.Group();
      const bal = new THREE.Mesh(tr.sweep(s0, s1, 4, ballastProfile, { uScale: 1, vScale: 1 }), bMat);
      bal.receiveShadow = true;
      const rails = new THREE.Mesh(tr.sweep(s0, s1, 3, railProfile), railMat);
      rails.castShadow = false; rails.receiveShadow = true;
      const n = Math.floor((s1 - s0) / 0.65);
      const sl = new THREE.InstancedMesh(sleeperGeo, M.vc, n);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);
      for (let i = 0; i < n; i++) {
        const s = s0 + i * 0.65;
        tr.sample(s, o);
        e.set(0, Math.atan2(o.tx, o.tz), 0);
        q.setFromEuler(e);
        p.set(o.x, o.y - 0.02, o.z);
        sl.setMatrixAt(i, m4.compose(p, q, sc));
      }
      sl.receiveShadow = true;
      sl.computeBoundingSphere();
      grp.add(bal, rails, sl);
      tr.sample((s0 + s1) / 2, o);
      this.addTile(grp, o.x, o.z);
    }
  }

  buildOHE() {
    const tr = this.track;
    const l = [];
    // mast in local frame (x = left)
    box(l, '#6f7478', 0.3, 7.6, 0.3, 3.4, 3.8, 0);
    box(l, '#6f7478', 0.5, 0.4, 0.5, 3.4, 0.2, 0);
    beam(l, '#8a8f93', V(3.4, 6.95, 0), V(-0.4, 6.95, 0), 0.09, true);
    beam(l, '#8a8f93', V(3.4, 5.9, 0), V(-0.3, 5.82, 0), 0.07, true);
    beam(l, '#8a8f93', V(3.4, 5.2, 0), V(1.2, 6.95, 0), 0.05, true);
    cyl(l, '#c46a3a', 0.07, 0.07, 0.45, 2.9, 6.95, 0, 0, 0, Math.PI / 2, 6);
    cyl(l, '#c46a3a', 0.07, 0.07, 0.45, 2.9, 5.88, 0, 0, 0, Math.PI / 2, 6);
    const geo = mergeGeos(l);
    const spacing = 60;
    const count = Math.floor(tr.L / spacing);
    const avoid = (s) => this.crossingS?.some((c) => Math.abs(tr.diff(c, s)) < 12);
    const mats = [];
    const pts = [];
    const o = {};
    for (let i = 0; i < count; i++) {
      const s = i * spacing;
      if (avoid(s)) continue;
      mats.push(this.frameMat(s, 0, 0));
      tr.sample(s, o);
      pts.push({ s, x: o.x, y: o.y, z: o.z, nx: o.nx, nz: o.nz, stagger: (i % 2 ? 0.2 : -0.2) });
      this.addCircleObstacle(o.x + o.nx * 3.4, o.z + o.nz * 3.4, 0.4, o.y + 7.6);
    }
    // split masts into tiles for culling
    const per = 10;
    for (let a = 0; a < mats.length; a += per) {
      const im = new THREE.InstancedMesh(geo, M.vcMetal, Math.min(per, mats.length - a));
      for (let i = 0; i < im.count; i++) im.setMatrixAt(i, mats[a + i]);
      im.castShadow = true;
      im.computeBoundingSphere();
      const p0 = pts[a];
      this.addTile(im, p0.x, p0.z);
    }
    // wires
    const wv = [];
    const ct = RAIL_TOP + 5.5, mt = RAIL_TOP + 6.9;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if (tr.fwd(a.s, b.s) > spacing * 2.5) continue;
      const ax = a.x + a.nx * a.stagger, az = a.z + a.nz * a.stagger;
      const bx = b.x + b.nx * b.stagger, bz = b.z + b.nz * b.stagger;
      wv.push(ax, a.y + ct, az, bx, b.y + ct, bz);
      const N = 6;
      for (let k = 0; k < N; k++) {
        const t0 = k / N, t1 = (k + 1) / N;
        const sag = (t) => 0.55 * 4 * t * (1 - t);
        const p0 = [lerp(a.x, b.x, t0), lerp(a.y, b.y, t0) + mt - sag(t0), lerp(a.z, b.z, t0)];
        const p1 = [lerp(a.x, b.x, t1), lerp(a.y, b.y, t1) + mt - sag(t1), lerp(a.z, b.z, t1)];
        wv.push(...p0, ...p1);
        if (k > 0) wv.push(p0[0], p0[1], p0[2], lerp(ax, bx, t0), lerp(a.y, b.y, t0) + ct, lerp(az, bz, t0));
      }
    }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(wv, 3));
    const wires = new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x3a3a36 }));
    wires.frustumCulled = false;
    this.wires = wires;
    this.group.add(wires);
  }

  // ---------------- river & bridges ----------------
  buildRiver() {
    const r = this.terrain.river;
    const pos = [], idx = [];
    const hw = RIVER_HALF + 8;
    for (let i = 0; i < r.length; i++) {
      const a = r[Math.max(0, i - 1)], b = r[Math.min(r.length - 1, i + 1)];
      let dx = b[0] - a[0], dz = b[1] - a[1];
      const l = Math.hypot(dx, dz); dx /= l; dz /= l;
      pos.push(r[i][0] + dz * hw, WATER_LEVEL, r[i][1] - dx * hw, r[i][0] - dz * hw, WATER_LEVEL, r[i][1] + dx * hw);
      if (i > 0) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const n = g.attributes.normal;
    for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
    const water = new THREE.Mesh(g, new THREE.MeshPhongMaterial({ color: 0x3d7d8a, specular: 0x8fb8c0, shininess: 60, transparent: true, opacity: 0.9 }));
    water.receiveShadow = true;
    this.water = water;
    this.group.add(water);
  }

  buildBridges() {
    const tr = this.track;
    this.bridgeRanges = this.terrain.bridgeRanges.map(([a, b]) => [a - 22, b + 22]);
    for (const [sa, sb] of this.bridgeRanges) {
      const l = [];
      const C = '#6f7c80', CON = '#a29d92';
      const n = Math.ceil((sb - sa) / 6);
      const pts = (k, lat, y) => tr.point(sa + ((sb - sa) * k) / n, lat, y);
      for (const lat of [-2.7, 2.7]) {
        for (let k = 0; k < n; k++) {
          beam(l, C, pts(k, lat, -0.5), pts(k + 1, lat, -0.5), 0.45);
          beam(l, C, pts(k, lat, 6.2), pts(k + 1, lat, 6.2), 0.4);
          beam(l, C, pts(k, lat, -0.5), pts(k, lat, 6.2), 0.22);
          beam(l, C, k % 2 ? pts(k, lat, -0.5) : pts(k, lat, 6.2), k % 2 ? pts(k + 1, lat, 6.2) : pts(k + 1, lat, -0.5), 0.2);
        }
        beam(l, C, pts(n, lat, -0.5), pts(n, lat, 6.2), 0.22);
      }
      for (let k = 0; k <= n; k += 2) beam(l, C, pts(k, -2.7, 6.2), pts(k, 2.7, 6.2), 0.18);
      for (let k = 0; k <= n; k++) beam(l, C, pts(k, -2.7, -0.6), pts(k, 2.7, -0.6), 0.3);
      // deck under ballast
      l.push(part(tr.sweep(sa, sb, 3, [{ pts: [[2.9, -0.65], [-2.9, -0.65]], color: '#555' }, { pts: [[-2.9, -0.95], [2.9, -0.95]], color: '#444' }]), '#5c5c5c'));
      // piers
      const o = {};
      for (let k = 0; k <= n; k += 5) {
        const s = sa + ((sb - sa) * k) / n;
        tr.sample(s, o);
        const top = o.y - 0.9, bot = WATER_LEVEL - 3;
        const h = top - bot;
        const m = this.frameMat(s, 0, 0);
        l.push(part(new THREE.BoxGeometry(6.6, h, 2.2), CON, m.clone().multiply(mat(0, -0.9 - h / 2, 0))));
      }
      const mesh = new THREE.Mesh(mergeGeos(l), M.vcMetal);
      mesh.castShadow = true; mesh.receiveShadow = true;
      const mid = tr.point((sa + sb) / 2);
      this.addTile(mesh, mid.x, mid.z);
    }
  }

  // ---------------- stations ----------------
  boardTexture(st) {
    return canvasTexture(1024, 320, (ctx, w, h) => {
      ctx.fillStyle = '#f7d117'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#111'; ctx.lineWidth = 14; ctx.strokeRect(10, 10, w - 20, h - 20);
      ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = 'bold 104px "Nirmala UI", "Noto Sans Devanagari", "Mangal", sans-serif';
      ctx.fillText(st.hi, w / 2, 105);
      ctx.font = 'bold 96px Arial, sans-serif';
      ctx.fillText(st.name.toUpperCase(), w / 2, 225, w - 60);
    });
  }

  buildStation(st) {
    const tr = this.track, s0 = st.s;
    const isTown = st.kind === 'town';
    const half = isTown ? 110 : 85;
    const l = [];
    // platform
    const plat = tr.sweep(s0 - half, s0 + half, 5, [
      { pts: [[-1.85, -0.6], [-1.85, 0.95]], color: '#9b9285' },
      { pts: [[-1.85, 0.95], [-2.45, 0.95]], color: '#f1e9cf' },
      { pts: [[-2.45, 0.95], [-9.2, 0.95]], color: '#b5aa98' },
      { pts: [[-9.2, 0.95], [-9.2, -0.8]], color: '#8c8478' },
    ]);
    l.push(plat);
    for (const sz of [-1, 1]) {
      l.push(part(new THREE.BoxGeometry(7.35, 1.55, 0.3), '#8c8478', this.frameMat(s0 + sz * half, -5.52, 0.18)));
    }
    // canopy
    const ch = isTown ? 70 : 45;
    l.push(tr.sweep(s0 - ch, s0 + ch, 4, [
      { pts: [[-2.4, 4.7], [-8.6, 4.2]], color: '#3f7d68' },
      { pts: [[-8.6, 4.06], [-2.4, 4.56]], color: '#e3dac6' },
      { pts: [[-2.4, 4.56], [-2.4, 4.7]], color: '#2f5d4e' },
    ]));
    for (let d = -ch + 4; d <= ch - 4; d += 8) {
      for (const lat of [-3.4, -7.6]) {
        l.push(part(new THREE.CylinderGeometry(0.12, 0.14, 3.6, 8), '#2f5d4e', this.frameMat(s0 + d, lat, 0.95 + 1.8)));
      }
      l.push(part(new THREE.BoxGeometry(0.4, 0.45, 1.8), '#5c3b24', this.frameMat(s0 + d + 4, -5.5, 0.95 + 0.22)));
      l.push(part(new THREE.BoxGeometry(0.1, 0.5, 1.8), '#5c3b24', this.frameMat(s0 + d + 4, -5.75, 0.95 + 0.6)));
    }
    // lamps
    for (let d = -half + 10; d <= half - 10; d += 18) {
      l.push(part(new THREE.CylinderGeometry(0.06, 0.08, 4.2, 6), '#333', this.frameMat(s0 + d, -8.6, 0.95 + 2.1)));
      l.push(part(new THREE.BoxGeometry(0.9, 0.12, 0.25), '#eee', this.frameMat(s0 + d, -8.2, 0.95 + 4.2)));
    }
    // station building
    const bLen = isTown ? 44 : 22, bDep = isTown ? 12 : 8, bH = isTown ? 7.5 : 4.6;
    const bLat = isTown ? -17 : -14.5;
    const bx = this.frameMat(s0 - 10, bLat, 0.95);
    l.push(part(new THREE.BoxGeometry(bDep, 0.5, bLen + 1), '#7a2b22', bx.clone().multiply(mat(0, 0.25, 0))));
    l.push(part(new THREE.BoxGeometry(bDep + 0.6, 0.5, bLen + 0.6), '#7a2b22', bx.clone().multiply(mat(0, bH + 0.25, 0))));
    if (isTown) {
      l.push(part(new THREE.BoxGeometry(5, 6, 5), '#efe0bd', bx.clone().multiply(mat(0, bH + 3.5, 0))));
      l.push(part(new THREE.ConeGeometry(4, 3, 4), '#7a2b22', bx.clone().multiply(mat(0, bH + 8, 0, 0, Math.PI / 4))));
      l.push(part(new THREE.CylinderGeometry(1.4, 1.4, 0.2, 20), '#ffffff', bx.clone().multiply(mat(2.55, bH + 4.2, 0, 0, 0, Math.PI / 2))));
    }
    const mesh = new THREE.Mesh(mergeGeos(l), M.vc);
    mesh.receiveShadow = true; mesh.castShadow = true;
    this.addTile(mesh, st.x, st.z);
    // building walls with texture
    const wallTex = canvasTexture(512, 128, (ctx, w, h) => {
      ctx.fillStyle = '#efe0bd'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#7a2b22'; ctx.fillRect(0, h - 14, w, 14);
      const n = 6;
      for (let i = 0; i < n; i++) {
        const x = (i + 0.5) * (w / n);
        ctx.fillStyle = '#4b3a2c';
        ctx.beginPath(); ctx.moveTo(x - 16, h - 14); ctx.lineTo(x - 16, 48); ctx.arc(x, 48, 16, Math.PI, 0); ctx.lineTo(x + 16, h - 14); ctx.fill();
        ctx.strokeStyle = '#7a2b22'; ctx.lineWidth = 4; ctx.stroke();
      }
    });
    wallTex.wrapS = THREE.RepeatWrapping;
    wallTex.repeat.set(Math.round(bLen / 12), 1);
    const wm = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.85 });
    const bld = new THREE.Mesh(new THREE.BoxGeometry(bDep, bH, bLen), [wm, wm, M.vc, M.vc, wm, wm]);
    bld.geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Array(bld.geometry.attributes.position.count * 3).fill(0.8), 3));
    bld.applyMatrix4(bx.clone().multiply(mat(0, bH / 2, 0)));
    bld.castShadow = true; bld.receiveShadow = true;
    this.addTile(bld, st.x, st.z);
    const bc = new THREE.Vector3().setFromMatrixPosition(bx);
    const fa = (ss) => { const q = tr.sample(ss, {}); return Math.atan2(q.tx, q.tz); };
    this.addBoxObstacle(bc.x, bc.z, bDep / 2 + 0.5, bLen / 2 + 0.5, fa(s0 - 10), bc.y + bH + (isTown ? 10 : 1));
    // platform as obstacle strip for cars and camera
    for (let d = -half; d <= half; d += 10) {
      const p = tr.point(s0 + d, -5.5, 0);
      this.addCircleObstacle(p.x, p.z, 3.6, p.y + 4.8);
    }
    // name boards
    const tex = this.boardTexture(st);
    const bm = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 });
    const ym = new THREE.MeshStandardMaterial({ color: 0xf7d117, roughness: 0.6 });
    for (const d of [-half + 18, half - 18, -6]) {
      const g = new THREE.Group();
      const board = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.25, 4.0), [bm, bm, ym, ym, ym, ym]);
      board.position.y = 2.75;
      g.add(board);
      for (const z of [-1.7, 1.7]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 6), new THREE.MeshStandardMaterial({ color: 0x222222 }));
        post.position.set(0, 1.1, z);
        g.add(post);
      }
      g.traverse((c) => { c.castShadow = true; });
      this.placeObj(g, s0 + d, d === -6 ? -9.0 : -5.5, 0.95);
      this.addTile(g, st.x, st.z);
    }
    // stop board for the loco
    const stopTex = canvasTexture(128, 128, (ctx, w, h) => {
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#c81e1e'; ctx.fillRect(8, 8, w - 16, h - 16);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 40px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('STOP', w / 2, h / 2);
    });
    const sb = new THREE.Group();
    const sbBoard = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.8, 0.8), [new THREE.MeshBasicMaterial({ map: stopTex }), new THREE.MeshBasicMaterial({ map: stopTex }), ym, ym, ym, ym]);
    sbBoard.position.y = 2.2;
    sb.add(sbBoard);
    const sbPost = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2, 6), new THREE.MeshStandardMaterial({ color: 0x333333 }));
    sbPost.position.y = 1;
    sb.add(sbPost);
    this.placeObj(sb, s0 + STOP_AHEAD + 2, -2.8, 0.95);
    this.addTile(sb, st.x, st.z);
    // goods stacks on the platform for supply stations
    st.supplies.forEach((type, i) => {
      for (let k = 0; k < 3; k++) {
        const m = new THREE.Mesh(cargoGeometry(type, 2.2, 3.0), M.vc);
        m.castShadow = true;
        m.scale.set(0.9, 0.7, 0.9);
        this.placeObj(m, s0 + 22 + i * 14 + k * 4.2, -7.2, 0.95);
        this.addTile(m, st.x, st.z);
      }
    });
    // goods shed behind building for supply stations
    if (st.supplies.length) {
      const gl = [];
      const gm = this.frameMat(s0 + 40, -24, 0, 0, false);
      for (const dz of [-10, -3.3, 3.3, 10]) for (const dx of [-5, 5]) gl.push(part(new THREE.BoxGeometry(0.35, 6, 0.35), '#6c6c6c', gm.clone().multiply(mat(dx, 3, dz))));
      gl.push(part(new THREE.BoxGeometry(11.5, 0.25, 22), '#8f9a9c', gm.clone().multiply(mat(0, 6.2, 0, 0, 0, 0.08))));
      gl.push(part(new THREE.BoxGeometry(10, 0.9, 20), '#a39b8c', gm.clone().multiply(mat(0, 0.45, 0))));
      const shed = new THREE.Mesh(mergeGeos(gl), M.vc);
      shed.castShadow = true; shed.receiveShadow = true;
      this.addTile(shed, st.x, st.z);
      const sc = new THREE.Vector3().setFromMatrixPosition(gm);
      this.addBoxObstacle(sc.x, sc.z, 6, 11.5, fa(s0 + 40), sc.y + 6.5);
      st.supplies.forEach((type, i) => {
        for (let k = 0; k < 2; k++) {
          const m = new THREE.Mesh(cargoGeometry(type, 2.4, 4.0), M.vc);
          m.castShadow = true;
          m.applyMatrix4(gm.clone().multiply(mat(-2.5 + k * 5, 0.9, -5 + i * 10)));
          this.addTile(m, st.x, st.z);
        }
      });
    }
    // signal before the station (left side, for trains running forward)
    this.buildSignal(s0 - 420, st);
  }

  buildSignal(s, st) {
    const g = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 5.2, 8), new THREE.MeshStandardMaterial({ color: 0xdddddd }));
    post.position.y = 2.6;
    g.add(post);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.5, 0.35), new THREE.MeshStandardMaterial({ color: 0x111111 }));
    head.position.set(0, 5.2, 0);
    g.add(head);
    const hood = new THREE.Mesh(new THREE.CircleGeometry(0.42, 12), new THREE.MeshStandardMaterial({ color: 0x111111, side: THREE.DoubleSide }));
    hood.position.set(0, 5.2, -0.19);
    g.add(hood);
    const lamps = {};
    const cols = { red: 0xff2a1a, yellow: 0xffc21a, green: 0x2aff6a };
    [['red', 5.65], ['yellow', 5.2], ['green', 4.75]].forEach(([k, y]) => {
      const m = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: cols[k], emissiveIntensity: 0 });
      const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.14, 12), m);
      lamp.position.set(0, y, -0.2);
      lamp.rotation.y = Math.PI;
      g.add(lamp);
      lamps[k] = m;
    });
    this.placeObj(g, s, 3.2, 0);
    const p = g.position;
    this.addTile(g, p.x, p.z);
    this.signals.push({ s, st, lamps, aspect: null, redUntil: 0 });
  }

  buildStopZone() {
    const g = new THREE.Group();
    this.stopZone = g;
    this.stopZoneMat = new THREE.MeshBasicMaterial({ color: 0x38e06a, transparent: true, opacity: 0.35, depthWrite: false });
    this.stopZoneMesh = null;
    const postMat = new THREE.MeshBasicMaterial({ color: 0x38e06a });
    this.stopPosts = [0, 1].map(() => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4, 8), postMat);
      g.add(m);
      return m;
    });
    g.visible = false;
    this.scene.add(g);
  }
  setStopZone(stationId) {
    if (this.stopZoneFor === stationId) return;
    this.stopZoneFor = stationId;
    if (!stationId) { this.stopZone.visible = false; return; }
    const st = this.stations.find((x) => x.id === stationId);
    const s = st.s + STOP_AHEAD;
    if (this.stopZoneMesh) { this.stopZone.remove(this.stopZoneMesh); this.stopZoneMesh.geometry.dispose(); }
    this.stopZoneMesh = new THREE.Mesh(this.track.sweep(s - 30, s + 60, 2, [{ pts: [[1.3, 0.3], [-1.3, 0.3]], color: '#fff' }]), this.stopZoneMat);
    this.stopZone.add(this.stopZoneMesh);
    [s - 30, s + 60].forEach((ss, i) => this.stopPosts[i].position.copy(this.track.point(ss, -2.2, 3)));
    this.stopZone.visible = true;
  }

  // ---------------- roads & crossings ----------------
  addRoad(points, width = 7, kind = 'asphalt') {
    // points: [[x,z],...] ; resample every 3 m
    const pts = [];
    for (let i = 0; i < points.length - 1; i++) {
      const [ax, az] = points[i], [bx, bz] = points[i + 1];
      const L = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.ceil(L / 3));
      for (let k = 0; k < n; k++) pts.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
    }
    pts.push(points[points.length - 1]);
    const road = { pts, width, kind };
    this.roads.push(road);
    for (let i = 0; i < pts.length - 1; i++) {
      this.roadHash.insert((pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2, { road, i }, width);
    }
    return road;
  }
  roadY(x, z) {
    const nt = this.track.nearest(x, z, 26);
    const th = this.terrain.heightAt(x, z) + 0.07;
    if (nt.d < 26) {
      const ty = this.track.heightAt(nt.s) + RAIL_TOP + 0.01;
      return lerp(Math.max(ty, th), th, smoothstep(5, 24, nt.d));
    }
    return th;
  }
  roadDist(x, z, maxD = 40) {
    let best = Infinity, bp = null;
    this.roadHash.query(x, z, maxD, ({ road, i }) => {
      const [ax, az] = road.pts[i], [bx, bz] = road.pts[i + 1];
      const dx = bx - ax, dz = bz - az;
      const ll = dx * dx + dz * dz || 1;
      const t = clamp(((x - ax) * dx + (z - az) * dz) / ll, 0, 1);
      const qx = ax + dx * t, qz = az + dz * t;
      const d = Math.hypot(x - qx, z - qz) - road.width / 2;
      if (d < best) { best = d; bp = { x: qx, z: qz, yaw: Math.atan2(dx, dz), road }; }
    });
    return { d: best, p: bp };
  }
  buildRoadMeshes() {
    const tex = {
      asphalt: canvasTexture(64, 256, (ctx, w, h) => {
        ctx.fillStyle = '#4a4a48'; ctx.fillRect(0, 0, w, h);
        const r = rng(9);
        for (let i = 0; i < 600; i++) { const g = 60 + r() * 40; ctx.fillStyle = `rgb(${g},${g},${g})`; ctx.fillRect(r() * w, r() * h, 1, 1); }
        ctx.fillStyle = '#d8d2b0'; ctx.fillRect(2, 0, 3, h); ctx.fillRect(w - 5, 0, 3, h);
        ctx.fillStyle = '#e8e0a0'; ctx.fillRect(w / 2 - 1.5, 0, 3, h / 2);
      }),
      dirt: canvasTexture(64, 256, (ctx, w, h) => {
        ctx.fillStyle = '#9b7a55'; ctx.fillRect(0, 0, w, h);
        const r = rng(11);
        for (let i = 0; i < 500; i++) { ctx.fillStyle = r() > 0.5 ? '#8a6a48' : '#ad8c65'; ctx.fillRect(r() * w, r() * h, 2, 2); }
        ctx.fillStyle = '#7f6243'; ctx.fillRect(w * 0.25, 0, 5, h); ctx.fillRect(w * 0.7, 0, 5, h);
      }),
    };
    for (const k in tex) { tex[k].wrapT = THREE.RepeatWrapping; }
    const mats = { asphalt: new THREE.MeshLambertMaterial({ map: tex.asphalt }), dirt: new THREE.MeshLambertMaterial({ map: tex.dirt }) };
    for (const road of this.roads) {
      const { pts, width } = road;
      const pos = [], uv = [], idx = [];
      let dist = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
        let dx = b[0] - a[0], dz = b[1] - a[1];
        const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
        if (i > 0) dist += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        const hw = width / 2;
        const lx = pts[i][0] + dz * hw, lz = pts[i][1] - dx * hw;
        const rx = pts[i][0] - dz * hw, rz = pts[i][1] + dx * hw;
        pos.push(lx, this.roadY(lx, lz), lz, rx, this.roadY(rx, rz), rz);
        uv.push(0, dist / 10, 1, dist / 10);
        if (i > 0) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, mats[road.kind]);
      m.receiveShadow = true;
      m.material.polygonOffset = true; m.material.polygonOffsetFactor = -2; m.material.polygonOffsetUnits = -2;
      const c = pts[Math.floor(pts.length / 2)];
      this.addTile(m, c[0], c[1]);
    }
  }

  buildCrossing(sc) {
    const tr = this.track;
    const g = new THREE.Group();
    const stripeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
    const booms = [];
    const lights = [];
    for (const side of [-1, 1]) {
      const lat = side * 5.2;
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.3, 0.35), new THREE.MeshStandardMaterial({ color: 0x333333 }));
      const base = this.frameMat(sc + side * 4.6, lat, RAIL_TOP);
      post.applyMatrix4(base.clone().multiply(mat(0, 0.65, 0)));
      g.add(post);
      const pivot = new THREE.Group();
      const bl = [];
      for (let k = 0; k < 8; k++) bl.push(part(new THREE.BoxGeometry(0.14, 0.14, 1.0), k % 2 ? '#d61f1f' : '#f5f5f5', mat(0, 0, -side * (0.5 + k))));
      bl.push(part(new THREE.BoxGeometry(0.3, 0.3, 0.6), '#333', mat(0, 0, side * 0.4)));
      const boom = new THREE.Mesh(mergeGeos(bl), stripeMat);
      boom.castShadow = true;
      pivot.add(boom);
      pivot.applyMatrix4(base.clone().multiply(mat(0, 1.2, 0)));
      g.add(pivot);
      booms.push({ pivot, side, base: pivot.quaternion.clone() });
      const lm = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2010, emissiveIntensity: 0 });
      const lp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.3), lm);
      lp.applyMatrix4(base.clone().multiply(mat(0, 1.6, 0)));
      g.add(lp);
      lights.push(lm);
      // cross-buck sign
      const sign = new THREE.Group();
      for (const r of [0.6, -0.6]) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.25, 1.6), new THREE.MeshStandardMaterial({ color: 0xffffff }));
        b.rotation.x = r;
        b.position.y = 2.6;
        sign.add(b);
      }
      const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6), new THREE.MeshStandardMaterial({ color: 0x444444 }));
      sp.position.y = 1.3;
      sign.add(sp);
      sign.applyMatrix4(this.frameMat(sc - side * 5, side * 6.5, RAIL_TOP));
      g.add(sign);
    }
    // gate keeper hut
    const hut = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.6, 2.4), new THREE.MeshStandardMaterial({ color: 0xe9dcc0 }));
    hut.applyMatrix4(this.frameMat(sc + 10, -9, 1.3, 0, false));
    hut.castShadow = true;
    g.add(hut);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.2, 4), new THREE.MeshStandardMaterial({ color: 0xa84a2a }));
    roof.applyMatrix4(this.frameMat(sc + 10, -9, 3.2, Math.PI / 4, false));
    g.add(roof);
    const p = tr.point(sc);
    this.addTile(g, p.x, p.z);
    const crossing = { s: sc, booms, lights, angle: Math.PI / 2, closed: false, pos: p.clone(), obstacles: [] };
    // obstacles representing the closed booms (activated dynamically)
    for (const side of [-1, 1]) {
      const q = tr.point(sc, side * 5.2, 0);
      crossing.obstacles.push({ type: 'circle', x: q.x, z: q.z, r: 3.6, active: false });
      this.vehObs.insert(q.x, q.z, crossing.obstacles[crossing.obstacles.length - 1], 4);
    }
    this.crossings.push(crossing);
    return crossing;
  }

  // ---------------- per-frame ----------------
  update(dt, t, train, camPos, drawDist) {
    // distance culling
    for (const tile of this.tiles) {
      const d = Math.hypot(tile.x - camPos.x, tile.z - camPos.z);
      tile.obj.visible = d < drawDist + (tile.big || 0);
    }
    const tr = this.track;
    const bells = [];
    // crossings
    for (const c of this.crossings) {
      let closed = false;
      if (train) {
        const head = train.headS, tail = train.tailS;
        const dHead = tr.diff(head, c.s); // + ahead of head
        const dTail = tr.diff(tail, c.s);
        const between = dHead <= 25 && dTail >= -25;
        const ahead = train.dir > 0 ? dHead : -dTail; // distance from the leading end to the crossing
        closed = between || (ahead > 0 && ahead < 520 && train.speed > 0.3) || (ahead > 0 && ahead < 60);
      }
      c.closed = closed;
      const target = closed ? 0 : Math.PI / 2;
      const prev = c.angle;
      c.angle += clamp(target - c.angle, -dt * 0.7, dt * 0.7);
      for (const b of c.booms) {
        b.pivot.quaternion.copy(b.base).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), b.side * c.angle));
      }
      const blink = closed || c.angle < 1.4 ? (Math.floor(t * 2.5) % 2) : -1;
      c.lights.forEach((m, i) => { m.emissiveIntensity = blink < 0 ? 0 : ((i + blink) % 2 ? 3 : 0.1); });
      for (const o of c.obstacles) o.active = c.angle < 1.0;
      if (closed || prev !== c.angle) bells.push(c);
    }
    // signals
    if (train) {
      for (const sg of this.signals) {
        const d = tr.diff(train.headS, sg.s);
        if (d < 0 && d > -15 && train.dir > 0) sg.redUntil = t + 25;
        let aspect = 'green';
        if (t < sg.redUntil) aspect = 'red';
        else if (train.targetStation === sg.st.id) aspect = 'yellow';
        if (aspect !== sg.aspect) {
          sg.aspect = aspect;
          for (const k in sg.lamps) sg.lamps[k].emissiveIntensity = k === aspect ? 3.5 : 0;
        }
      }
    }
    for (const a of this.anim) a(dt, t);
    if (this.stopZone.visible) this.stopZoneMat.opacity = 0.25 + 0.15 * Math.sin(t * 4);
    return bells;
  }
}
