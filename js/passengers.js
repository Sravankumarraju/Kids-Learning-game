// Passengers: small low-poly people who wait on platforms, walk to coach doors to board, and get off at stops.
import * as THREE from 'three';
import { mergeGeos, part, mat, rng } from './util.js';
import { M } from './models.js';

const SHIRTS = ['#d83a2a', '#f0c330', '#2f6db5', '#3d9b56', '#e57a26', '#9a3fb5', '#e79ab0', '#f1ede2'];
const SKIN = ['#8a5a3c', '#a86e4a', '#6e4630', '#c08a62'];

function personGeos() {
  const out = [];
  const r = rng(55);
  for (let i = 0; i < 10; i++) {
    const shirt = SHIRTS[i % SHIRTS.length], skin = SKIN[Math.floor(r() * SKIN.length)];
    const legs = i % 3 === 0 ? shirt : ['#2b3a55', '#3a3a3a', '#6b5a45'][i % 3];
    const l = [];
    l.push(part(new THREE.BoxGeometry(0.34, 0.8, 0.22), legs, mat(0, 0.4, 0)));
    l.push(part(new THREE.CylinderGeometry(0.2, 0.24, 0.72, 8), shirt, mat(0, 1.15, 0)));
    l.push(part(new THREE.SphereGeometry(0.16, 10, 8), skin, mat(0, 1.68, 0)));
    l.push(part(new THREE.SphereGeometry(0.165, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), '#1b1b1b', mat(0, 1.7, -0.01)));
    if (i % 4 === 1) l.push(part(new THREE.BoxGeometry(0.3, 0.32, 0.2), '#7a4a2a', mat(0.28, 0.75, 0))); // a bag
    out.push(mergeGeos(l));
  }
  return out;
}

export class Passengers {
  constructor(game) {
    this.game = game;
    this.track = game.track;
    this.scene = game.scene;
    this.geos = personGeos();
    this.r = rng(901);
    this.walkers = [];
    this.byStation = {};
    for (const st of game.world.stations) {
      this.byStation[st.id] = { st, waiting: [], away: true };
      this.spawnWaiting(st, 3 + Math.floor(this.r() * 6));
    }
  }

  person() {
    const m = new THREE.Mesh(this.geos[Math.floor(this.r() * this.geos.length)], M.vc);
    m.castShadow = true;
    this.scene.add(m);
    return m;
  }

  platformPoint(st, ds, lat, out = new THREE.Vector3()) {
    const o = this.track.sample(st.s + ds, {});
    return out.set(o.x + o.nx * lat, o.y + 0.95, o.z + o.nz * lat);
  }

  spawnWaiting(st, n) {
    const rec = this.byStation[st.id];
    const o = {};
    for (let i = 0; i < n; i++) {
      const ds = -30 + this.r() * 100, lat = -4.2 - this.r() * 3.8;
      const m = this.person();
      this.platformPoint(st, ds, lat, m.position);
      this.track.sample(st.s + ds, o);
      m.rotation.y = Math.atan2(o.nx, o.nz) + (this.r() - 0.5) * 0.8; // face the track
      m.userData.phase = this.r() * 6;
      rec.waiting.push(m);
    }
  }

  waitingAt(id) { return this.byStation[id]?.waiting.length || 0; }

  // door positions (world) of every car that has doors, on the platform side
  doorPoints(train) {
    const pts = [];
    for (const c of train.cars) {
      if (!c.userData.doors) continue;
      c.updateMatrixWorld();
      for (const d of c.userData.doors) pts.push(c.localToWorld(d.clone()));
    }
    return pts;
  }

  // start the boarding animation; returns counts and how long it takes
  board(stId, train, onboard) {
    const rec = this.byStation[stId];
    const doors = this.doorPoints(train);
    if (!rec || !doors.length) return { boarded: 0, alighted: 0, duration: 0 };
    const st = rec.st;
    const exit = this.platformPoint(st, -18, -11);
    // people getting off
    const alighted = Math.min(onboard, Math.round(onboard * (0.3 + this.r() * 0.5)));
    for (let i = 0; i < alighted; i++) {
      const door = doors[i % doors.length];
      const m = this.person();
      const from = door.clone().setY(door.y + 0.1);
      const step = from.clone().lerp(exit, 0.15);
      m.position.copy(from);
      m.visible = false;
      this.walkers.push({ m, path: [from, step, exit.clone().add(new THREE.Vector3((this.r() - 0.5) * 4, 0, (this.r() - 0.5) * 4))], speed: 1.6, delay: 0.3 + i * 0.35, vanish: true });
    }
    // people getting on
    const boarded = rec.waiting.length;
    rec.waiting.forEach((m, i) => {
      let best = doors[0], bd = Infinity;
      for (const d of doors) { const dd = d.distanceTo(m.position); if (dd < bd) { bd = dd; best = d; } }
      const edge = best.clone(); edge.y = m.position.y;
      this.walkers.push({ m, path: [m.position.clone(), edge, best.clone()], speed: 1.8, delay: 0.6 + (i % 6) * 0.25, vanish: true });
    });
    rec.waiting = [];
    rec.away = false;
    const longest = this.walkers.reduce((mx, w) => Math.max(mx, w.delay + this.pathLen(w.path) / w.speed), 0);
    return { boarded, alighted, duration: Math.min(9, longest + 0.3) };
  }

  pathLen(p) { let l = 0; for (let i = 1; i < p.length; i++) l += p[i].distanceTo(p[i - 1]); return l; }

  update(dt, t, train) {
    // walkers
    for (const w of this.walkers) {
      if (w.delay > 0) { w.delay -= dt; continue; }
      w.m.visible = true;
      let move = w.speed * dt;
      while (move > 0 && w.path.length > 1) {
        const a = w.m.position, b = w.path[1];
        const d = a.distanceTo(b);
        if (d <= move) { a.copy(b); w.path.shift(); move -= d; } else {
          const dir = b.clone().sub(a).normalize();
          a.addScaledVector(dir, move);
          w.m.rotation.y = Math.atan2(dir.x, dir.z);
          move = 0;
        }
      }
      w.m.position.y += Math.abs(Math.sin(t * 10 + w.delay)) * 0.004;
      if (w.path.length <= 1) w.done = true;
    }
    for (const w of this.walkers) if (w.done && w.vanish) { this.scene.remove(w.m); }
    this.walkers = this.walkers.filter((w) => !w.done);
    // idle people sway a little
    for (const id in this.byStation) {
      const rec = this.byStation[id];
      for (const m of rec.waiting) m.rotation.z = Math.sin(t * 1.5 + m.userData.phase) * 0.03;
      // new passengers arrive once the train has gone
      if (!rec.away && train) {
        const d = Math.abs(this.track.diff(rec.st.s, train.headS));
        if (d > 300) { rec.away = true; this.spawnWaiting(rec.st, 3 + Math.floor(this.r() * 6)); }
      }
    }
  }
}
