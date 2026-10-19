// The railway loop: arc-length parameterised centreline with heights, nearest-point queries and sweep geometry.
import * as THREE from 'three';
import { SpatialHash } from './util.js';

export const RAIL_TOP = 0.22; // rail head above formation reference height (track "ty")

export class Track {
  constructor() {
    const pts = [];
    const N = 36;
    for (let i = 0; i < N; i++) {
      const th = Math.PI / 2 + (i / N) * Math.PI * 2;
      const x = 2000 * Math.cos(th) * (1 + 0.06 * Math.sin(3 * th));
      const z = 1250 * Math.sin(th) * (1 + 0.07 * Math.cos(2 * th)) + 50 * Math.sin(5 * th);
      pts.push(new THREE.Vector3(x, 0, z));
    }
    this.curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    const M = 30000;
    const xs = new Float64Array(M + 1), zs = new Float64Array(M + 1), cum = new Float64Array(M + 1);
    const v = new THREE.Vector3();
    for (let i = 0; i <= M; i++) {
      this.curve.getPoint((i % M) / M, v);
      xs[i] = v.x; zs[i] = v.z;
      if (i > 0) cum[i] = cum[i - 1] + Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]);
    }
    const L = cum[M];
    const n = Math.ceil(L);
    this.L = L; this.n = n; this.ds = L / n;
    this.px = new Float32Array(n + 1);
    this.pz = new Float32Array(n + 1);
    this.py = new Float32Array(n + 1);
    let j = 0;
    for (let k = 0; k <= n; k++) {
      const s = k * this.ds;
      while (j < M - 1 && cum[j + 1] < s) j++;
      const t = (s - cum[j]) / Math.max(1e-9, cum[j + 1] - cum[j]);
      this.px[k] = xs[j] + (xs[j + 1] - xs[j]) * t;
      this.pz[k] = zs[j] + (zs[j + 1] - zs[j]) * t;
    }
    this.px[n] = this.px[0]; this.pz[n] = this.pz[0];
    // tangents
    this.tx = new Float32Array(n + 1);
    this.tz = new Float32Array(n + 1);
    for (let k = 0; k <= n; k++) {
      const a = (k - 1 + n) % n, b = (k + 1) % n;
      const dx = this.px[b] - this.px[a], dz = this.pz[b] - this.pz[a];
      const l = Math.hypot(dx, dz) || 1;
      this.tx[k] = dx / l; this.tz[k] = dz / l;
    }
    // spatial hash of segments every 4 samples
    this.hash = new SpatialHash(50);
    this.step = 4;
    for (let k = 0; k < n; k += this.step) {
      const k2 = Math.min(k + this.step, n);
      const mx = (this.px[k] + this.px[k2]) / 2, mz = (this.pz[k] + this.pz[k2]) / 2;
      this.hash.insert(mx, mz, k, 4);
    }
  }

  wrap(s) { const L = this.L; s %= L; return s < 0 ? s + L : s; }
  // forward distance from a to b along increasing s
  fwd(a, b) { return this.wrap(b - a); }
  // signed shortest difference b - a
  diff(a, b) { let d = this.wrap(b - a); if (d > this.L / 2) d -= this.L; return d; }

  sample(s, o = {}) {
    s = this.wrap(s);
    const u = s / this.ds;
    const i = Math.min(Math.floor(u), this.n - 1);
    const f = u - i;
    const i1 = i + 1;
    o.x = this.px[i] + (this.px[i1] - this.px[i]) * f;
    o.z = this.pz[i] + (this.pz[i1] - this.pz[i]) * f;
    o.y = this.py[i] + (this.py[i1] - this.py[i]) * f;
    let tx = this.tx[i] + (this.tx[i1] - this.tx[i]) * f;
    let tz = this.tz[i] + (this.tz[i1] - this.tz[i]) * f;
    const l = Math.sqrt(tx * tx + tz * tz) || 1;
    tx /= l; tz /= l;
    o.tx = tx; o.tz = tz;
    o.nx = tz; o.nz = -tx; // left normal
    o.grade = (this.py[i1] - this.py[i]) / this.ds;
    return o;
  }
  heightAt(s) { return this.sample(s, _o).y; }
  // point on track at s with lateral offset (left +) and vertical offset
  point(s, lat = 0, up = 0, v = new THREE.Vector3()) {
    const o = this.sample(s, _o);
    return v.set(o.x + o.nx * lat, o.y + up, o.z + o.nz * lat);
  }

  nearest(x, z, maxD = 150) {
    let best = Infinity, bestS = 0, bestSide = 0;
    const n = this.n, st = this.step;
    this.hash.query(x, z, maxD, (k) => {
      const k2 = Math.min(k + st, n);
      const ax = this.px[k], az = this.pz[k];
      const bx = this.px[k2], bz = this.pz[k2];
      const dx = bx - ax, dz = bz - az;
      const ll = dx * dx + dz * dz;
      let t = ((x - ax) * dx + (z - az) * dz) / ll;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = ax + dx * t, qz = az + dz * t;
      const d = Math.hypot(x - qx, z - qz);
      if (d < best) {
        best = d; bestS = (k + t * (k2 - k)) * this.ds;
        // side: cross of tangent and offset; left normal = (dz,-dx)
        bestSide = Math.sign((x - qx) * dz - (z - qz) * dx) || 1;
      }
    });
    return { d: best, s: bestS, side: bestSide };
  }

  // Build a swept geometry along the track between s0 and s1.
  // profile: array of { pts: [[lat, y], ...], color } polylines (lat + = left of travel).
  sweep(s0, s1, step, profile, opts = {}) {
    const ns = Math.max(1, Math.ceil((s1 - s0) / step));
    // sample the centreline once, then build every profile strip from the cache
    const SX = new Float32Array(ns + 1), SY = new Float32Array(ns + 1), SZ = new Float32Array(ns + 1);
    const NX = new Float32Array(ns + 1), NZ = new Float32Array(ns + 1), SS = new Float32Array(ns + 1);
    const o = {};
    for (let i = 0; i <= ns; i++) {
      const s = s0 + ((s1 - s0) * i) / ns;
      this.sample(s, o);
      SX[i] = o.x; SZ[i] = o.z; NX[i] = o.nx; NZ[i] = o.nz; SS[i] = s;
      SY[i] = opts.yFn ? opts.yFn(s, o) : o.y;
    }
    let strips = 0;
    for (const seg of profile) strips += seg.pts.length - 1;
    const nv = strips * (ns + 1) * 2;
    const pos = new Float32Array(nv * 3), col = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
    const idx = new (nv > 65535 ? Uint32Array : Uint16Array)(strips * ns * 6);
    let v = 0, ii = 0;
    const c = new THREE.Color();
    const us = opts.uScale || 1, vs = opts.vScale || 4;
    for (const seg of profile) {
      c.set(seg.color || '#888');
      const pts = seg.pts;
      const plen = [0];
      for (let p = 1; p < pts.length; p++) plen.push(plen[p - 1] + Math.hypot(pts[p][0] - pts[p - 1][0], pts[p][1] - pts[p - 1][1]));
      for (let p = 0; p < pts.length - 1; p++) {
        const base = v;
        const la = pts[p][0], ya = pts[p][1], lb = pts[p + 1][0], yb = pts[p + 1][1];
        for (let i = 0; i <= ns; i++) {
          pos[v * 3] = SX[i] + NX[i] * la; pos[v * 3 + 1] = SY[i] + ya; pos[v * 3 + 2] = SZ[i] + NZ[i] * la;
          pos[v * 3 + 3] = SX[i] + NX[i] * lb; pos[v * 3 + 4] = SY[i] + yb; pos[v * 3 + 5] = SZ[i] + NZ[i] * lb;
          col[v * 3] = col[v * 3 + 3] = c.r; col[v * 3 + 1] = col[v * 3 + 4] = c.g; col[v * 3 + 2] = col[v * 3 + 5] = c.b;
          uv[v * 2] = plen[p] / us; uv[v * 2 + 1] = SS[i] / vs; uv[v * 2 + 2] = plen[p + 1] / us; uv[v * 2 + 3] = SS[i] / vs;
          v += 2;
        }
        for (let i = 0; i < ns; i++) {
          const a = base + i * 2, b = a + 1, cc = a + 2, d = a + 3;
          idx[ii++] = a; idx[ii++] = b; idx[ii++] = cc; idx[ii++] = b; idx[ii++] = d; idx[ii++] = cc;
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}
const _o = {};
