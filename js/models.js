// Procedural 3D models: locomotive, goods wagons, cargo loads, car, truck, machinery.
import * as THREE from 'three';
import { part, mat, mergeGeos, canvasTexture, rng } from './util.js';

export const M = {
  vc: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.08 }),
  vcGloss: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.2 }),
  vcMetal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.55 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x8fb4c8, roughness: 0.08, metalness: 0.3, transparent: true, opacity: 0.45 }),
};

const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const C = (rt, rb, h, seg = 12) => new THREE.CylinderGeometry(rt, rb, h, seg);
export function box(list, color, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) {
  list.push(part(B(w, h, d), color, mat(x, y, z, rx, ry, rz)));
}
export function cyl(list, color, rt, rb, h, x, y, z, rx = 0, ry = 0, rz = 0, seg = 12) {
  list.push(part(C(rt, rb, h, seg), color, mat(x, y, z, rx, ry, rz)));
}
const _up = new THREE.Vector3(0, 1, 0);
export function beam(list, color, a, b, t = 0.08, round = false) {
  const d = new THREE.Vector3().subVectors(b, a);
  const l = d.length();
  const q = new THREE.Quaternion().setFromUnitVectors(_up, d.normalize());
  const m = new THREE.Matrix4().compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
  list.push(part(round ? C(t / 2, t / 2, l, 6) : B(t, l, t), color, m));
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// side profile extruded across width; profile pts are [z, y]
function extrudeProfile(pts, width, color, bevel = 0.04) {
  const sh = new THREE.Shape();
  sh.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: width - bevel * 2, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1 });
  g.translate(0, 0, -(width - bevel * 2) / 2);
  g.rotateY(-Math.PI / 2);
  g.deleteAttribute('uv');
  return part(g, color);
}

// ---------- Wheelsets ----------
function wheelsetGeo(r, gauge = 1.676, rimColor = '#b8b8b0') {
  const l = [];
  for (const sx of [-1, 1]) {
    const x = (sx * gauge) / 2;
    cyl(l, '#2a2a2a', r, r, 0.14, x, 0, 0, 0, 0, Math.PI / 2, 18);
    cyl(l, rimColor, r * 1.02, r * 1.02, 0.05, x + sx * -0.06, 0, 0, 0, 0, Math.PI / 2, 18);
    cyl(l, '#555', r * 0.35, r * 0.35, 0.18, x + sx * 0.02, 0, 0, 0, 0, Math.PI / 2, 10);
    // rotation marker so spinning is visible
    box(l, '#e8e0c8', 0.04, r * 0.55, 0.1, x + sx * 0.075, r * 0.42, 0);
    box(l, '#e8e0c8', 0.04, r * 0.55, 0.1, x + sx * 0.075, -r * 0.42, 0);
  }
  cyl(l, '#3a3a3a', 0.09, 0.09, gauge, 0, 0, 0, 0, 0, Math.PI / 2, 8);
  return mergeGeos(l);
}

function makeBogie(axles, spacing, r, frameColor) {
  const g = new THREE.Group();
  const l = [];
  const len = spacing * (axles - 1) + r * 2 + 0.6;
  for (const sx of [-1, 1]) {
    box(l, frameColor, 0.16, 0.42, len, sx * 1.08, r + 0.05, 0);
    box(l, frameColor, 0.12, 0.14, len - 0.4, sx * 1.08, r + 0.33, 0);
    for (let a = 0; a < axles; a++) {
      const z = (a - (axles - 1) / 2) * spacing;
      box(l, '#3b3b3b', 0.28, 0.32, 0.36, sx * 1.1, r, z); // axle box
      cyl(l, '#9a8a40', 0.11, 0.11, 0.32, sx * 1.12, r + 0.42, z, 0, 0, 0, 8); // spring
    }
  }
  box(l, frameColor, 2.1, 0.22, 0.5, 0, r + 0.25, 0); // bolster
  if (axles > 2) box(l, frameColor, 2.1, 0.18, 0.3, 0, r + 0.2, len / 2 - 0.4);
  const frame = new THREE.Mesh(mergeGeos(l), M.vc);
  frame.castShadow = true;
  g.add(frame);
  g.userData.wheels = [];
  const wg = wheelsetGeo(r);
  for (let a = 0; a < axles; a++) {
    const w = new THREE.Mesh(wg, M.vcMetal);
    w.position.set(0, r, (a - (axles - 1) / 2) * spacing);
    w.castShadow = true;
    g.add(w);
    g.userData.wheels.push(w);
  }
  return g;
}

function coupler(l, z, dir) {
  box(l, '#2b2b2b', 0.24, 0.22, 0.7, 0, 1.0, z - dir * 0.2);
  box(l, '#3a3a3a', 0.42, 0.36, 0.28, 0, 1.0, z + dir * 0.12);
  box(l, '#3a3a3a', 0.12, 0.2, 0.18, 0.14, 1.0, z + dir * 0.28);
}

// ---------- Locomotive (Indian electric freight loco inspired, Co-Co) ----------
export function makeLocomotive(liv = {}) {
  const root = new THREE.Group();
  root.name = 'loco';
  const RED = liv.body || '#9c2219', CREAM = liv.band || '#efe2bf', GREY = '#55585a', DARK = '#202224', ROOF = '#7b7f80';
  const l = [];
  const body = [[-10, 1.18], [10, 1.18], [10, 2.55], [9.6, 3.72], [9.25, 4.05], [-9.25, 4.05], [-9.6, 3.72], [-10, 2.55]];
  l.push(extrudeProfile(body, 3.12, RED));
  // cream livery bands (sides + wrap around noses)
  for (const sx of [-1, 1]) {
    box(l, CREAM, 0.03, 0.26, 19.6, sx * 1.575, 2.3, 0);
    box(l, CREAM, 0.03, 0.09, 19.6, sx * 1.575, 1.62, 0);
    box(l, CREAM, 0.03, 0.09, 18.4, sx * 1.575, 3.9, 0);
  }
  for (const sz of [-1, 1]) {
    box(l, CREAM, 3.0, 0.26, 0.03, 0, 2.3, sz * 10.04);
    box(l, CREAM, 3.0, 0.09, 0.03, 0, 1.62, sz * 10.04);
  }
  // roof
  box(l, ROOF, 2.7, 0.12, 18.2, 0, 4.1, 0);
  box(l, GREY, 1.6, 0.35, 5.0, 0, 4.3, 0);
  box(l, GREY, 1.1, 0.25, 2.2, 0, 4.25, 3.6);
  box(l, GREY, 1.1, 0.25, 2.2, 0, 4.25, -3.6);
  // side louvres
  for (const sx of [-1, 1]) for (let p = 0; p < 3; p++) {
    const zc = -5 + p * 5;
    box(l, '#3d3f41', 0.03, 1.0, 3.6, sx * 1.58, 3.1, zc);
    for (let k = 0; k < 9; k++) box(l, '#6a6d70', 0.05, 0.9, 0.06, sx * 1.6, 3.1, zc - 1.6 + k * 0.4);
  }
  // cab side windows + doors
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    box(l, '#1b2a33', 0.04, 0.7, 0.95, sx * 1.58, 3.25, sz * 8.55);
    box(l, '#7a1a14', 0.04, 1.9, 0.75, sx * 1.585, 2.35, sz * 7.5);
    box(l, '#c9c9c9', 0.05, 0.05, 1.2, sx * 1.62, 2.1, sz * 7.5); // grab rail
  }
  // windshields
  const wl = [];
  for (const sz of [-1, 1]) {
    for (const sx of [-1, 1]) box(wl, '#16242c', 1.3, 1.05, 0.05, sx * 0.72, 3.15, sz * 9.82, -sz * 0.36);
    box(l, RED, 0.12, 1.1, 0.06, 0, 3.15, sz * 9.84, -sz * 0.36);
    // headlight housing
    box(l, DARK, 1.2, 0.32, 0.4, 0, 3.98, sz * 9.25);
    // marker light housings
    for (const sx of [-1, 1]) box(l, DARK, 0.3, 0.3, 0.12, sx * 1.15, 1.85, sz * 10.03);
    // pilot / cow-catcher and steps
    box(l, '#2c2c2c', 2.8, 0.55, 0.25, 0, 0.75, sz * 10.05, sz * 0.25);
    for (const sx of [-1, 1]) {
      box(l, '#c7b23b', 0.5, 0.06, 0.3, sx * 1.35, 0.85, sz * 9.6);
      box(l, '#c7b23b', 0.5, 0.06, 0.3, sx * 1.35, 0.45, sz * 9.6);
    }
    coupler(l, sz * 10.15, sz);
  }
  // underframe
  box(l, '#2d2e30', 3.0, 0.24, 19.8, 0, 1.06, 0);
  box(l, '#3a3c3e', 2.4, 0.55, 5.2, 0, 0.72, 0);
  for (const sx of [-1, 1]) cyl(l, '#4a4a4a', 0.28, 0.28, 2.0, sx * 0.9, 0.7, -0.5, Math.PI / 2, 0, 0, 10);
  // side handrails
  for (const sx of [-1, 1]) {
    beam(l, '#d0d0d0', V(sx * 1.62, 2.1, -6.5), V(sx * 1.62, 2.1, 6.5), 0.05, true);
  }
  const bodyMat = M.vcGloss.clone();
  bodyMat.side = THREE.DoubleSide;
  const bodyMesh = new THREE.Mesh(mergeGeos(l), bodyMat);
  bodyMesh.castShadow = true; bodyMesh.receiveShadow = true;
  root.add(bodyMesh);
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x1e3440, roughness: 0.05, metalness: 0.5, transparent: true, opacity: 0.82 });
  const glass = new THREE.Mesh(mergeGeos(wl), glassMat);
  root.add(glass);
  // simple driver's desk visible from the cab view
  const dl = [];
  box(dl, '#3b4045', 2.9, 0.55, 0.8, 0, 2.75, 9.15);
  box(dl, '#23272a', 1.2, 0.35, 0.05, 0.62, 3.08, 8.82, -0.5);
  for (let k = 0; k < 3; k++) cyl(dl, '#e8e4d0', 0.1, 0.1, 0.02, 0.25 + k * 0.33, 3.1, 8.8, Math.PI / 2 - 0.5, 0, 0, 12);
  box(dl, '#7a1a14', 0.08, 1.2, 0.08, 0, 3.4, 9.55, -0.36);
  const desk = new THREE.Mesh(mergeGeos(dl), M.vc);
  root.add(desk);
  // cab frame seen from the driver's seat (shown only in cab view; the shell is then rendered single-sided)
  const fl = [];
  box(fl, '#5a1410', 3.0, 0.3, 0.25, 0, 3.85, 9.35);
  for (const x of [-1.5, 0, 1.5]) box(fl, '#5a1410', 0.14, 1.3, 0.14, x, 3.25, 9.55, -0.36);
  for (const sx of [-1, 1]) {
    box(fl, '#6a1a14', 0.06, 1.4, 1.8, sx * 1.52, 2.0, 8.6);
    box(fl, '#6a1a14', 0.06, 0.25, 1.8, sx * 1.52, 3.95, 8.6);
  }
  box(fl, '#2b2b2b', 3.0, 0.08, 2.0, 0, 4.06, 8.6);
  const cabFrame = new THREE.Mesh(mergeGeos(fl), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }));
  cabFrame.visible = false;
  root.add(cabFrame);

  // number plate decal
  const plate = canvasTexture(256, 64, (ctx, w, h) => {
    ctx.fillStyle = RED; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = CREAM; ctx.font = 'bold 40px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('WAG 31108', w / 2, h / 2 + 2);
  });
  const pm = new THREE.MeshStandardMaterial({ map: plate, roughness: 0.5 });
  for (const sx of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), pm);
    p.position.set(sx * 1.6, 1.88, 0);
    p.rotation.y = sx * Math.PI / 2;
    root.add(p);
  }

  // pantographs (rear raised to touch wire)
  const pl = [];
  for (const [zc, raised] of [[6.2, false], [-6.2, true]]) {
    for (const sx of [-1, 1]) cyl(pl, '#c46a3a', 0.08, 0.1, 0.35, sx * 0.55, 4.35, zc, 0, 0, 0, 8);
    box(pl, '#4a4a4a', 1.4, 0.08, 1.4, 0, 4.55, zc);
    const hinge = V(0, 4.62, zc + 1.0);
    const knee = raised ? V(0, 5.05, zc - 0.9) : V(0, 4.75, zc - 1.2);
    const head = raised ? V(0, 5.42, zc + 0.6) : V(0, 4.85, zc + 0.4);
    beam(pl, '#9aa0a3', hinge, knee, 0.1, true);
    beam(pl, '#9aa0a3', knee, head, 0.07, true);
    box(pl, '#303030', 1.9, 0.08, 0.16, 0, head.y + 0.04, head.z);
    box(pl, '#9aa0a3', 0.06, 0.06, 0.4, -0.95, head.y + 0.02, head.z);
    box(pl, '#9aa0a3', 0.06, 0.06, 0.4, 0.95, head.y + 0.02, head.z);
  }
  const panto = new THREE.Mesh(mergeGeos(pl), M.vcMetal);
  panto.castShadow = true;
  root.add(panto);

  // headlights and marker lamps (separate material to switch emissive)
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xfff2c0, emissiveIntensity: 0, roughness: 0.2 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x661111, emissive: 0xff2010, emissiveIntensity: 0, roughness: 0.3 });
  const ll = [], tl = [];
  for (const sx of [-1, 1]) {
    ll.push(part(C(0.14, 0.14, 0.06, 14), '#fff', mat(sx * 0.32, 3.98, 9.46, Math.PI / 2)));
    ll.push(part(C(0.1, 0.1, 0.06, 12), '#fff', mat(sx * 1.15, 1.85, 10.1, Math.PI / 2)));
    tl.push(part(C(0.1, 0.1, 0.06, 12), '#fff', mat(sx * 1.15, 1.85, -10.1, Math.PI / 2)));
  }
  const lamps = new THREE.Mesh(mergeGeos(ll), lampMat);
  const tails = new THREE.Mesh(mergeGeos(tl), tailMat);
  root.add(lamps, tails);
  const glowTex = canvasTexture(64, 64, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,250,220,1)'); g.addColorStop(0.25, 'rgba(255,240,180,0.6)'); g.addColorStop(1, 'rgba(255,230,150,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  });
  const glowMat = new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
  const glows = [];
  for (const sx of [-1, 1]) {
    const sp = new THREE.Sprite(glowMat);
    sp.scale.set(2.2, 2.2, 1);
    sp.position.set(sx * 0.32, 3.98, 9.6);
    root.add(sp); glows.push(sp);
  }
  const spot = new THREE.SpotLight(0xfff1cc, 0, 160, 0.32, 0.5, 1.2);
  spot.position.set(0, 3.9, 9.6);
  spot.target.position.set(0, 0, 60);
  root.add(spot, spot.target);

  const bogies = [makeBogie(3, 1.9, 0.545, '#2e2f31'), makeBogie(3, 1.9, 0.545, '#2e2f31')];
  root.add(bogies[0], bogies[1]);
  root.userData = {
    kind: 'loco', length: 20.56, bogieOffset: 5.4, bogies, wheelR: 0.545, cabPos: [0.55, 3.25, 8.0],
    setCabView(on) {
      glassMat.opacity = on ? 0.1 : 0.82;
      bodyMat.side = on ? THREE.FrontSide : THREE.DoubleSide;
      bodyMat.needsUpdate = true;
      cabFrame.visible = on;
    },
    setLights(on) {
      lampMat.emissiveIntensity = on ? 2.2 : 0;
      tailMat.emissiveIntensity = on ? 1.4 : 0;
      glowMat.opacity = on ? 0.9 : 0;
      spot.intensity = on ? 220 : 0;
    },
  };
  return root;
}

// ---------- Goods wagon (open high-sided wagon inspired) ----------
let wagonGeoCache = null;
export function makeWagon(num) {
  const root = new THREE.Group();
  if (!wagonGeoCache) {
    const l = [];
    const RUST = '#6b3326', RIB = '#5a2a1f', DARK = '#262626';
    box(l, RUST, 3.1, 0.12, 9.8, 0, 1.28, 0); // floor
    for (const sx of [-1, 1]) {
      box(l, RUST, 0.07, 1.9, 9.8, sx * 1.56, 2.27, 0);
      box(l, RIB, 0.12, 0.12, 9.9, sx * 1.6, 3.22, 0); // top rail
      box(l, DARK, 0.14, 0.26, 9.9, sx * 1.6, 1.2, 0); // sole bar
      for (let k = 0; k < 11; k++) box(l, RIB, 0.09, 1.9, 0.12, sx * 1.62, 2.27, -4.75 + k * 0.95);
    }
    for (const sz of [-1, 1]) {
      box(l, RUST, 3.2, 1.9, 0.07, 0, 2.27, sz * 4.9);
      box(l, RIB, 3.25, 0.12, 0.12, 0, 3.22, sz * 4.92);
      for (let k = 0; k < 3; k++) box(l, RIB, 0.12, 1.9, 0.1, -1.0 + k, 2.27, sz * 4.95);
      coupler(l, sz * 5.1, sz);
      box(l, '#c9c9c9', 0.05, 0.05, 0.6, 1.45, 1.6, sz * 5.0); // handrail stub
    }
    box(l, DARK, 0.5, 0.35, 9.6, 0, 1.0, 0); // centre sill
    cyl(l, '#3a3a3a', 0.25, 0.25, 1.4, 0.6, 0.9, 0.5, Math.PI / 2, 0, 0, 10); // brake cylinder
    wagonGeoCache = mergeGeos(l);
  }
  const bodyMesh = new THREE.Mesh(wagonGeoCache, M.vc);
  bodyMesh.castShadow = true; bodyMesh.receiveShadow = true;
  root.add(bodyMesh);
  const tex = canvasTexture(512, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(240,235,220,0.92)';
    ctx.font = 'bold 40px monospace';
    ctx.fillText('NR  BOXN', 16, 50);
    ctx.font = 'bold 30px monospace';
    ctx.fillText(`${num}  CC 58.81T`, 16, 100);
    ctx.fillRect(330, 18, 160, 4);
  });
  const dm = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  for (const sx of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), dm);
    p.position.set(sx * 1.68, 2.6, -2.2 * sx);
    p.rotation.y = sx * Math.PI / 2;
    root.add(p);
  }
  const bogies = [makeBogie(2, 2.0, 0.5, '#3a3a3a'), makeBogie(2, 2.0, 0.5, '#3a3a3a')];
  root.add(bogies[0], bogies[1]);
  const cargo = new THREE.Group();
  cargo.position.y = 1.34;
  root.add(cargo);
  root.userData = { kind: 'wagon', length: 10.71, bogieOffset: 3.25, bogies, wheelR: 0.5, cargo, cargoType: null };
  return root;
}

// ---------- Cargo loads (fit an area ~ 9.2 x 2.9) ----------
const cargoCache = {};
export function cargoGeometry(type, w = 2.9, len = 9.2) {
  const key = `${type}:${w}:${len}`;
  if (cargoCache[key]) return cargoCache[key];
  const l = [];
  const r = rng(type.length * 97 + len * 3);
  const vary = (hex, amt = 0.12) => {
    const c = new THREE.Color(hex);
    const k = 1 - amt + r() * amt * 2;
    return c.multiplyScalar(k);
  };
  if (type === 'timber') {
    const logL = len / 2 - 0.2;
    for (const half of [-1, 1]) {
      let layer = 0;
      for (let row = 6; row > 0; row -= 1, layer++) {
        const rad = 0.24;
        for (let i = 0; i < row; i++) {
          const x = (i - (row - 1) / 2) * rad * 2.02;
          if (Math.abs(x) > w / 2 - rad) continue;
          const y = rad + layer * rad * 1.75;
          l.push(part(C(rad, rad, logL, 9), vary('#7a5230', 0.18), mat(x, y, half * (logL / 2 + 0.1), Math.PI / 2)));
          l.push(part(C(rad * 0.98, rad * 0.98, 0.02, 9), '#d9b884', mat(x, y, half * (logL + 0.11), Math.PI / 2)));
        }
      }
    }
  } else if (type === 'bricks' || type === 'tiles') {
    const base = type === 'bricks' ? '#b5482f' : '#c0622f';
    const nz = Math.floor(len / 1.5);
    for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < 2; ix++) {
      const x = (ix - 0.5) * (w / 2), z = (iz - (nz - 1) / 2) * (len / nz);
      const hgt = type === 'bricks' ? 1.5 + r() * 0.3 : 1.0 + r() * 0.3;
      box(l, '#8b6a45', w / 2 - 0.15, 0.12, len / nz - 0.2, x, 0.06, z); // pallet
      const layers = type === 'bricks' ? 6 : 8;
      for (let k = 0; k < layers; k++) {
        box(l, vary(base, 0.15), w / 2 - 0.2, hgt / layers - 0.02, len / nz - 0.25, x, 0.12 + (k + 0.5) * (hgt / layers), z);
      }
    }
  } else if (type === 'cement') {
    for (let layer = 0; layer < 5; layer++) {
      const nz = Math.floor(len / 0.7), nx = Math.floor(w / 0.5);
      for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
        if (layer > 2 && (iz === 0 || iz === nz - 1)) continue;
        const x = (ix - (nx - 1) / 2) * 0.5 + (layer % 2) * 0.05, z = (iz - (nz - 1) / 2) * 0.7;
        box(l, vary('#c9c7bf', 0.08), 0.46, 0.2, 0.64, x, 0.11 + layer * 0.22, z, 0, (r() - 0.5) * 0.1);
      }
    }
  } else if (type === 'produce') {
    const cols = ['#d83a2a', '#f0c330', '#4f9a3a', '#e57a26', '#7b3f8c'];
    const nz = Math.floor(len / 0.8);
    for (let layer = 0; layer < 3; layer++) for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < 3; ix++) {
      const x = (ix - 1) * 0.9, z = (iz - (nz - 1) / 2) * 0.8;
      box(l, vary('#a07a4a'), 0.82, 0.5, 0.72, x, 0.25 + layer * 0.52, z);
      if (layer === 2) box(l, cols[Math.floor(r() * cols.length)], 0.74, 0.1, 0.64, x, 0.52 + layer * 0.52, z);
    }
  } else if (type === 'glass') {
    const nz = Math.floor(len / 1.4);
    for (let iz = 0; iz < nz; iz++) {
      const z = (iz - (nz - 1) / 2) * 1.4;
      box(l, '#9c7b52', w - 0.3, 0.12, 1.1, 0, 0.06, z);
      for (const sx of [-1, 1]) beam(l, '#9c7b52', V(sx * 1.2, 0.1, z), V(sx * 0.15, 1.8, z), 0.1);
      for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) {
        box(l, '#9fd0df', 0.03, 1.5, 1.0, sx * (0.35 + k * 0.08), 0.95, z, 0, 0, sx * 0.55);
      }
    }
  } else if (type === 'paint') {
    const cols = ['#e0a21b', '#2f6db5', '#c8342f', '#3d9b56', '#ffffff'];
    const nz = Math.floor(len / 0.65), nx = Math.floor(w / 0.65);
    for (let layer = 0; layer < 2; layer++) for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
      const x = (ix - (nx - 1) / 2) * 0.65, z = (iz - (nz - 1) / 2) * 0.65;
      cyl(l, cols[Math.floor(r() * cols.length)], 0.28, 0.28, 0.85, x, 0.43 + layer * 0.88, z, 0, 0, 0, 10);
      cyl(l, '#5a5a5a', 0.29, 0.29, 0.04, x, 0.86 + layer * 0.88, z, 0, 0, 0, 10);
    }
  } else if (type === 'saplings') {
    const nz = Math.floor(len / 0.7), nx = Math.floor(w / 0.7);
    for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
      const x = (ix - (nx - 1) / 2) * 0.7, z = (iz - (nz - 1) / 2) * 0.7;
      cyl(l, '#7a4a2a', 0.22, 0.16, 0.35, x, 0.18, z, 0, 0, 0, 8);
      cyl(l, '#5b3a22', 0.03, 0.03, 0.6, x, 0.6, z, 0, 0, 0, 5);
      l.push(part(new THREE.IcosahedronGeometry(0.32 + r() * 0.12, 0), vary('#3f8f34', 0.2), mat(x, 1.0 + r() * 0.2, z)));
    }
  }
  const g = mergeGeos(l);
  cargoCache[key] = g;
  return g;
}

export function setWagonCargo(wagon, type, fill = 1) {
  const cg = wagon.userData.cargo;
  while (cg.children.length) cg.remove(cg.children[0]);
  wagon.userData.cargoType = type;
  if (!type) return;
  const m = new THREE.Mesh(cargoGeometry(type), M.vc);
  m.castShadow = true;
  m.scale.y = 0.45 + 0.55 * fill;
  cg.add(m);
}

// ---------- Car (small hatchback) ----------
export function makeCar(BODY = '#2f78c4') {
  const root = new THREE.Group();
  const l = [];
  const prof = [[-1.95, 0.32], [1.95, 0.32], [2.0, 0.72], [1.85, 0.92], [0.85, 1.05], [0.2, 1.52], [-1.55, 1.55], [-1.9, 1.3], [-2.0, 0.75]];
  l.push(extrudeProfile(prof, 1.7, BODY, 0.06));
  // windows
  for (const sx of [-1, 1]) {
    box(l, '#1b2733', 0.03, 0.38, 1.6, sx * 0.86, 1.28, -0.55);
    box(l, '#d9d9d9', 0.04, 0.05, 3.2, sx * 0.87, 0.62, 0);
  }
  box(l, '#1b2733', 1.5, 0.45, 0.03, 0, 1.28, 0.55, -0.85);
  box(l, '#1b2733', 1.45, 0.35, 0.03, 0, 1.32, -1.72, 0.45);
  box(l, '#d9d9d9', 1.7, 0.18, 0.12, 0, 0.45, 2.0);
  box(l, '#d9d9d9', 1.7, 0.18, 0.12, 0, 0.45, -2.0);
  for (const sx of [-1, 1]) {
    box(l, '#fff8d0', 0.32, 0.16, 0.05, sx * 0.6, 0.78, 1.99);
    box(l, '#c81e1e', 0.25, 0.15, 0.05, sx * 0.65, 0.85, -1.99);
    box(l, '#222', 0.08, 0.1, 0.15, sx * 0.9, 1.05, 0.7); // mirrors
  }
  box(l, '#ffffff', 0.5, 0.12, 0.03, 0, 0.45, 2.07); // number plate
  const body = new THREE.Mesh(mergeGeos(l), M.vcGloss);
  body.castShadow = true;
  root.add(body);
  const wheels = addWheels(root, [[0.78, 1.25], [-0.78, 1.25], [0.78, -1.25], [-0.78, -1.25]], 0.32, 0.2);
  root.userData = { kind: 'car', wheels, steerWheels: wheels.slice(0, 2), wheelR: 0.32 };
  return root;
}

function addWheels(root, posList, r, wdt) {
  const l = [];
  cyl(l, '#1d1d1d', r, r, wdt, 0, 0, 0, 0, 0, Math.PI / 2, 16);
  cyl(l, '#bdbdbd', r * 0.55, r * 0.55, wdt + 0.02, 0, 0, 0, 0, 0, Math.PI / 2, 10);
  box(l, '#777', wdt + 0.04, r * 0.9, 0.08, 0, 0, 0);
  const g = mergeGeos(l);
  const out = [];
  for (const [x, z] of posList) {
    const pivot = new THREE.Group();
    pivot.position.set(x, r, z);
    const w = new THREE.Mesh(g, M.vc);
    w.castShadow = true;
    pivot.add(w);
    root.add(pivot);
    out.push({ pivot, mesh: w });
  }
  return out;
}

// ---------- Truck (Indian goods truck inspired) ----------
export function makeTruck(CAB = '#e8862a') {
  const root = new THREE.Group();
  const l = [];
  const DARK = '#262626';
  box(l, DARK, 1.2, 0.3, 7.2, 0, 0.75, -0.3); // chassis
  // cab
  box(l, CAB, 2.35, 1.5, 1.9, 0, 1.75, 2.45);
  box(l, CAB, 2.3, 0.5, 1.7, 0, 2.7, 2.35);
  box(l, '#1b2733', 2.0, 0.65, 0.05, 0, 2.2, 3.41);
  box(l, '#c9c9c9', 2.1, 0.5, 0.06, 0, 1.25, 3.41); // grille
  for (let k = 0; k < 5; k++) box(l, '#777', 1.9, 0.04, 0.07, 0, 1.08 + k * 0.08, 3.43);
  box(l, '#b8b8b8', 2.4, 0.22, 0.2, 0, 0.75, 3.5); // bumper
  box(l, '#d21f3c', 2.35, 0.12, 0.05, 0, 2.95, 3.38); // decorated visor
  for (let k = 0; k < 7; k++) box(l, ['#f6d32b', '#2aa84a', '#2f6db5'][k % 3], 0.18, 0.18, 0.04, -0.95 + k * 0.32, 2.85, 3.42, 0, 0, Math.PI / 4);
  for (const sx of [-1, 1]) {
    box(l, '#1b2733', 0.05, 0.6, 0.9, sx * 1.18, 2.15, 2.6);
    box(l, '#fff8d0', 0.35, 0.22, 0.05, sx * 0.85, 1.12, 3.46);
    box(l, '#222', 0.06, 0.4, 0.2, sx * 1.3, 2.3, 3.2);
  }
  // bed with tall wooden sides
  const BED = '#2f6db5';
  box(l, '#6b4a2a', 2.4, 0.15, 5.0, 0, 1.0, -1.25);
  for (const sx of [-1, 1]) {
    box(l, BED, 0.08, 1.2, 5.0, sx * 1.2, 1.68, -1.25);
    box(l, '#f6d32b', 0.09, 0.12, 5.0, sx * 1.2, 2.1, -1.25);
    box(l, '#d21f3c', 0.09, 0.08, 5.0, sx * 1.2, 1.3, -1.25);
  }
  box(l, BED, 2.4, 1.6, 0.1, 0, 1.85, 1.25); // headboard
  box(l, BED, 2.4, 1.2, 0.08, 0, 1.68, -3.75); // tailgate
  for (const sx of [-1, 1]) {
    box(l, '#c81e1e', 0.3, 0.18, 0.05, sx * 0.95, 0.85, -3.8);
    box(l, DARK, 0.6, 0.5, 0.05, sx * 1.0, 0.6, -2.4); // mud flaps
  }
  const body = new THREE.Mesh(mergeGeos(l), M.vcGloss);
  body.castShadow = true;
  root.add(body);
  const hop = canvasTexture(512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#2f6db5'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f6d32b'; ctx.fillRect(0, 0, w, 22); ctx.fillRect(0, h - 22, w, 22);
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 64px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('HORN OK', w / 2, 105); ctx.fillText('PLEASE', w / 2, 180);
    ctx.fillStyle = '#d21f3c'; ctx.beginPath(); ctx.arc(60, 128, 26, 0, 7); ctx.arc(w - 60, 128, 26, 0, 7); ctx.fill();
  });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.1), new THREE.MeshStandardMaterial({ map: hop, roughness: 0.6 }));
  back.position.set(0, 1.68, -3.80);
  back.rotation.y = Math.PI;
  root.add(back);
  const cargo = new THREE.Group();
  cargo.position.set(0, 1.08, -1.25);
  root.add(cargo);
  const wheels = addWheels(root, [[1.0, 2.4], [-1.0, 2.4], [1.0, -1.6], [-1.0, -1.6], [1.0, -2.75], [-1.0, -2.75]], 0.48, 0.32);
  root.userData = { kind: 'truck', wheels, steerWheels: wheels.slice(0, 2), wheelR: 0.48, cargo };
  return root;
}

export function setTruckCargo(truck, load) {
  const cg = truck.userData.cargo;
  while (cg.children.length) cg.remove(cg.children[0]);
  const types = Object.keys(load).filter((k) => load[k] > 0);
  if (!types.length) return;
  const seg = 4.6 / types.length;
  types.forEach((t, i) => {
    const m = new THREE.Mesh(cargoGeometry(t, 2.2, seg - 0.1), M.vc);
    m.position.z = -2.3 + seg * (i + 0.5);
    m.scale.y = 0.55;
    m.castShadow = true;
    cg.add(m);
  });
}

// ---------- Excavator ----------
export function makeExcavator() {
  const root = new THREE.Group();
  const Y = '#f2b81c', D = '#2b2b2b';
  const l = [];
  for (const sx of [-1, 1]) {
    box(l, D, 0.7, 0.75, 4.2, sx * 1.25, 0.38, 0);
    for (let k = 0; k < 4; k++) cyl(l, '#555', 0.28, 0.28, 0.72, sx * 1.25, 0.38, -1.5 + k, 0, 0, Math.PI / 2, 10);
  }
  box(l, D, 1.6, 0.4, 2.8, 0, 0.7, 0);
  const base = new THREE.Mesh(mergeGeos(l), M.vc);
  base.castShadow = true;
  root.add(base);
  const upper = new THREE.Group();
  upper.position.y = 0.95;
  root.add(upper);
  const ul = [];
  box(ul, Y, 2.6, 1.0, 3.2, 0, 0.5, -0.4);
  box(ul, '#3a3a3a', 2.6, 0.9, 0.8, 0, 0.55, -2.1); // counterweight
  box(ul, Y, 1.0, 1.4, 1.2, -0.75, 1.65, 0.6); // cab
  box(ul, '#1b2733', 0.9, 0.9, 0.05, -0.75, 1.8, 1.21);
  box(ul, '#1b2733', 0.05, 0.8, 1.0, -1.26, 1.75, 0.6);
  cyl(ul, '#333', 0.08, 0.08, 0.8, 0.8, 1.4, -1.0, 0, 0, 0, 6); // exhaust
  const upMesh = new THREE.Mesh(mergeGeos(ul), M.vc);
  upMesh.castShadow = true;
  upper.add(upMesh);
  const boom = new THREE.Group();
  boom.position.set(0.35, 1.0, 1.1);
  upper.add(boom);
  const bl = [];
  box(bl, Y, 0.45, 0.6, 5.4, 0, 0, 2.7);
  cyl(bl, '#999', 0.08, 0.08, 2.4, 0, -0.45, 1.4, Math.PI / 2 - 0.25, 0, 0, 6);
  const boomMesh = new THREE.Mesh(mergeGeos(bl), M.vc);
  boomMesh.castShadow = true;
  boom.add(boomMesh);
  const stick = new THREE.Group();
  stick.position.set(0, 0, 5.4);
  boom.add(stick);
  const sl = [];
  box(sl, Y, 0.35, 0.45, 3.0, 0, 0, 1.5);
  const stickMesh = new THREE.Mesh(mergeGeos(sl), M.vc);
  stickMesh.castShadow = true;
  stick.add(stickMesh);
  const bucket = new THREE.Group();
  bucket.position.set(0, 0, 3.0);
  stick.add(bucket);
  const kl = [];
  box(kl, '#444', 1.1, 0.08, 1.0, 0, -0.5, 0.45);
  box(kl, '#444', 1.1, 0.9, 0.08, 0, -0.05, 0.92);
  for (const sx of [-1, 1]) box(kl, '#444', 0.06, 0.9, 1.0, sx * 0.55, -0.05, 0.45);
  for (let k = 0; k < 5; k++) box(kl, '#222', 0.08, 0.08, 0.25, -0.44 + k * 0.22, -0.55, 1.0);
  const bucketMesh = new THREE.Mesh(mergeGeos(kl), M.vc);
  bucketMesh.castShadow = true;
  bucket.add(bucketMesh);
  const dirt = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 1 }));
  dirt.scale.set(1, 0.6, 0.9);
  dirt.position.set(0, -0.15, 0.45);
  dirt.visible = false;
  bucket.add(dirt);
  const tip = new THREE.Object3D();
  tip.position.set(0, -0.55, 1.05);
  bucket.add(tip);
  root.userData = { upper, boom, stick, bucket, tip, dirt };
  return root;
}

// ---------- Tower crane ----------
export function makeCrane(height = 18, jibLen = 30) {
  const root = new THREE.Group();
  const Y = '#f2c21c';
  const l = [];
  box(l, '#888', 4, 0.8, 4, 0, 0.4, 0);
  const s = 1.6;
  for (let y = 0.8; y < height; y += 2) {
    for (const [ax, az] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) box(l, Y, 0.14, 2, 0.14, (ax * s) / 2, y + 1, (az * s) / 2);
    beam(l, Y, V(-s / 2, y, -s / 2), V(s / 2, y + 2, -s / 2), 0.07);
    beam(l, Y, V(s / 2, y, s / 2), V(-s / 2, y + 2, s / 2), 0.07);
    beam(l, Y, V(-s / 2, y, s / 2), V(-s / 2, y + 2, -s / 2), 0.07);
    beam(l, Y, V(s / 2, y, -s / 2), V(s / 2, y + 2, s / 2), 0.07);
  }
  const mast = new THREE.Mesh(mergeGeos(l), M.vc);
  mast.castShadow = true;
  root.add(mast);
  const top = new THREE.Group();
  top.position.y = height + 0.8;
  root.add(top);
  const tl = [];
  box(tl, Y, 2.0, 0.6, 2.0, 0, 0.3, 0);
  box(tl, '#ddd', 1.3, 1.3, 1.3, 0.2, 1.2, 1.4); // operator cab
  box(tl, '#1b2733', 1.0, 0.7, 0.05, 0.2, 1.3, 2.06);
  // jib along +x
  for (let x = 0; x < jibLen; x += 2) {
    box(tl, Y, 2, 0.1, 0.1, x + 1, 0.7, -0.5);
    box(tl, Y, 2, 0.1, 0.1, x + 1, 0.7, 0.5);
    box(tl, Y, 2, 0.1, 0.1, x + 1, 1.8, 0);
    beam(tl, Y, V(x, 0.7, -0.5), V(x + 1, 1.8, 0), 0.06);
    beam(tl, Y, V(x, 0.7, 0.5), V(x + 1, 1.8, 0), 0.06);
    beam(tl, Y, V(x + 1, 1.8, 0), V(x + 2, 0.7, -0.5), 0.06);
    beam(tl, Y, V(x + 1, 1.8, 0), V(x + 2, 0.7, 0.5), 0.06);
  }
  for (let x = -9; x < 0; x += 1.5) box(tl, Y, 1.5, 0.15, 1.2, x + 0.75, 0.7, 0);
  box(tl, '#777', 2.4, 1.6, 1.4, -8, 0.0, 0); // counterweight
  beam(tl, '#bbb', V(0, 4.5, 0), V(jibLen * 0.7, 1.8, 0), 0.04, true);
  beam(tl, '#bbb', V(0, 4.5, 0), V(-8, 0.8, 0), 0.04, true);
  box(tl, Y, 0.5, 4, 0.5, 0, 2.5, 0);
  const topMesh = new THREE.Mesh(mergeGeos(tl), M.vc);
  topMesh.castShadow = true;
  top.add(topMesh);
  const trolley = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.3, 1.2), new THREE.MeshStandardMaterial({ color: 0x555555 }));
  trolley.position.y = 0.45;
  top.add(trolley);
  const hook = new THREE.Group();
  const hl = [];
  box(hl, '#d23a2a', 0.6, 0.6, 0.4, 0, 0.3, 0);
  cyl(hl, '#333', 0.12, 0.05, 0.5, 0, -0.2, 0, 0, 0, 0, 6);
  const hookMesh = new THREE.Mesh(mergeGeos(hl), M.vc);
  hook.add(hookMesh);
  root.add(hook);
  const cableGeo = new THREE.BufferGeometry().setFromPoints([V(0, 0, 0), V(0, 1, 0)]);
  const cable = new THREE.Line(cableGeo, new THREE.LineBasicMaterial({ color: 0x222222 }));
  root.add(cable);
  root.userData = { top, trolley, hook, cable, height: height + 0.8, jibLen };
  return root;
}

// ---------- Concrete mixer truck ----------
export function makeMixer() {
  const root = new THREE.Group();
  const l = [];
  box(l, '#262626', 1.2, 0.3, 6.5, 0, 0.75, 0);
  box(l, '#e6e6e6', 2.3, 1.6, 1.8, 0, 1.8, 2.3);
  box(l, '#1b2733', 2.0, 0.6, 0.05, 0, 2.2, 3.21);
  box(l, '#c81e1e', 2.32, 0.2, 1.82, 0, 1.2, 2.3);
  box(l, '#888', 0.4, 0.15, 2.0, 0, 1.3, -3.6, 0.5); // chute
  const body = new THREE.Mesh(mergeGeos(l), M.vc);
  body.castShadow = true;
  root.add(body);
  const drum = new THREE.Group();
  drum.position.set(0, 2.2, -0.9);
  drum.rotation.x = -0.2;
  const dl = [];
  cyl(dl, '#e8862a', 1.15, 0.7, 2.4, 0, 0, 0.9, Math.PI / 2, 0, 0, 16);
  cyl(dl, '#e8862a', 0.7, 1.15, 1.6, 0, 0, -1.1, Math.PI / 2, 0, 0, 16);
  for (let k = 0; k < 4; k++) box(dl, '#2f6db5', 0.12, 0.12, 3.6, Math.cos(k * 1.57) * 1.0, Math.sin(k * 1.57) * 1.0, 0, 0, 0, 0);
  const dm = new THREE.Mesh(mergeGeos(dl), M.vc);
  dm.castShadow = true;
  drum.add(dm);
  root.add(drum);
  const wheels = addWheels(root, [[1.0, 2.3], [-1.0, 2.3], [1.0, -1.6], [-1.0, -1.6], [1.0, -2.7], [-1.0, -2.7]], 0.48, 0.32);
  root.userData = { drum, wheels };
  return root;
}

// ---------- light helpers shared by power cars ----------
function lampSet(root, front, y, halfW) {
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xfff2c0, emissiveIntensity: 0, roughness: 0.2 });
  const ll = [];
  for (const sx of halfW ? [-1, 1] : [0]) ll.push(part(C(0.14, 0.14, 0.06, 14), '#fff', mat(sx * halfW, y, front, Math.PI / 2)));
  const lamps = new THREE.Mesh(mergeGeos(ll), lampMat);
  root.add(lamps);
  const spot = new THREE.SpotLight(0xfff1cc, 0, 160, 0.32, 0.5, 1.2);
  spot.position.set(0, y, front + 0.2);
  spot.target.position.set(0, 0, front + 50);
  root.add(spot, spot.target);
  return (on) => { lampMat.emissiveIntensity = on ? 2.2 : 0; spot.intensity = on ? 220 : 0; };
}

// ---------- passenger coach (ICF style; vintage = short wooden heritage coach) ----------
export function makeCoach(liv, num, vintage = false) {
  const root = new THREE.Group();
  const BODY = liv.body, BAND = liv.band;
  const L = vintage ? 15.5 : 21.5, half = L / 2;
  const l = [];
  box(l, BODY, 3.15, 2.5, L, 0, 2.45, 0);
  const roof = new THREE.CylinderGeometry(1.75, 1.75, L, 18, 1, false, -Math.PI / 2.6, (Math.PI * 2) / 2.6);
  roof.rotateX(Math.PI / 2);
  l.push(part(roof, vintage ? '#5a3a24' : '#cfcfcf', mat(0, 2.6, 0, 0, 0, 0, 0.92, 1, 1)));
  box(l, '#2d2e30', 3.0, 0.3, L - 0.4, 0, 1.15, 0);
  for (const sx of [-1, 1]) {
    box(l, BAND, 0.03, 0.12, L - 0.4, sx * 1.585, 1.75, 0);
    box(l, BAND, 0.03, 0.12, L - 0.4, sx * 1.585, 3.35, 0);
    const n = vintage ? 7 : 10;
    for (let k = 0; k < n; k++) {
      const z = -half + 2.4 + (k * (L - 4.8)) / (n - 1);
      box(l, '#1b2a33', 0.04, 0.85, vintage ? 1.1 : 1.15, sx * 1.585, 2.7, z);
      if (!vintage) for (let b = 0; b < 3; b++) box(l, '#9aa0a3', 0.05, 0.04, 1.15, sx * 1.6, 2.45 + b * 0.25, z);
    }
    for (const sz of [-1, 1]) {
      box(l, vintage ? '#4a2a18' : '#1d2f52', 0.04, 2.0, 0.9, sx * 1.59, 2.2, sz * (half - 1.2));
      box(l, '#c9c9c9', 0.05, 0.6, 0.05, sx * 1.62, 2.3, sz * (half - 0.65));
    }
  }
  for (const sz of [-1, 1]) {
    box(l, '#2b2b2b', 1.6, 2.6, 0.3, 0, 2.4, sz * (half + 0.1));
    coupler(l, sz * (half + 0.15), sz);
    if (vintage) for (const sx of [-1, 1]) cyl(l, '#333', 0.18, 0.18, 0.4, sx * 1.1, 1.05, sz * (half + 0.2), Math.PI / 2, 0, 0, 10);
  }
  const body = new THREE.Mesh(mergeGeos(l), M.vcGloss);
  body.castShadow = true; body.receiveShadow = true;
  root.add(body);
  const tex = canvasTexture(256, 64, (ctx) => {
    ctx.fillStyle = BAND; ctx.font = 'bold 30px sans-serif'; ctx.fillText(vintage ? `HERITAGE ${num}` : `${num}  2S`, 8, 42);
  });
  const dm = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  for (const sx of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), dm);
    p.position.set(sx * 1.61, 1.45, 0); p.rotation.y = sx * Math.PI / 2;
    root.add(p);
  }
  const bogies = [makeBogie(2, 2.5, 0.46, '#2e2f31'), makeBogie(2, 2.5, 0.46, '#2e2f31')];
  root.add(bogies[0], bogies[1]);
  // platform-side (right, local -x) doors
  const doors = [new THREE.Vector3(-1.7, 1.2, half - 1.2), new THREE.Vector3(-1.7, 1.2, -half + 1.2)];
  root.userData = { kind: 'coach', length: L + 0.9, bogieOffset: vintage ? 5.0 : 7.4, bogies, wheelR: 0.46, doors };
  return root;
}

// ---------- EMU driving car ----------
export function makeEMUCab(liv) {
  const root = new THREE.Group();
  const inner = new THREE.Group();
  root.add(inner);
  const BODY = liv.body, BAND = liv.band;
  const L = 20.5, half = L / 2;
  const l = [];
  const prof = [[-half, 1.3], [half - 0.6, 1.3], [half, 1.9], [half, 2.9], [half - 0.7, 3.95], [-half, 3.95]];
  l.push(extrudeProfile(prof, 3.15, BODY));
  const roof = new THREE.CylinderGeometry(1.7, 1.7, L - 1.2, 18, 1, false, -Math.PI / 2.8, (Math.PI * 2) / 2.8);
  roof.rotateX(Math.PI / 2);
  l.push(part(roof, '#bdbdbd', mat(0, 2.6, -0.6, 0, 0, 0, 0.93, 1, 1)));
  box(l, '#2d2e30', 3.0, 0.3, L - 0.6, 0, 1.15, 0);
  for (const sx of [-1, 1]) {
    box(l, BAND, 0.03, 0.18, L - 1.2, sx * 1.585, 1.8, -0.4);
    for (let k = 0; k < 8; k++) box(l, '#1b2a33', 0.04, 0.85, 1.1, sx * 1.585, 2.75, -half + 2.6 + k * 1.95);
    for (const z of [-half + 1.3, 3.6]) box(l, '#2a2a2a', 0.04, 2.1, 1.3, sx * 1.59, 2.3, z);
  }
  box(l, BAND, 3.0, 0.25, 0.05, 0, 2.1, half + 0.01);
  box(l, '#16242c', 2.6, 0.9, 0.05, 0, 3.25, half - 0.33, -0.95);
  box(l, '#2b2b2b', 1.6, 2.6, 0.3, 0, 2.4, -half - 0.1);
  coupler(l, half + 0.15, 1); coupler(l, -half - 0.15, -1);
  box(l, '#4a4a4a', 1.2, 0.08, 1.2, 0, 4.05, 2);
  beam(l, '#9aa0a3', V(0, 4.1, 2.8), V(0, 4.9, 1.4), 0.08, true);
  beam(l, '#9aa0a3', V(0, 4.9, 1.4), V(0, 5.42, 2.6), 0.06, true);
  box(l, '#303030', 1.9, 0.08, 0.16, 0, 5.46, 2.6);
  const body = new THREE.Mesh(mergeGeos(l), M.vcGloss);
  body.castShadow = true; body.receiveShadow = true;
  inner.add(body);
  const setL = lampSet(inner, half + 0.05, 3.9, 0.5);
  const bogies = [makeBogie(2, 2.5, 0.46, '#2e2f31'), makeBogie(2, 2.5, 0.46, '#2e2f31')];
  inner.add(bogies[0], bogies[1]);
  const doors = [new THREE.Vector3(-1.7, 1.2, -half + 1.3), new THREE.Vector3(-1.7, 1.2, 3.6)];
  root.userData = { kind: 'loco', length: L + 0.6, bogieOffset: 7.0, bogies, wheelR: 0.46, doors, inner, cabPos: [0.55, 3.0, half - 1.6],
    setLights: setL, setCabView() {} };
  return root;
}
// rear driving car: the same model turned round
export function makeEMURear(liv) {
  const r = makeEMUCab(liv);
  r.userData.inner.rotation.y = Math.PI;
  r.userData.doors = r.userData.doors.map((d) => new THREE.Vector3(d.x, d.y, -d.z));
  r.userData.kind = 'coach';
  r.userData.setLights(false);
  return r;
}

// ---------- steam locomotive with tender ----------
export function makeSteamLoco(liv) {
  const root = new THREE.Group();
  const BODY = liv.body, TRIM = liv.band;
  const l = [];
  cyl(l, BODY, 1.0, 1.0, 7.5, 0, 2.6, 4.2, Math.PI / 2, 0, 0, 18);
  cyl(l, '#2a2a2a', 1.05, 1.05, 1.0, 0, 2.6, 8.4, Math.PI / 2, 0, 0, 18);
  cyl(l, '#3a3a3a', 0.85, 0.85, 0.12, 0, 2.6, 8.95, Math.PI / 2, 0, 0, 18);
  cyl(l, '#1d1d1d', 0.32, 0.42, 1.3, 0, 4.1, 7.9, 0, 0, 0, 12);
  cyl(l, TRIM, 0.45, 0.5, 0.6, 0, 3.75, 4.8, 0, 0, 0, 12);
  cyl(l, TRIM, 0.3, 0.35, 0.5, 0, 3.7, 2.6, 0, 0, 0, 12);
  for (let k = 0; k < 4; k++) cyl(l, TRIM, 1.04, 1.04, 0.08, 0, 2.6, 1.5 + k * 1.9, Math.PI / 2, 0, 0, 18);
  box(l, '#222', 2.8, 0.25, 11, 0, 1.3, 3.5);
  box(l, '#b0262a', 2.6, 0.5, 0.3, 0, 1.0, 9.2);
  for (const sx of [-1, 1]) cyl(l, '#333', 0.18, 0.18, 0.5, sx * 1.0, 1.0, 9.45, Math.PI / 2, 0, 0, 10);
  box(l, BODY, 2.9, 2.4, 2.6, 0, 2.7, -1.0);
  box(l, '#111', 3.1, 0.15, 3.0, 0, 4.0, -1.0);
  for (const sx of [-1, 1]) { box(l, '#1b2a33', 0.04, 0.8, 0.9, sx * 1.46, 3.1, -0.6); box(l, TRIM, 0.04, 0.12, 2.6, sx * 1.46, 2.0, -1.0); }
  box(l, BODY, 2.9, 2.2, 6.0, 0, 2.4, -6.0);
  box(l, '#222', 2.6, 0.5, 5.6, 0, 3.6, -6.0);
  for (const sx of [-1, 1]) box(l, TRIM, 0.04, 0.12, 6.0, sx * 1.46, 2.0, -6.0);
  coupler(l, -9.2, -1);
  const body = new THREE.Mesh(mergeGeos(l), M.vcGloss);
  body.castShadow = true;
  root.add(body);
  const drive = new THREE.Group();
  const wl = [];
  for (const sx of [-1, 1]) {
    cyl(wl, '#b0262a', 0.85, 0.85, 0.12, sx * 0.84, 0, 0, 0, 0, Math.PI / 2, 20);
    cyl(wl, '#c9c9c9', 0.88, 0.88, 0.05, sx * 0.78, 0, 0, 0, 0, Math.PI / 2, 20);
    for (let k = 0; k < 6; k++) box(wl, '#d8d0c0', 0.05, 1.5, 0.08, sx * 0.92, 0, 0, (k * Math.PI) / 6, 0, 0);
  }
  cyl(wl, '#333', 0.1, 0.1, 1.7, 0, 0, 0, 0, 0, Math.PI / 2, 8);
  const wg = mergeGeos(wl);
  drive.userData.wheels = [];
  for (const z of [-1.8, 0, 1.8]) { const w = new THREE.Mesh(wg, M.vcMetal); w.position.set(0, 0.85, z); w.castShadow = true; drive.add(w); drive.userData.wheels.push(w); }
  const rods = [1.02, -1.02].map((x) => {
    const rod = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 3.8), new THREE.MeshStandardMaterial({ color: 0xc9c9c9, metalness: 0.7, roughness: 0.3 }));
    rod.position.set(x, 0.85, 0);
    drive.add(rod);
    return rod;
  });
  drive.userData.rods = rods;
  const tender = makeBogie(2, 1.8, 0.45, '#2a2a2a');
  root.add(drive, tender);
  const setL = lampSet(root, 9.0, 3.6, 0);
  root.userData = { kind: 'loco', length: 19.0, bogieOffset: 4.6, bogies: [drive, tender], wheelR: 0.85, steam: new THREE.Vector3(0, 4.9, 7.9),
    cabPos: [0.6, 3.6, -0.4], setLights: setL, setCabView() {} };
  return root;
}

// ---------- extra road vehicles ----------
export function makeSUV(BODY = '#3d9b56') {
  const root = new THREE.Group();
  const l = [];
  box(l, BODY, 1.85, 0.9, 4.2, 0, 0.95, 0);
  box(l, BODY, 1.8, 0.75, 2.6, 0, 1.78, -0.45);
  for (const sx of [-1, 1]) box(l, '#1b2733', 0.03, 0.5, 2.3, sx * 0.91, 1.82, -0.45);
  box(l, '#1b2733', 1.6, 0.55, 0.03, 0, 1.8, 0.86, -0.35);
  box(l, '#2b2b2b', 1.9, 0.3, 0.25, 0, 0.65, 2.15);
  box(l, '#2b2b2b', 1.9, 0.3, 0.25, 0, 0.65, -2.15);
  cyl(l, '#222', 0.4, 0.4, 0.25, 0, 1.25, -2.2, Math.PI / 2, 0, 0, 14);
  for (const sx of [-1, 1]) { box(l, '#fff8d0', 0.3, 0.2, 0.05, sx * 0.62, 1.1, 2.11); box(l, '#c81e1e', 0.2, 0.2, 0.05, sx * 0.75, 1.1, -2.11); }
  box(l, '#444', 1.6, 0.06, 2.2, 0, 2.18, -0.45);
  const body = new THREE.Mesh(mergeGeos(l), M.vcGloss);
  body.castShadow = true;
  root.add(body);
  const wheels = addWheels(root, [[0.88, 1.35], [-0.88, 1.35], [0.88, -1.35], [-0.88, -1.35]], 0.42, 0.28);
  root.userData = { kind: 'suv', wheels, steerWheels: wheels.slice(0, 2), wheelR: 0.42 };
  return root;
}

export function makeAuto(BODY = '#f2c21c') {
  const root = new THREE.Group();
  const l = [];
  box(l, '#2a6a3a', 1.3, 0.6, 2.4, 0, 0.75, -0.2);
  box(l, BODY, 1.25, 0.08, 2.5, 0, 2.05, -0.25);
  box(l, BODY, 1.25, 1.2, 0.08, 0, 1.45, -1.45);
  for (const sx of [-1, 1]) {
    box(l, BODY, 0.06, 1.2, 1.2, sx * 0.62, 1.45, -0.85);
    box(l, '#222', 0.05, 1.3, 0.05, sx * 0.6, 1.4, 0.9);
  }
  box(l, '#2a6a3a', 0.6, 0.9, 0.5, 0, 1.1, 1.05);
  box(l, '#1b2733', 1.0, 0.55, 0.03, 0, 1.65, 0.95, -0.15);
  box(l, '#fff8d0', 0.22, 0.18, 0.05, 0, 1.0, 1.32);
  box(l, '#3a3a3a', 0.9, 0.3, 0.5, 0, 1.05, -0.35);
  const body = new THREE.Mesh(mergeGeos(l), M.vcGloss);
  body.castShadow = true;
  root.add(body);
  const wheels = addWheels(root, [[0, 1.05], [0.6, -1.0], [-0.6, -1.0]], 0.27, 0.16);
  root.userData = { kind: 'auto', wheels, steerWheels: wheels.slice(0, 1), wheelR: 0.27 };
  return root;
}

export function makeTractor(BODY = '#c8302a') {
  const root = new THREE.Group();
  const l = [];
  box(l, BODY, 1.0, 0.9, 2.2, 0, 1.2, 0.9);
  box(l, '#2b2b2b', 0.9, 0.5, 0.1, 0, 1.2, 2.02);
  box(l, BODY, 1.4, 0.4, 1.4, 0, 1.0, -0.6);
  box(l, '#2b2b2b', 0.5, 0.5, 0.5, 0, 1.55, -0.7);
  box(l, '#555', 0.06, 0.6, 0.06, 0.15, 1.9, 0.2);
  cyl(l, '#222', 0.06, 0.06, 1.2, 0.3, 2.1, 1.4, 0, 0, 0, 6);
  for (const sx of [-1, 1]) box(l, BODY, 0.5, 0.15, 1.2, sx * 0.95, 1.95, -0.6);
  box(l, '#fff8d0', 0.2, 0.16, 0.05, 0.3, 1.45, 2.03); box(l, '#fff8d0', 0.2, 0.16, 0.05, -0.3, 1.45, 2.03);
  box(l, '#3a7ab0', 1.9, 0.6, 2.4, 0, 1.0, -3.0);
  box(l, '#2b2b2b', 0.15, 0.15, 1.2, 0, 0.7, -1.6);
  const body = new THREE.Mesh(mergeGeos(l), M.vcGloss);
  body.castShadow = true;
  root.add(body);
  const front = addWheels(root, [[0.62, 1.55], [-0.62, 1.55]], 0.38, 0.2);
  const rear = addWheels(root, [[0.85, -0.6], [-0.85, -0.6]], 0.75, 0.42);
  const trolley = addWheels(root, [[1.0, -3.0], [-1.0, -3.0]], 0.4, 0.2);
  root.userData = { kind: 'tractor', wheels: [...front, ...rear, ...trolley], steerWheels: front, wheelR: 0.5 };
  return root;
}
