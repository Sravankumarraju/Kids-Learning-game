// The player's train: goods, express, local EMU or heritage steam. Cars follow the track by arc length,
// with simple forgiving physics and an assisted-driving mode.
import * as THREE from 'three';
import { makeLocomotive, makeWagon, setWagonCargo, makeCoach, makeEMUCab, makeEMURear, makeSteamLoco } from './models.js';
import { RAIL_TOP } from './track.js';
import { clamp, canvasTexture } from './util.js';
import { STOP_AHEAD } from './world.js';
import { TRAIN_TYPES } from './data.js';

export let VMAX = 20.8;
export const WAGONS = 6;
// forgiving stop zone: the loco head may stop a little short or well past the marker
export const STOP_BEFORE = 30, STOP_PAST = 60;

const HERITAGE = { body: '#7a4a2a', band: '#e8d8b0' };

export class Train {
  constructor(scene, track) {
    this.scene = scene;
    this.track = track;
    this.cars = [];
    this.headS = 60;
    this.speed = 0; // m/s, magnitude
    this.dir = 1; // +1 forward along s, -1 reverse
    this.throttle = 0; // 0..1
    this.brake = 0; // 0..1
    this.lightsOn = true;
    this.assist = false;
    this.wheelAngle = 0;
    this.targetStation = null;
    this._o = {}; this._a = new THREE.Vector3(); this._b = new THREE.Vector3();
    this.puffs = [];
    this.setConsist({ type: 'goods', livery: 0, cars: 6 });
  }

  setConsist(choice) {
    for (const c of this.cars) this.scene.remove(c);
    const def = TRAIN_TYPES.find((t) => t.id === choice.type) || TRAIN_TYPES[0];
    const liv = def.liveries[choice.livery] || def.liveries[0];
    const n = def.cars.includes(choice.cars) ? choice.cars : def.cars[Math.floor(def.cars.length / 2)];
    this.def = def;
    this.type = def.id;
    this.service = def.service;
    this.vmax = def.vmax;
    VMAX = def.vmax;
    const cars = [];
    if (def.id === 'goods') {
      cars.push(makeLocomotive(liv));
      for (let i = 0; i < WAGONS; i++) cars.push(makeWagon(`${21200 + i * 37}`));
    } else if (def.id === 'express') {
      cars.push(makeLocomotive(liv));
      for (let i = 0; i < n; i++) cars.push(makeCoach(liv, `${12400 + i * 11}`));
    } else if (def.id === 'local') {
      cars.push(makeEMUCab(liv));
      for (let i = 0; i < n - 2; i++) cars.push(makeCoach(liv, `${6300 + i * 7}`));
      cars.push(makeEMURear(liv));
    } else {
      cars.push(makeSteamLoco(liv));
      for (let i = 0; i < n; i++) cars.push(makeCoach(HERITAGE, `${101 + i}`, true));
    }
    this.cars = cars;
    this.loco = cars[0];
    let off = 0;
    for (const c of cars) {
      c.userData.centerOffset = off + c.userData.length / 2;
      off += c.userData.length;
      c.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      this.scene.add(c);
    }
    this.length = off;
    this.loco.userData.setLights(this.lightsOn);
    this.place();
  }

  get tailS() { return this.track.wrap(this.headS - this.length); }
  get kmh() { return this.speed * 3.6; }
  get stopped() { return this.speed < 0.15; }

  setLights(on) { this.lightsOn = on; this.loco.userData.setLights(on); }

  setDirection(d) {
    if (!this.stopped) return false;
    this.dir = d;
    return true;
  }

  // distance from the loco head to the stop point of a station in the direction of travel
  distanceTo(station) {
    const stop = station.s + STOP_AHEAD;
    return this.dir > 0 ? this.track.fwd(this.headS, stop) : this.track.fwd(stop, this.headS);
  }
  inStopZone(station) {
    const d = this.track.diff(station.s + STOP_AHEAD, this.headS); // + = past the marker
    return d >= -STOP_BEFORE && d <= STOP_PAST;
  }

  update(dt, ctl) {
    const tr = this.track;
    // ---- controls / assist ----
    if (this.assist && ctl.assistTarget) {
      const st = ctl.assistTarget;
      const dd = tr.diff(this.headS, st.s + STOP_AHEAD); // + means the stop point is ahead in +s
      if (this.stopped) {
        if (dd > 1.5) this.dir = 1;
        else if (dd < -1.5 && dd > -400) this.dir = -1; // overshot: back up gently
      }
      // distance still to run in the current direction; negative = we are past it
      let d;
      if (this.dir > 0) d = dd >= -1.5 ? dd : dd > -400 ? -1 : tr.L + dd;
      else d = dd <= 1.5 ? -dd : dd < 400 ? -1 : tr.L - dd;
      const v = this.speed;
      if (d < 0 || Math.abs(dd) < 1.2) {
        this.throttle = 0; this.brake = 1;
      } else {
        const cap = this.dir > 0 ? this.vmax * 0.92 : 6;
        const vt = Math.min(cap, Math.sqrt(2 * 0.5 * Math.max(0, d - 1)));
        if (v < vt - 0.5) { this.throttle = Math.min(1, this.throttle + dt * 0.8); this.brake = 0; }
        else if (v > vt) {
          const need = (v * v) / (2 * Math.max(d - 1, 0.5));
          this.throttle = 0; this.brake = clamp(need / 0.95 + 0.15, 0.2, 1);
        } else { this.throttle = Math.max(0, this.throttle - dt * 0.4); this.brake = 0; }
      }
    } else if (this.assist) {
      // no destination: gentle cruise
      const vt = 13;
      if (this.speed < vt - 0.5) { this.throttle = Math.min(0.8, this.throttle + dt * 0.6); this.brake = 0; }
      else if (this.speed > vt + 0.5) { this.throttle = 0; this.brake = 0.3; }
    } else {
      this.throttle = ctl.throttle;
      this.brake = ctl.brake;
    }
    // ---- physics ----
    const o = tr.sample(this.headS - this.length / 2, this._o);
    const v = this.speed;
    const trac = this.throttle * 0.7 * Math.min(1, (8 * this.vmax) / 20.8 / Math.max(v, 0.1));
    const res = v > 0.01 ? 0.015 + 0.00057 * (20.8 / this.vmax) * (20.8 / this.vmax) * v * v : 0;
    const grade = o.grade * this.dir * 9.8 * 0.25; // reduced for a forgiving feel
    const brk = this.brake * 0.95;
    let a = trac - res - (v > 0.05 || trac > 0 ? grade : 0) - brk;
    if (v < 0.01 && a < 0) a = 0;
    this.speed = clamp(v + a * dt, 0, this.vmax);
    if (this.throttle === 0 && this.brake > 0 && this.speed < 0.08) this.speed = 0;
    this.accel = a;
    this.headS = tr.wrap(this.headS + this.speed * this.dir * dt);
    this.travelled = (this.travelled || 0) + this.speed * dt;
    this.wheelAngle += (this.speed * this.dir * dt);
    this.place();
  }

  place() {
    const tr = this.track, o = this._o, a = this._a, b = this._b;
    for (const c of this.cars) {
      const ud = c.userData;
      const sc = this.headS - ud.centerOffset;
      const f = sc + ud.bogieOffset, r = sc - ud.bogieOffset;
      tr.sample(f, o); a.set(o.x, o.y + RAIL_TOP, o.z);
      const yawF = Math.atan2(o.tx, o.tz);
      tr.sample(r, o); b.set(o.x, o.y + RAIL_TOP, o.z);
      const yawR = Math.atan2(o.tx, o.tz);
      c.position.addVectors(a, b).multiplyScalar(0.5);
      const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
      const yaw = Math.atan2(dx, dz);
      const pitch = -Math.atan2(dy, Math.hypot(dx, dz));
      c.rotation.set(pitch, yaw, 0, 'YXZ');
      // bogies swivel to follow the rail under them
      const bg = ud.bogies;
      bg[0].position.set(0, 0, ud.bogieOffset);
      bg[1].position.set(0, 0, -ud.bogieOffset);
      bg[0].rotation.y = wrapA(yawF - yaw);
      bg[1].rotation.y = wrapA(yawR - yaw);
      const ang = this.wheelAngle / ud.wheelR;
      for (const g of bg) for (const w of g.userData.wheels) w.rotation.x = ang;
      if (bg[0].userData.rods) bg[0].userData.rods.forEach((r, k) => { const a = ang + k * Math.PI / 2; r.position.y = 0.85 + Math.sin(a) * 0.32; r.position.z = Math.cos(a) * 0.32; });
    }
  }

  // world positions of head/tail/centre for cameras
  headPos(v = new THREE.Vector3()) { return this.track.point(this.headS, 0, RAIL_TOP, v); }
  tailPos(v = new THREE.Vector3()) { return this.track.point(this.tailS, 0, RAIL_TOP, v); }

  setCargo(list) {
    // list: array of WAGONS entries {type, fill} or null; only goods wagons can show cargo
    for (let i = 0; i < WAGONS; i++) {
      const w = this.cars[i + 1];
      if (!w || !w.userData.cargo) continue;
      const e = list[i];
      setWagonCargo(w, e ? e.type : null, e ? e.fill : 1);
    }
  }

  // steam engine smoke puffs, more with throttle
  updateSmoke(dt) {
    const src = this.loco.userData.steam;
    if (!this._puffTex) {
      this._puffTex = canvasTexture(64, 64, (ctx, w, h) => {
        const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
        g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      });
    }
    if (src) {
      this._puffT = (this._puffT || 0) - dt;
      if (this._puffT <= 0) {
        this._puffT = 0.5 / (1 + this.throttle * 5 + this.speed * 0.15);
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._puffTex, color: 0xd8d8d8, transparent: true, depthWrite: false, opacity: 0.8 }));
        sp.position.copy(this.loco.localToWorld(src.clone()));
        sp.scale.set(1.2, 1.2, 1);
        this.scene.add(sp);
        this.puffs.push({ sp, life: 2.5, vy: 3 + this.throttle * 3 });
      }
    }
    for (const p of this.puffs) {
      p.life -= dt;
      p.sp.position.y += p.vy * dt;
      const k = 1 + (2.5 - p.life) * 2.2;
      p.sp.scale.set(k * 1.5, k * 1.5, 1);
      p.sp.material.opacity = Math.max(0, p.life / 2.5) * 0.7;
      if (p.life <= 0) { this.scene.remove(p.sp); p.sp.material.dispose(); }
    }
    this.puffs = this.puffs.filter((p) => p.life > 0);
  }

  // oriented boxes for vehicle collision
  obstacles() {
    return this.cars.map((c) => ({ type: 'box', x: c.position.x, z: c.position.z, hx: 1.7, hz: c.userData.length / 2, c: Math.cos(c.rotation.y), s: Math.sin(c.rotation.y), active: true }));
  }
}

function wrapA(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
