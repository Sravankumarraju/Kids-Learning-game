// Procedural heightfield: rolling countryside, regional hills, a river, a flattened town and a graded track bed.
import * as THREE from 'three';
import { Assets } from './assets.js';
import { createNoise2D, fbm, rng, smoothstep, lerp, clamp, angDiff, SpatialHash, canvasTexture } from './util.js';
import { STATIONS } from './data.js';

export const WATER_LEVEL = -2.5;
export const RIVER_HALF = 18;

export class Terrain {
  constructor(track) {
    this.track = track;
    const r = rng(20251019);
    this.n1 = createNoise2D(r);
    this.n2 = createNoise2D(r);
    this.n3 = createNoise2D(r);
    this.stations = STATIONS.map((st) => {
      const s = st.f * track.L;
      const o = track.sample(s, {});
      return { ...st, s, x: o.x, z: o.z, phi: Math.atan2(o.z / 1250, o.x / 2000) };
    });
    this.hills = [
      { id: 'VNG', amp: 55, w: 0.45 },
      { id: 'SLP', amp: 48, w: 0.35 },
      { id: 'ITK', amp: 14, w: 0.3 },
      { id: 'RGP', amp: 10, w: 0.4 },
    ].map((h) => ({ ...h, phi: this.stations.find((s) => s.id === h.id).phi }));

    // river polyline
    this.river = [];
    for (let x = -3700; x <= 3700; x += 20) {
      const z = 80 * Math.sin(x / 500) + 150 * Math.sin(x / 1300 + 0.5) - 40;
      this.river.push([x, z]);
    }
    this.riverHash = new SpatialHash(60);
    for (let i = 0; i < this.river.length - 1; i++) {
      const [ax, az] = this.river[i], [bx, bz] = this.river[i + 1];
      this.riverHash.insert((ax + bx) / 2, (az + bz) / 2, i, 12);
    }

    this.computeTrackHeights();
    // town: inward from Mitrapur station
    const st0 = this.stations[0];
    const o = track.sample(st0.s, {});
    this.townCenter = new THREE.Vector3(o.x - o.nx * 260, 0, o.z - o.nz * 260);
    this.townY = o.y - 0.6;
    this.townCenter.y = this.townY;
    this.holes = [];
    this.buildGrid();
  }

  baseH(x, z) {
    const rn = Math.hypot(x / 2000, z / 1250);
    let h = 2.2 + 3 * fbm(this.n1, x / 700, z / 700, 3);
    const phi = Math.atan2(z / 1250, x / 2000);
    let hill = 0;
    for (const hl of this.hills) {
      const d = angDiff(phi, hl.phi) / hl.w;
      hill += hl.amp * Math.exp(-d * d);
    }
    hill *= smoothstep(0.55, 0.92, rn);
    const backdrop = smoothstep(1.22, 1.85, rn) * 120;
    const rid = 0.5 + 0.5 * fbm(this.n2, x / 420, z / 420, 4);
    h += (hill + backdrop) * rid * rid * 1.6;
    return h;
  }

  riverDist(x, z) {
    let best = Infinity;
    this.riverHash.query(x, z, 120, (i) => {
      const [ax, az] = this.river[i], [bx, bz] = this.river[i + 1];
      const dx = bx - ax, dz = bz - az;
      let t = ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz);
      t = clamp(t, 0, 1);
      const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
      if (d < best) best = d;
    });
    return best;
  }

  computeTrackHeights() {
    const tr = this.track, n = tr.n;
    let h = new Float64Array(n);
    for (let k = 0; k < n; k++) h[k] = this.baseH(tr.px[k], tr.pz[k]);
    const box = (arr, R) => {
      const out = new Float64Array(n);
      const pre = new Float64Array(n * 3 + 1);
      for (let i = 0; i < n * 3; i++) pre[i + 1] = pre[i] + arr[i % n];
      for (let k = 0; k < n; k++) {
        const a = k + n - R, b = k + n + R + 1;
        out[k] = (pre[b] - pre[a]) / (2 * R + 1);
      }
      return out;
    };
    h = box(box(h, 260), 260);
    // keep bridges above the river
    this.bridgeRanges = [];
    let inR = false, start = 0;
    for (let k = 0; k < n; k++) {
      const dr = this.riverDist(tr.px[k], tr.pz[k]);
      const req = WATER_LEVEL + 8 - smoothstep(60, 380, dr) * 100;
      if (req > h[k]) h[k] = req;
      const near = dr < RIVER_HALF + 14;
      if (near && !inR) { inR = true; start = k; }
      if (!near && inR) { inR = false; this.bridgeRanges.push([start * tr.ds, k * tr.ds]); }
    }
    // level platforms at stations
    for (const st of this.stations) {
      const k0 = Math.round(st.s / tr.ds);
      const y0 = h[k0];
      for (let dk = -450; dk <= 450; dk++) {
        const k = (k0 + dk + n) % n;
        const w = 1 - smoothstep(170, 450, Math.abs(dk * tr.ds));
        h[k] = lerp(h[k], y0, w);
      }
    }
    h = box(h, 30);
    for (let k = 0; k < n; k++) tr.py[k] = h[k];
    tr.py[n] = tr.py[0];
  }

  finalH(x, z, k = -1) {
    let h = this.baseH(x, z);
    const tc = this.townCenter;
    const dT = Math.hypot(x - tc.x, z - tc.z);
    if (dT < 520) h = lerp(this.townY, h, smoothstep(340, 520, dT));
    const nt = this.track.nearest(x, z, 110);
    if (k >= 0) this.vTrackD[k] = nt.d;
    if (nt.d < 110) {
      const ty = this.track.heightAt(nt.s) - 0.6;
      h = lerp(ty, h, smoothstep(30, 100, nt.d));
    }
    const rd = this.riverDist(x, z);
    if (k >= 0) this.vRiverD[k] = rd;
    if (rd < 110) {
      const bed = WATER_LEVEL - 2.4;
      h = Math.min(h, lerp(bed, Math.max(h, WATER_LEVEL + 0.8), smoothstep(RIVER_HALF - 6, RIVER_HALF + 45, rd)));
    }
    return h;
  }

  buildGrid() {
    const cell = 20;
    this.cell = cell;
    this.x0 = -3600; this.z0 = -2600;
    this.nx = 360; this.nz = 260;
    const W = this.nx + 1, D = this.nz + 1;
    this.h = new Float32Array(W * D);
    this.vTrackD = new Float32Array(W * D);
    this.vRiverD = new Float32Array(W * D);
    for (let j = 0; j < D; j++) for (let i = 0; i < W; i++) {
      const k = j * W + i;
      this.h[k] = this.finalH(this.x0 + i * cell, this.z0 + j * cell, k);
    }
  }

  heightAt(x, z) {
    const fx0 = (x - this.x0) / this.cell, fz0 = (z - this.z0) / this.cell;
    let i = Math.floor(fx0), j = Math.floor(fz0);
    i = clamp(i, 0, this.nx - 1); j = clamp(j, 0, this.nz - 1);
    const fx = clamp(fx0 - i, 0, 1), fz = clamp(fz0 - j, 0, 1);
    const W = this.nx + 1;
    const ha = this.h[j * W + i], hb = this.h[j * W + i + 1], hc = this.h[(j + 1) * W + i], hd = this.h[(j + 1) * W + i + 1];
    if (fx + fz <= 1) return ha + (hb - ha) * fx + (hc - ha) * fz;
    return hd + (hc - hd) * (1 - fx) + (hb - hd) * (1 - fz);
  }

  normalAt(x, z, out = new THREE.Vector3()) {
    const e = 2;
    const hl = this.heightAt(x - e, z), hr = this.heightAt(x + e, z);
    const hd = this.heightAt(x, z - e), hu = this.heightAt(x, z + e);
    return out.set(hl - hr, 2 * e, hd - hu).normalize();
  }

  regionWeight(id, x, z, r) {
    const st = this.stations.find((s) => s.id === id);
    const d = Math.hypot(x - st.x, z - st.z) / r;
    return Math.exp(-d * d);
  }

  buildMesh() {
    const W = this.nx + 1, D = this.nz + 1, cell = this.cell;
    const pos = new Float32Array(W * D * 3), col = new Float32Array(W * D * 3), uv = new Float32Array(W * D * 2);
    const spl = new Float32Array(W * D * 4); // texture weights: grass, forest floor, dry soil, sand
    const tint = new THREE.Color();
    const tc = this.townCenter;
    for (let j = 0; j < D; j++) for (let i = 0; i < W; i++) {
      const k = j * W + i;
      const x = this.x0 + i * cell, z = this.z0 + j * cell, y = this.h[k];
      pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
      uv[k * 2] = x / 7; uv[k * 2 + 1] = z / 7;
      const nz = fbm(this.n3, x / 160, z / 160, 3);
      const hx = this.h[k + (i < this.nx ? 1 : -1)] - y, hz = this.h[k + (j < this.nz ? W : -W)] - y;
      const slope = Math.hypot(hx, hz) / cell;
      const dT = Math.hypot(x - tc.x, z - tc.z);
      const rd = this.vRiverD[k], td = this.vTrackD[k];
      const lat = this.regionWeight('ITK', x, z, 420), slp = this.regionWeight('SLP', x, z, 380);
      let gW = 1 + Math.max(0, nz) * 0.4;
      let fW = this.regionWeight('VNG', x, z, 900) * 1.6 + Math.max(0, -nz) * 0.25;
      let dW = smoothstep(0.3, 0.7, slope) * 1.5 + (1 - smoothstep(240, 370, dT)) * 1.2 + lat * 1.6 + slp * 0.9 * smoothstep(0.1, 0.5, slope + 0.2)
        + (td < 40 ? (1 - smoothstep(6, 24, td)) * 1.2 : 0) + smoothstep(70, 140, y) * 0.6;
      let sW = (1 - smoothstep(RIVER_HALF + 2, RIVER_HALF + 30, rd)) * 3;
      const sum = gW + fW + dW + sW;
      spl[k * 4] = gW / sum; spl[k * 4 + 1] = fW / sum; spl[k * 4 + 2] = dW / sum; spl[k * 4 + 3] = sW / sum;
      // gentle colour tint on top of the real textures (regional soil colour, lush paddies, natural variation)
      tint.setRGB(1, 1, 1);
      tint.lerp(new THREE.Color(1.25, 0.78, 0.6), lat * 0.8);
      tint.lerp(new THREE.Color(0.86, 1.06, 0.82), this.regionWeight('DHN', x, z, 600) * 0.6);
      tint.lerp(new THREE.Color(0.95, 0.95, 0.97), slp * 0.5);
      const v = 0.92 + nz * 0.1;
      col[k * 3] = tint.r * v; col[k * 3 + 1] = tint.g * v; col[k * 3 + 2] = tint.b * v;
    }
    const idx = new Uint32Array(this.nx * this.nz * 6);
    let p = 0;
    for (let j = 0; j < this.nz; j++) for (let i = 0; i < this.nx; i++) {
      const a = j * W + i, b = a + 1, cc = a + W, d = cc + 1;
      idx[p++] = a; idx[p++] = cc; idx[p++] = b;
      idx[p++] = b; idx[p++] = cc; idx[p++] = d;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('splat', new THREE.BufferAttribute(spl, 4));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    g.computeBoundingSphere();

    const holes = this.holeUniform = { value: Array.from({ length: 10 }, () => new THREE.Vector4()) };
    // real ground textures blended per vertex; a second, larger-scale sample hides the tiling
    const m = Assets.material('grass', { vertexColors: true, normal: 0.8 });
    const extra = { tForest: { value: Assets.tex('forest_ground') }, tDirt: { value: Assets.tex('dry_ground') }, tSand: { value: Assets.tex('sand') } };
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uHoles = holes;
      Object.assign(sh.uniforms, extra);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
varying vec3 vWPos;
attribute vec4 splat;
varying vec4 vSplat;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vSplat = splat;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec3 vWPos;
uniform vec4 uHoles[10];
varying vec4 vSplat;
uniform sampler2D tForest;
uniform sampler2D tDirt;
uniform sampler2D tSand;
vec4 two(sampler2D t, vec2 u) { return mix(texture2D(t, u), texture2D(t, u * 0.21 + vec2(0.37, 0.11)), 0.4); }`)
        .replace('void main() {', `void main() {
 for (int i = 0; i < 10; i++) { vec4 hb = uHoles[i]; if (vWPos.x > hb.x && vWPos.x < hb.z && vWPos.z > hb.y && vWPos.z < hb.w) discard; }`)
        .replace('#include <map_fragment>', `vec4 texelColor = two(map, vMapUv) * vSplat.x + two(tForest, vMapUv) * vSplat.y + two(tDirt, vMapUv) * vSplat.z + two(tSand, vMapUv) * vSplat.w;
diffuseColor *= texelColor;`);
    };
    const mesh = new THREE.Mesh(g, m);
    mesh.receiveShadow = true;
    mesh.name = 'terrain';
    this.mesh = mesh;
    return mesh;
  }

  setHole(i, minX, minZ, maxX, maxZ) {
    if (this.holeUniform) this.holeUniform.value[i].set(minX, minZ, maxX, maxZ);
  }
}
