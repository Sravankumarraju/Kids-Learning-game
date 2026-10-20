// Mitrapur town layout: roads, warehouse, garage, building plots, regional features and town expansion.
import * as THREE from 'three';
import { part, mat, mergeGeos, canvasTexture, rng } from './util.js';
import { M, box, cyl, cargoGeometry } from './models.js';
import { MATERIALS, CARGO } from './data.js';
import { PROJECTS } from './buildgeo.js';
import { Assets } from './assets.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const PLOT_SPOTS = [[-205, 0], [-115, 0], [115, 0], [-55, 0], [55, 0], [-160, 1], [-85, 1], [85, 1], [175, 1], [-260, 0]];

export class Town {
  constructor(world) {
    this.world = world;
    this.track = world.track;
    this.terrain = world.terrain;
    const tc = this.terrain.townCenter;
    this.tc = tc;
    const P = (dx, dz) => [tc.x + dx, tc.z + dz];
    this.P = P;
    this.L = this.track.L;
    this.crossingS = [480, Math.round(0.105 * this.L), Math.round(0.70 * this.L)];
    world.crossingS = this.crossingS;
    // ten building plots along the main street: south side faces +z, north side faces -z
    this.plots = PLOT_SPOTS.map(([dx, north], i) => {
      const [x, z] = P(dx, north ? 42 : -6);
      const [ux, uz] = P(dx, 20);
      return { i, x, z, y: this.terrain.townY, w: 24, d: 22, yaw: north ? Math.PI : 0, unload: { x: ux, z: uz, r: 9 } };
    });
    const [wx, wz] = P(150, 205);
    this.warehouse = { x: wx, z: wz };
    const [bx, bz] = P(150, 178);
    this.bay = { x: bx, z: bz, r: 9 };
    const [gx, gz] = P(205, -8);
    this.garage = { x: gx, z: gz };
    this.spawn = {
      car: { x: tc.x + 188, z: tc.z + 20, yaw: -Math.PI / 2 },
      truck: { x: tc.x + 222, z: tc.z + 20, yaw: -Math.PI / 2 },
    };
    this.expansions = [];
  }

  // roads must exist before scenery so it can avoid them
  defineRoads() {
    const w = this.world, P = this.P, tr = this.track;
    w.addRoad([P(0, 232), P(0, -250)]);
    w.addRoad([P(-290, 150), P(290, 150)]);
    w.addRoad([P(-300, 20), P(300, 20)]);
    w.addRoad([P(-290, -130), P(290, -130)]);
    w.addRoad([P(-290, 150), P(-290, -130)]);
    w.addRoad([P(290, 150), P(290, -130)]);
    w.addRoad([P(150, 20), P(150, 150)], 7); // service road to the warehouse loading bay
    const cp = (s, lat) => { const p = tr.point(s, lat); return [p.x, p.z]; };
    const [c1, c2, c3] = this.crossingS;
    // C1: market street west end -> crossing -> Mitrapur Gaon village (outside)
    w.addRoad(this.fixRoad([P(-290, 150), cp(c1, -45), cp(c1, 0), cp(c1, 180)]), 6.5);
    // C2: town street west -> crossing -> Dhanpur village; branch to Dhanpur station forecourt
    const inner2 = cp(c2, -70);
    const mid = [(P(-300, 20)[0] + inner2[0]) / 2, (P(-300, 20)[1] + inner2[1]) / 2];
    const ml = Math.hypot(mid[0], mid[1]);
    const midIn = [mid[0] - (mid[0] / ml) * 120, mid[1] - (mid[1] / ml) * 120];
    w.addRoad(this.fixRoad([P(-300, 20), midIn, inner2, cp(c2, 0), cp(c2, 270)]), 6.5);
    const dhn = this.world.stations.find((s) => s.id === 'DHN');
    w.addRoad(this.fixRoad([inner2, cp(dhn.s - 60, -60), cp(dhn.s - 5, -38)]), 6, 'dirt');
    // C3: farm road in the hills
    w.addRoad(this.fixRoad([cp(c3, -240), cp(c3, -40), cp(c3, 0), cp(c3, 60), cp(c3, 320)]), 5.5, 'dirt');
  }

  // densify and push road points that run close to the track (except at crossings) away from it
  fixRoad(points) {
    const out = [];
    for (let i = 0; i < points.length - 1; i++) {
      const [ax, az] = points[i], [bx, bz] = points[i + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 20));
      for (let k = 0; k < n; k++) out.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
    }
    out.push(points[points.length - 1]);
    return out.map(([x, z]) => {
      const nt = this.track.nearest(x, z, 40);
      if (nt.d > 24) return [x, z];
      if (this.crossingS.some((c) => Math.abs(this.track.diff(c, nt.s)) < 45)) return [x, z];
      const p = this.track.point(nt.s, nt.side * 26);
      return [p.x, p.z];
    });
  }

  build(scenery) {
    const sc = scenery;
    const st = (id) => this.world.stations.find((s) => s.id === id);
    const tr = this.track;
    // reserve town features
    this.plots.forEach((p) => sc.reserve(p.x, p.z, 26));
    sc.reserve(this.warehouse.x, this.warehouse.z, 30);
    // ---- regional features along the line ----
    sc.paddy(st('DHN'), -520, 520, 40, 420);
    sc.paddy(st('DHN'), -480, 480, -70, -380);
    sc.paddy(st('MTP'), 700, 1000, 40, 300);
    sc.village(st('DHN'), -260, 300, 26, 110, { palms: true });
    sc.village(st('MTP'), 480, 250, 22, 90, { flat: 0.5 });
    sc.village(st('ITK'), 260, -240, 18, 80);
    sc.village(st('VNG'), -230, -170, 8, 50, { temple: false });
    sc.village(st('SLP'), 260, -210, 20, 70, { flat: 0.9, temple: false });
    sc.village(st('RGP'), 30, 230, 22, 100, { palms: true });
    sc.village(st('PHW'), 230, -170, 14, 70);
    sc.flowerFields(st('PHW'), -170, 170, -45, -210);
    sc.flowerFields(st('PHW'), -170, 170, 140, 40);
    sc.kilns(st('ITK'));
    sc.cementWorks(st('SLP'));
    sc.factories(st('RGP'));
    sc.timberDepot(st('VNG'));
    const r = rng(77);
    for (let i = 0; i < 40; i++) {
      const p = sc.framePos(st('DHN'), (r() - 0.5) * 900, (r() < 0.5 ? -1 : 1) * (60 + r() * 300));
      if (sc.isFree(p.x, p.z, { track: 20 })) sc.add('hay', p.x, p.z, 0, 0.8 + r() * 0.4, new THREE.Color().setRGB(1, 1, 1, THREE.SRGBColorSpace));
    }
    for (let i = 0; i < 120; i++) {
      const p = sc.framePos(st('RGP'), (r() - 0.5) * 900, (r() < 0.5 ? -1 : 1) * (40 + r() * 300));
      if (sc.isFree(p.x, p.z, { track: 16 })) sc.add('palm', p.x, p.z, r() * 6, 0.8 + r() * 0.5, new THREE.Color().setHSL(0.28, 0.35, 0.8, THREE.SRGBColorSpace));
    }
    this.buildTown(sc);
  }

  buildTown(sc) {
    const P = this.P, tc = this.tc, w = this.world, y0 = this.terrain.townY;
    const r = rng(31);
    const colors = ['#f3efe4', '#e9d8b6', '#a9cfe6', '#efc0c8', '#f2d27a', '#c6e2b5', '#e8b98a'];
    const house = (dx, dz, yaw) => {
      const [x, z] = P(dx, dz);
      sc.addHouse(x, z, yaw, 7 + r() * 3, 7 + r() * 2, 3.5 + r() * 3.5, colors[Math.floor(r() * colors.length)], r() < 0.6 ? 'flat' : 'gable', r() < 0.5);
    };
    for (let dx = -270; dx <= 270; dx += 22) {
      if (Math.abs(dx) < 16) continue;
      house(dx, -150, Math.PI);
      house(dx, -110, 0);
      if (!(dx > -185 && dx < -115) && !(dx > 120 && dx < 180)) house(dx, 125, Math.PI);
      if (!PLOT_SPOTS.some(([px, n]) => n && Math.abs(px - dx) < 20) && !(dx > 140 && dx < 160)) house(dx, 62, 0);
    }
    for (let dz = -100; dz <= 120; dz += 24) {
      if (dz > -40 && dz < 45) continue;
      house(-310, dz, Math.PI / 2);
      house(310, dz, -Math.PI / 2);
    }
    // street trees
    for (let dx = -280; dx <= 280; dx += 40) {
      for (const dz of [32, -142]) {
        const [x, z] = P(dx + 10, dz);
        if (sc.reserved.some((q) => Math.hypot(x - q.x, z - q.z) < q.r)) continue;
        if (w.roadDist(x, z, 20).d < 5) continue;
        sc.add('round', x, z, r() * 6, 0.9, new THREE.Color().setHSL(0.28, 0.4, 0.8, THREE.SRGBColorSpace));
        w.addCircleObstacle(x, z, 0.6, y0 + 7);
      }
    }
    this.buildFootpaths(sc, r);
    sc.temple(...P(-235, -205), 0, 1.2);
    // water tank
    {
      const l = [];
      for (const [x, z] of [[-2, -2], [2, -2], [2, 2], [-2, 2]]) box(l, '#bdb8ad', 0.5, 16, 0.5, x, 8, z);
      cyl(l, '#d8d4c8', 4.5, 3.5, 4, 0, 18, 0, 0, 0, 0, 16);
      l.push(part(new THREE.ConeGeometry(4.6, 1.5, 16), '#a8a294', mat(0, 20.7, 0)));
      const m = new THREE.Mesh(mergeGeos(l), M.vc);
      const [x, z] = P(235, -195);
      m.position.set(x, y0, z); m.castShadow = true;
      w.addTile(m, x, z);
      w.addBoxObstacle(x, z, 3, 3, 0, y0 + 21);
    }
    this.buildWarehouse();
    this.buildGarage();
    this.buildMarket();
    this.buildPlotMarkers();
    this.buildExpansions(sc);
  }

  sign(text, sub, w = 8, h = 1.8, bg = '#1f5e8c') {
    const tex = canvasTexture(512, 128, (ctx, W, H) => {
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 6; ctx.strokeRect(6, 6, W - 12, H - 12);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `bold ${sub ? 46 : 60}px Arial, sans-serif`;
      ctx.fillText(text, W / 2, sub ? 48 : H / 2, W - 30);
      if (sub) { ctx.font = 'bold 34px "Nirmala UI", "Noto Sans Devanagari", sans-serif'; ctx.fillText(sub, W / 2, 96, W - 30); }
    });
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, side: THREE.DoubleSide }));
  }

  buildWarehouse() {
    const { x, z } = this.warehouse, y0 = this.terrain.townY, w = this.world;
    const l = [];
    box(l, '#c9c2b2', 36, 9, 18, 0, 4.5, 0);
    box(l, '#7a8a8e', 37, 0.4, 19, 0, 9.2, 0, 0, 0, 0);
    for (let i = 0; i < 3; i++) box(l, '#5c6468', 7, 6, 0.2, -11 + i * 11, 3, -9.05);
    box(l, '#8a8070', 38, 1.1, 6, 0, 0.55, -12); // loading dock
    box(l, '#e0b81c', 14, 0.05, 0.4, 0, 0.03, -27 + 0.5);
    const m = new THREE.Mesh(mergeGeos(l), M.vc);
    m.position.set(x, y0, z); m.castShadow = true; m.receiveShadow = true;
    w.addTile(m, x, z);
    w.addBoxObstacle(x, z - 3, 19, 12, 0, y0 + 10);
    const s = this.sign('MITRAPUR GOODS WAREHOUSE', 'मित्रपुर माल गोदाम', 16, 3.2);
    s.position.set(x, y0 + 7.6, z - 9.2); s.rotation.y = Math.PI;
    w.addTile(s, x, z);
    // loading bay marking
    const bay = this.bay;
    const bayTex = canvasTexture(256, 256, (ctx, W, H) => {
      ctx.clearRect(0, 0, W, H);
      ctx.strokeStyle = '#f2c21c'; ctx.lineWidth = 14; ctx.strokeRect(10, 10, W - 20, H - 20);
      ctx.fillStyle = 'rgba(242,194,28,0.35)';
      for (let i = -W; i < W * 2; i += 40) { ctx.save(); ctx.beginPath(); ctx.rect(10, 10, W - 20, H - 20); ctx.clip(); ctx.translate(i, 0); ctx.rotate(0.6); ctx.fillRect(0, -50, 14, 500); ctx.restore(); }
      ctx.fillStyle = '#f2c21c'; ctx.font = 'bold 40px Arial'; ctx.textAlign = 'center'; ctx.fillText('LOADING BAY', W / 2, H / 2 + 14);
    });
    const bm = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshBasicMaterial({ map: bayTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
    bm.rotation.x = -Math.PI / 2;
    bm.position.set(bay.x, y0 + 0.08, bay.z);
    w.addTile(bm, bay.x, bay.z);
    // stock piles that visibly reflect warehouse inventory
    this.stockPiles = {};
    MATERIALS.forEach((mtype, i) => {
      const px = x - 32 - (i % 2) * 7, pz = z - 12 + Math.floor(i / 2) * 7;
      const g = new THREE.Group();
      g.position.set(px, y0, pz);
      const pallet = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.2, 5.5), new THREE.MeshStandardMaterial({ color: 0x8b6a45 }));
      pallet.position.y = 0.1;
      g.add(pallet);
      const pile = new THREE.Mesh(cargoGeometry(mtype, 4.8, 4.8), M.vc);
      pile.position.y = 0.2; pile.castShadow = true;
      g.add(pile);
      const lbl = this.sign(CARGO[mtype].name, null, 4.5, 0.9, CARGO[mtype].color);
      lbl.position.set(0, 3.6, 0);
      lbl.userData.billboard = true;
      g.add(lbl);
      w.addTile(g, px, pz);
      this.stockPiles[mtype] = { g, pile, lbl };
      w.addBoxObstacle(px, pz, 3, 3, 0, y0 + 3);
    });
  }

  updateStock(stock) {
    for (const k in this.stockPiles) {
      const n = stock[k] || 0;
      const sp = this.stockPiles[k];
      sp.pile.visible = n > 0;
      sp.pile.scale.y = Math.min(1.2, 0.15 + n / 16);
    }
  }

  buildGarage() {
    const { x, z } = this.garage, y0 = this.terrain.townY, w = this.world;
    const l = [];
    box(l, '#d9cfb8', 18, 6, 0.4, 0, 3, -7);
    box(l, '#d9cfb8', 0.4, 6, 14, -9, 3, 0);
    box(l, '#d9cfb8', 0.4, 6, 14, 9, 3, 0);
    box(l, '#3f7d68', 19, 0.4, 15, 0, 6.2, 0);
    box(l, '#8a8070', 18, 0.15, 14, 0, 0.08, 0);
    const m = new THREE.Mesh(mergeGeos(l), M.vc);
    m.position.set(x, y0, z); m.castShadow = true;
    w.addTile(m, x, z);
    w.addBoxObstacle(x, z - 7, 9, 0.6, 0, y0 + 6.5);
    w.addBoxObstacle(x - 9, z, 0.6, 7, 0, y0 + 6.5);
    w.addBoxObstacle(x + 9, z, 0.6, 7, 0, y0 + 6.5);
    const s = this.sign('TOWN GARAGE', 'नगर गैरेज', 9, 1.8, '#3f7d68');
    s.position.set(x, y0 + 7.3, z + 7.6);
    w.addTile(s, x, z);
  }

  buildMarket() {
    const [mx, mz] = this.P(-150, 185), y0 = this.terrain.townY, w = this.world;
    const l = [];
    const awn = ['#d61f3c', '#f2a21c', '#2f8f5a', '#2f6db5', '#9a3fb5'];
    for (let i = 0; i < 6; i++) {
      const x = -25 + i * 10;
      for (const [dx, dz] of [[-3.5, -2.5], [3.5, -2.5], [-3.5, 2.5], [3.5, 2.5]]) box(l, '#6a5240', 0.2, 3, 0.2, x + dx, 1.5, dz);
      box(l, awn[i % awn.length], 8, 0.15, 6, x, 3.1, 0, 0.12);
      box(l, '#8a6a45', 7, 0.9, 2.5, x, 0.45, -1);
      for (let k = 0; k < 6; k++) box(l, ['#d83a2a', '#f0c330', '#4f9a3a', '#e57a26'][(k + i) % 4], 0.9, 0.3, 0.8, x - 2.8 + k * 1.1, 1.05, -1);
    }
    const m = new THREE.Mesh(mergeGeos(l), M.vc);
    m.position.set(mx, y0, mz); m.castShadow = true;
    w.addTile(m, mx, mz);
    w.addBoxObstacle(mx, mz, 31, 3.5, 0, y0 + 3.5);
    const s = this.sign('SABZI MANDI', 'सब्ज़ी मंडी', 8, 1.8, '#2f8f5a');
    s.position.set(mx, y0 + 5, mz + 4);
    w.addTile(s, mx, mz);
  }

  // raised paved footpaths with kerbs along every town street, lined with shade trees
  buildFootpaths(sc, r) {
    const P = this.P, w = this.world, y0 = this.terrain.townY;
    const streets = [[[-300, 20], [300, 20]], [[-290, 150], [290, 150]], [[-290, -130], [290, -130]], [[0, 232], [0, -250]], [[-290, 150], [-290, -130]], [[290, 150], [290, -130]]];
    const distTo = (x, z, [ax, az], [bx, bz]) => {
      const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / ((bx - ax) ** 2 + (bz - az) ** 2)));
      return Math.hypot(x - (ax + (bx - ax) * t), z - (az + (bz - az) * t));
    };
    const pave = Assets.material('paving', { repeat: [0.5, 0.5] });
    const kerb = new THREE.MeshStandardMaterial({ color: 0xd8d4cc, roughness: 0.8 });
    const parts = [], kerbs = [];
    for (const st of streets) {
      const [a, b] = st;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len;
      const yaw = Math.atan2(dx, dz);
      // footpath centre 4.8 m to each side of the road; side vector is (dz, -dx)
      const at = (t, off, side) => [a[0] + dx * t + dz * side * off, a[1] + dz * t - dx * side * off];
      const blockedAt = (x, z) => streets.some((o) => o !== st && distTo(x, z, o[0], o[1]) < 9);
      for (const side of [-1, 1]) {
        let run = null;
        const flush = (t1) => {
          if (run != null && t1 - run >= 3) {
            const tm = (run + t1) / 2, L = t1 - run;
            const [cx, cz] = at(tm, 4.8, side);
            const g = new THREE.BoxGeometry(2.2, 0.16, L);
            const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2.2, uv.getY(i) * L);
            g.rotateY(yaw); g.translate(cx, 0.08, cz);
            parts.push(g);
            const k = new THREE.BoxGeometry(0.18, 0.2, L);
            k.translate(-side * 1.1, 0.1, 0);
            k.rotateY(yaw); k.translate(cx, 0, cz);
            kerbs.push(k);
          }
          run = null;
        };
        for (let t = 0; t <= len; t += 2) {
          const [x, z] = at(t, 4.8, side);
          const blocked = blockedAt(x, z);
          if (!blocked && run == null) run = t;
          if (blocked && run != null) flush(t);
          if (!blocked && t % 18 === 8) {
            const [tx, tz] = at(t, 6.8, side);
            const [wx, wz] = P(tx, tz);
            if (!sc.reserved.some((q) => Math.hypot(wx - q.x, wz - q.z) < q.r + 2) && !blockedAt(tx, tz)) {
              sc.add('round', wx, wz, r() * 6, 0.75 + r() * 0.3, new THREE.Color().setHSL(0.27 + r() * 0.04, 0.45, 0.75 + r() * 0.15, THREE.SRGBColorSpace));
              w.addCircleObstacle(wx, wz, 0.5, y0 + 7);
            }
          }
        }
        flush(len);
      }
    }
    const tc = this.tc;
    for (const [list, m] of [[parts, pave], [kerbs, kerb]]) {
      if (!list.length) continue;
      const mesh = new THREE.Mesh(mergeGeometries(list), m);
      mesh.position.set(tc.x, y0, tc.z);
      mesh.receiveShadow = true; mesh.castShadow = false;
      w.group.add(mesh);
    }
  }

  buildPlotMarkers() {
    const w = this.world, y0 = this.terrain.townY;
    this.plotMarkers = this.plots.map((p) => {
      const g = new THREE.Group();
      g.position.set(p.x, y0, p.z);
      g.rotation.y = p.yaw;
      const l = [];
      for (const [x, z] of [[-12, -11], [12, -11], [-12, 11], [12, 11]]) box(l, '#e85d2a', 0.15, 1.0, 0.15, x, 0.5, z);
      const pegs = new THREE.Mesh(mergeGeos(l), M.vc);
      g.add(pegs);
      const sign = this.sign(`${p.i + 1}. ${PROJECTS[p.i].name.toUpperCase()}`, `भूखंड ${p.i + 1}`, 4.6, 1.2, '#7a4a2a');
      sign.position.set(-9, 1.9, 11.4);
      g.add(sign);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 6), new THREE.MeshStandardMaterial({ color: 0x444444 }));
      post.position.set(-9, 0.8, 11.35);
      g.add(post);
      // locked fence
      const lock = new THREE.Group();
      const fl = [];
      for (let i = 0; i <= 24; i += 2) { box(fl, '#9a8a6a', 0.12, 1.2, 0.12, -12 + i, 0.6, 11); box(fl, '#9a8a6a', 0.12, 1.2, 0.12, -12 + i, 0.6, -11); }
      box(fl, '#9a8a6a', 24, 0.08, 0.08, 0, 1.0, 11); box(fl, '#9a8a6a', 24, 0.08, 0.08, 0, 1.0, -11);
      lock.add(new THREE.Mesh(mergeGeos(fl), M.vc));
      const ls = this.sign('COMING SOON', 'Finish the previous building', 5, 1.2, '#8a2a22');
      ls.position.set(0, 2.2, 11.2);
      lock.add(ls);
      g.add(lock);
      w.addTile(g, p.x, p.z);
      // unload zone ring
      const ring = new THREE.Mesh(new THREE.RingGeometry(p.unload.r - 0.6, p.unload.r, 40), new THREE.MeshBasicMaterial({ color: 0xf2c21c, transparent: true, opacity: 0.6, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(p.unload.x, y0 + 0.12, p.unload.z);
      w.addTile(ring, p.unload.x, p.unload.z);
      return { g, lock, sign, ring };
    });
  }

  setPlotLocked(i, locked, label) {
    const m = this.plotMarkers[i];
    m.lock.visible = locked;
    m.ring.visible = !locked;
  }

  buildExpansions(sc) {
    const P = this.P, y0 = this.terrain.townY, w = this.world;
    // level 1: street lamps and a bus shelter
    {
      const g = new THREE.Group();
      const l = [];
      for (let dx = -280; dx <= 280; dx += 30) {
        for (const dz of [28, 142]) {
          const [x, z] = P(dx, dz);
          cyl(l, '#3a3a3a', 0.08, 0.1, 6, x - this.tc.x, 3, z - this.tc.z, 0, 0, 0, 6);
          box(l, '#3a3a3a', 1.4, 0.12, 0.2, x - this.tc.x, 6, z - this.tc.z + 0.6);
          box(l, '#fff6c8', 0.5, 0.15, 0.35, x - this.tc.x, 5.9, z - this.tc.z + 1.2);
        }
      }
      const [bx, bz] = P(40, 30);
      box(l, '#2f6db5', 6, 0.2, 2.6, bx - this.tc.x, 2.8, bz - this.tc.z);
      for (const ddx of [-2.8, 2.8]) box(l, '#999', 0.12, 2.8, 0.12, bx - this.tc.x + ddx, 1.4, bz - this.tc.z - 1);
      box(l, '#8a6a45', 5, 0.15, 0.6, bx - this.tc.x, 0.6, bz - this.tc.z - 0.6);
      const m = new THREE.Mesh(mergeGeos(l), M.vc);
      m.position.set(this.tc.x, y0, this.tc.z);
      m.castShadow = true;
      g.add(m);
      this.world.group.add(g);
      this.expansions.push({ g, label: 'Street lamps and a bus stop' });
    }
    // level 2: school with playground
    {
      const g = new THREE.Group();
      const [x, z] = P(-60, -225);
      const l = [];
      box(l, '#f2d27a', 36, 7, 10, 0, 3.5, 0);
      box(l, '#b5482f', 37, 0.5, 11, 0, 7.2, 0);
      for (let i = 0; i < 8; i++) box(l, '#2f6db5', 2, 1.8, 0.1, -15 + i * 4.3, 4.5, 5.05);
      box(l, '#5a3a28', 2.4, 3, 0.1, 0, 1.5, 5.06);
      box(l, '#9b7a55', 36, 0.05, 18, 0, 0.03, 15);
      cyl(l, '#d61f3c', 0.08, 0.08, 3, -10, 1.5, 14, 0, 0, 0, 6);
      cyl(l, '#d61f3c', 0.08, 0.08, 3, -6, 1.5, 14, 0, 0, 0, 6);
      box(l, '#d61f3c', 4.2, 0.12, 0.12, -8, 3, 14);
      box(l, '#2f8f5a', 3, 0.15, 1.2, 8, 1.2, 16, 0, 0, 0.3);
      const m = new THREE.Mesh(mergeGeos(l), M.vc);
      m.position.set(x, y0, z); m.castShadow = true;
      g.add(m);
      const s = this.sign('MITRAPUR SCHOOL', 'मित्रपुर विद्यालय', 9, 1.8, '#b5482f');
      s.position.set(x, y0 + 9, z + 5.2);
      g.add(s);
      this.world.group.add(g);
      this.expansions.push({ g, label: 'A new school', obs: [[x, z, 18.5, 5.5]] });
    }
    // level 3: park with fountain and town hall
    {
      const g = new THREE.Group();
      const [x, z] = P(90, -230);
      const l = [];
      box(l, '#5a9a3a', 40, 0.1, 30, 0, 0.05, 0);
      cyl(l, '#d8d4c8', 4, 4.2, 0.8, 0, 0.4, 0, 0, 0, 0, 20);
      cyl(l, '#5fa8c8', 3.6, 3.6, 0.1, 0, 0.75, 0, 0, 0, 0, 20);
      cyl(l, '#d8d4c8', 0.4, 0.6, 2.5, 0, 1.6, 0, 0, 0, 0, 10);
      box(l, '#f1ede2', 22, 9, 10, 0, 4.5, -22);
      box(l, '#e0a21b', 6, 4, 6, 0, 11, -22);
      cyl(l, '#f1ede2', 3, 3, 0.5, 0, 13.3, -22, 0, 0, 0, 16);
      l.push(part(new THREE.SphereGeometry(3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), '#f1ede2', mat(0, 13.5, -22)));
      for (let i = 0; i < 6; i++) cyl(l, '#f1ede2', 0.35, 0.35, 8, -8 + i * 3.2, 4, -16.8, 0, 0, 0, 10);
      const m = new THREE.Mesh(mergeGeos(l), M.vc);
      m.position.set(x, y0, z); m.castShadow = true; m.receiveShadow = true;
      g.add(m);
      const water = new THREE.Mesh(new THREE.ConeGeometry(0.6, 2.5, 8, 1, true), new THREE.MeshStandardMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.6 }));
      water.position.set(x, y0 + 3.6, z);
      g.add(water);
      this.world.anim.push((dt, t) => { if (g.visible) water.scale.y = 0.9 + 0.15 * Math.sin(t * 6); });
      const s = this.sign('NAGAR BHAVAN', 'नगर भवन', 8, 1.8, '#e0a21b');
      s.position.set(x, y0 + 7, z - 16.6);
      g.add(s);
      this.world.group.add(g);
      this.expansions.push({ g, label: 'A park, fountain and town hall', obs: [[x, z - 22, 11.5, 5.5], [x, z, 4.5, 4.5]] });
    }
    for (const e of this.expansions) {
      e.g.visible = false;
      e.obsItems = (e.obs || []).map(([x, z, hx, hz]) => { const o = w.addBoxObstacle(x, z, hx, hz, 0, y0 + 14); o.active = false; return o; });
    }
  }

  setExpansion(level) {
    this.expansions.forEach((e, i) => {
      e.g.visible = i < level;
      e.obsItems.forEach((o) => { o.active = i < level; });
    });
  }
}
