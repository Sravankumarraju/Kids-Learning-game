// Car and truck: stable arcade handling on the heightfield, collisions, stuck detection and recovery.
import * as THREE from 'three';
import { clamp, damp } from './util.js';
import { WATER_LEVEL } from './terrain.js';

const PARAMS = {
  car: { maxV: 19, rev: 5, acc: 3.4, brake: 8, wb: 2.5, steer: 0.62, half: 0.95, len: 4.0, offRoad: 0.6 },
  truck: { maxV: 14, rev: 4, acc: 2.0, brake: 6, wb: 4.0, steer: 0.5, half: 1.25, len: 7.6, offRoad: 0.55 },
  suv: { maxV: 18, rev: 5, acc: 3.0, brake: 7, wb: 2.7, steer: 0.58, half: 1.0, len: 4.3, offRoad: 0.9 },
  auto: { maxV: 13, rev: 4, acc: 2.6, brake: 6, wb: 2.05, steer: 0.75, half: 0.7, len: 2.8, offRoad: 0.65 },
  tractor: { maxV: 9, rev: 3, acc: 2.0, brake: 6, wb: 2.2, steer: 0.6, half: 1.05, len: 5.5, offRoad: 1.0 },
};

export class Vehicle {
  constructor(kind, obj, world) {
    this.kind = kind;
    this.obj = obj;
    this.world = world;
    this.terrain = world.terrain;
    this.p = PARAMS[kind];
    this.x = 0; this.z = 0; this.yaw = 0;
    this.speed = 0; this.steer = 0; this.throttle = 0; this.braking = false;
    this.stuckTime = 0;
    this.wheelSpin = 0;
    this.pitch = 0; this.roll = 0;
    obj.visible = false;
    world.scene.add(obj);
  }

  place(x, z, yaw) {
    this.x = x; this.z = z; this.yaw = yaw; this.speed = 0; this.stuckTime = 0;
    this.updateTransform(1);
  }

  get onRoad() { return this.world.roadDist(this.x, this.z, 12).d < 0.5; }

  update(dt, inp, extraObstacles) {
    const p = this.p;
    // input: inp.fwd (-1..1), inp.steer (-1..1), inp.brake (bool)
    const fwd = inp.fwd;
    const road = this.onRoad;
    const vmax = p.maxV * (road ? 1 : p.offRoad);
    this.braking = false;
    this.throttle = Math.abs(fwd);
    let a = 0;
    if (fwd > 0) {
      if (this.speed < -0.3) { a = p.brake; this.braking = true; } else a = p.acc * (1 - Math.max(0, this.speed) / vmax);
    } else if (fwd < 0) {
      if (this.speed > 0.3) { a = -p.brake; this.braking = true; } else a = -p.acc * 0.7 * (1 + this.speed / p.rev);
    } else {
      a = -Math.sign(this.speed) * Math.min(Math.abs(this.speed) / dt, 1.2);
    }
    if (inp.brake) { a = -Math.sign(this.speed) * Math.min(Math.abs(this.speed) / dt, p.brake * 1.2); this.braking = true; this.throttle = 0; }
    // slope resistance
    const n = this.terrain.normalAt(this.x, this.z);
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const slope = -(n.x * fx + n.z * fz); // + uphill
    a -= slope * 9.8 * 0.6;
    this.speed = clamp(this.speed + a * dt, -p.rev, vmax + 0.5);
    if (this.speed > vmax) this.speed = damp(this.speed, vmax, 3, dt);
    // stable steering: less lock at speed
    const lock = p.steer / (1 + Math.abs(this.speed) / 9);
    this.steer = damp(this.steer, inp.steer * lock, 8, dt);
    const yawRate = (this.speed / p.wb) * Math.tan(this.steer);
    this.yaw += yawRate * dt;
    const nx = this.x + Math.sin(this.yaw) * this.speed * dt;
    const nz = this.z + Math.cos(this.yaw) * this.speed * dt;
    const hit = this.collide(nx, nz, extraObstacles);
    if (hit) {
      if (Math.abs(this.speed) > 3 && this.onBump) this.onBump();
      this.speed *= -0.15;
      // push out
      this.x = hit.x; this.z = hit.z;
    } else { this.x = nx; this.z = nz; }
    // world bounds
    this.x = clamp(this.x, -3400, 3400);
    this.z = clamp(this.z, -2400, 2400);
    // water: vehicles bog down
    const gy = this.terrain.heightAt(this.x, this.z);
    this.inWater = gy < WATER_LEVEL - 0.2;
    if (this.inWater) this.speed *= Math.pow(0.15, dt);
    // stuck detection
    if (this.throttle > 0.5 && Math.abs(this.speed) < 0.4) this.stuckTime += dt; else this.stuckTime = Math.max(0, this.stuckTime - dt * 2);
    this.stuck = this.stuckTime > 2.5 || this.inWater;
    this.wheelSpin += (this.speed * dt) / (this.obj.userData.wheelR || 0.4);
    this.updateTransform(dt);
  }

  collide(nx, nz, extra) {
    const p = this.p;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const pts = [-0.38, 0, 0.38].map((k) => [nx + fx * p.len * k, nz + fz * p.len * k]);
    const r = p.half;
    let res = null;
    const test = (o) => {
      if (res || o.active === false) return;
      for (const [px, pz] of pts) {
        let pen = 0, ox = 0, oz = 0;
        if (o.type === 'circle') {
          const dx = px - o.x, dz = pz - o.z, d = Math.hypot(dx, dz);
          if (d < o.r + r) { pen = o.r + r - d; ox = dx / (d || 1); oz = dz / (d || 1); }
        } else {
          const dx = px - o.x, dz = pz - o.z;
          const lx = dx * o.c - dz * o.s, lz = dx * o.s + dz * o.c;
          const cx = clamp(lx, -o.hx, o.hx), cz = clamp(lz, -o.hz, o.hz);
          const ex = lx - cx, ez = lz - cz, d = Math.hypot(ex, ez);
          if (d < r) {
            let nlx, nlz;
            if (d > 1e-4) { nlx = ex / d; nlz = ez / d; pen = r - d; } else {
              const ax = o.hx - Math.abs(lx), az = o.hz - Math.abs(lz);
              if (ax < az) { nlx = Math.sign(lx) || 1; nlz = 0; pen = ax + r; } else { nlx = 0; nlz = Math.sign(lz) || 1; pen = az + r; }
            }
            // back to world: inverse rotation
            ox = nlx * o.c + nlz * o.s; oz = -nlx * o.s + nlz * o.c;
          }
        }
        if (pen > 0) { res = { x: this.x + ox * Math.min(pen, 0.5), z: this.z + oz * Math.min(pen, 0.5) }; return; }
      }
    };
    this.world.vehObs.query(nx, nz, p.len + 6, test);
    if (extra) for (const o of extra) test(o);
    return res;
  }

  updateTransform(dt) {
    const p = this.p, t = this.terrain;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const rx = fz, rz = -fx;
    const gy = (x, z) => Math.max(this.world.roadDist(x, z, 8).d < 0.5 ? this.world.roadY(x, z) : t.heightAt(x, z), WATER_LEVEL - 1.2);
    const hf = gy(this.x + fx * p.wb / 2, this.z + fz * p.wb / 2);
    const hb = gy(this.x - fx * p.wb / 2, this.z - fz * p.wb / 2);
    const hl = gy(this.x + rx * p.half, this.z + rz * p.half);
    const hr = gy(this.x - rx * p.half, this.z - rz * p.half);
    const y = (hf + hb + hl + hr) / 4;
    const pitch = -Math.atan2(hf - hb, p.wb);
    const roll = Math.atan2(hl - hr, p.half * 2);
    const k = Math.min(1, dt * 10);
    this.pitch += (pitch - this.pitch) * k;
    this.roll += (roll - this.roll) * k;
    this.obj.position.set(this.x, y, this.z);
    this.obj.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ');
    for (const w of this.obj.userData.wheels) w.mesh.rotation.x = this.wheelSpin;
    for (const w of this.obj.userData.steerWheels) w.pivot.rotation.y = this.steer;
  }

  // move to the nearest road point, upright and stopped
  recover(fallback) {
    let best = null;
    for (let r = 20; r <= 1200 && !best; r *= 2) {
      const q = this.world.roadDist(this.x, this.z, r);
      if (q.p && q.d < r) best = q.p;
    }
    if (best) this.place(best.x, best.z, best.yaw);
    else if (fallback) this.place(fallback.x, fallback.z, fallback.yaw);
    this.stuckTime = 0;
  }
}
