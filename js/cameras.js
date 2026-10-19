// Camera rig: six train views, vehicle views and an orbit view for construction, with smooth transitions and clearance checks.
import * as THREE from 'three';
import { clamp, damp, lerp } from './util.js';

export const TRAIN_VIEWS = [
  { id: 'left', label: 'Left side' },
  { id: 'right', label: 'Right side' },
  { id: 'chase', label: 'Chase' },
  { id: 'cab', label: "Driver's cab" },
  { id: 'aerial', label: 'Aerial' },
  { id: 'trackside', label: 'Trackside cinematic' },
];
export const VEHICLE_VIEWS = [
  { id: 'vchase', label: 'Chase' },
  { id: 'vfar', label: 'Far chase' },
  { id: 'vcab', label: 'Driver seat' },
  { id: 'vtop', label: 'Top-down' },
];

const UP = new THREE.Vector3(0, 1, 0);

export class CameraRig {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;
    this.terrain = world.terrain;
    this.track = world.track;
    this.trainView = 'left';
    this.vehicleView = 'vchase';
    this.t = 1;
    this.dur = 1.3;
    this.from = new THREE.Vector3();
    this.fromT = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.P = new THREE.Vector3();
    this.T = new THREE.Vector3();
    this.lift = 0;
    this.sideDist = 70;
    this.autoFrame = true;
    this.vYaw = 0;
    this.orbit = { yaw: 0.6, pitch: 0.55, dist: 48, center: new THREE.Vector3() };
    this.trackside = null;
    this.onCut = null;
    this.context = null;
    this._v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  }

  get currentView() {
    if (this.context === 'train') return this.trainView;
    if (this.context === 'build') return 'orbit';
    return this.vehicleView;
  }

  beginTransition(dur = 1.3) {
    this.from.copy(this.camera.position);
    this.fromT.copy(this.target);
    this.t = 0;
    this.dur = dur;
  }
  setTrainView(id) {
    if (id === this.trainView) return;
    this.trainView = id;
    this.trackside = null;
    this._tsActive = false;
    if (this.context === 'train') this.beginTransition();
  }
  setVehicleView(id) {
    if (id === this.vehicleView) return;
    this.vehicleView = id;
    if (this.context !== 'train' && this.context !== 'build') this.beginTransition(0.9);
  }
  setContext(ctx) {
    if (ctx === this.context) return;
    this.context = ctx;
    this.trackside = null;
    this._tsActive = false;
    this.beginTransition(1.6);
  }

  // ---------- desired pose per view ----------
  trainPose(train, dt) {
    const [head, tail, mid, f] = this._v;
    train.headPos(head); train.tailPos(tail);
    mid.addVectors(head, tail).multiplyScalar(0.5);
    f.subVectors(head, tail); f.y = 0;
    const span = f.length();
    f.normalize();
    const left = new THREE.Vector3(f.z, 0, -f.x);
    const cam = this.camera;
    const view = this.trainView;
    const loco = train.loco;
    const lf = new THREE.Vector3(0, 0, 1).applyQuaternion(loco.quaternion); lf.y = 0; lf.normalize();
    this.near = 0.5;
    if (view === 'left' || view === 'right') {
      const sign = view === 'left' ? 1 : -1;
      const asp = Number.isFinite(cam.aspect) && cam.aspect > 0 ? cam.aspect : 1.6; // hidden tabs can report a 0x0 viewport
      const hf = Math.atan(Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * asp);
      let want = this.autoFrame ? ((span / 2) * 1.12 + 6) / Math.tan(hf) : 45;
      want = clamp(want, 26, 150);
      this.sideDist = Number.isFinite(this.sideDist) ? damp(this.sideDist, want, 2, dt) : want;
      const d = this.sideDist;
      this.P.copy(mid).addScaledVector(left, sign * d).addScaledVector(UP, 3.5 + d * 0.12);
      this.T.copy(mid).addScaledVector(UP, 2.0);
    } else if (view === 'chase') {
      this.P.copy(loco.position).addScaledVector(lf, -30).addScaledVector(UP, 11);
      this.T.copy(loco.position).addScaledVector(lf, 35).addScaledVector(UP, 2.5);
    } else if (view === 'cab') {
      this.near = 0.1;
      const cp = loco.userData.cabPos || [0.55, 3.25, 8.0];
      loco.localToWorld(this.P.set(cp[0], cp[1], cp[2]));
      loco.localToWorld(this.T.set(cp[0], cp[1] - 0.3, cp[2] + 52));
      return 'nocheck';
    } else if (view === 'aerial') {
      this.P.copy(mid).addScaledVector(left, 55).addScaledVector(UP, 150).addScaledVector(f, -70);
      this.T.copy(mid);
    } else if (view === 'trackside') {
      const tr = this.track;
      const lead = train.dir > 0 ? train.headS : train.tailS;
      if (this.trackside) {
        const ahead = train.dir > 0 ? tr.diff(lead, this.trackside.s) : -tr.diff(lead, this.trackside.s);
        const tailLead = train.dir > 0 ? train.tailS : train.headS;
        const tailAhead = train.dir > 0 ? tr.diff(tailLead, this.trackside.s) : -tr.diff(tailLead, this.trackside.s);
        if (tailAhead < -45 || ahead > 650) this.trackside = null;
      }
      if (!this.trackside) {
        const s = tr.wrap(lead + train.dir * (train.speed > 1 ? 260 : 120));
        const side = this.tsSide = -(this.tsSide || 1);
        let lat = side * 16;
        const p = tr.point(s, lat, 0);
        p.y = Math.max(this.terrain.heightAt(p.x, p.z), p.y) + 2.6;
        this.trackside = { s, pos: p };
        if (this._tsActive) {
          // re-pick while already in this view: a cinematic cut
          if (this.onCut) this.onCut();
          this.t = 1;
          this.camera.position.copy(p);
        }
        this._tsActive = true;
      }
      this.P.copy(this.trackside.pos);
      const locoP = loco.position;
      this.T.copy(locoP).lerp(mid, 0.35).addScaledVector(UP, 2);
    }
    return 'check';
  }

  vehiclePose(veh, dt) {
    const o = veh.obj;
    const fwd = new THREE.Vector3(Math.sin(veh.yaw), 0, Math.cos(veh.yaw));
    this.vYaw = lerpAngle(this.vYaw, veh.yaw + (veh.speed < -0.5 ? 0 : 0), 1 - Math.exp(-3 * dt));
    const vf = new THREE.Vector3(Math.sin(this.vYaw), 0, Math.cos(this.vYaw));
    const big = veh.kind === 'truck';
    this.near = 0.3;
    switch (this.vehicleView) {
      case 'vfar':
        this.P.copy(o.position).addScaledVector(vf, big ? -26 : -20).addScaledVector(UP, big ? 11 : 9);
        this.T.copy(o.position).addScaledVector(fwd, 8).addScaledVector(UP, 1.5);
        break;
      case 'vcab':
        this.near = 0.1;
        o.localToWorld(this.P.set(big ? 0.55 : 0.4, big ? 2.6 : 1.25, big ? 2.4 : -0.1));
        o.localToWorld(this.T.set(big ? 0.55 : 0.4, big ? 2.2 : 1.1, 30));
        return 'nocheck';
      case 'vtop':
        this.P.copy(o.position).addScaledVector(UP, 70).addScaledVector(vf, -8);
        this.T.copy(o.position);
        break;
      default:
        this.P.copy(o.position).addScaledVector(vf, big ? -14 : -9).addScaledVector(UP, big ? 5.5 : 3.6);
        this.T.copy(o.position).addScaledVector(fwd, 6).addScaledVector(UP, 1.4);
    }
    return 'check';
  }

  buildPose() {
    const ob = this.orbit;
    const c = ob.center;
    this.P.set(c.x + Math.sin(ob.yaw) * Math.cos(ob.pitch) * ob.dist, c.y + Math.sin(ob.pitch) * ob.dist, c.z + Math.cos(ob.yaw) * Math.cos(ob.pitch) * ob.dist);
    this.T.copy(c);
    this.near = 0.3;
    return 'check';
  }

  update(dt, ctx) {
    let res;
    if (this.context === 'train') res = this.trainPose(ctx.train, dt);
    else if (this.context === 'build') res = this.buildPose();
    else res = this.vehiclePose(ctx.vehicle, dt);
    // clearance from terrain and obstacles
    if (res === 'check') {
      const ground = this.terrain.heightAt(this.P.x, this.P.z) + 1.8;
      const obs = this.world.obstacleTop(this.P.x, this.P.z, 2.5) + 2.0;
      let need = Math.max(0, Math.max(ground, obs) - this.P.y);
      // keep a clear line of sight: rise until the view passes over buildings/trees/hills in between
      if (this.context !== 'build') {
        const P = this.P, T = this.T;
        for (let k = 1; k <= 7; k++) {
          const f = 0.12 + k * 0.1;
          const x = P.x + (T.x - P.x) * f, z = P.z + (T.z - P.z) * f;
          const top = Math.max(this.world.obstacleTop(x, z, 0.5), this.terrain.heightAt(x, z)) + 1.0;
          const lineY = P.y + need + (T.y - P.y - need) * f;
          if (top > lineY) need = Math.max(need, (top - T.y * f) / (1 - f) - P.y);
        }
        need = Math.min(need, 70);
      }
      this.lift = need > this.lift ? damp(this.lift, need, 6, dt) : damp(this.lift, need, 1.5, dt);
      this.P.y += this.lift;
    } else this.lift = 0;
    if (!Number.isFinite(this.lift)) this.lift = 0;
    const cam = this.camera;
    if (!Number.isFinite(cam.position.x + cam.position.y + cam.position.z)) { cam.position.copy(this.P); this.t = 1; }
    if (this.t < 1) {
      this.t = Math.min(1, this.t + dt / this.dur);
      const e = this.t * this.t * this.t * (this.t * (this.t * 6 - 15) + 10);
      const arc = Math.min(45, this.from.distanceTo(this.P) * 0.3) * Math.sin(Math.PI * e);
      cam.position.lerpVectors(this.from, this.P, e).addScaledVector(UP, arc);
      this.target.lerpVectors(this.fromT, this.T, e);
      // keep above ground during the blend
      const g = this.terrain.heightAt(cam.position.x, cam.position.z) + 1.5;
      if (cam.position.y < g && res === 'check') cam.position.y = g;
    } else {
      cam.position.copy(this.P);
      this.target.copy(this.T);
    }
    const near = this.t < 0.85 && this.near < 0.5 ? 0.3 : this.near;
    if (cam.near !== near) { cam.near = near; cam.updateProjectionMatrix(); }
    cam.lookAt(this.target);
  }
}

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
