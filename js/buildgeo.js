// Building layout and geometry for the real-time construction site.
// Plot-local coordinates: ground at y = 0, building centred on (0, 0), front faces +z (towards the street).
import * as THREE from 'three';
import { Assets } from './assets.js';
import { rng } from './util.js';

export const TRENCH_W = 0.8, TRENCH_D = 1.0, FOOTING_H = 0.5;
export const PLINTH = 0.45; // ground floor level above the ground
export const FLOOR_H = 3.0, SLAB_T = 0.16, WALL_T = 0.23, COL = 0.26;
export const BRICK = { l: 0.24, h: 0.075, t: 0.22, pitchL: 0.25, pitchH: 0.085 };

export const PROJECTS = [
  { id: 'house', name: 'Family House', icon: '🏠', w: 10, d: 8, floors: 1, roof: 'tiles', door: 'left', note: 'A cosy one-storey home with a clay-tile roof.' },
  { id: 'shop', name: 'Corner Shop', icon: '🏪', w: 9, d: 7, floors: 1, roof: 'flat', door: 'shutter', note: 'A shop with a wide rolling shutter and a flat roof.' },
  { id: 'school', name: 'Village School', icon: '🏫', w: 14, d: 8, floors: 1, roof: 'tiles', door: 'left', note: 'A long classroom block with big windows.' },
  { id: 'clinic', name: 'Health Clinic', icon: '🏥', w: 11, d: 8, floors: 1, roof: 'flat', door: 'centre', note: 'A clinic with a central entrance and a flat roof.' },
  { id: 'duplex', name: 'Two-Storey Home', icon: '🏡', w: 10, d: 8, floors: 2, roof: 'flat', door: 'left', note: 'Your first building with a second floor!' },
  { id: 'post', name: 'Post Office', icon: '🏤', w: 12, d: 8, floors: 1, roof: 'tiles', door: 'centre', note: 'A post office with a tiled roof.' },
  { id: 'police', name: 'Police Station', icon: '🚓', w: 12, d: 9, floors: 2, roof: 'flat', door: 'centre', note: 'Two floors with a flat terrace roof.' },
  { id: 'library', name: 'Library', icon: '📚', w: 14, d: 9, floors: 1, roof: 'tin', door: 'centre', note: 'A big reading hall under a metal roof.' },
  { id: 'bus', name: 'Bus Station', icon: '🚌', w: 16, d: 8, floors: 1, roof: 'tin', door: 'shutter', note: 'A long waiting hall with wide openings.' },
  { id: 'hall', name: 'Town Hall', icon: '🏛️', w: 16, d: 10, floors: 2, roof: 'tiles', door: 'centre', note: 'The biggest project: two floors and a grand tiled roof.' },
];

// walls, openings and column positions for a project
export function layout(p) {
  const hw = p.w / 2, hd = p.d / 2;
  const walls = [
    { id: 'front', a: [-hw, hd], b: [hw, hd], out: [0, 1] },
    { id: 'right', a: [hw, hd], b: [hw, -hd], out: [1, 0] },
    { id: 'back', a: [hw, -hd], b: [-hw, -hd], out: [0, -1] },
    { id: 'left', a: [-hw, -hd], b: [-hw, hd], out: [-1, 0] },
  ];
  for (const w of walls) {
    w.len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
    w.dir = [(w.b[0] - w.a[0]) / w.len, (w.b[1] - w.a[1]) / w.len];
    w.yaw = Math.atan2(w.dir[0], w.dir[1]) - Math.PI / 2; // local +x along the wall
  }
  // the main door on the front wall (columns must stay clear of it)
  const wide = p.door === 'shutter';
  const door = { kind: wide ? 'shutter' : 'door', w: wide ? Math.min(3.2, p.w * 0.35) : 1.1, h: wide ? 2.5 : 2.15 };
  door.s = p.door === 'left' ? 2.2 : walls[0].len / 2;
  // columns: corners plus every ~4 m along each wall
  const cols = [];
  const seen = new Set();
  for (const w of walls) {
    const n = Math.max(1, Math.round(w.len / 4));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      let x = w.a[0] + (w.b[0] - w.a[0]) * t, z = w.a[1] + (w.b[1] - w.a[1]) * t;
      if (w.id === 'front' && k > 0 && Math.abs(w.len * t - door.s) < door.w / 2 + 0.35) x = w.a[0] + door.s + Math.sign(w.len * t - door.s || 1) * (door.w / 2 + 0.35);
      const key = `${x.toFixed(2)},${z.toFixed(2)}`;
      if (!seen.has(key)) { seen.add(key); cols.push([x, z]); }
    }
  }
  // openings (s = distance along the wall from a, v = height above floor)
  const ops = (floor) => {
    const out = { front: [], right: [], back: [], left: [] };
    const front = walls[0];
    if (floor === 0) out.front.push({ kind: door.kind, s: door.s, v: 0, w: door.w, h: door.h });
    void front;
    for (const w of walls) {
      const n = Math.max(1, Math.floor((w.len - 1.5) / 3));
      for (let k = 0; k < n; k++) {
        const s = (w.len * (k + 0.5)) / n;
        const clash = out[w.id].some((o) => Math.abs(o.s - s) < o.w / 2 + 1.0);
        const nearCol = cols.some(([cx, cz]) => Math.hypot(w.a[0] + w.dir[0] * s - cx, w.a[1] + w.dir[1] * s - cz) < 0.95);
        if (!clash && !nearCol) out[w.id].push({ kind: 'window', s, v: 0.95, w: 1.3, h: 1.25 });
      }
    }
    return out;
  };
  return { hw, hd, walls, cols, ops, floors: p.floors };
}

export function floorBase(k) { return PLINTH + k * (FLOOR_H + SLAB_T); }

// every brick of one floor, in laying order (course by course around the whole building)
export function brickSlots(L, floor) {
  const slots = [];
  const lintels = [];
  const courses = Math.floor((FLOOR_H - 0.05) / BRICK.pitchH);
  const ops = L.ops(floor);
  const y0 = floorBase(floor);
  const r = rng(77 + floor);
  for (let c = 0; c < courses; c++) {
    const v = c * BRICK.pitchH;
    for (const w of L.walls) {
      const off = c % 2 ? BRICK.pitchL / 2 : 0;
      for (let s = COL / 2 + off + BRICK.pitchL / 2; s < w.len - COL / 2; s += BRICK.pitchL) {
        const x = w.a[0] + w.dir[0] * s, z = w.a[1] + w.dir[1] * s;
        if (L.cols.some(([cx, cz]) => Math.abs(cx - x) < COL / 2 + 0.12 && Math.abs(cz - z) < COL / 2 + 0.12)) continue;
        if (ops[w.id].some((o) => Math.abs(s - o.s) < o.w / 2 + 0.02 && v + BRICK.h > o.v - 0.01 && v < o.v + o.h + 0.12)) continue;
        slots.push({ x, y: y0 + v + BRICK.h / 2, z, yaw: w.yaw, shade: 0.82 + r() * 0.3 });
      }
    }
  }
  // a concrete lintel over every opening, appearing when the wall reaches it
  for (const w of L.walls) for (const o of ops[w.id]) {
    const s = o.s;
    lintels.push({ x: w.a[0] + w.dir[0] * s, z: w.a[1] + w.dir[1] * s, y: y0 + o.v + o.h + 0.07, yaw: w.yaw, len: o.w + 0.4, atCourse: Math.ceil((o.v + o.h) / BRICK.pitchH) });
  }
  return { slots, lintels, courses };
}

// a 2D wall outline with its openings, for plaster and paint skins
export function wallShape(w, ops, H) {
  const sh = new THREE.Shape();
  sh.moveTo(0, 0); sh.lineTo(w.len, 0); sh.lineTo(w.len, H); sh.lineTo(0, H); sh.closePath();
  for (const o of ops) {
    const h = new THREE.Path();
    h.moveTo(o.s - o.w / 2, o.v + 0.001); h.lineTo(o.s + o.w / 2, o.v + 0.001); h.lineTo(o.s + o.w / 2, o.v + o.h); h.lineTo(o.s - o.w / 2, o.v + o.h); h.closePath();
    sh.holes.push(h);
  }
  return sh;
}

// outside skin of one wall on one floor, uv normalised to 0..1 for the coverage mask
export function skinGeometry(w, ops, H) {
  const g = new THREE.ShapeGeometry(wallShape(w, ops, H));
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / w.len, pos.getY(i) / H);
  return g;
}
export function placeSkin(mesh, w, y0, offset) {
  mesh.position.set(w.a[0] + w.out[0] * (WALL_T / 2 + offset), y0, w.a[1] + w.out[1] * (WALL_T / 2 + offset));
  mesh.rotation.set(0, w.yaw, 0);
}

// a paintable mask: a small canvas whose alpha says where plaster or paint has gone
export function makeMask(w, H) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = Math.max(32, Math.round((128 * H) / w.len));
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, c.width, c.height);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  return { canvas: c, ctx, tex };
}
export function paintMask(m, u, v, radius = 0.09) {
  const { ctx, canvas } = m;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.ellipse(u * canvas.width, (1 - v) * canvas.height, radius * canvas.width, radius * canvas.width, 0, 0, Math.PI * 2);
  ctx.fill();
  m.tex.needsUpdate = true;
}
export function fillMask(m) { m.ctx.fillStyle = '#fff'; m.ctx.fillRect(0, 0, m.canvas.width, m.canvas.height); m.tex.needsUpdate = true; }
export function maskCoverage(m) {
  const d = m.ctx.getImageData(0, 0, m.canvas.width, m.canvas.height).data;
  let on = 0;
  for (let i = 0; i < d.length; i += 16) if (d[i] > 128) on++;
  return on / (d.length / 16);
}

// window and door fittings with real wood and glass
const WOOD = () => Assets.material('planks', { repeat: [0.5, 1], color: 0xb07a4c });
export function fitting(o) {
  const g = new THREE.Group();
  const frameMat = o.kind === 'window' ? new THREE.MeshStandardMaterial({ color: 0xf1ede2, roughness: 0.5 }) : WOOD();
  const fr = (w, h, x, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.12), frameMat); m.position.set(x, y, 0); m.castShadow = true; g.add(m); };
  fr(o.w, 0.08, 0, o.h - 0.04); fr(0.08, o.h, -o.w / 2 + 0.04, o.h / 2); fr(0.08, o.h, o.w / 2 - 0.04, o.h / 2);
  if (o.kind === 'window') {
    fr(o.w, 0.08, 0, 0.04); fr(0.06, o.h, 0, o.h / 2);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(o.w - 0.1, o.h - 0.1), new THREE.MeshPhysicalMaterial({ color: 0xa8c4d4, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.35, clearcoat: 1 }));
    glass.position.set(0, o.h / 2, -0.02);
    g.add(glass);
    for (let k = 1; k < 4; k++) { const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, o.h - 0.1, 6), new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.7, roughness: 0.4 })); bar.position.set(-o.w / 2 + (k * o.w) / 4, o.h / 2, 0.05); g.add(bar); }
  } else if (o.kind === 'door') {
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(o.w - 0.12, o.h - 0.08, 0.05), WOOD());
    leaf.position.set(0, (o.h - 0.08) / 2, -0.02); leaf.castShadow = true; g.add(leaf);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), new THREE.MeshStandardMaterial({ color: 0xd4b04a, metalness: 1, roughness: 0.25 }));
    knob.position.set(o.w / 2 - 0.18, 1.0, 0.03); g.add(knob);
  } else {
    // rolling shutter, ribbed steel
    const sh = new THREE.Mesh(new THREE.BoxGeometry(o.w - 0.1, o.h * 0.35, 0.05), Assets.material('tin_roof', { repeat: [2, 1], color: 0x9fb3c2, metalness: 0.7, roughness: 0.4 }));
    sh.position.set(0, o.h * 0.82, 0); g.add(sh);
  }
  return g;
}
