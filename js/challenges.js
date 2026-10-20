// Ten driving challenges: drive through glowing checkpoints around Mitrapur and the villages.
// Each one opens the next; stars come from the time taken (par time = 3 stars).
import * as THREE from 'three';

export const DRIVE_LEVELS = [
  { name: 'Market Day', icon: '🛒', desc: 'Drive to the Sabzi Mandi on Market Street.', par: 60, spawn: 'garage', cps: (c) => [c.P(-150, 150)] },
  { name: 'Around the Block', icon: '🔄', desc: 'Drive all the way round the middle of town.', par: 110, spawn: 'garage', cps: (c) => [c.P(0, 20), c.P(-290, 20), c.P(-290, 150), c.P(0, 150), c.P(290, 150), c.P(290, 20)] },
  { name: 'Station Pick-up', icon: '🚉', desc: 'Fetch a visitor from Mitrapur Junction and come back to the garage.', par: 130, spawn: 'garage', cps: (c) => [c.forecourt(), c.P(205, 20)] },
  { name: 'Warehouse Run', icon: '📦', desc: 'Take the truck to the loading bay, then to the first building plot.', par: 100, vehicle: 'truck', spawn: 'garage', cps: (c) => [c.bay(), c.plot(0)] },
  { name: 'Village Visit', icon: '🌾', desc: 'Visit Dhanpur village across the level crossing.', par: 150, spawn: 'garage', cps: (c) => [c.P(-300, 20), c.cross(1, -70), c.cross(1, 270)] },
  { name: 'Town Time Trial', icon: '⏱️', desc: 'Eight checkpoints, as fast as you can — but drive safely!', par: 120, spawn: 'trial', cps: (c) => [c.P(0, 20), c.P(-290, 20), c.P(-290, -130), c.P(0, -130), c.P(290, -130), c.P(290, 150), c.P(0, 150), c.P(150, 20)] },
  { name: 'Farm Road', icon: '🚜', desc: 'Drive the tractor along the hill farm road and over the railway.', par: 120, vehicle: 'tractor', spawn: 'farm', cps: (c) => [c.cross(2, -40), c.cross(2, 60), c.cross(2, 320)] },
  { name: 'Night Patrol', icon: '🌙', desc: 'Check the town streets at night. Your headlights light the way.', par: 160, night: true, spawn: 'garage', cps: (c) => [c.P(0, 20), c.P(0, 150), c.P(-150, 150), c.P(-290, -130), c.P(205, 20)] },
  { name: 'Railway Crossing', icon: '🚧', desc: 'Drive to Mitrapur Gaon over the level crossing. Stop if the gates are down!', par: 140, spawn: 'garage', cps: (c) => [c.P(-290, 150), c.cross(0, -45), c.cross(0, 180)] },
  { name: 'Grand Tour', icon: '🏆', desc: 'Market, station, warehouse and Dhanpur village — then home.', par: 320, spawn: 'garage', cps: (c) => [c.P(-150, 150), c.forecourt(), c.bay(), c.cross(1, -70), c.cross(1, 270), c.P(205, 20)] },
];

export class Challenges {
  constructor(game) {
    this.game = game;
    this.active = null;
    this.group = new THREE.Group();
    game.scene.add(this.group);
  }

  get S() {
    const s = this.game.state;
    s.drive ||= { open: 1, stars: new Array(DRIVE_LEVELS.length).fill(0), best: new Array(DRIVE_LEVELS.length).fill(0) };
    return s.drive;
  }

  // helpers that turn level descriptions into world positions
  coords() {
    const g = this.game, t = g.town, tr = g.track;
    const at = (x, z) => ({ x, z });
    return {
      P: (dx, dz) => at(...t.P(dx, dz)),
      forecourt: () => { const st = g.world.stations.find((s) => s.id === 'MTP'); const p = tr.point(st.s, -26, 0); return at(p.x, p.z); },
      bay: () => at(t.bay.x, t.bay.z),
      plot: (i) => at(t.plots[i].unload.x, t.plots[i].unload.z),
      cross: (k, lat) => { const p = tr.point(t.crossingS[k], lat); return at(p.x, p.z); },
    };
  }

  start(i) {
    const lv = DRIVE_LEVELS[i];
    if (!lv || i + 1 > this.S.open) return false;
    this.stop();
    const g = this.game;
    const c = this.coords();
    const cps = lv.cps(c).map((p, k) => ({ ...p, r: 9, k }));
    // put the vehicle at the start, facing the first checkpoint
    const v = g.vehicle;
    if (v) {
      let sp = null;
      if (lv.spawn === 'garage') sp = c.P(190, 20);
      else if (lv.spawn === 'trial') sp = c.P(160, 20);
      else if (lv.spawn === 'farm') sp = c.cross(2, -240);
      if (sp) v.place(sp.x, sp.z, Math.atan2(cps[0].x - sp.x, cps[0].z - sp.z));
      v.speed = 0;
    }
    this.active = { i, lv, cps, k: 0, t: 0, prevMode: null };
    if (lv.night) { this.active.prevMode = g.daynight.mode; g.daynight.mode = 'night'; }
    this.buildMarkers();
    g.audio.play('chime');
    g.ui.toast(`Challenge ${i + 1}: ${lv.name} — ${lv.desc}`, 'good');
    return true;
  }

  stop() {
    const a = this.active;
    if (!a) return;
    if (a.prevMode) this.game.daynight.mode = a.prevMode;
    while (this.group.children.length) this.group.remove(this.group.children[0]);
    this.active = null;
  }

  buildMarkers() {
    const g = this.game;
    for (const cp of this.active.cps) {
      const m = new THREE.Group();
      const y = g.world.roadY(cp.x, cp.z);
      m.position.set(cp.x, y, cp.z);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(cp.r * 0.8, 0.25, 8, 40), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.85 }));
      ring.rotation.x = Math.PI / 2; ring.position.y = 0.3;
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(cp.r * 0.8, cp.r * 0.8, 9, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }));
      beam.position.y = 4.5;
      const num = numberSprite(cp.k + 1);
      num.position.y = 10.5;
      m.add(ring, beam, num);
      m.userData = { ring, beam, num };
      cp.mesh = m;
      this.group.add(m);
    }
  }

  update(dt) {
    const a = this.active, g = this.game;
    if (!a) return;
    const v = g.vehicle;
    if (!v || !g.isDrive()) return;
    a.t += dt;
    a.cps.forEach((cp, k) => {
      const u = cp.mesh.userData;
      cp.mesh.visible = k >= a.k;
      const now = k === a.k;
      u.ring.material.color.setHex(now ? 0xffd23f : 0xffffff);
      u.ring.material.opacity = now ? 0.75 + 0.25 * Math.sin(g.time * 6) : 0.35;
      u.beam.visible = now;
      u.ring.scale.setScalar(now ? 1 + 0.05 * Math.sin(g.time * 4) : 0.7);
    });
    const cp = a.cps[a.k];
    if (Math.hypot(v.x - cp.x, v.z - cp.z) < cp.r) {
      a.k++;
      g.audio.play('coin');
      if (a.k >= a.cps.length) this.finish();
      else g.ui.toast(`Checkpoint ${a.k}/${a.cps.length}!`, 'good');
    }
  }

  finish() {
    const a = this.active, g = this.game, S = this.S;
    const t = a.t, par = a.lv.par;
    const stars = t <= par ? 3 : t <= par * 1.5 ? 2 : 1;
    S.stars[a.i] = Math.max(S.stars[a.i] || 0, stars);
    S.best[a.i] = S.best[a.i] ? Math.min(S.best[a.i], Math.round(t)) : Math.round(t);
    const first = a.i + 1 === S.open;
    if (first) S.open = Math.min(DRIVE_LEVELS.length + 1, S.open + 1);
    const coins = 40 + a.i * 20 + stars * 10;
    g.state.coins += coins;
    const lv = a.lv, i = a.i;
    this.stop();
    g.audio.play('fanfare');
    g.ui.celebrate(`${lv.icon} ${lv.name} complete!`, [
      `${'⭐'.repeat(stars)}${'☆'.repeat(3 - stars)}  ·  time ${fmt(t)} (3 stars under ${fmt(par)})`,
      `+${coins} coins`,
      i + 1 < DRIVE_LEVELS.length ? (first ? `Challenge ${i + 2} "${DRIVE_LEVELS[i + 1].name}" is open!` : 'Try the next challenge from the Drive menu.') : 'You finished every driving challenge! 🏆',
    ]);
    g.save();
  }

  // what the HUD shows while a challenge is on
  objective() {
    const a = this.active;
    if (!a) return null;
    const cp = a.cps[a.k];
    const v = this.game.vehicle;
    const d = v ? Math.hypot(v.x - cp.x, v.z - cp.z) : 0;
    return {
      title: `${a.lv.icon} Challenge ${a.i + 1}: ${a.lv.name}`,
      sub: `Checkpoint ${a.k + 1}/${a.cps.length} · ${Math.round(d)} m · ⏱ ${fmt(a.t)} (par ${fmt(a.lv.par)})`,
      target: { x: cp.x, z: cp.z, r: cp.r },
    };
  }
}

function fmt(t) { const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${m}:${String(s).padStart(2, '0')}`; }

function numberSprite(n) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(64, 64, 56, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 8; ctx.strokeStyle = '#ffffff'; ctx.stroke();
  ctx.fillStyle = '#1b1b1b'; ctx.font = 'bold 70px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(n), 64, 68);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false }));
  s.scale.set(3, 3, 1);
  return s;
}
