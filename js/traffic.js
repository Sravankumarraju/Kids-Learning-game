// Town life: cars, autos, trucks and tractors driving around Mitrapur on the left (as in India),
// keeping their distance and stopping for the player; people walking the pavements; cows resting on the verge.
import * as THREE from 'three';
import { makeCar, makeSUV, makeAuto, makeTruck, makeTractor } from './cars.js';
import { makeWorker, animateWorker } from './machines.js';
import { rng, clamp, lerp, angDiff } from './util.js';

const KINDS = [
  { make: makeCar, len: 3.9, vmax: 11, colors: ['#c0392b', '#ecf0f1', '#2c3e50', '#7f8c8d', '#2980b9', '#d35400'] },
  { make: makeCar, len: 3.9, vmax: 11, colors: ['#f1c40f', '#ecf0f1', '#8e44ad', '#16a085'] },
  { make: makeSUV, len: 4.5, vmax: 12, colors: ['#ecf0f1', '#1e272e', '#a93226', '#566573'] },
  { make: makeAuto, len: 2.8, vmax: 8, colors: ['#2f8f5a', '#1d1d1d', '#2f8f5a'] },
  { make: makeTruck, len: 7.4, vmax: 9, colors: ['#e8862a', '#c0392b', '#2471a3'] },
  { make: makeTractor, len: 3.8, vmax: 6, colors: ['#c8302a', '#2471a3'] },
];

export class Traffic {
  constructor(game) {
    this.game = game;
    this.world = game.world;
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.cars = [];
    this.people = [];
    this.cows = [];
    this.routes = [];
  }

  build(count = 8) {
    const P = this.game.town.P;
    const loop = (pts) => this.route(pts.map(([dx, dz]) => P(dx, dz)), true);
    // three loops around the town blocks
    this.routes = [
      loop([[-290, 150], [290, 150], [290, -130], [-290, -130]]),
      loop([[-290, 20], [290, 20], [290, 150], [-290, 150]]),
      loop([[290, 20], [-290, 20], [-290, -130], [290, -130]]),
    ];
    const r = rng(2024);
    for (let k = 0; k < count; k++) {
      const route = this.routes[k % this.routes.length];
      const kind = KINDS[k % 7 === 6 ? 5 : k % 5 === 4 ? 4 : Math.floor(r() * 4)];
      const obj = kind.make(kind.colors[Math.floor(r() * kind.colors.length)]);
      this.group.add(obj);
      const lamps = obj.userData.lamps;
      if (lamps) { this.game.daynight.addLamp(lamps.head, 3); this.game.daynight.addLamp(lamps.tail, 2); }
      this.cars.push({ obj, route, kind, d: (route.len * (k / count + r() * 0.08)) % route.len, v: 0, vmax: kind.vmax * (0.85 + r() * 0.3), spin: 0, wait: 0 });
    }
    this.buildPeople(r);
    this.buildCows(r);
  }

  // a route: densified polyline with cumulative lengths; the car keeps to the left of it
  route(pts, closed) {
    const all = closed ? [...pts, pts[0]] : pts;
    const out = [];
    for (let i = 0; i < all.length - 1; i++) {
      const [ax, az] = all[i], [bx, bz] = all[i + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 6));
      for (let k = 0; k < n; k++) out.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
    }
    out.push(all[all.length - 1]);
    const cum = [0];
    for (let i = 1; i < out.length; i++) cum.push(cum[i - 1] + Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]));
    return { pts: out, cum, len: cum[cum.length - 1], closed };
  }
  // position, heading and upcoming turn at distance d along a route
  sample(rt, d) {
    d = ((d % rt.len) + rt.len) % rt.len;
    let lo = 0, hi = rt.cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (rt.cum[m] <= d) lo = m; else hi = m; }
    const a = rt.pts[lo], b = rt.pts[hi];
    const t = (d - rt.cum[lo]) / Math.max(0.001, rt.cum[hi] - rt.cum[lo]);
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
    return { x: a[0] + dx * t, z: a[1] + dz * t, yaw: Math.atan2(dx, dz), nx: dx / l, nz: dz / l };
  }

  buildPeople(r) {
    const P = this.game.town.P;
    const shirts = [0xe74c3c, 0x3498db, 0xf1c40f, 0x9b59b6, 0x1abc9c, 0xe67e22, 0xffffff, 0xd35400];
    // on the footpaths, 4.8 m either side of the street centre
    const walks = [[[-280, 24.8], [280, 24.8]], [[-280, 15.2], [280, 15.2]], [[-280, 145.2], [280, 145.2]], [[-280, -125.2], [280, -125.2]], [[4.8, 140], [4.8, -120]], [[-4.8, 140], [-4.8, -120]]];
    for (let k = 0; k < 16; k++) {
      const w = makeWorker(k + 3);
      // everyday clothes, no hard hat; some in long kurta/saree-like dresses
      w.children[2].material = new THREE.MeshStandardMaterial({ color: shirts[k % shirts.length], roughness: 0.85 });
      w.children[3].visible = false; w.children[7].visible = false; w.children[8].visible = false;
      if (k % 3 === 1) {
        const dress = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.32, 0.75, 12), new THREE.MeshStandardMaterial({ color: shirts[(k + 3) % shirts.length], roughness: 0.8 }));
        dress.position.y = 0.62; dress.castShadow = true; w.add(dress);
      }
      if (k % 5 === 0) w.scale.setScalar(0.7); // children
      const path = walks[k % walks.length].map(([dx, dz]) => P(dx, dz));
      this.group.add(w);
      this.people.push({ w, path, t: r(), dir: r() < 0.5 ? 1 : -1, speed: 1.1 + r() * 0.5, pause: 0 });
    }
  }

  buildCows(r) {
    const P = this.game.town.P;
    for (const [dx, dz, yaw] of [[-150, 33, 0.4], [60, 158, 2.2], [240, -118, -1.2], [-40, 7, 3.0]]) {
      const cow = makeCow(r);
      const [x, z] = P(dx, dz);
      cow.position.set(x, this.world.roadY(x, z) - 0.05, z);
      cow.rotation.y = yaw;
      this.group.add(cow);
      this.cows.push({ obj: cow, x, z, t: r() * 10 });
      this.world.addCircleObstacle(x, z, 1.2, cow.position.y + 1.5);
    }
  }

  update(dt, time) {
    const g = this.game;
    const player = g.vehicle && g.vehicle.obj.visible ? g.vehicle : null;
    // order cars on each route so they keep a safe gap
    for (const c of this.cars) {
      const rt = c.route;
      let gap = Infinity;
      for (const o of this.cars) {
        if (o === c || o.route !== rt) continue;
        let dd = o.d - c.d; if (dd < 0) dd += rt.len;
        if (dd < gap) gap = dd - (o.kind.len + c.kind.len) / 2;
      }
      const s = this.sample(rt, c.d);
      // slow for the corner ahead
      const ahead = this.sample(rt, c.d + 14);
      const turn = Math.abs(angDiff(ahead.yaw, s.yaw));
      let target = c.vmax * (turn > 0.6 ? 0.45 : 1);
      if (gap < 18) target = Math.min(target, Math.max(0, (gap - 4) * 0.8));
      // stop (and toot) for the player's vehicle when it is in our lane ahead
      if (player) {
        const dx = player.x - s.x, dz = player.z - s.z;
        const fwd = dx * s.nx + dz * s.nz, side = dx * s.nz - dz * s.nx;
        if (fwd > 0 && fwd < 16 && Math.abs(side - 1.9) < 3.0) { target = Math.min(target, Math.max(0, (fwd - 6) * 0.7)); if (fwd < 9 && !c.honked && dist2(player, g.camera) < 3600) { c.honked = true; g.audio.play('beep'); } }
        else if (fwd > 20 || fwd < -5) c.honked = false;
      }
      c.v = lerp(c.v, target, 1 - Math.exp(-dt * (target < c.v ? 3 : 1.2)));
      c.d = (c.d + c.v * dt) % rt.len;
      const p = this.sample(rt, c.d);
      // drive on the left: offset to the left of the direction of travel
      const x = p.x + p.nz * 1.9, z = p.z - p.nx * 1.9;
      const o = c.obj;
      o.position.set(x, this.world.roadY(x, z), z);
      o.rotation.y = o.rotation.y + angDiff(p.yaw, o.rotation.y) * Math.min(1, dt * 5);
      c.spin += (c.v * dt) / (o.userData.wheelR || 0.35);
      for (const w of o.userData.wheels) w.mesh.rotation.x = c.spin;
      const steer = clamp(angDiff(ahead.yaw, p.yaw) * 0.8, -0.5, 0.5);
      for (const w of o.userData.steerWheels) w.pivot.rotation.y = steer;
    }
    for (const p of this.people) {
      if (p.pause > 0) { p.pause -= dt; animateWorker(p.w, time, 'idle'); continue; }
      const [a, b] = p.path;
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      p.t += (p.dir * p.speed * dt) / L;
      if (p.t > 1 || p.t < 0) { p.dir *= -1; p.t = clamp(p.t, 0, 1); p.pause = 1 + Math.random() * 3; }
      const x = lerp(a[0], b[0], p.t), z = lerp(a[1], b[1], p.t);
      p.w.position.set(x, this.game.terrain.townY + 0.16, z);
      p.w.rotation.y = Math.atan2((b[0] - a[0]) * p.dir, (b[1] - a[1]) * p.dir);
      animateWorker(p.w, time, 'walk');
      if (Math.random() < dt * 0.02) p.pause = 2 + Math.random() * 4;
    }
    for (const c of this.cows) {
      c.t += dt;
      const u = c.obj.userData;
      u.head.rotation.x = 0.3 + Math.sin(c.t * 0.7) * 0.25;
      u.tail.rotation.z = Math.sin(c.t * 2.3) * 0.4;
    }
  }

  // other cars as collision boxes for the player's vehicle
  obstacles() {
    return this.cars.map((c) => ({ type: 'box', x: c.obj.position.x, z: c.obj.position.z, hx: 1.0, hz: c.kind.len / 2, c: Math.cos(c.obj.rotation.y), s: Math.sin(c.obj.rotation.y), active: true }));
  }
}

function dist2(v, cam) { return (v.x - cam.position.x) ** 2 + (v.z - cam.position.z) ** 2; }

// a white Indian cow with a hump, horns and a swishing tail
function makeCow(r) {
  const root = new THREE.Group();
  const coat = new THREE.MeshStandardMaterial({ color: r() < 0.5 ? 0xf1ece2 : 0xd8c8b0, roughness: 0.9 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3a3330, roughness: 0.7 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1.2, 6, 12), coat);
  body.rotation.x = Math.PI / 2; body.position.y = 1.05; body.castShadow = true; root.add(body);
  const hump = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), coat); hump.position.set(0, 1.45, 0.45); root.add(hump);
  for (const [x, z] of [[0.22, 0.55], [-0.22, 0.55], [0.22, -0.55], [-0.22, -0.55]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.8, 8), coat);
    leg.position.set(x, 0.4, z); leg.castShadow = true; root.add(leg);
    const hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.08, 8), dark); hoof.position.set(x, 0.04, z); root.add(hoof);
  }
  const head = new THREE.Group(); head.position.set(0, 1.25, 0.95); root.add(head);
  const skull = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.35, 4, 10), coat); skull.rotation.x = 1.1; skull.position.set(0, -0.05, 0.2); skull.castShadow = true; head.add(skull);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), new THREE.MeshStandardMaterial({ color: 0x8a6a62, roughness: 0.6 })); nose.position.set(0, -0.22, 0.38); head.add(nose);
  for (const sx of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.3, 8), dark); horn.position.set(sx * 0.12, 0.2, 0.08); horn.rotation.z = -sx * 0.5; head.add(horn);
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), coat); ear.scale.set(1.6, 0.5, 1); ear.position.set(sx * 0.2, 0.05, 0.05); head.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), dark); eye.position.set(sx * 0.12, 0.0, 0.3); head.add(eye);
  }
  const tail = new THREE.Group(); tail.position.set(0, 1.25, -0.95); root.add(tail);
  const t = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.8, 6), coat); t.position.y = -0.4; tail.add(t);
  const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), dark); tuft.position.y = -0.82; tail.add(tuft);
  root.userData = { head, tail };
  return root;
}
