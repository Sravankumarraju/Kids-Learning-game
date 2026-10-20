// Realistic vehicles: shaped bodies with wheel arches, clear-coat paint, tinted glass with seats behind it,
// alloy wheels with real tyres, working head/tail lights (they glow at night) and Indian number plates.
// Every model faces +z, sits on y = 0 and exposes { wheels: [{pivot, mesh}], steerWheels, wheelR, lamps } in userData.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Assets } from './assets.js';
import { canvasTexture } from './util.js';

// ---------- materials ----------
const paintCache = new Map();
export function carPaint(hex, metallic = true) {
  const key = `${hex}:${metallic}`;
  if (!paintCache.has(key)) paintCache.set(key, new THREE.MeshPhysicalMaterial({ color: hex, metalness: metallic ? 0.45 : 0.1, roughness: metallic ? 0.32 : 0.45, clearcoat: 1, clearcoatRoughness: 0.06 }));
  return paintCache.get(key);
}
const MAT = {
  glass: new THREE.MeshPhysicalMaterial({ color: 0x142028, metalness: 0.6, roughness: 0.04, transparent: true, opacity: 0.86, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.6 }),
  black: new THREE.MeshStandardMaterial({ color: 0x18191b, roughness: 0.55, metalness: 0.1 }),
  plastic: new THREE.MeshStandardMaterial({ color: 0x232527, roughness: 0.7 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xe8ecef, roughness: 0.08, metalness: 1 }),
  alloy: new THREE.MeshStandardMaterial({ color: 0xc4c8cc, roughness: 0.25, metalness: 0.9 }),
  steelRim: new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.4, metalness: 0.7 }),
  tyre: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.93 }),
  disc: new THREE.MeshStandardMaterial({ color: 0x6d6f72, roughness: 0.45, metalness: 0.8 }),
  seat: new THREE.MeshStandardMaterial({ color: 0x2b2b30, roughness: 0.85 }),
  canvas: new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.95, side: THREE.DoubleSide }),
  yellowTrim: new THREE.MeshStandardMaterial({ color: 0xf2c21c, roughness: 0.5 }),
};
// each vehicle gets its own lamp materials so they can glow at night
function lampMats() {
  return {
    head: new THREE.MeshStandardMaterial({ color: 0xf4f6f8, emissive: 0xfff4d6, emissiveIntensity: 0.15, roughness: 0.05, metalness: 0.3 }),
    tail: new THREE.MeshStandardMaterial({ color: 0x8a0d0d, emissive: 0xff1a1a, emissiveIntensity: 0.2, roughness: 0.2 }),
    amber: new THREE.MeshStandardMaterial({ color: 0xd98a00, emissive: 0xff9a00, emissiveIntensity: 0.15, roughness: 0.2 }),
  };
}

function mesh(geo, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.rotation.set(rx, ry, rz);
  o.castShadow = true; o.receiveShadow = true;
  return o;
}
const rbox = (w, h, d, r = 0.05) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));

// a side profile (z forward, y up) extruded across the car's width, with rounded edges
function sideBody(drawShape, width, bevel = 0.07, taper = null) {
  const sh = new THREE.Shape();
  drawShape(sh);
  const depth = width - bevel * 2;
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 3, curveSegments: 14 });
  g.translate(0, 0, -depth / 2);
  g.rotateY(-Math.PI / 2);
  if (taper) {
    // tumblehome: the cabin narrows towards the roof
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      if (y > taper.from) p.setX(i, p.getX(i) * (1 - taper.k * Math.min(1, (y - taper.from) / (taper.to - taper.from))));
    }
    g.computeVertexNormals();
  }
  return g;
}

// ---------- wheels ----------
const wheelGeo = new Map();
function wheelParts(r, w, spokes) {
  const key = `${r}:${w}:${spokes}`;
  if (wheelGeo.has(key)) return wheelGeo.get(key);
  // tyre cross-section turned on a lathe (rounded shoulders)
  const ri = r * 0.64, pts = [];
  const sw = w / 2;
  for (let k = 0; k <= 12; k++) {
    const a = -Math.PI / 2 + (k / 12) * Math.PI;
    pts.push(new THREE.Vector2(r - 0.045 + Math.cos(a) * 0.045, Math.sin(a) * sw * 0.92));
  }
  pts.unshift(new THREE.Vector2(ri, -sw * 0.86));
  pts.push(new THREE.Vector2(ri, sw * 0.86));
  const tyre = new THREE.LatheGeometry(pts, 36);
  tyre.rotateZ(Math.PI / 2);
  const rim = new THREE.CylinderGeometry(ri * 0.98, ri * 0.98, w * 0.62, 28, 1, true); rim.rotateZ(Math.PI / 2);
  const face = new THREE.CylinderGeometry(ri * 0.95, ri * 0.95, 0.02, 28); face.rotateZ(Math.PI / 2); face.translate(w * 0.22, 0, 0);
  const hub = new THREE.CylinderGeometry(ri * 0.22, ri * 0.25, 0.06, 16); hub.rotateZ(Math.PI / 2); hub.translate(w * 0.28, 0, 0);
  const spokeGeo = new THREE.BoxGeometry(0.035, ri * 0.75, ri * 0.16);
  const disc = new THREE.CylinderGeometry(ri * 0.8, ri * 0.8, 0.03, 24); disc.rotateZ(Math.PI / 2); disc.translate(-w * 0.1, 0, 0);
  const out = { tyre, rim, face, hub, spokeGeo, disc, ri };
  wheelGeo.set(key, out);
  return out;
}
export function makeWheel(r, w, { spokes = 5, rimMat = MAT.alloy, side = 1, deep = false } = {}) {
  const p = wheelParts(r, w, spokes);
  const g = new THREE.Group();
  g.add(mesh(p.tyre, MAT.tyre), mesh(p.rim, deep ? MAT.steelRim : rimMat), mesh(p.disc, MAT.disc));
  const outer = new THREE.Group();
  if (spokes) {
    for (let k = 0; k < spokes; k++) {
      const s = mesh(p.spokeGeo, rimMat, w * 0.24, 0, 0, (k / spokes) * Math.PI * 2);
      s.geometry = p.spokeGeo;
      s.position.set(w * 0.24, Math.cos((k / spokes) * Math.PI * 2) * p.ri * 0.45, Math.sin((k / spokes) * Math.PI * 2) * p.ri * 0.45);
      outer.add(s);
    }
  } else outer.add(mesh(p.face, deep ? MAT.steelRim : rimMat));
  outer.add(mesh(p.hub, MAT.chrome));
  if (side < 0) outer.rotation.y = Math.PI;
  // flatten and merge so a wheel is 4-5 draw calls instead of ~12
  outer.updateMatrix();
  for (const m of [...outer.children]) { m.applyMatrix4(outer.matrix); g.add(m); }
  return optimize(g);
}
function addWheels(root, list, r, w, opts) {
  return list.map(([x, z]) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, r, z);
    const m = makeWheel(r, w, { ...opts, side: Math.sign(x) || 1 });
    pivot.add(m);
    root.add(pivot);
    return { pivot, mesh: m };
  });
}

// ---------- shared details ----------
let plateSeq = 7;
function plateTex(commercial) {
  const n = (plateSeq = (plateSeq * 7919 + 13) % 9000) + 1000;
  const letters = 'ABCDEFGHJKLMNPRSTUVWXYZ';
  const txt = `MT 0${1 + (n % 9)} ${letters[n % 23]}${letters[(n >> 3) % 23]} ${n}`;
  return canvasTexture(256, 56, (ctx, w, h) => {
    ctx.fillStyle = commercial ? '#f7d117' : '#fbfbf6'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#111'; ctx.lineWidth = 4; ctx.strokeRect(2, 2, w - 4, h - 4);
    ctx.fillStyle = '#1a3d8f'; ctx.fillRect(4, 4, 26, h - 8);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px Arial'; ctx.textAlign = 'center'; ctx.fillText('IND', 17, h - 12);
    ctx.fillStyle = '#111'; ctx.font = 'bold 34px Arial'; ctx.textBaseline = 'middle'; ctx.fillText(txt, 142, h / 2 + 2, 216);
  });
}
function plate(commercial, x, y, z, ry = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.12), new THREE.MeshStandardMaterial({ map: plateTex(commercial), roughness: 0.4 }));
  m.position.set(x, y, z); m.rotation.y = ry;
  return m;
}
function mirror(root, paint, x, y, z) {
  const s = Math.sign(x);
  const arm = mesh(rbox(0.12, 0.05, 0.08, 0.02), MAT.black, x - s * 0.04, y - 0.05, z);
  const cap = mesh(rbox(0.1, 0.13, 0.18, 0.04), paint, x + s * 0.03, y, z - 0.02);
  const glass = mesh(new THREE.PlaneGeometry(0.15, 0.1), MAT.chrome, x + s * 0.03, y, z - 0.115, 0, Math.PI, 0);
  root.add(arm, cap, glass);
}
function seats(root, rows, halfW, y, zFront) {
  rows.forEach((z, k) => {
    const sitW = k === 0 ? halfW * 0.8 : halfW * 1.7;
    for (const sx of k === 0 ? [-1, 1] : [0]) {
      root.add(mesh(rbox(sitW, 0.14, 0.5, 0.05), MAT.seat, sx * halfW * 0.45, y, zFront + z));
      root.add(mesh(rbox(sitW, 0.6, 0.14, 0.05), MAT.seat, sx * halfW * 0.45, y + 0.35, zFront + z - 0.25, -0.15));
    }
  });
}
function steering(root, x, y, z) {
  const w = mesh(new THREE.TorusGeometry(0.17, 0.022, 8, 20), MAT.black, x, y, z, -0.35 + Math.PI / 2 - 0.9, 0, 0);
  root.add(w);
  root.add(mesh(rbox(1.3, 0.2, 0.35, 0.05), MAT.plastic, 0, y - 0.12, z + 0.3)); // dashboard
}

// merge the fixed body parts of a vehicle by material: ~60 small meshes become a handful of draw calls
function optimize(root) {
  const groups = new Map();
  root.updateMatrixWorld(true);
  for (const o of [...root.children]) {
    if (!o.isMesh || o.material.map) continue; // keep textured parts (plates, signs, planks) as they are
    const g = o.geometry.clone();
    g.applyMatrix4(o.matrix);
    const ng = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(ng.attributes)) if (!['position', 'normal'].includes(k)) ng.deleteAttribute(k);
    if (!groups.has(o.material)) groups.set(o.material, []);
    groups.get(o.material).push(ng);
    root.remove(o);
  }
  for (const [m, list] of groups) {
    const merged = new THREE.Mesh(mergeGeometries(list), m);
    merged.castShadow = true; merged.receiveShadow = true;
    root.add(merged);
  }
  return root;
}

// ---------- hatchback (the town car) ----------
export function makeCar(hex = '#2f78c4') {
  const root = new THREE.Group();
  const paint = carPaint(hex);
  const L = lampMats();
  const W = 1.7, wr = 0.31, zf = 1.22, zr = -1.23, ar = 0.38;
  const lower = sideBody((s) => {
    s.moveTo(-1.86, 0.26);
    s.lineTo(zr - ar, 0.26); s.lineTo(zr - ar, wr); s.absarc(zr, wr, ar, Math.PI, 0, true); s.lineTo(zr + ar, 0.26);
    s.lineTo(zf - ar, 0.26); s.lineTo(zf - ar, wr); s.absarc(zf, wr, ar, Math.PI, 0, true); s.lineTo(zf + ar, 0.26);
    s.lineTo(1.84, 0.26); s.quadraticCurveTo(1.96, 0.3, 1.96, 0.5); s.quadraticCurveTo(1.95, 0.72, 1.82, 0.8);
    s.quadraticCurveTo(1.35, 0.9, 0.86, 0.96); s.lineTo(-1.62, 1.0); s.quadraticCurveTo(-1.86, 1.0, -1.9, 0.86);
    s.lineTo(-1.94, 0.5); s.quadraticCurveTo(-1.94, 0.28, -1.86, 0.26);
  }, W, 0.08);
  root.add(mesh(lower, paint));
  // glasshouse with tumblehome, then a painted roof and pillars over it
  const cabin = sideBody((s) => {
    s.moveTo(0.86, 0.94); s.quadraticCurveTo(0.45, 1.25, 0.12, 1.45); s.quadraticCurveTo(-0.5, 1.5, -1.36, 1.47);
    s.quadraticCurveTo(-1.62, 1.4, -1.74, 0.98); s.closePath();
  }, W - 0.12, 0.04, { from: 0.98, to: 1.5, k: 0.16 });
  root.add(mesh(cabin, MAT.glass));
  const roof = sideBody((s) => { s.moveTo(0.14, 1.45); s.quadraticCurveTo(-0.5, 1.53, -1.38, 1.5); s.lineTo(-1.38, 1.46); s.quadraticCurveTo(-0.5, 1.49, 0.14, 1.42); s.closePath(); }, W * 0.86, 0.035);
  root.add(mesh(roof, paint));
  for (const sx of [-1, 1]) {
    root.add(mesh(rbox(0.07, 0.9, 0.07, 0.02), paint, sx * 0.73, 1.2, 0.49, -0.98, 0, sx * 0.1)); // A pillar
    root.add(mesh(rbox(0.05, 0.5, 0.1, 0.02), MAT.black, sx * 0.71, 1.22, -0.42, 0, 0, sx * 0.13)); // B pillar
    root.add(mesh(rbox(0.08, 0.64, 0.22, 0.02), paint, sx * 0.71, 1.22, -1.55, 0.66, 0, sx * 0.12)); // C pillar
    root.add(mesh(rbox(0.03, 0.025, 2.5, 0.01), MAT.chrome, sx * 0.79, 0.99, -0.4)); // window line
    root.add(mesh(rbox(0.04, 0.03, 0.14, 0.01), MAT.chrome, sx * 0.86, 0.86, 0.2)); // door handles
    root.add(mesh(rbox(0.04, 0.03, 0.14, 0.01), MAT.chrome, sx * 0.86, 0.86, -0.75));
    mirror(root, paint, sx * 0.93, 1.02, 0.66);
    root.add(mesh(rbox(0.4, 0.16, 0.1, 0.05), MAT.black, sx * 0.58, 0.7, 1.92, 0, sx * 0.3, 0));
    root.add(mesh(rbox(0.34, 0.11, 0.08, 0.04), L.head, sx * 0.58, 0.71, 1.96, 0, sx * 0.3, 0));
    root.add(mesh(rbox(0.32, 0.16, 0.08, 0.03), L.tail, sx * 0.6, 0.84, -1.97));
  }
  // bumpers, grille, plates, wipers
  root.add(mesh(rbox(1.7, 0.2, 0.2, 0.08), MAT.plastic, 0, 0.36, 1.93));
  root.add(mesh(rbox(1.7, 0.22, 0.2, 0.08), MAT.plastic, 0, 0.38, -1.93));
  root.add(mesh(rbox(0.72, 0.2, 0.06, 0.06), MAT.black, 0, 0.58, 1.98));
  root.add(mesh(rbox(0.7, 0.03, 0.05, 0.01), MAT.chrome, 0, 0.66, 2.0));
  root.add(plate(false, 0, 0.4, 2.04), plate(false, 0, 0.62, -1.99, Math.PI));
  for (const sx of [-1, 1]) root.add(mesh(new THREE.BoxGeometry(0.5, 0.015, 0.02), MAT.black, sx * 0.28, 0.99, 0.82, 0, 0, 0.12 * sx));
  seats(root, [0, -0.85], W / 2 - 0.15, 0.5, -0.2);
  steering(root, 0.38, 0.92, 0.32);
  const wheels = addWheels(root, [[0.74, zf], [-0.74, zf], [0.74, zr], [-0.74, zr]], wr, 0.2, { spokes: 5 });
  root.userData = { kind: 'car', wheels, steerWheels: wheels.slice(0, 2), wheelR: wr, lamps: L };
  return optimize(root);
}

// ---------- SUV (boxy, high, roof rails and a spare wheel) ----------
export function makeSUV(hex = '#3d9b56') {
  const root = new THREE.Group();
  const paint = carPaint(hex);
  const L = lampMats();
  const W = 1.85, wr = 0.38, zf = 1.42, zr = -1.32, ar = 0.46;
  const lower = sideBody((s) => {
    s.moveTo(-2.1, 0.42);
    s.lineTo(zr - ar, 0.42); s.lineTo(zr - ar, wr); s.absarc(zr, wr, ar, Math.PI, 0, true); s.lineTo(zr + ar, 0.42);
    s.lineTo(zf - ar, 0.42); s.lineTo(zf - ar, wr); s.absarc(zf, wr, ar, Math.PI, 0, true); s.lineTo(zf + ar, 0.42);
    s.lineTo(2.18, 0.42); s.lineTo(2.24, 0.9); s.quadraticCurveTo(2.22, 1.08, 2.05, 1.12);
    s.lineTo(1.0, 1.2); s.lineTo(-2.08, 1.22); s.lineTo(-2.14, 0.62); s.quadraticCurveTo(-2.14, 0.44, -2.1, 0.42);
  }, W, 0.07);
  root.add(mesh(lower, paint));
  const cabin = sideBody((s) => { s.moveTo(1.0, 1.18); s.lineTo(0.35, 1.82); s.lineTo(-2.0, 1.86); s.lineTo(-2.06, 1.2); s.closePath(); }, W - 0.1, 0.04, { from: 1.2, to: 1.86, k: 0.07 });
  root.add(mesh(cabin, MAT.glass));
  root.add(mesh(rbox(W * 0.93, 0.07, 2.45, 0.03), paint, 0, 1.86, -0.83));
  for (const sx of [-1, 1]) {
    root.add(mesh(rbox(0.04, 0.05, 2.2, 0.02), MAT.alloy, sx * 0.72, 1.97, -0.8)); // roof rails
    for (const z of [0.2, -1.85]) root.add(mesh(rbox(0.05, 0.1, 0.06, 0.02), MAT.black, sx * 0.72, 1.92, z));
    root.add(mesh(rbox(0.07, 0.9, 0.08, 0.02), paint, sx * 0.87, 1.5, 0.68, -0.79, 0, 0));
    root.add(mesh(rbox(0.06, 0.62, 0.12, 0.02), MAT.black, sx * 0.87, 1.52, -0.55));
    root.add(mesh(rbox(0.06, 0.62, 0.16, 0.02), paint, sx * 0.87, 1.52, -1.95));
    root.add(mesh(rbox(0.06, 0.32, 3.6, 0.05), MAT.plastic, sx * 0.93, 0.56, 0.05)); // cladding
    root.add(mesh(rbox(0.05, 0.04, 0.15, 0.01), MAT.chrome, sx * 0.94, 1.06, 0.3));
    root.add(mesh(rbox(0.05, 0.04, 0.15, 0.01), MAT.chrome, sx * 0.94, 1.06, -0.9));
    mirror(root, MAT.black, sx * 1.02, 1.3, 0.8);
    root.add(mesh(rbox(0.42, 0.24, 0.1, 0.05), MAT.black, sx * 0.62, 0.98, 2.22));
    root.add(mesh(rbox(0.36, 0.18, 0.08, 0.05), L.head, sx * 0.62, 0.98, 2.26));
    root.add(mesh(rbox(0.12, 0.42, 0.06, 0.03), L.tail, sx * 0.84, 1.0, -2.13));
    root.add(mesh(rbox(0.12, 0.06, 0.06, 0.02), L.amber, sx * 0.82, 0.62, 2.24));
  }
  root.add(mesh(rbox(0.86, 0.32, 0.08, 0.05), MAT.black, 0, 0.92, 2.22));
  for (let k = 0; k < 6; k++) root.add(mesh(new THREE.BoxGeometry(0.05, 0.26, 0.03), MAT.chrome, -0.32 + k * 0.13, 0.92, 2.27));
  root.add(mesh(rbox(1.84, 0.28, 0.22, 0.08), MAT.plastic, 0, 0.55, 2.2));
  root.add(mesh(rbox(1.84, 0.28, 0.22, 0.08), MAT.plastic, 0, 0.55, -2.15));
  root.add(mesh(rbox(1.0, 0.06, 0.12, 0.02), MAT.alloy, 0, 0.45, 2.33)); // skid plate
  root.add(plate(false, 0, 0.62, 2.32), plate(false, 0, 0.82, -2.17, Math.PI));
  const spare = makeWheel(0.36, 0.24, { spokes: 0, deep: true });
  spare.rotation.y = Math.PI / 2; spare.position.set(0, 1.22, -2.28);
  root.add(spare);
  root.add(mesh(new THREE.CylinderGeometry(0.37, 0.37, 0.26, 24, 1, false).rotateX(Math.PI / 2), MAT.black, 0, 1.22, -2.29));
  seats(root, [0, -0.95], W / 2 - 0.15, 0.82, -0.3);
  steering(root, 0.42, 1.25, 0.35);
  const wheels = addWheels(root, [[0.8, zf], [-0.8, zf], [0.8, zr], [-0.8, zr]], wr, 0.25, { spokes: 6 });
  root.userData = { kind: 'suv', wheels, steerWheels: wheels.slice(0, 2), wheelR: wr, lamps: L };
  return optimize(root);
}

// ---------- auto-rickshaw ----------
export function makeAuto(hex = '#2f8f5a') {
  const root = new THREE.Group();
  const paint = carPaint(hex, false);
  const L = lampMats();
  const yellow = carPaint('#f2c21c', false);
  // floor pan
  root.add(mesh(rbox(1.3, 0.1, 2.5, 0.04), MAT.black, 0, 0.36, -0.15));
  // front cowl (nose) with a single headlight
  const cowl = sideBody((s) => { s.moveTo(1.15, 0.36); s.quadraticCurveTo(1.32, 0.55, 1.28, 0.95); s.lineTo(1.05, 1.02); s.lineTo(0.75, 0.42); s.closePath(); }, 0.72, 0.06);
  root.add(mesh(cowl, paint));
  root.add(mesh(new THREE.SphereGeometry(0.11, 16, 10), L.head, 0, 0.94, 1.27));
  root.add(mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.06, 16).rotateX(Math.PI / 2), MAT.chrome, 0, 0.94, 1.22));
  for (const sx of [-1, 1]) root.add(mesh(rbox(0.07, 0.07, 0.05, 0.02), L.amber, sx * 0.3, 0.98, 1.1));
  // lower body sides and the rear compartment
  for (const sx of [-1, 1]) {
    const side = sideBody((s) => { s.moveTo(0.8, 0.4); s.lineTo(0.65, 0.95); s.lineTo(-1.3, 0.95); s.lineTo(-1.4, 0.4); s.closePath(); }, 0.06, 0.02);
    const m = mesh(side, paint); m.position.x = sx * 0.64; root.add(m);
    root.add(mesh(rbox(0.05, 0.05, 2.0, 0.02), yellow, sx * 0.67, 0.95, -0.3));
  }
  root.add(mesh(rbox(1.3, 0.62, 0.5, 0.06), paint, 0, 0.68, -1.38)); // engine cover
  root.add(mesh(rbox(0.3, 0.12, 0.05, 0.03), L.tail, 0.45, 0.92, -1.64), mesh(rbox(0.3, 0.12, 0.05, 0.03), L.tail, -0.45, 0.92, -1.64));
  root.add(plate(true, 0, 0.6, -1.64, Math.PI));
  // windscreen with frame
  root.add(mesh(new THREE.PlaneGeometry(1.1, 0.6), MAT.glass, 0, 1.4, 0.85, -0.12, 0, 0));
  root.add(mesh(rbox(1.18, 0.05, 0.05, 0.02), MAT.black, 0, 1.72, 0.82), mesh(rbox(1.18, 0.05, 0.05, 0.02), MAT.black, 0, 1.1, 0.88));
  // canopy: black canvas hood on a frame
  const hood = new THREE.CylinderGeometry(0.66, 0.66, 2.35, 24, 1, true, -Math.PI / 2, Math.PI);
  hood.rotateX(Math.PI / 2); hood.rotateZ(Math.PI / 2); hood.scale(1, 0.45, 1);
  root.add(mesh(hood, MAT.canvas, 0, 1.72, -0.3));
  root.add(mesh(rbox(1.36, 0.06, 2.4, 0.03), yellow, 0, 1.73, -0.3));
  for (const z of [0.82, -0.3, -1.44]) for (const sx of [-1, 1]) root.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.8, 8), MAT.black, sx * 0.64, 1.33, z));
  // driver seat, handlebar, passenger bench
  root.add(mesh(rbox(0.5, 0.14, 0.42, 0.05), MAT.seat, 0, 0.78, 0.25));
  root.add(mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.9, 8).rotateZ(Math.PI / 2), MAT.chrome, 0, 1.1, 0.7));
  root.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 8), MAT.black, 0, 0.82, 0.78, 0.4));
  root.add(mesh(rbox(1.2, 0.16, 0.5, 0.05), MAT.seat, 0, 0.8, -0.75));
  root.add(mesh(rbox(1.2, 0.55, 0.14, 0.05), MAT.seat, 0, 1.08, -1.05));
  const wheels = addWheels(root, [[0, 1.05], [0.62, -1.05], [-0.62, -1.05]], 0.23, 0.13, { spokes: 0, deep: true });
  root.userData = { kind: 'auto', wheels, steerWheels: wheels.slice(0, 1), wheelR: 0.23, lamps: L };
  return optimize(root);
}

// ---------- goods truck (Indian style, decorated cab) ----------
export function makeTruck(hex = '#e8862a') {
  const root = new THREE.Group();
  const paint = carPaint(hex, false);
  const L = lampMats();
  const blue = carPaint('#2f6db5', false);
  root.add(mesh(new THREE.BoxGeometry(1.15, 0.28, 7.0), MAT.black, 0, 0.78, -0.35)); // chassis
  // cab: rounded front, flat sides
  const cab = sideBody((s) => {
    s.moveTo(1.55, 0.95); s.lineTo(3.45, 0.95); s.lineTo(3.45, 1.6); s.lineTo(3.3, 2.95); s.quadraticCurveTo(3.28, 3.05, 3.15, 3.05); s.lineTo(1.55, 3.05); s.closePath();
  }, 2.36, 0.09);
  root.add(mesh(cab, paint));
  root.add(mesh(new THREE.PlaneGeometry(2.0, 0.85), MAT.glass, 0, 2.35, 3.47, -0.107, 0, 0));
  root.add(mesh(new THREE.BoxGeometry(2.1, 0.06, 0.06), MAT.black, 0, 1.92, 3.5), mesh(new THREE.BoxGeometry(2.1, 0.06, 0.06), MAT.black, 0, 2.79, 3.41));
  for (const sx of [-1, 1]) {
    root.add(mesh(new THREE.PlaneGeometry(0.95, 0.65), MAT.glass, sx * 1.19, 2.3, 2.75, 0, sx * Math.PI / 2, 0));
    root.add(mesh(rbox(0.06, 0.45, 0.22, 0.03), MAT.black, sx * 1.36, 2.35, 3.2));
    root.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6).rotateZ(Math.PI / 2), MAT.chrome, sx * 1.25, 2.6, 3.2));
    root.add(mesh(rbox(0.36, 0.22, 0.08, 0.04), L.head, sx * 0.86, 1.15, 3.47));
    root.add(mesh(rbox(0.12, 0.08, 0.05, 0.02), L.amber, sx * 1.1, 1.35, 3.47));
    root.add(mesh(rbox(0.25, 0.16, 0.05, 0.03), L.tail, sx * 0.95, 0.85, -3.86));
    root.add(mesh(rbox(0.6, 0.5, 0.04, 0.02), MAT.black, sx * 1.0, 0.62, -2.3)); // mud flaps
  }
  root.add(mesh(rbox(1.9, 0.5, 0.08, 0.04), MAT.chrome, 0, 1.3, 3.48)); // grille
  for (let k = 0; k < 6; k++) root.add(mesh(new THREE.BoxGeometry(1.75, 0.03, 0.04), MAT.black, 0, 1.1 + k * 0.08, 3.53));
  root.add(mesh(rbox(2.45, 0.24, 0.22, 0.06), MAT.alloy, 0, 0.82, 3.52)); // bumper
  // decorated visor with tassels and diamonds
  root.add(mesh(rbox(2.4, 0.16, 0.25, 0.04), carPaint('#d21f3c', false), 0, 3.05, 3.32));
  for (let k = 0; k < 7; k++) root.add(mesh(new THREE.BoxGeometry(0.16, 0.16, 0.03), carPaint(['#f6d32b', '#2aa84a', '#2f6db5'][k % 3], false), -0.96 + k * 0.32, 2.9, 3.47, 0, 0, Math.PI / 4));
  root.add(plate(true, 0, 0.95, 3.55));
  // the bed: wooden floor, tall painted sides, headboard and tailgate
  const planks = Assets.material('planks', { repeat: [1, 2], color: 0x9a6a3a });
  root.add(mesh(new THREE.BoxGeometry(2.4, 0.14, 5.0), planks, 0, 1.0, -1.25));
  for (const sx of [-1, 1]) {
    root.add(mesh(new THREE.BoxGeometry(0.07, 1.2, 5.0), blue, sx * 1.2, 1.68, -1.25));
    root.add(mesh(new THREE.BoxGeometry(0.08, 0.1, 5.0), MAT.yellowTrim, sx * 1.21, 2.12, -1.25));
    root.add(mesh(new THREE.BoxGeometry(0.08, 0.07, 5.0), carPaint('#d21f3c', false), sx * 1.21, 1.3, -1.25));
  }
  root.add(mesh(new THREE.BoxGeometry(2.4, 1.6, 0.08), blue, 0, 1.86, 1.27));
  root.add(mesh(new THREE.BoxGeometry(2.4, 1.2, 0.07), blue, 0, 1.68, -3.75));
  const hop = canvasTexture(512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#2f6db5'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f6d32b'; ctx.fillRect(0, 0, w, 22); ctx.fillRect(0, h - 22, w, 22);
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 64px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('HORN OK', w / 2, 105); ctx.fillText('PLEASE', w / 2, 180);
    ctx.fillStyle = '#d21f3c'; ctx.beginPath(); ctx.arc(60, 128, 26, 0, 7); ctx.arc(w - 60, 128, 26, 0, 7); ctx.fill();
  });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.1), new THREE.MeshStandardMaterial({ map: hop, roughness: 0.6 }));
  back.position.set(0, 1.68, -3.8); back.rotation.y = Math.PI;
  root.add(back);
  const cargo = new THREE.Group();
  cargo.position.set(0, 1.08, -1.25);
  root.add(cargo);
  seats(root, [0], 1.0, 1.35, 2.4);
  const wheels = addWheels(root, [[1.0, 2.4], [-1.0, 2.4], [1.0, -1.6], [-1.0, -1.6], [1.0, -2.75], [-1.0, -2.75]], 0.5, 0.32, { spokes: 0, deep: true });
  root.userData = { kind: 'truck', wheels, steerWheels: wheels.slice(0, 2), wheelR: 0.5, cargo, lamps: L };
  return optimize(root);
}

// ---------- farm tractor ----------
export function makeTractor(hex = '#c8302a') {
  const root = new THREE.Group();
  const paint = carPaint(hex, false);
  const L = lampMats();
  const hood = sideBody((s) => { s.moveTo(1.75, 0.75); s.lineTo(1.82, 1.32); s.quadraticCurveTo(1.7, 1.48, 1.4, 1.5); s.lineTo(-0.1, 1.55); s.lineTo(-0.1, 0.75); s.closePath(); }, 0.8, 0.07);
  root.add(mesh(hood, paint));
  root.add(mesh(rbox(0.7, 0.45, 0.08, 0.04), MAT.black, 0, 1.08, 1.82)); // grille
  for (let k = 0; k < 5; k++) root.add(mesh(new THREE.BoxGeometry(0.6, 0.025, 0.03), MAT.chrome, 0, 0.92 + k * 0.08, 1.86));
  for (const sx of [-1, 1]) root.add(mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.08, 16).rotateX(Math.PI / 2), L.head, sx * 0.25, 1.38, 1.78));
  root.add(mesh(rbox(0.6, 0.5, 1.6, 0.08), MAT.black, 0, 0.75, 0.6)); // engine block
  root.add(mesh(rbox(0.9, 0.5, 1.0, 0.08), paint, 0, 0.95, -0.55)); // transmission
  root.add(mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.1, 10), MAT.black, 0.3, 2.0, 1.1)); // exhaust
  root.add(mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.12, 10), MAT.chrome, 0.3, 2.56, 1.1));
  // fenders over the big rear wheels, seat and wheel
  for (const sx of [-1, 1]) {
    const f = new THREE.CylinderGeometry(0.85, 0.85, 0.5, 20, 1, true, -Math.PI / 2 - 0.2, Math.PI + 0.4);
    f.rotateZ(Math.PI / 2);
    root.add(mesh(f, paint, sx * 0.86, 0.72, -0.85));
    root.add(mesh(rbox(0.06, 0.06, 0.08, 0.02), L.tail, sx * 1.1, 1.3, -1.5));
  }
  root.add(mesh(rbox(0.55, 0.12, 0.5, 0.05), MAT.seat, 0, 1.55, -0.9));
  root.add(mesh(rbox(0.55, 0.45, 0.1, 0.05), MAT.seat, 0, 1.8, -1.15, -0.2));
  root.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.6, 8), MAT.black, 0, 1.75, -0.2, -0.6));
  root.add(mesh(new THREE.TorusGeometry(0.18, 0.02, 8, 20), MAT.black, 0, 2.0, -0.32, -0.6 + Math.PI / 2));
  root.add(plate(true, 0, 1.0, -1.58, Math.PI));
  // big lugged rear tyres, small front tyres
  const rear = addWheels(root, [[0.86, -0.85], [-0.86, -0.85]], 0.78, 0.42, { spokes: 0, deep: true });
  // chevron lugs on the rear tyres, merged into one mesh per wheel
  const lugs = [];
  for (let k = 0; k < 22; k++) {
    const a = (k / 22) * Math.PI * 2;
    const g = new THREE.BoxGeometry(0.38, 0.06, 0.1);
    g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(a, k % 2 ? 0.35 : -0.35, 0)));
    g.translate(0, Math.cos(a) * 0.79, Math.sin(a) * 0.79);
    lugs.push(g);
  }
  const lugGeo = mergeGeometries(lugs);
  for (const w of rear) w.mesh.add(mesh(lugGeo, MAT.tyre));
  const front = addWheels(root, [[0.62, 1.25], [-0.62, 1.25]], 0.38, 0.2, { spokes: 0, deep: true });
  root.userData = { kind: 'tractor', wheels: [...front, ...rear], steerWheels: front, wheelR: 0.5, lamps: L };
  return optimize(root);
}

