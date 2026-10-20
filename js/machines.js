// Detailed construction machines and site workers with physically based materials.
// Every model faces +z, sits on y = 0 and exposes its moving parts in userData.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeos, part, mat } from './util.js';

// ---------- shared materials ----------
export const PBR = {
  yellow: new THREE.MeshPhysicalMaterial({ color: 0xf2b10f, roughness: 0.38, metalness: 0.15, clearcoat: 0.6, clearcoatRoughness: 0.25 }),
  orange: new THREE.MeshPhysicalMaterial({ color: 0xe8691c, roughness: 0.4, metalness: 0.15, clearcoat: 0.5, clearcoatRoughness: 0.3 }),
  white: new THREE.MeshPhysicalMaterial({ color: 0xf1f1ee, roughness: 0.35, metalness: 0.1, clearcoat: 0.6 }),
  blue: new THREE.MeshPhysicalMaterial({ color: 0x1f5fa8, roughness: 0.4, metalness: 0.15, clearcoat: 0.5 }),
  red: new THREE.MeshPhysicalMaterial({ color: 0xc0241c, roughness: 0.4, metalness: 0.15, clearcoat: 0.5 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x8c9196, roughness: 0.35, metalness: 0.85 }),
  darkSteel: new THREE.MeshStandardMaterial({ color: 0x3b3e42, roughness: 0.55, metalness: 0.7 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xdfe3e6, roughness: 0.12, metalness: 1 }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.92, metalness: 0 }),
  black: new THREE.MeshStandardMaterial({ color: 0x222426, roughness: 0.6, metalness: 0.2 }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0x9fb7c6, roughness: 0.04, metalness: 0, transmission: 0, transparent: true, opacity: 0.45, clearcoat: 1 }),
  light: new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xfff2c0, emissiveIntensity: 0.3, roughness: 0.2 }),
  amber: new THREE.MeshStandardMaterial({ color: 0xffa000, emissive: 0xff8c00, emissiveIntensity: 0.6, roughness: 0.3 }),
  rebar: new THREE.MeshStandardMaterial({ color: 0x6b4a36, roughness: 0.7, metalness: 0.6 }),
};

const rbox = (w, h, d, r = 0.06) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
function mesh(geo, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz, 'YXZ');
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
// a road wheel: tyre with tread blocks, steel rim and hub
const wheelCache = {};
export function wheel(r, w, rimMat = PBR.steel) {
  const key = `${r}:${w}`;
  if (!wheelCache[key]) {
    const tyre = new THREE.TorusGeometry(r * 0.78, r * 0.24, 10, 28);
    tyre.rotateY(Math.PI / 2); tyre.scale(w / (r * 0.48), 1, 1);
    const tread = [];
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      tread.push(part(new THREE.BoxGeometry(w * 0.95, r * 0.08, r * 0.16), '#1a1a1a', mat(0, Math.cos(a) * r, Math.sin(a) * r, a)));
    }
    const rim = new THREE.CylinderGeometry(r * 0.56, r * 0.56, w * 0.7, 18); rim.rotateZ(Math.PI / 2);
    const hub = new THREE.CylinderGeometry(r * 0.2, r * 0.2, w * 0.82, 10); hub.rotateZ(Math.PI / 2);
    wheelCache[key] = { tyre, tread: mergeGeos(tread), rim, hub };
  }
  const c = wheelCache[key];
  const g = new THREE.Group();
  g.add(mesh(c.tyre, PBR.rubber), mesh(c.tread, PBR.rubber), mesh(c.rim, rimMat), mesh(c.hub, PBR.darkSteel));
  return g;
}
function cab(w, h, d, paint) {
  const g = new THREE.Group();
  g.add(mesh(rbox(w, 0.12, d, 0.04), paint, 0, h, 0));
  for (const [x, z] of [[-w / 2 + 0.05, -d / 2 + 0.05], [w / 2 - 0.05, -d / 2 + 0.05], [-w / 2 + 0.05, d / 2 - 0.05], [w / 2 - 0.05, d / 2 - 0.05]]) {
    g.add(mesh(new THREE.BoxGeometry(0.08, h, 0.08), PBR.black, x, h / 2, z));
  }
  const gl = mesh(new THREE.BoxGeometry(w - 0.1, h - 0.15, d - 0.1), PBR.glass, 0, h / 2, 0);
  gl.castShadow = false;
  g.add(gl);
  g.add(mesh(new THREE.BoxGeometry(0.5, 0.5, 0.45), PBR.black, -0.1, 0.3, -d / 4)); // seat
  return g;
}
function beacon(x, y, z) { return mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.16, 10), PBR.amber, x, y, z); }

// ---------- bulldozer ----------
export function makeBulldozer() {
  const root = new THREE.Group();
  for (const sx of [-1, 1]) {
    const track = new THREE.Group();
    track.add(mesh(rbox(0.6, 0.8, 3.4, 0.35), PBR.rubber, 0, 0.4, 0));
    for (let k = 0; k < 6; k++) track.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.62, 12).rotateZ(Math.PI / 2), PBR.darkSteel, 0, 0.32, -1.3 + k * 0.52));
    track.position.x = sx * 1.1;
    root.add(track);
  }
  root.add(mesh(rbox(1.7, 0.8, 2.6, 0.12), PBR.yellow, 0, 1.05, -0.2));
  root.add(mesh(rbox(1.5, 0.7, 1.4, 0.1), PBR.yellow, 0, 1.6, 0.55)); // engine hood
  root.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.9, 8), PBR.black, 0.45, 2.3, 0.9));
  const c = cab(1.4, 1.3, 1.2, PBR.yellow); c.position.set(0, 1.45, -0.75); root.add(c);
  root.add(beacon(0, 2.85, -0.75));
  // blade on push arms
  const blade = new THREE.Group();
  const curve = new THREE.CylinderGeometry(1.1, 1.1, 3.0, 20, 1, true, -0.55, 1.1);
  curve.rotateZ(Math.PI / 2); curve.rotateX(-0.3);
  blade.add(mesh(curve, PBR.yellow, 0, 0.55, 0.6));
  blade.add(mesh(new THREE.BoxGeometry(3.0, 0.1, 0.25), PBR.steel, 0, 0.06, 0.55));
  for (const sx of [-1, 1]) blade.add(mesh(new THREE.BoxGeometry(0.16, 0.16, 1.6), PBR.yellow, sx * 1.0, 0.5, -0.4, 0.15));
  blade.position.z = 1.6;
  root.add(blade);
  root.userData = { blade, kind: 'bulldozer' };
  return root;
}

// ---------- JCB-style backhoe loader ----------
export function makeBackhoe() {
  const root = new THREE.Group();
  const wheels = [];
  for (const [x, z, r] of [[1.0, 1.25, 0.55], [-1.0, 1.25, 0.55], [1.05, -1.05, 0.8], [-1.05, -1.05, 0.8]]) {
    const w = wheel(r, r * 0.75); w.position.set(x, r, z); root.add(w); wheels.push(w);
  }
  root.add(mesh(rbox(1.5, 0.7, 3.4, 0.1), PBR.yellow, 0, 1.1, 0.1));
  root.add(mesh(rbox(1.3, 0.7, 1.3, 0.12), PBR.yellow, 0, 1.75, 1.0)); // engine hood
  const c = cab(1.6, 1.5, 1.5, PBR.yellow); c.position.set(0, 1.5, -0.6); root.add(c);
  root.add(beacon(0.6, 3.15, -0.6));
  // front loader bucket
  const loader = new THREE.Group();
  for (const sx of [-1, 1]) loader.add(mesh(new THREE.BoxGeometry(0.14, 0.18, 2.2), PBR.yellow, sx * 0.85, 0, 1.0, 0.25));
  const lb = new THREE.Group();
  lb.add(mesh(new THREE.BoxGeometry(2.2, 0.08, 0.8), PBR.yellow, 0, -0.3, 0.3), mesh(new THREE.BoxGeometry(2.2, 0.7, 0.08), PBR.yellow, 0, 0, -0.05));
  for (const sx of [-1, 1]) lb.add(mesh(new THREE.BoxGeometry(0.06, 0.7, 0.8), PBR.yellow, sx * 1.1, 0, 0.3));
  lb.position.set(0, -0.35, 2.1);
  loader.add(lb);
  loader.position.set(0, 1.4, 1.2);
  root.add(loader);
  // rear backhoe arm
  const swing = new THREE.Group(); swing.position.set(0, 1.3, -1.9); root.add(swing);
  const boom = new THREE.Group(); swing.add(boom);
  boom.add(mesh(new THREE.BoxGeometry(0.3, 0.4, 2.4), PBR.yellow, 0, 0, -1.2));
  const stick = new THREE.Group(); stick.position.z = -2.4; boom.add(stick);
  stick.add(mesh(new THREE.BoxGeometry(0.24, 0.3, 1.8), PBR.yellow, 0, 0, -0.9));
  const bucket = new THREE.Group(); bucket.position.z = -1.8; stick.add(bucket);
  bucket.add(mesh(new THREE.BoxGeometry(0.6, 0.06, 0.5), PBR.darkSteel, 0, -0.3, -0.2), mesh(new THREE.BoxGeometry(0.6, 0.5, 0.06), PBR.darkSteel, 0, -0.05, -0.45));
  const tip = new THREE.Object3D(); tip.position.set(0, -0.35, -0.45); bucket.add(tip);
  boom.rotation.x = 0.9; stick.rotation.x = -1.6; bucket.rotation.x = -0.6;
  for (const sx of [-1, 1]) root.add(mesh(new THREE.BoxGeometry(0.2, 1.0, 0.2), PBR.yellow, sx * 1.0, 0.7, -1.8)); // stabilisers
  root.userData = { wheels, loader, swing, boom, stick, bucket, tip, kind: 'backhoe' };
  return root;
}

// ---------- tracked excavator ----------
export function makeExcavator2() {
  const root = new THREE.Group();
  for (const sx of [-1, 1]) {
    const tr = new THREE.Group();
    tr.add(mesh(rbox(0.7, 0.75, 4.2, 0.34), PBR.rubber, 0, 0.38, 0));
    for (let k = 0; k < 7; k++) tr.add(mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.72, 12).rotateZ(Math.PI / 2), PBR.darkSteel, 0, 0.3, -1.6 + k * 0.53));
    tr.position.x = sx * 1.25;
    root.add(tr);
  }
  root.add(mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.3, 20), PBR.darkSteel, 0, 0.9, 0));
  const upper = new THREE.Group(); upper.position.y = 1.05; root.add(upper);
  upper.add(mesh(rbox(2.6, 1.0, 3.2, 0.14), PBR.yellow, 0, 0.5, -0.4));
  upper.add(mesh(rbox(2.6, 0.95, 0.8, 0.2), PBR.darkSteel, 0, 0.55, -2.15)); // counterweight
  const c = cab(1.0, 1.55, 1.25, PBR.yellow); c.position.set(-0.75, 1.0, 0.6); upper.add(c);
  upper.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.8, 8), PBR.black, 0.8, 1.4, -1.0));
  upper.add(beacon(-0.75, 2.7, 0.6));
  const boom = new THREE.Group(); boom.position.set(0.35, 1.0, 1.1); upper.add(boom);
  boom.add(mesh(rbox(0.45, 0.6, 5.4, 0.08), PBR.yellow, 0, 0, 2.7));
  boom.add(mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.6, 10).rotateX(Math.PI / 2 - 0.25), PBR.chrome, 0, -0.42, 1.4));
  const stick = new THREE.Group(); stick.position.z = 5.4; boom.add(stick);
  stick.add(mesh(rbox(0.36, 0.45, 3.0, 0.07), PBR.yellow, 0, 0, 1.5));
  stick.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.6, 10).rotateX(Math.PI / 2), PBR.chrome, 0, 0.32, 1.0));
  const bucket = new THREE.Group(); bucket.position.z = 3.0; stick.add(bucket);
  bucket.add(mesh(new THREE.BoxGeometry(1.1, 0.08, 1.0), PBR.darkSteel, 0, -0.5, 0.45), mesh(new THREE.BoxGeometry(1.1, 0.9, 0.08), PBR.darkSteel, 0, -0.05, 0.92));
  for (const sx of [-1, 1]) bucket.add(mesh(new THREE.BoxGeometry(0.06, 0.9, 1.0), PBR.darkSteel, sx * 0.55, -0.05, 0.45));
  for (let k = 0; k < 5; k++) bucket.add(mesh(new THREE.ConeGeometry(0.06, 0.25, 6).rotateX(Math.PI / 2), PBR.steel, -0.44 + k * 0.22, -0.55, 1.05));
  const dirt = mesh(new THREE.SphereGeometry(0.5, 10, 8), new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 1 }), 0, -0.15, 0.45);
  dirt.scale.set(1, 0.6, 0.9); dirt.visible = false; bucket.add(dirt);
  const tip = new THREE.Object3D(); tip.position.set(0, -0.55, 1.05); bucket.add(tip);
  root.userData = { upper, boom, stick, bucket, tip, dirt, kind: 'excavator' };
  return root;
}

// ---------- tipper truck ----------
export function makeTipper(paint = PBR.orange) {
  const root = new THREE.Group();
  const wheels = [];
  for (const [x, z] of [[1.05, 2.4], [-1.05, 2.4], [1.05, -1.4], [-1.05, -1.4], [1.05, -2.55], [-1.05, -2.55]]) {
    const w = wheel(0.52, 0.42); w.position.set(x, 0.52, z); root.add(w); wheels.push(w);
  }
  root.add(mesh(new THREE.BoxGeometry(1.2, 0.3, 6.6), PBR.black, 0, 0.85, -0.2));
  root.add(mesh(rbox(2.4, 1.7, 1.9, 0.15), paint, 0, 1.85, 2.45));
  root.add(mesh(new THREE.BoxGeometry(2.1, 0.75, 0.05), PBR.glass, 0, 2.3, 3.41));
  root.add(mesh(new THREE.BoxGeometry(2.2, 0.45, 0.08), PBR.chrome, 0, 1.25, 3.42)); // grille
  root.add(mesh(new THREE.BoxGeometry(2.45, 0.24, 0.22), PBR.steel, 0, 0.78, 3.45));
  for (const sx of [-1, 1]) {
    root.add(mesh(new THREE.BoxGeometry(0.35, 0.2, 0.06), PBR.light, sx * 0.85, 1.15, 3.45));
    root.add(mesh(new THREE.BoxGeometry(0.06, 0.65, 0.95), PBR.glass, sx * 1.21, 2.25, 2.55));
  }
  const body = new THREE.Group();
  body.position.set(0, 1.1, -3.3);
  const bl = [];
  bl.push(part(new THREE.BoxGeometry(2.3, 0.12, 4.6), '#9a9a9a', mat(0, 0.06, 2.3)));
  for (const sx of [-1, 1]) bl.push(part(new THREE.BoxGeometry(0.1, 1.1, 4.6), '#9a9a9a', mat(sx * 1.15, 0.6, 2.3)));
  bl.push(part(new THREE.BoxGeometry(2.3, 1.3, 0.1), '#9a9a9a', mat(0, 0.7, 4.6)));
  bl.push(part(new THREE.BoxGeometry(2.3, 1.1, 0.1), '#9a9a9a', mat(0, 0.6, 0)));
  const shell = new THREE.Mesh(mergeGeos(bl), PBR.steel);
  shell.castShadow = true;
  body.add(shell);
  const load = mesh(new THREE.BoxGeometry(2.1, 1.0, 4.4), new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 1 }), 0, 0.55, 2.3);
  load.scale.y = 0.01; load.visible = false;
  body.add(load);
  root.add(body);
  root.userData = { wheels, body, load, kind: 'tipper' };
  return root;
}

// ---------- transit mixer ----------
export function makeMixer2() {
  const root = new THREE.Group();
  const wheels = [];
  for (const [x, z] of [[1.05, 2.4], [-1.05, 2.4], [1.05, -1.3], [-1.05, -1.3], [1.05, -2.45], [-1.05, -2.45]]) {
    const w = wheel(0.52, 0.42); w.position.set(x, 0.52, z); root.add(w); wheels.push(w);
  }
  root.add(mesh(new THREE.BoxGeometry(1.2, 0.3, 6.6), PBR.black, 0, 0.85, -0.2));
  root.add(mesh(rbox(2.4, 1.7, 1.9, 0.15), PBR.white, 0, 1.85, 2.45));
  root.add(mesh(new THREE.BoxGeometry(2.1, 0.75, 0.05), PBR.glass, 0, 2.3, 3.41));
  root.add(mesh(new THREE.BoxGeometry(2.42, 0.18, 1.92), PBR.blue, 0, 1.3, 2.45));
  root.add(mesh(new THREE.BoxGeometry(2.45, 0.24, 0.22), PBR.steel, 0, 0.78, 3.45));
  const drum = new THREE.Group();
  drum.position.set(0, 2.25, -1.0);
  drum.rotation.x = -0.18;
  const pts = [];
  for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector2(0.3 + Math.sin(t * Math.PI) * 0.95 + (1 - t) * 0.15, -2.2 + t * 4.4)); }
  const shell = new THREE.LatheGeometry(pts, 28);
  shell.rotateX(Math.PI / 2);
  drum.add(mesh(shell, PBR.orange));
  for (let k = 0; k < 3; k++) {
    const stripe = new THREE.TorusGeometry(1.15, 0.05, 6, 28); stripe.rotateY(0);
    drum.add(mesh(stripe, PBR.blue, 0, 0, -0.8 + k * 0.8));
  }
  root.add(drum);
  const chute = new THREE.Group();
  chute.position.set(0, 1.55, -3.6);
  chute.add(mesh(new THREE.BoxGeometry(0.45, 0.12, 1.8), PBR.steel, 0, 0, -0.9));
  chute.rotation.x = 0.45;
  root.add(chute);
  const stream = mesh(new THREE.CylinderGeometry(0.16, 0.22, 1, 10), new THREE.MeshStandardMaterial({ color: 0x8f8d86, roughness: 0.6 }), 0, 0, 0);
  stream.visible = false;
  root.add(stream);
  root.userData = { wheels, drum, chute, stream, kind: 'mixer' };
  return root;
}

// ---------- concrete pump with folding boom ----------
export function makePump() {
  const root = new THREE.Group();
  const wheels = [];
  for (const [x, z] of [[1.05, 2.6], [-1.05, 2.6], [1.05, -1.5], [-1.05, -1.5], [1.05, -2.6], [-1.05, -2.6]]) {
    const w = wheel(0.52, 0.42); w.position.set(x, 0.52, z); root.add(w); wheels.push(w);
  }
  root.add(mesh(new THREE.BoxGeometry(1.4, 0.4, 7.2), PBR.black, 0, 0.9, -0.1));
  root.add(mesh(rbox(2.4, 1.6, 1.8, 0.15), PBR.red, 0, 1.85, 2.7));
  root.add(mesh(new THREE.BoxGeometry(2.1, 0.7, 0.05), PBR.glass, 0, 2.25, 3.61));
  root.add(mesh(rbox(2.2, 0.9, 3.5, 0.1), PBR.white, 0, 1.55, -1.4));
  for (const sx of [-1, 1]) for (const z of [0.8, -3.0]) root.add(mesh(new THREE.BoxGeometry(0.2, 0.9, 0.2), PBR.red, sx * 1.6, 0.6, z)); // outriggers
  const turret = new THREE.Group(); turret.position.set(0, 2.1, 0.3); root.add(turret);
  turret.add(mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.6, 16), PBR.red, 0, 0.3, 0));
  const segs = [];
  let parent = turret, len = [6, 5.5, 5];
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Group();
    s.position.set(0, i === 0 ? 0.6 : 0, i === 0 ? 0 : len[i - 1]);
    s.add(mesh(new THREE.BoxGeometry(0.3, 0.32, len[i]), PBR.red, 0, 0, len[i] / 2));
    s.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, len[i], 8).rotateX(Math.PI / 2), PBR.steel, 0.2, 0.1, len[i] / 2));
    parent.add(s); segs.push(s); parent = s;
  }
  const hose = mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.2, 8), PBR.rubber, 0, -1.1, len[2]);
  segs[2].add(hose);
  const nozzle = new THREE.Object3D(); nozzle.position.set(0, -2.2, len[2]); segs[2].add(nozzle);
  segs[0].rotation.x = -1.2; segs[1].rotation.x = 2.6; segs[2].rotation.x = -2.6; // folded for travel
  root.userData = { wheels, turret, segs, nozzle, kind: 'pump' };
  return root;
}

// ---------- vibratory road roller ----------
export function makeRoller() {
  const root = new THREE.Group();
  const drum = mesh(new THREE.CylinderGeometry(0.75, 0.75, 2.0, 24).rotateZ(Math.PI / 2), PBR.steel, 0, 0.75, 1.3);
  root.add(drum);
  root.add(mesh(new THREE.BoxGeometry(2.2, 0.3, 1.8), PBR.yellow, 0, 1.6, 1.3));
  for (const sx of [-1, 1]) { const w = wheel(0.65, 0.5); w.position.set(sx * 0.8, 0.65, -1.2); root.add(w); }
  root.add(mesh(rbox(1.7, 0.9, 2.0, 0.12), PBR.yellow, 0, 1.3, -1.0));
  const c = cab(1.4, 1.3, 1.2, PBR.yellow); c.position.set(0, 1.75, -0.5); root.add(c);
  root.add(beacon(0, 3.2, -0.5));
  root.userData = { drum, kind: 'roller' };
  return root;
}

// ---------- surveyor's tripod (theodolite) ----------
export function makeTripod() {
  const root = new THREE.Group();
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    root.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.5, 6), PBR.yellow, Math.cos(a) * 0.3, 0.72, Math.sin(a) * 0.3, Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4));
  }
  root.add(mesh(rbox(0.25, 0.3, 0.2, 0.04), PBR.white, 0, 1.55, 0));
  root.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.25, 10).rotateX(Math.PI / 2), PBR.black, 0, 1.6, 0.15));
  return root;
}

// ---------- site worker (hard hat and safety vest), walks and works ----------
const SKIN = [0x8a5a3c, 0xa86e4a, 0x6e4630, 0xc08a62];
export function makeWorker(i = 0) {
  const root = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: SKIN[i % SKIN.length], roughness: 0.7 });
  const vest = new THREE.MeshStandardMaterial({ color: i % 2 ? 0xff7a00 : 0xd8f000, roughness: 0.6, emissive: i % 2 ? 0x331800 : 0x2a3000 });
  const pants = new THREE.MeshStandardMaterial({ color: [0x2b3a55, 0x3a3a3a, 0x4a3a2a][i % 3], roughness: 0.9 });
  const hat = new THREE.MeshPhysicalMaterial({ color: [0xffd000, 0xffffff, 0xff6a00][i % 3], roughness: 0.3, clearcoat: 0.8 });
  const legL = new THREE.Group(), legR = new THREE.Group();
  legL.position.set(-0.11, 0.85, 0); legR.position.set(0.11, 0.85, 0);
  legL.add(mesh(rbox(0.16, 0.85, 0.18, 0.05), pants, 0, -0.42, 0)); legR.add(mesh(rbox(0.16, 0.85, 0.18, 0.05), pants, 0, -0.42, 0));
  legL.add(mesh(rbox(0.17, 0.1, 0.28, 0.03), PBR.black, 0, -0.85, 0.05)); legR.add(mesh(rbox(0.17, 0.1, 0.28, 0.03), PBR.black, 0, -0.85, 0.05));
  root.add(legL, legR);
  root.add(mesh(rbox(0.44, 0.62, 0.26, 0.08), vest, 0, 1.18, 0));
  root.add(mesh(new THREE.BoxGeometry(0.46, 0.05, 0.27), new THREE.MeshStandardMaterial({ color: 0xdddddd, emissive: 0x444444 }), 0, 1.12, 0));
  const armL = new THREE.Group(), armR = new THREE.Group();
  armL.position.set(-0.28, 1.45, 0); armR.position.set(0.28, 1.45, 0);
  armL.add(mesh(rbox(0.12, 0.6, 0.13, 0.04), skin, 0, -0.3, 0)); armR.add(mesh(rbox(0.12, 0.6, 0.13, 0.04), skin, 0, -0.3, 0));
  root.add(armL, armR);
  root.add(mesh(new THREE.SphereGeometry(0.14, 14, 10), skin, 0, 1.66, 0));
  root.add(mesh(new THREE.SphereGeometry(0.165, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), hat, 0, 1.7, 0));
  root.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 14), hat, 0, 1.7, 0.03));
  root.userData = { legL, legR, armL, armR, phase: i * 1.7 };
  return root;
}
export function animateWorker(w, t, mode) {
  const u = w.userData, p = t * 6 + u.phase;
  if (mode === 'walk') {
    u.legL.rotation.x = Math.sin(p) * 0.6; u.legR.rotation.x = -Math.sin(p) * 0.6;
    u.armL.rotation.x = -Math.sin(p) * 0.5; u.armR.rotation.x = Math.sin(p) * 0.5;
  } else if (mode === 'work') {
    u.legL.rotation.x = 0; u.legR.rotation.x = 0;
    u.armR.rotation.x = -1.2 + Math.sin(p * 1.4) * 0.6; u.armL.rotation.x = -0.6 + Math.sin(p * 1.4 + 1) * 0.3;
  } else {
    u.legL.rotation.x = u.legR.rotation.x = 0; u.armL.rotation.x = u.armR.rotation.x = Math.sin(p * 0.3) * 0.05;
  }
}
