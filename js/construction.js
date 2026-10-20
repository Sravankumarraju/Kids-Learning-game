// Real-time construction: ten building projects, twelve real stages each (columns, walls and slab repeat for every
// floor). Every stage opens with a short lesson and a method choice, then the player does the work with real
// machines and a site crew, gets stars for accuracy, and the days pass in a quick time-lapse.
import * as THREE from 'three';
import { STAGES, PAINT_COLORS, CARGO, STAGE_ROOF } from './data.js';
import * as L from './logic.js';
import * as B from './buildgeo.js';
import * as V from './sitevis.js';
import { ST } from './sitevis.js';
import { LESSONS, QUIZZES, INSPECTION } from './lessons.js';
import { makeBulldozer, makeBackhoe, makeExcavator2, makeTipper, makeMixer2, makePump, makeRoller, makeTripod, makeWorker, animateWorker } from './machines.js';
import { makeCrane } from './models.js';
import { clamp, lerp, angDiff } from './util.js';

const DAYS = [1, 1, 2, 2, 8, 3, 8, 6, 15, 4, 5, 3];
const ease = (k) => k * k * (3 - 2 * k);
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export class Construction {
  constructor(game) {
    this.game = game;
    this.town = game.town;
    this.terrain = game.terrain;
    this.audio = game.audio;
    this.sites = this.town.plots.map((p, i) => {
      const root = new THREE.Group();
      root.position.set(p.x, p.y, p.z);
      root.rotation.y = p.yaw || 0;
      game.scene.add(root);
      const proj = B.PROJECTS[i];
      const Lay = B.layout(proj);
      const site = { i, plot: p, root, proj, L: Lay, segs: V.trenchSegs(Lay), h: null };
      site.setHole = (ext) => {
        if (!ext) { this.terrain.setHole(i, 0, 0, 0, 0); return; }
        this.terrain.setHole(i, p.x - ext[0], p.z - ext[1], p.x + ext[0], p.z + ext[1]);
      };
      return site;
    });
    // machines and crew (moved to whichever site is being worked on)
    const scaled = (o, s) => { o.scale.setScalar(s); return o; };
    this.m = {
      dozer: makeBulldozer(), excavator: scaled(makeExcavator2(), 0.8), backhoe: makeBackhoe(), tipper: makeTipper(),
      mixer: scaled(makeMixer2(), 0.9), pump: scaled(makePump(), 0.85), roller: makeRoller(), tripod: makeTripod(), crane: makeCrane(16, 20),
    };
    // the backhoe bucket can carry soil too
    const bd = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 1 }));
    bd.position.set(0, -0.2, -0.2); bd.visible = false; this.m.backhoe.userData.bucket.add(bd); this.m.backhoe.userData.dirt = bd;
    for (const k in this.m) { this.m[k].visible = false; this.m[k].traverse((o) => { if (o.isMesh) o.castShadow = true; }); }
    this.crew = [0, 1, 2, 3].map((k) => { const w = makeWorker(k); w.visible = false; w.userData.goal = null; w.userData.mode = 'idle'; return w; });
    this.people = [0, 1, 2].map((k) => civilian(makeWorker(k + 4), k));
    this.inspector = makeWorker(1);
    this.inspector.children[2].material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
    this.session = null;
    this.seqs = [];
    this.particles = [];
    this.pickables = [];
    this.pad = {};
    this.focus = V3();
    this.tmp = V3();
    this.box3 = new THREE.Box3();
    this.arrow = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.8, 4), new THREE.MeshStandardMaterial({ color: 0xffc400, emissive: 0xff8a00, emissiveIntensity: 0.6, roughness: 0.4 }));
    this.arrow.geometry.rotateX(Math.PI);
    this.arrow.visible = false;
  }

  get state() { return this.game.state; }
  get ps() { return this.state.plots[this.session.i]; }
  get site() { return this.sites[this.session.i]; }

  // ---------- persistent visuals ----------
  refreshAll() { this.sites.forEach((_, i) => this.refreshPlot(i)); }
  refreshPlot(i) {
    const site = this.sites[i], ps = this.state.plots[i];
    this.town.setPlotLocked(i, !ps.unlocked);
    V.buildSite(site, ps, this.game);
    if (this.session && this.session.i === i) { for (const k in this.m) if (this.m[k].visible) site.root.add(this.m[k]); for (const w of [...this.crew, ...this.people, this.inspector]) if (w.visible) site.root.add(w); }
  }

  // ---------- session ----------
  canEnter(i) { const ps = this.state.plots[i]; return !!ps && ps.unlocked && !ps.done; }

  enter(i) {
    const ps = this.state.plots[i];
    const proj = B.PROJECTS[i];
    ps.floors = proj.floors;
    ps.design ||= { type: proj.id, color: PAINT_COLORS[0].hex };
    ps.colors ||= { walls: ps.design.color };
    ps.days ||= 0;
    this.session = { i, phase: 'learn', t: 0 };
    this.seqs = [];
    this.refreshPlot(i);
    const site = this.sites[i];
    for (const w of this.crew) { w.visible = true; site.root.add(w); }
    this.crew.forEach((w, k) => { w.position.set(-3 + k * 2, 0, 12.5); w.rotation.y = Math.PI; w.userData.goal = null; });
    const ob = this.game.rig.orbit;
    const c = site.root.position;
    ob.center.set(c.x, c.y + 2, c.z);
    ob.yaw = (site.plot.yaw || 0) + 0.55; ob.pitch = 0.55; ob.dist = 34 + site.proj.w;
    this.setupStage();
  }

  exit() {
    if (!this.session) return;
    this.finishSeqs();
    this.hideMachines();
    for (const w of [...this.crew, ...this.people, this.inspector]) { w.visible = false; w.parent?.remove(w); }
    for (const p of this.particles) p.m.parent?.remove(p.m);
    this.particles = [];
    const i = this.session.i;
    this.session = null;
    this.pickables = [];
    this.game.ui.buildPanel(null);
    this.refreshPlot(i);
    this.game.save();
  }

  hideMachines() { for (const k in this.m) { this.m[k].visible = false; this.m[k].parent?.remove(this.m[k]); } }
  show(name, x, z, yaw = 0, y = 0) {
    const o = this.m[name];
    o.visible = true;
    this.site.root.add(o);
    o.position.set(x, y, z);
    o.rotation.y = yaw;
    return o;
  }

  stageIdx() { return this.ps.stage; }
  progress() { const ps = this.ps; ps.progress ||= {}; return ps.progress; }
  lesson() {
    const st = this.stageIdx();
    const l = LESSONS[st];
    if (st !== ST.roof) return l;
    return this.isSlab() ? l.slab : l[this.site.proj.roof];
  }
  isSlab() { const ps = this.ps, proj = this.site.proj; return (ps.floor || 0) < proj.floors - 1 || proj.roof === 'flat'; }
  fact() { const f = this.lesson().facts; return f[(this.session.i + (this.ps.floor || 0)) % f.length]; }

  // ---------- stage setup ----------
  setupStage() {
    // a fresh session object for every stage, so timers from the last stage cannot act on this one
    const s = this.session = { i: this.session.i, t: this.session.t };
    const ps = this.ps, st = ps.stage;
    this.finishSeqs();
    this.hideMachines();
    this.pickables = [];
    this.people.forEach((p) => { p.visible = false; p.parent?.remove(p); });
    this.inspector.visible = false; this.inspector.parent?.remove(this.inspector);
    Object.assign(s, { phase: 'learn', step: null, choice: null, feedback: null, stars: 3, helped: false, hold: null, gauge: 0, quiz: null, level: null, held: false });
    this.pad = {};
    if (st >= STAGES.length) { this.panel(); return; }
    if (!L.canWorkStage(ps, st, this.state.rules.realMaterials)) { s.phase = 'blocked'; this.panel(); return; }
    // resume straight into the work if this stage was already started
    const pr = this.progress();
    if (pr.choice) { s.choice = pr.choice; this.startWork(); return; }
    if (!this.lesson().choice) s.choice = 'none';
    this.idleScene();
    this.panel();
  }

  // machines parked and crew standing by, before the work starts
  idleScene() {
    const st = this.stageIdx(), site = this.site;
    const { hw, hd } = site.L;
    this.setFocus(0, 1.5, 0);
    if (st === ST.survey) { this.show('tripod', -hw - 2.5, hd + 3, 0.6); this.crewTo(0, -hw - 3, hd + 3.6, 'idle', -hw, 0); }
    if (st >= ST.columns && st <= ST.roof) this.show('crane', -hw - 4, -hd - 4, 0);
  }

  choose(id) {
    const s = this.session, l = this.lesson();
    if (s.phase !== 'learn') return;
    const opt = l.choice.opts.find((o) => o.id === id);
    if (!opt) return;
    if (!opt.good) { s.stars = Math.min(s.stars, 2); s.feedback = { good: false, text: opt.why }; s.choice = l.choice.opts.find((o) => o.good).id; this.audio.play('error'); }
    else { s.feedback = { good: true, text: opt.why }; s.choice = id; this.audio.play('chime'); }
    s.picked = id;
    this.panel();
  }

  startWork() {
    const s = this.session, st = this.stageIdx(), pr = this.progress();
    pr.choice = s.choice;
    s.phase = 'work';
    s.feedback = null;
    const site = this.site, { hw, hd } = site.L;
    const f = this.ps.floor || 0;
    this.audio.play('click');
    if (st === ST.survey) {
      this.show('tripod', -hw - 2.5, hd + 3, 0.6);
      this.crewTo(0, -hw - 3, hd + 3.6, 'work', -hw, 0);
      this.crewTo(1, hw + 2, hd + 2.5, 'idle', 0, 0);
      this.makePegGhosts();
    } else if (st === ST.clear) {
      if (s.choice === 'dozer') {
        this.show('dozer', -10, 14, Math.PI);
        this.run(this.driveSteps('dozer', [[-10, 14], [-10, -9]], 5, true), () => { s.lane = 0; s.laneT = 0; this.panel(); });
        s.lane = -1;
      }
      this.crewTo(0, 11, 11, 'idle', 0, 0);
      this.pickables = Object.values(site.h.debris);
    } else if (st === ST.dig) {
      s.seg = this.nextSeg();
      s.mach = s.choice === 'backhoe' ? 'backhoe' : 'excavator';
      this.show(s.mach, 0, 16, Math.PI);
      this.show('tipper', -hw - 6, hd + 8, Math.PI * 0.5);
      if (s.seg != null) this.moveDigger(s.seg);
      this.crewTo(0, hw + 2, hd + 4, 'idle', 0, 0);
    } else if (st === ST.steel) {
      this.makeSegGhosts((k) => !(pr.cages || []).includes(k));
    } else if (st === ST.footing) {
      s.wall = this.nextFootWall();
      this.show('mixer', 0, 18, 0);
      if (s.wall != null) this.moveMixer(s.wall);
      this.crewTo(0, hw + 1.5, hd + 1.5, 'work', 0, 0);
      this.crewTo(1, -hw - 1.5, hd + 1.5, 'work', 0, 0);
    } else if (st === ST.plinth) {
      s.step = pr.dpc ? 'done' : (pr.backfill || 0) >= 1 ? 'dpc' : (pr.plinth || 0) >= 1 ? 'fill' : 'build';
      this.crewAround('work', 0);
      if (s.step === 'fill') this.show('roller', -hw + 1.5, 0, Math.PI / 2, B.PLINTH * (pr.backfill || 0));
    } else if (st === ST.columns) {
      this.show('crane', -hw - 4, -hd - 4, 0);
      this.show('pump', hw + 3.2, hd + 7, Math.PI);
      this.foldPump(1);
      this.pickables = [];
      for (const c of V.columnSpots(site.L, f)) if (!(pr.cols || []).includes(c.k)) {
        const gm = V.box(0.6, B.FLOOR_H + 0.3, 0.6, V.mats().ghost, c.x, c.y0 + B.FLOOR_H / 2, c.z);
        gm.castShadow = false; gm.userData = { col: c };
        site.root.add(gm); this.pickables.push(gm);
      }
      this.crewTo(0, hw + 2, hd + 4, 'idle', 0, 0);
      s.step = this.pickables.length ? 'pour' : 'strip';
    } else if (st === ST.walls) {
      this.show('crane', -hw - 4, -hd - 4, 0);
      s.step = 'lay';
      s.checks = [0.3, 0.65].filter((k) => (pr.bricks || 0) / site.h.brickSlots.slots.length < k);
      this.crewAround('work', B.floorBase(f), true);
    } else if (st === ST.roof) {
      this.show('crane', -hw - 4, -hd - 4, 0);
      const rp = pr.roof ||= {};
      if (this.isSlab()) s.step = !rp.deck ? 'deck' : !rp.mesh ? 'mesh' : 'pour';
      else s.step = (rp.gablesK || 0) < 1 ? 'gables' : (rp.trusses || []).length < site.h.pitched.trusses.length ? 'trusses' : 'cover';
      if (s.step === 'pour') { this.show('pump', hw + 3.2, hd + 7, Math.PI); this.foldPump(1); }
      if (s.step === 'trusses') this.makeTrussGhosts();
      this.crewAround('work', B.floorBase(f) + B.FLOOR_H, true);
    } else if (st === ST.fittings) {
      this.makeFitGhosts();
      s.step = this.pickables.length ? 'fit' : 'quiz';
      if (s.step === 'quiz') this.startQuiz();
      this.crewAround('work', 0);
    } else if (st === ST.finish) {
      s.step = (pr.plaster || []).length < this.skinKeys().length ? 'plaster' : 'paint';
      s.paintColor = this.ps.colors.walls;
      this.crewAround('work', 0);
    } else if (st === ST.handover) {
      s.step = pr.floorPat ? 'garden' : 'floor';
      if (s.step === 'garden') this.makeGardenGhosts();
    }
    this.panel();
  }

  // ---------- panel ----------
  panel() {
    if (!this.session) return;
    const s = this.session, ps = this.ps, site = this.site, proj = site.proj;
    const st = s.phase === 'review' ? s.doneStage : ps.stage;
    const info = {
      project: proj, plot: s.i, stage: st, total: STAGES.length, floor: (ps.floor || 0) + 1, floors: proj.floors,
      name: st < STAGES.length ? (s.phase === 'review' ? `✅ ${STAGES[st].name}` : STAGES[st].name) : `${proj.name} complete!`, day: ps.days || 0, phase: s.phase,
      needs: [], hint: '', buttons: [], meter: null, card: null, palette: null, quiz: null, stars: null,
    };
    if (st >= STAGES.length) { info.hint = 'Finished! Tap Home to start the next building.'; return this.game.ui.buildPanel(info); }
    const need = STAGES[st].need;
    if (this.state.rules.realMaterials) for (const k in need) info.needs.push({ k, name: CARGO[k].name, have: ps.site[k] || 0, need: need[k], color: CARGO[k].color });
    if (s.phase === 'blocked') {
      info.hint = 'This stage needs more materials. Bring them by goods train, load the truck at the warehouse and unload here.';
      return this.game.ui.buildPanel(info);
    }
    if (s.phase === 'learn') {
      const l = this.lesson();
      info.card = { fact: this.fact(), task: l.task || '', q: l.choice?.q, opts: l.choice?.opts.map((o) => ({ id: o.id, label: o.label, sel: s.picked === o.id, good: s.picked === o.id ? !!o.good : null })), feedback: s.feedback };
      if (s.choice) info.buttons.push({ id: 'start', label: "Let's build! ▶", primary: true });
      return this.game.ui.buildPanel(info);
    }
    if (s.phase === 'review') {
      info.stars = s.stars;
      info.hint = s.review;
      info.buttons.push({ id: 'next', label: s.nextLabel || 'Next stage ▶', primary: true });
      return this.game.ui.buildPanel(info);
    }
    // work
    const pr = this.progress();
    const help = { id: 'help', label: '🤝 Help me' };
    switch (st) {
      case ST.survey: info.hint = `Tap peg ${(pr.pegs || 0) + 1} (the glowing one with that number).`; info.buttons.push(help); break;
      case ST.clear:
        if (s.choice === 'dozer') { info.hint = 'Hold PUSH to drive the bulldozer across the plot.'; info.buttons.push({ id: 'hold', label: '🚜 PUSH', hold: true, primary: true }); }
        else info.hint = 'Tap a bush, rock or piece of junk — a worker will carry it away.';
        info.meter = { label: 'Cleared', v: this.clearRatio() };
        info.buttons.push(help);
        break;
      case ST.dig:
        info.hint = s.seg == null ? 'All trenches dug!' : 'Hold DIG and let go in the green zone (1 m deep).';
        info.meter = { label: 'Depth', v: s.gauge, lo: 0.62, hi: 0.78, marks: ['0', '1 m', '1.5 m'] };
        info.buttons.push({ id: 'hold', label: '⛏️ DIG', hold: true, primary: true }, help);
        info.sub = `Trench ${(pr.dug || []).length}/${site.segs.length}`;
        break;
      case ST.steel: info.hint = 'Tap a glowing trench to lower a steel cage into it.'; info.sub = `Cages ${(pr.cages || []).length}/${site.segs.length}`; info.buttons.push(help); break;
      case ST.footing:
        info.hint = s.wall == null ? 'Footings poured!' : 'Hold POUR and let go when the concrete reaches the green line.';
        info.meter = { label: 'Concrete', v: s.gauge, lo: 0.42, hi: 0.58 };
        info.buttons.push({ id: 'hold', label: '🪣 POUR', hold: true, primary: true }, help);
        break;
      case ST.plinth:
        if (s.step === 'build') { info.hint = 'Hold BUILD to raise the brick plinth wall.'; info.meter = { label: 'Plinth', v: pr.plinth || 0 }; info.buttons.push({ id: 'hold', label: '🧱 BUILD', hold: true, primary: true }); }
        else if (s.step === 'fill') { info.hint = 'Hold ROLL to fill the trenches with soil and press it hard.'; info.meter = { label: 'Filled', v: pr.backfill || 0 }; info.buttons.push({ id: 'hold', label: '🛞 ROLL', hold: true, primary: true }); }
        else { info.hint = 'Tap to lay the black damp-proof layer.'; info.buttons.push({ id: 'dpc', label: '⬛ Lay damp-proof layer', primary: true }); }
        info.buttons.push(help);
        break;
      case ST.columns:
        if (s.step === 'pour') { info.hint = 'Tap a glowing column to pump concrete into it.'; info.sub = `Columns ${(pr.cols || []).length}/${site.L.cols.length}`; }
        else { info.hint = 'Seven days of curing are over. Take off the wooden shuttering!'; info.buttons.push({ id: 'strip', label: '🪵 Remove shuttering', primary: true }); }
        info.buttons.push(help);
        break;
      case ST.walls: {
        const n = pr.bricks || 0, tot = site.h.brickSlots.slots.length;
        if (s.level) { info.hint = 'Tap CHECK when the bubble is in the middle!'; info.meter = { label: 'Spirit level', v: s.level.v, lo: 0.43, hi: 0.57, bubble: true }; info.buttons.push({ id: 'check', label: '🎯 CHECK', primary: true }); }
        else { info.hint = 'Hold LAY BRICKS to build the walls row by row.'; info.meter = { label: 'Bricks', v: n / tot }; info.buttons.push({ id: 'hold', label: '🧱 LAY BRICKS', hold: true, primary: true }); }
        info.sub = `${Math.floor(Math.min(n, tot))} of ${tot} bricks`;
        info.buttons.push(help);
        break;
      }
      case ST.roof: {
        const rp = pr.roof || {};
        if (s.step === 'deck') { info.hint = 'Tap to put up the props and the wooden deck.'; info.buttons.push({ id: 'deck', label: '🪵 Props and deck', primary: true }); }
        else if (s.step === 'mesh') { info.hint = 'Tap to tie the steel mesh on the deck.'; info.buttons.push({ id: 'mesh', label: '🔩 Tie steel mesh', primary: true }); }
        else if (s.step === 'pour') { info.hint = 'Hold POUR to fill the slab with concrete.'; info.meter = { label: 'Slab', v: rp.pour || 0 }; info.buttons.push({ id: 'hold', label: '🪣 POUR', hold: true, primary: true }); }
        else if (s.step === 'gables') { info.hint = 'Hold BUILD to raise the triangle gable walls.'; info.meter = { label: 'Gables', v: rp.gablesK || 0 }; info.buttons.push({ id: 'hold', label: '🧱 BUILD', hold: true, primary: true }); }
        else if (s.step === 'trusses') { info.hint = 'Tap a glowing spot — the crane lifts a timber truss there.'; info.sub = `Trusses ${(rp.trusses || []).length}/${site.h.pitched.trusses.length}`; }
        else { const t = site.proj.roof === 'tin' ? 'FIX SHEETS' : 'LAY TILES'; info.hint = `Hold ${t} to cover the roof.`; info.meter = { label: 'Roof', v: rp.cover || 0 }; info.buttons.push({ id: 'hold', label: `🏠 ${t}`, hold: true, primary: true }); }
        info.buttons.push(help);
        break;
      }
      case ST.fittings:
        if (s.step === 'fit') { info.hint = 'Tap a glowing opening to fit a door or window.'; info.sub = `Fitted ${(pr.fit || []).length}/${V.openings(site.L).length}`; info.buttons.push(help); }
        else if (s.quiz) info.quiz = { q: s.quiz.q, opts: s.quiz.opts.map((o) => ({ id: o.id, label: o.label })), feedback: s.feedback };
        break;
      case ST.finish:
        if (s.step === 'plaster') { info.hint = 'Swipe your finger across each wall to plaster it.'; info.sub = `Walls plastered ${(pr.plaster || []).length}/${this.skinKeys().length}`; }
        else { info.hint = 'Pick a colour, then swipe across the walls to paint.'; info.palette = PAINT_COLORS; info.paintColor = s.paintColor; info.sub = `Walls painted ${(pr.paint || []).length}/${this.skinKeys().length}`; }
        info.buttons.push(help);
        break;
      case ST.handover:
        if (s.step === 'floor') { info.hint = 'Choose the floor tiles.'; info.choices = V.FLOOR_PATTERNS.map((p) => ({ id: `floor:${p.id}`, label: p.name })); }
        else if (s.step === 'garden') { info.hint = 'Tap the glowing spots to finish the garden.'; info.sub = `Garden ${(pr.garden || []).length}/8`; info.buttons.push(help); }
        else if (s.step === 'inspect') { info.hint = 'The inspector is checking the building…'; info.checklist = INSPECTION.map((t, k) => ({ t, ok: k < (s.checked || 0) })); }
        else if (s.step === 'open') { info.hint = 'Everything passed! Open the doors for the new owners.'; info.checklist = INSPECTION.map((t) => ({ t, ok: true })); info.buttons.push({ id: 'open', label: '🎉 Open the doors!', primary: true }); }
        break;
    }
    this.game.ui.buildPanel(info);
  }

  // ---------- input ----------
  onButton(id, down = true) {
    if (!this.session) return;
    const s = this.session;
    if (id === 'hold' || id === 'grab' || id === 'primary') {
      if (id !== 'hold') {
        // keyboard: Space acts on the main button
        const ui = this.game.ui._bpPrimary;
        if (ui && ui.hold) { this.onButton('hold', down); return; }
        if (down && ui) this.onButton(ui.id, true);
        return;
      }
      if (s.phase !== 'work') return;
      if (down && !s.held) this.holdStart();
      if (!down && s.held) this.holdEnd();
      s.held = down;
      return;
    }
    if (!down) return;
    if (id === 'start' && s.phase === 'learn' && s.choice) return this.startWork();
    if (id === 'next' && s.phase === 'review') return this.afterReview();
    if (id.startsWith('opt:')) return this.choose(id.slice(4));
    if (id.startsWith('quiz:')) return this.answerQuiz(id.slice(5));
    if (id.startsWith('color:')) { s.paintColor = id.slice(6); this.audio.play('click'); this.panel(); return; }
    if (id.startsWith('floor:')) return this.pickFloor(id.slice(6));
    if (s.phase !== 'work' || this.busy()) return;
    if (id === 'help') return this.help();
    if (id === 'dpc') return this.layDpc();
    if (id === 'strip') return this.stripShutters();
    if (id === 'deck') return this.slabDeck();
    if (id === 'mesh') return this.slabMesh();
    if (id === 'check') return this.levelCheck();
    if (id === 'open') return this.openDoors();
  }
  setPad(name, v) { this.pad[name] = v; }
  busy() { return this.seqs.some((q) => q.block); }

  holdStart() {
    const s = this.session, st = this.stageIdx();
    if (this.busy()) return;
    if (st === ST.dig && s.seg != null) { s.gauge = 0; this.audio.play('click'); }
    if (st === ST.footing && s.wall != null) { s.gauge = this.wallFill(s.wall); this.m.mixer.userData.stream.visible = true; }
  }
  holdEnd() {
    const s = this.session, st = this.stageIdx();
    if (st === ST.dig && s.seg != null && s.gauge > 0.05) this.digRelease();
    if (st === ST.footing && s.wall != null) { this.m.mixer.userData.stream.visible = false; this.pourRelease(); }
  }

  // taps on the 3D site
  pick(raycaster) {
    if (!this.session || this.session.phase !== 'work' || !this.pickables.length || this.busy()) return false;
    const hits = raycaster.intersectObjects(this.pickables, true);
    if (!hits.length) return false;
    let o = hits[0].object;
    while (o && !Object.keys(o.userData || {}).some((k) => ['debris', 'peg', 'seg', 'col', 'truss', 'fit', 'garden'].includes(k))) o = o.parent;
    if (!o) return false;
    const u = o.userData;
    if (u.peg != null) this.tapPeg(u.peg, o);
    else if (u.debris) this.tapDebris(u.debris, o);
    else if (u.seg) this.tapCage(u.seg, o);
    else if (u.col) this.tapColumn(u.col, o);
    else if (u.truss != null) this.tapTruss(u.truss, o);
    else if (u.fit) this.tapFit(u.fit, o);
    else if (u.garden) this.tapGarden(u.garden, o);
    return true;
  }

  // swipe painting on the walls
  pointerDown(rc) {
    if (!this.session || this.session.phase !== 'work' || this.stageIdx() !== ST.finish) return false;
    const hit = this.skinHit(rc);
    if (!hit) return false;
    this.painting = true;
    this.paintAt(hit);
    return true;
  }
  pointerMove(rc) { if (this.painting) { const hit = this.skinHit(rc); if (hit) this.paintAt(hit); } }
  pointerUp() { if (this.painting) { this.painting = false; this.checkSkins(); } }

  // ================= stage work =================
  // ---- survey ----
  makePegGhosts() {
    const h = this.site.h, pr = this.progress();
    this.pickables = [];
    h.pegPts.forEach(([x, z], k) => {
      if (k < (pr.pegs || 0)) return;
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.6, 14), k === (pr.pegs || 0) ? V.mats().hot : V.mats().ghost);
      m.position.y = 0.8; g.add(m);
      const lbl = label(String(k + 1)); lbl.position.y = 2.2; g.add(lbl);
      g.userData = { peg: k };
      this.site.root.add(g); this.pickables.push(g);
    });
  }
  tapPeg(k, obj) {
    const pr = this.progress(), s = this.session;
    if (k !== (pr.pegs || 0)) { s.stars = Math.max(1, s.stars - 1); this.toast(`Not yet — find peg ${(pr.pegs || 0) + 1} first.`); this.audio.play('error'); return; }
    this.pickables.forEach((p) => p.parent?.remove(p));
    this.pickables = [];
    pr.pegs = k + 1;
    const [x, z] = this.site.h.pegPts[k];
    this.crewTo(1, x + 0.6, z + 0.6, 'work', x, z);
    this.audio.play('thud');
    this.puff(V3(x, 0.2, z), 0xc8b090, 4);
    V.buildSite(this.site, this.ps, this.game); this.reattach();
    this.makePegGhosts();
    this.setFocus(x, 0.5, z);
    if (pr.pegs >= 4) this.done('All four corners are marked and the diagonals are equal — the corners are square!');
    else this.panel();
  }

  // ---- clear ----
  clearRatio() { const n = V.debrisList(this.session.i).length; return (this.progress().cleared || []).length / n; }
  tapDebris(d, obj) {
    const s = this.session;
    if (s.choice === 'dozer') { this.toast('Hold PUSH to drive the bulldozer.'); return; }
    if (obj.userData.taken) return;
    obj.userData.taken = true;
    const k = this.freeWorker();
    const w = this.crew[k];
    this.crewTo(k, d.x + 0.8, d.z + 0.8, 'walk', d.x, d.z);
    this.run([
      { until: () => !w.userData.goal, fn: () => {} },
      { dur: 0.8, start: () => { w.userData.mode = 'work'; this.audio.play('thud'); }, fn: () => {} },
      { dur: 0.6, fn: (e) => { obj.scale.setScalar(1 - e); obj.position.y = e * 0.8; }, end: () => { obj.parent?.remove(obj); this.removeDebris(d.k); } },
    ], null, false);
  }
  removeDebris(k) {
    const pr = this.progress();
    pr.cleared ||= [];
    if (!pr.cleared.includes(k)) pr.cleared.push(k);
    delete this.site.h.debris[k];
    this.pickables = Object.values(this.site.h.debris);
    this.puff(V3(0, 0, 0), 0xb89a70, 0);
    this.panel();
    if (this.clearRatio() >= 1) this.done('The plot is clean and ready. The ground is bare soil now.');
  }
  updateClear(dt) {
    const s = this.session;
    if (s.choice !== 'dozer' || s.lane < 0 || this.busy()) return;
    const dz = this.m.dozer;
    const lanes = [-8, -4.5, -1, 2.5, 6, 9];
    if (!s.held) { dz.userData.blade.position.y = lerp(dz.userData.blade.position.y, 0.2, dt * 4); return; }
    dz.userData.blade.position.y = lerp(dz.userData.blade.position.y, 0, dt * 6);
    const z = lanes[s.lane];
    const dir = s.lane % 2 ? -1 : 1;
    const x0 = -10.5 * dir, x1 = 10.5 * dir;
    s.laneT = Math.min(1, s.laneT + dt * 0.28);
    dz.position.set(lerp(x0, x1, s.laneT), 0, z);
    dz.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    this.engine(dt);
    if (Math.random() < dt * 6) this.puff(V3(dz.position.x + dir * 2.4, 0.3, z), 0xc2a27a, 1);
    // debris in front of the blade is pushed along, then off the plot
    for (const k in this.site.h.debris) {
      const o = this.site.h.debris[k];
      const ahead = (o.position.x - dz.position.x) * dir;
      if (Math.abs(o.position.z - z) < 1.9 && ahead > 0 && ahead < 2.6) { o.position.x = dz.position.x + dir * 2.4; o.userData.pushed = true; }
    }
    if (s.laneT >= 1) {
      for (const k in this.site.h.debris) { const o = this.site.h.debris[k]; if (o.userData.pushed) { o.parent?.remove(o); this.removeDebris(+k); if (!this.session || this.session.phase !== 'work') return; } }
      s.lane++;
      s.laneT = 0;
      this.panel();
      if (s.lane >= lanes.length) {
        // anything the blade missed is picked up by the crew
        for (const k in this.site.h.debris) { this.site.h.debris[k].parent?.remove(this.site.h.debris[k]); this.removeDebris(+k); if (!this.session || this.session.phase !== 'work') return; }
      } else this.run([{ dur: 0.7, fn: (e) => { dz.position.z = lerp(z, lanes[s.lane], e); } }]);
    }
  }

  // ---- dig ----
  nextSeg() { const dug = this.progress().dug || []; const s = this.site.segs.find((x) => !dug.includes(x.k)); return s ? s.k : null; }
  diggerSpot(seg) {
    const sg = this.site.segs[seg], out = sg.w.out;
    const back = this.session.mach === 'backhoe';
    const d = back ? 5.2 : 6.2;
    return { x: sg.x + out[0] * d, z: sg.z + out[1] * d, yaw: back ? Math.atan2(out[0], out[1]) : Math.atan2(-out[0], -out[1]) };
  }
  moveDigger(seg) {
    const o = this.m[this.session.mach];
    const t = this.diggerSpot(seg);
    const from = [o.position.x, o.position.z];
    this.setFocus(this.site.segs[seg].x, 0, this.site.segs[seg].z);
    // drive around the outside of the building, not through it
    const { hw, hd } = this.site.L;
    const ring = (x, z) => { const m = Math.max(Math.abs(x) / (hw + 6), Math.abs(z) / (hd + 6)); return m < 1 ? [x / m, z / m] : [x, z]; };
    const mid = ring((from[0] + t.x) / 2, (from[1] + t.z) / 2);
    this.run([
      ...this.driveSteps(this.session.mach, [from, mid, [t.x, t.z]], 4, false),
      { dur: 0.6, fn: (e) => { o.rotation.y = lerpAngle(o.rotation.y, t.yaw, e); } },
    ], () => this.panel());
  }
  pose(name, p) {
    const u = this.m[name].userData;
    const sg = name === 'backhoe' ? -1 : 1;
    if (name === 'backhoe') u.swing.rotation.y = p.swing; else u.upper.rotation.y = p.swing;
    u.boom.rotation.x = sg * p.boom; u.stick.rotation.x = sg * p.stick; u.bucket.rotation.x = sg * p.bucket;
  }
  digPose(depth) { return this.session.mach === 'backhoe' ? { swing: 0, boom: -0.25 + depth * 0.5, stick: 1.0 + depth * 0.25, bucket: 0.2 } : { swing: 0, boom: -0.05 + depth * 0.32, stick: 0.85 + depth * 0.35, bucket: -0.2 }; }
  updateDig(dt) {
    const s = this.session;
    if (s.seg == null || this.busy()) return;
    if (s.auto) { s.gauge = 0.7; this.digRelease(); return; }
    if (s.held) {
      s.gauge = Math.min(1, s.gauge + dt * 0.42);
      this.engine(dt);
      this.game.ui.buildMeter(s.gauge);
    }
    const p = this.digPose(s.held ? s.gauge / 0.7 : 0);
    if (!s.held) p.boom -= 0.35;
    this.pose(s.mach, p);
  }
  digRelease() {
    const s = this.session, g = s.gauge, pr = this.progress();
    const seg = s.seg;
    if (g < 0.62) { this.toast('Not deep enough yet — hold a little longer.'); this.audio.play('error'); s.gauge = 0; this.panel(); return; }
    if (g > 0.78) { s.stars = Math.max(1, s.stars - 1); this.toast('Oops, a bit too deep! The crew puts some soil back.'); }
    else if (!s.auto) this.toast('Perfect depth!', 'good');
    const name = s.mach, u = this.m[name].userData;
    const p0 = this.digPose(g / 0.7);
    const side = this.swingTo(name, V.heapPos(this.site.segs[seg]));
    const cover = this.site.h.segCovers[seg];
    this.audio.play('clank');
    this.run([
      { dur: 0.7, fn: (e) => { this.pose(name, { ...p0, bucket: lerp(p0.bucket, 1.5, e) }); }, end: () => { u.dirt.visible = true; if (cover) { cover.parent?.remove(cover); delete this.site.h.segCovers[seg]; } this.puff(this.segPoint(seg), 0x8a6a48, 5); } },
      { dur: 0.8, fn: (e) => { this.pose(name, { swing: lerp(0, side, e), boom: lerp(p0.boom, -0.6, e), stick: lerp(p0.stick, 1.1, e), bucket: 1.5 }); } },
      { dur: 0.5, fn: (e) => { this.pose(name, { swing: side, boom: -0.6, stick: 1.1, bucket: lerp(1.5, -0.6, e) }); }, end: () => { u.dirt.visible = false; this.dropSpoil(name, seg); this.audio.play('thud'); } },
      { dur: 0.7, fn: (e) => { this.pose(name, { swing: lerp(side, 0, e), boom: -0.4, stick: 1.1, bucket: lerp(-0.6, 0.2, e) }); } },
    ], () => {
      pr.dug ||= [];
      if (!pr.dug.includes(seg)) pr.dug.push(seg);
      s.gauge = 0;
      s.seg = this.nextSeg();
      this.game.save();
      if (s.seg == null) this.digDone();
      else { this.moveDigger(s.seg); this.panel(); }
    });
  }
  // which way the digger's arm must turn to point at a spot on the site
  swingTo(name, [hx, hz]) {
    const o = this.m[name];
    const dx = hx - o.position.x, dz = hz - o.position.z, Y = o.rotation.y;
    const vx = dx * Math.cos(Y) - dz * Math.sin(Y), vz = dx * Math.sin(Y) + dz * Math.cos(Y);
    return name === 'backhoe' ? Math.atan2(-vx, -vz) : Math.atan2(vx, vz);
  }
  dropSpoil(name, seg) {
    const tip = this.m[name].userData.tip;
    tip.getWorldPosition(this.tmp);
    this.site.root.worldToLocal(this.tmp);
    const h = this.site.h;
    h.heaps ||= [];
    let heap = h.heaps.find((m) => m.userData.seg === seg);
    if (!heap) { heap = V.heapMesh(this.site.segs[seg], 0.3); this.site.root.add(heap); h.heaps.push(heap); }
    else heap.scale.multiplyScalar(1.15);
    this.puff(V3(this.tmp.x, Math.max(0.6, this.tmp.y), this.tmp.z), 0x8a6a48, 6);
  }
  digDone() {
    // the tipper takes the extra soil away
    const tp = this.m.tipper, u = tp.userData;
    const { hw, hd } = this.site.L;
    u.load.visible = true;
    this.run([
      { dur: 1.2, fn: (e) => { u.load.scale.y = Math.max(0.01, e); } },
      ...this.driveSteps('tipper', [[tp.position.x, tp.position.z], [-hw - 6, 18], [30, 18]], 7, false),
    ], () => { u.load.visible = false; this.done('All the foundation trenches are 1 metre deep. The tipper took away the extra soil.'); });
  }
  segPoint(k) { const s = this.site.segs[k]; return V3(s.x, -0.6, s.z); }

  // ---- steel ----
  makeSegGhosts(filter) {
    this.pickables = [];
    for (const sg of this.site.segs) {
      if (!filter(sg.k)) continue;
      const gm = V.box(sg.len, 1.2, B.TRENCH_W + 0.3, V.mats().ghost, sg.x, -0.3, sg.z);
      gm.rotation.y = sg.yaw; gm.castShadow = false;
      gm.userData = { seg: sg };
      this.site.root.add(gm); this.pickables.push(gm);
    }
  }
  tapCage(sg, ghost) {
    ghost.parent?.remove(ghost);
    this.pickables = this.pickables.filter((p) => p !== ghost);
    const k = this.freeWorker();
    this.crewTo(k, sg.x + sg.w.out[0] * 1.2, sg.z + sg.w.out[1] * 1.2, 'walk', sg.x, sg.z);
    const cage = V.cageMesh(sg);
    const y1 = cage.position.y;
    cage.position.y = 1.2;
    this.site.root.add(cage);
    this.audio.play('clank');
    this.run([{ dur: 0.9, fn: (e) => { cage.position.y = lerp(1.2, y1, e); } }], () => {
      const pr = this.progress();
      pr.cages ||= [];
      pr.cages.push(sg.k);
      this.site.h.segCages[sg.k] = cage;
      this.panel();
      if (pr.cages.length >= this.site.segs.length) this.done('Every trench has a steel cage, lifted on cover blocks.');
    }, false);
  }

  // ---- footing ----
  footWalls() { return this.site.L.walls.map((w) => this.site.segs.filter((s) => s.w === w).map((s) => s.k)); }
  wallFill(wi) { const f = this.progress().fill || {}; const ks = this.footWalls()[wi]; return ks.reduce((a, k) => a + (f[k] || 0), 0) / ks.length / B.TRENCH_D; }
  nextFootWall() { const ws = this.footWalls(); const i = ws.findIndex((_, k) => this.wallFill(k) < 0.42); return i < 0 ? null : i; }
  moveMixer(wi) {
    const w = this.site.L.walls[wi];
    const [cx, cz] = V.wallPoint(w, w.len / 2);
    const tx = cx + w.out[0] * 5.6, tz = cz + w.out[1] * 5.6;
    const mx = this.m.mixer;
    this.setFocus(cx, 0, cz);
    const { hw, hd } = this.site.L;
    const ring = (x, z) => { const m = Math.max(Math.abs(x) / (hw + 7), Math.abs(z) / (hd + 7)); return m < 1 ? [x / m, z / m] : [x, z]; };
    const mid = ring((mx.position.x + tx) / 2, (mx.position.z + tz) / 2);
    this.run([
      ...this.driveSteps('mixer', [[mx.position.x, mx.position.z], mid, [tx + w.out[0] * 3, tz + w.out[1] * 3]], 5, false),
      ...this.driveSteps('mixer', [[tx + w.out[0] * 3, tz + w.out[1] * 3], [tx, tz]], 2, true),
      { dur: 0.4, fn: (e) => { mx.rotation.y = lerpAngle(mx.rotation.y, Math.atan2(w.out[0], w.out[1]), e); } },
    ], () => { this.audio.play('click'); this.panel(); });
  }
  updateFooting(dt) {
    const s = this.session;
    const mx = this.m.mixer.userData;
    mx.drum.rotation.z += dt * (s.held ? 3 : 1);
    if (s.wall != null && !this.busy() && s.auto) { s.gauge = 0.5; this.pourRelease(); return; }
    if (s.wall == null || this.busy() || !s.held) return;
    s.gauge = Math.min(0.75, s.gauge + dt * 0.12);
    const pr = this.progress();
    pr.fill ||= {};
    for (const k of this.footWalls()[s.wall]) {
      pr.fill[k] = s.gauge * B.TRENCH_D;
      const m = this.site.h.segFills[k];
      if (m) { m.visible = true; m.scale.y = Math.max(0.001, pr.fill[k]); }
    }
    this.game.ui.buildMeter(s.gauge);
    this.engine(dt);
    // the stream from the chute to the concrete surface
    const w = this.site.L.walls[s.wall];
    const [cx, cz] = V.wallPoint(w, w.len / 2);
    const top = V3(), bot = V3(cx, -B.TRENCH_D + s.gauge * B.TRENCH_D, cz);
    this.m.mixer.userData.chute.localToWorld(top.set(0, 0, -1.8));
    this.site.root.worldToLocal(top);
    stretch(mx.stream, top, bot, this.site.root);
    if (Math.random() < dt * 8) this.puff(bot, 0x9a988f, 1, 0.5);
  }
  pourRelease() {
    const s = this.session, g = s.gauge;
    if (g < 0.42) { this.toast('Keep pouring until the concrete reaches the green line.'); this.panel(); return; }
    if (g > 0.58) { s.stars = Math.max(1, s.stars - 1); this.toast('A little too much — the crew scrapes it level.'); }
    else if (!s.auto) this.toast('Spot on!', 'good');
    const pr = this.progress();
    pr.fill ||= {};
    for (const k of this.footWalls()[s.wall]) { pr.fill[k] = B.FOOTING_H; this.site.h.segFills[k].visible = true; this.site.h.segFills[k].scale.y = B.FOOTING_H; }
    this.game.save();
    s.wall = this.nextFootWall();
    s.gauge = 0;
    if (s.wall == null) {
      this.run([...this.driveSteps('mixer', [[this.m.mixer.position.x, this.m.mixer.position.z], [this.m.mixer.position.x, 18], [30, 18]], 7, false)], () => this.done('The footing concrete is poured. After 7 days of curing it is as hard as rock.'));
    } else this.moveMixer(s.wall);
    this.panel();
  }

  // ---- plinth ----
  updatePlinth(dt) {
    const s = this.session, pr = this.progress(), h = this.site.h;
    if (!s.held || this.busy()) return;
    if (s.step === 'build') {
      pr.plinth = Math.min(1, (pr.plinth || 0) + dt * 0.12);
      V.setPlinth(h, pr.plinth);
      this.game.ui.buildMeter(pr.plinth);
      if (Math.random() < dt * 3) this.audio.play('click');
      if (pr.plinth >= 1) {
        s.step = 'fill';
        s.held = false;
        this.show('roller', -this.site.L.hw + 1.5, 0, Math.PI / 2, 0.05);
        this.toast('Plinth wall built! Now fill and press the soil.', 'good');
        this.game.save();
        this.panel();
      }
    } else if (s.step === 'fill') {
      pr.backfill = Math.min(1, (pr.backfill || 0) + dt * 0.1);
      V.setBackfill(h, pr.backfill);
      V.setHeaps(h, 1 - pr.backfill);
      const r = this.m.roller, hw = this.site.L.hw - 1.6, hd = this.site.L.hd - 1.4;
      const t = pr.backfill * 7;
      const lane = Math.floor(t), f = t - lane;
      r.position.set(lane % 2 ? lerp(hw, -hw, f) : lerp(-hw, hw, f), (B.PLINTH - 0.06) * pr.backfill + 0.03, lerp(-hd, hd, Math.min(1, lane / 6)));
      r.rotation.y = lane % 2 ? -Math.PI / 2 : Math.PI / 2;
      r.userData.drum.rotation.x += dt * 4;
      this.engine(dt);
      this.game.ui.buildMeter(pr.backfill);
      if (pr.backfill >= 1) { s.step = 'dpc'; s.held = false; this.m.roller.visible = false; (h.heaps || []).forEach((m) => m.parent?.remove(m)); h.heaps = []; this.game.save(); this.panel(); }
    }
  }
  layDpc() {
    const s = this.session, pr = this.progress(), h = this.site.h;
    if (s.step !== 'dpc') return;
    h.dpc.visible = true; h.dpc.scale.x = 0.01;
    this.audio.play('click');
    this.run([{ dur: 1.2, fn: (e) => { h.dpc.scale.x = Math.max(0.01, e); } }], () => { pr.dpc = true; s.step = 'done'; this.done('The plinth is up, the soil is pressed hard and the damp-proof layer keeps water out.'); });
  }

  // ---- columns ----
  foldPump(k) {
    const u = this.m.pump.userData;
    u.segs[0].rotation.x = lerp(-0.35, -1.2, k); u.segs[1].rotation.x = lerp(1.2, 2.6, k); u.segs[2].rotation.x = lerp(0.9, -2.6, k);
  }
  // aim the folding boom so its tip hangs above a point (site-local)
  aimPump(target) {
    const pump = this.m.pump, u = pump.userData;
    const base = V3();
    u.turret.getWorldPosition(base);
    this.site.root.worldToLocal(base);
    const s = pump.scale.x;
    const L0 = 6 * s, L1 = 5.5 * s, L2 = 5 * s;
    const yawLocal = Math.atan2(target.x - base.x, target.z - base.z) - pump.rotation.y;
    u.turret.rotation.y = yawLocal;
    const d = Math.hypot(target.x - base.x, target.z - base.z);
    const p2 = -1.15; // last section points steeply down
    const ex = d - L2 * Math.cos(p2), ey = target.y + 1.6 - (base.y + 0.6 * s) - L2 * Math.sin(p2);
    const r = clamp(Math.hypot(ex, ey), Math.abs(L0 - L1) + 0.1, L0 + L1 - 0.05);
    const a = Math.atan2(ey, ex);
    const c1 = clamp((L0 * L0 + r * r - L1 * L1) / (2 * L0 * r), -1, 1);
    const p0 = a + Math.acos(c1);
    const c2 = clamp((L0 * L0 + L1 * L1 - r * r) / (2 * L0 * L1), -1, 1);
    const p1 = p0 - (Math.PI - Math.acos(c2));
    return { s0: -p0, s1: -(p1 - p0), s2: -(p2 - p1) };
  }
  tapColumn(c, ghost) {
    const s = this.session;
    if (s.step !== 'pour') return;
    ghost.parent?.remove(ghost);
    this.pickables = this.pickables.filter((p) => p !== ghost);
    const u = this.m.pump.userData;
    const tgt = V3(c.x, c.y0 + B.FLOOR_H, c.z);
    const from = { s0: u.segs[0].rotation.x, s1: u.segs[1].rotation.x, s2: u.segs[2].rotation.x, yaw: u.turret.rotation.y };
    const aim = this.aimPump(tgt);
    const yaw = u.turret.rotation.y;
    u.turret.rotation.y = from.yaw;
    const conc = this.site.h.cols[c.k];
    this.setFocus(c.x, c.y0 + 1.5, c.z);
    const stream = this.streamMesh();
    this.audio.play('clank');
    this.run([
      { dur: 1.2, fn: (e) => { u.turret.rotation.y = lerpAngle(from.yaw, yaw, e); u.segs[0].rotation.x = lerp(from.s0, aim.s0, e); u.segs[1].rotation.x = lerp(from.s1, aim.s1, e); u.segs[2].rotation.x = lerp(from.s2, aim.s2, e); } },
      { dur: 1.6, start: () => { stream.visible = true; conc.visible = true; }, fn: (e) => {
        conc.scale.y = Math.max(0.001, e * B.FLOOR_H);
        const tip = V3(0, 0, 5); u.segs[2].localToWorld(tip); this.site.root.worldToLocal(tip);
        stretch(stream, tip, V3(c.x, c.y0 + e * B.FLOOR_H, c.z), this.site.root);
        this.engine(0.016);
      }, end: () => { stream.visible = false; } },
    ], () => {
      const pr = this.progress();
      pr.cols ||= [];
      pr.cols.push(c.k);
      this.game.save();
      if (!this.pickables.length) { s.step = 'strip'; this.toast('All columns poured! Now we cure them for 7 days.', 'good'); this.timeLapse(7); }
      this.panel();
    });
  }
  stripShutters() {
    const h = this.site.h;
    this.audio.play('thud');
    const sh = Object.values(h.colShutters);
    this.run([{ dur: 1.0, fn: (e) => { sh.forEach((g) => { g.children.forEach((p) => {
      p.userData.p0 ||= p.position.clone();
      const n = V3(p.userData.p0.x, 0, p.userData.p0.z).normalize();
      p.position.copy(p.userData.p0).addScaledVector(n, e * 0.7);
      p.position.y = p.userData.p0.y * (1 - e * 0.9);
      p.rotation.set(n.z * e * 1.3, 0, -n.x * e * 1.3);
    }); }); } }], () => {
      sh.forEach((g) => g.parent?.remove(g));
      this.foldPumpAway();
      this.done('Smooth, strong concrete columns! They will carry the floors above.');
    });
  }
  foldPumpAway() { this.foldPump(1); this.m.pump.userData.turret.rotation.y = 0; }

  // ---- walls ----
  updateWalls(dt) {
    const s = this.session, pr = this.progress(), h = this.site.h;
    if (s.level) {
      s.level.t += dt;
      s.level.v = 0.5 + Math.sin(s.level.t * 2.3) * 0.42;
      this.game.ui.buildMeter(s.level.v);
      return;
    }
    // the tower crane swings pallets of bricks over now and then
    this.craneIdle(dt);
    if (!s.held || this.busy()) { this.crew.forEach((w) => { if (!w.userData.goal) w.userData.mode = 'idle'; }); return; }
    this.crew.forEach((w) => { if (!w.userData.goal) w.userData.mode = 'work'; });
    const tot = h.brickSlots.slots.length;
    const rate = tot / 22; // whole floor in about 22 seconds of holding
    pr.bricks = Math.min(tot, (pr.bricks || 0) + dt * rate);
    V.setBricks(h, Math.floor(pr.bricks));
    this.game.ui.buildMeter(pr.bricks / tot);
    s.tick = (s.tick || 0) + dt;
    if (s.tick > 0.22) { s.tick = 0; this.audio.play('click'); }
    const k = pr.bricks / tot;
    if (s.checks.length && k >= s.checks[0]) {
      s.checks.shift();
      s.held = false;
      s.level = { t: Math.random() * 3, v: 0.5, tries: 0 };
      this.audio.play('chime');
      this.panel();
      return;
    }
    if (pr.bricks >= tot) {
      s.held = false;
      this.game.save();
      this.done(`Floor ${(this.ps.floor || 0) + 1} walls are built, with concrete lintels over every opening.`);
    }
  }
  levelCheck() {
    const s = this.session;
    if (!s.level) return;
    const ok = Math.abs(s.level.v - 0.5) < 0.07;
    s.level.tries++;
    if (ok) { this.toast('Perfectly level!', 'good'); this.audio.play('chime'); s.level = null; this.game.save(); this.panel(); return; }
    this.audio.play('error');
    if (s.level.tries >= 3) { s.stars = Math.max(1, s.stars - 1); this.toast('The crew tapped the bricks straight. Keep going!'); s.level = null; this.panel(); return; }
    this.toast('Not quite — wait for the bubble to reach the middle.');
  }

  // ---- roof ----
  slabDeck() {
    const s = this.session, h = this.site.h, rp = this.progress().roof;
    if (s.step !== 'deck') return;
    h.deck.visible = true;
    const y = h.deck.position.y;
    h.deck.position.y = y - 3;
    this.audio.play('thud');
    this.run([{ dur: 1.4, fn: (e) => { h.deck.position.y = y - 3 * (1 - e); } }], () => { rp.deck = true; s.step = 'mesh'; this.game.save(); this.panel(); });
  }
  slabMesh() {
    const s = this.session, h = this.site.h, rp = this.progress().roof;
    if (s.step !== 'mesh') return;
    h.slabMesh.visible = true;
    h.slabMesh.children.forEach((b) => { b.visible = false; });
    const kids = h.slabMesh.children;
    this.audio.play('clank');
    this.run([{ dur: 1.6, fn: (e) => { const n = Math.floor(e * kids.length); for (let k = 0; k < n; k++) kids[k].visible = true; } }], () => {
      kids.forEach((b) => { b.visible = true; });
      rp.mesh = true; s.step = 'pour';
      const { hw, hd } = this.site.L;
      this.show('pump', hw + 3.2, hd + 7, Math.PI); this.foldPump(1);
      this.game.save(); this.panel();
    });
  }
  updateRoof(dt) {
    const s = this.session, rp = this.progress().roof, h = this.site.h, site = this.site;
    this.craneIdle(dt);
    if (this.busy()) return;
    if (s.step === 'pour') {
      const u = this.m.pump.userData;
      if (!s.stream) s.stream = this.streamMesh();
      s.stream.visible = s.held;
      if (!s.held) return;
      rp.pour = Math.min(1, (rp.pour || 0) + dt * 0.08);
      V.setSlab(h, rp.pour);
      const { hw, hd } = site.L;
      const y = B.floorBase(this.ps.floor || 0) + B.FLOOR_H;
      const x = -hw + 2 * hw * rp.pour, z = Math.sin(rp.pour * 40) * hd * 0.8;
      const aim = this.aimPump(V3(x, y, z));
      u.segs[0].rotation.x = lerp(u.segs[0].rotation.x, aim.s0, dt * 4); u.segs[1].rotation.x = lerp(u.segs[1].rotation.x, aim.s1, dt * 4); u.segs[2].rotation.x = lerp(u.segs[2].rotation.x, aim.s2, dt * 4);
      const tip = V3(0, 0, 5); u.segs[2].localToWorld(tip); site.root.worldToLocal(tip);
      stretch(s.stream, tip, V3(x, y + B.SLAB_T, z), site.root);
      this.setFocus(x, y, 0);
      this.engine(dt);
      this.game.ui.buildMeter(rp.pour);
      if (rp.pour >= 1) {
        s.held = false; s.stream.visible = false;
        this.foldPumpAway();
        this.game.save();
        this.timeLapse(14);
        h.deck.visible = false;
        this.done(this.ps.floor + 1 < site.proj.floors ? `The slab is poured and cured for 14 days. It is the floor for storey ${this.ps.floor + 2}!` : 'The roof slab is poured and cured. A parapet wall and a water tank go on top.');
      }
    } else if (s.step === 'gables') {
      if (!s.held) return;
      rp.gablesK = Math.min(1, (rp.gablesK || 0) + dt * 0.25);
      h.pitched.gables.visible = true;
      h.pitched.gables.children.forEach((m) => { m.scale.y = Math.max(0.001, rp.gablesK); });
      this.game.ui.buildMeter(rp.gablesK);
      if (rp.gablesK >= 1) { s.held = false; s.step = 'trusses'; this.makeTrussGhosts(); this.game.save(); this.panel(); }
    } else if (s.step === 'cover') {
      if (!s.held) return;
      rp.cover = Math.min(1, (rp.cover || 0) + dt * 0.1);
      V.setCover(h, rp.cover);
      this.game.ui.buildMeter(rp.cover);
      s.tick = (s.tick || 0) + dt;
      if (s.tick > 0.3) { s.tick = 0; this.audio.play('click'); }
      if (rp.cover >= 1) { s.held = false; this.game.save(); this.done(site.proj.roof === 'tin' ? 'The metal roof is fixed — rain will drum on it but never get in!' : 'The clay tile roof is on. Monsoon rain will run straight off.'); }
    }
  }
  makeTrussGhosts() {
    const h = this.site.h, rp = this.progress().roof;
    this.pickables = [];
    h.pitched.trusses.forEach((t, k) => {
      if ((rp.trusses || []).includes(k)) return;
      const gm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.6, 2 * this.site.L.hd + 1), V.mats().ghost);
      gm.position.set(t.position.x, t.position.y + 0.8, 0);
      gm.userData = { truss: k };
      this.site.root.add(gm); this.pickables.push(gm);
    });
  }
  tapTruss(k, ghost) {
    const s = this.session, h = this.site.h, rp = this.progress().roof;
    if (s.step !== 'trusses') return;
    ghost.parent?.remove(ghost);
    this.pickables = this.pickables.filter((p) => p !== ghost);
    const t = h.pitched.trusses[k];
    const home = t.userData.home.clone();
    const { hd } = this.site.L;
    const start = V3(home.x, 0.3, hd + 5);
    t.visible = true;
    t.position.copy(start);
    this.audio.play('clank');
    const hook = this.craneHook();
    this.run([{ dur: 2.0, fn: (e) => {
      const up = Math.min(1, e * 2), across = clamp((e - 0.35) / 0.65, 0, 1);
      t.position.set(home.x, lerp(start.y, home.y + 2.5, up) - across * 2.5 * across, lerp(start.z, home.z, ease(across)));
      this.craneTo(hook, t.position);
    } }], () => {
      t.position.copy(home);
      rp.trusses ||= []; rp.trusses.push(k);
      this.audio.play('thud');
      this.game.save();
      if (rp.trusses.length >= h.pitched.trusses.length) { s.step = 'cover'; this.toast('All trusses up! Triangles are strong.', 'good'); }
      this.panel();
    });
  }
  // tower crane helpers (crane sits at the back-left corner of the site)
  craneHook() { return this.m.crane.userData; }
  craneTo(u, local) {
    const c = this.m.crane;
    const dx = local.x - c.position.x, dz = local.z - c.position.z;
    const th = Math.atan2(dz, dx);
    u.top.rotation.y = -th;
    u.trolley.position.x = Math.hypot(dx, dz);
    u.hook.position.set(Math.cos(th) * Math.hypot(dx, dz), local.y + 0.8, Math.sin(th) * Math.hypot(dx, dz));
    const pos = u.cable.geometry.attributes.position;
    pos.setXYZ(0, u.hook.position.x, u.height + 0.3, u.hook.position.z);
    pos.setXYZ(1, u.hook.position.x, u.hook.position.y + 0.6, u.hook.position.z);
    pos.needsUpdate = true;
    u.cable.geometry.computeBoundingSphere();
  }
  craneIdle(dt) {
    const c = this.m.crane;
    if (!c.visible) return;
    this.session.ct = (this.session.ct || 0) + dt;
    const t = this.session.ct * 0.25;
    const { hw, hd } = this.site.L;
    this.craneTo(c.userData, V3(Math.sin(t) * hw * 0.8, 6 + Math.sin(t * 1.7) * 2, hd + 2 + Math.cos(t) * 3));
  }

  // ---- fittings ----
  makeFitGhosts() {
    const done = new Set(this.progress().fit || []);
    this.pickables = [];
    for (const op of V.openings(this.site.L)) {
      if (done.has(op.key)) continue;
      const gm = new THREE.Mesh(new THREE.BoxGeometry(op.o.w + 0.1, op.o.h + 0.1, 0.5), op.o.kind === 'window' ? V.mats().ghost : V.mats().hot);
      gm.position.set(op.x, op.y + op.o.h / 2, op.z);
      gm.rotation.y = op.yaw;
      gm.userData = { fit: op };
      this.site.root.add(gm); this.pickables.push(gm);
    }
  }
  tapFit(op, ghost) {
    ghost.parent?.remove(ghost);
    this.pickables = this.pickables.filter((p) => p !== ghost);
    const g = V.fittingAt(op);
    const outv = V3(op.w.out[0], 0, op.w.out[1]);
    const end = g.position.clone();
    this.site.root.add(g);
    this.audio.play('click');
    const k = this.freeWorker();
    this.crewTo(k, op.x + op.w.out[0] * 1.1, op.z + op.w.out[1] * 1.1, 'walk', op.x, op.z, op.f === 0 ? 0 : null);
    this.run([{ dur: 0.6, fn: (e) => { g.position.copy(end).addScaledVector(outv, (1 - e) * 1.5); } }], () => {
      const pr = this.progress();
      pr.fit ||= [];
      pr.fit.push(op.key);
      this.site.h.fits[op.key] = g;
      this.audio.play('thud');
      if (!this.pickables.length) { this.session.step = 'quiz'; this.startQuiz(); }
      this.panel();
    }, false);
  }
  startQuiz() {
    const s = this.session;
    s.quiz = QUIZZES[(this.session.i * 2 + (s.quizN || 0)) % QUIZZES.length];
    s.feedback = null;
    this.panel();
  }
  answerQuiz(id) {
    const s = this.session;
    if (!s.quiz || s.answered) return;
    const o = s.quiz.opts.find((x) => x.id === id);
    if (!o) return;
    s.feedback = { good: !!o.good, text: o.why };
    this.audio.play(o.good ? 'chime' : 'error');
    if (!o.good) { s.stars = Math.max(1, s.stars - 1); this.panel(); return; }
    s.answered = true;
    this.panel();
    setTimeout(() => { if (this.session === s) { s.answered = false; s.quiz = null; this.done('Doors and windows are in, and the wiring and pipes are safely inside the walls.'); } }, 1600);
  }

  // ---- finish ----
  skinKeys() { const out = []; for (let f = 0; f < this.site.proj.floors; f++) for (const w of this.site.L.walls) out.push(`${f}:${w.id}`); return out; }
  skinHit(rc) {
    const skins = Object.values(this.site.h.skins);
    const hits = rc.intersectObjects(skins, false);
    return hits[0] || null;
  }
  paintAt(hit) {
    const s = this.session, u = hit.object.userData, pr = this.progress();
    const key = u.skin;
    if (s.step === 'plaster') {
      if ((pr.plaster || []).includes(key)) return;
      B.paintMask(u.mask, hit.uv.x, hit.uv.y, 0.1);
    } else {
      if ((pr.paint || []).includes(key)) return;
      if (!(pr.plaster || []).includes(key)) return;
      // paint goes on as a second mask layer: tint the plaster as the brush passes
      if (!u.paint) { u.paint = B.makeMask(u.w, B.FLOOR_H); const m = hit.object.material.clone(); m.color.set(s.paintColor); m.alphaMap = u.paint.tex; u.paintMesh = new THREE.Mesh(hit.object.geometry, m); u.paintMesh.position.copy(hit.object.position); u.paintMesh.rotation.copy(hit.object.rotation); u.paintMesh.translateZ(0.004); hit.object.parent.add(u.paintMesh); }
      u.paintMesh.material.color.set(s.paintColor);
      B.paintMask(u.paint, hit.uv.x, hit.uv.y, 0.1);
    }
    s.swipe = (s.swipe || 0) + 1;
    if (s.swipe % 6 === 0) { this.audio.play('click'); this.checkSkins(); }
  }
  checkSkins() {
    const s = this.session, pr = this.progress(), ps = this.ps;
    let changed = false;
    for (const key in this.site.h.skins) {
      const u = this.site.h.skins[key].userData;
      if (s.step === 'plaster' && !(pr.plaster || []).includes(key) && B.maskCoverage(u.mask) > 0.72) { B.fillMask(u.mask); (pr.plaster ||= []).push(key); changed = true; this.audio.play('chime'); }
      if (s.step === 'paint' && u.paint && !(pr.paint || []).includes(key) && B.maskCoverage(u.paint) > 0.72) { B.fillMask(u.paint); (pr.paint ||= []).push(key); ps.colors.walls = s.paintColor; changed = true; this.audio.play('chime'); }
    }
    if (!changed) return;
    this.game.save();
    if (s.step === 'plaster' && pr.plaster.length >= this.skinKeys().length) { s.step = 'paint'; this.toast('All walls plastered! Now choose a colour and paint.', 'good'); }
    if (s.step === 'paint' && (pr.paint || []).length >= this.skinKeys().length) { ps.colors.walls = s.paintColor; this.done('Plastered and painted — it looks brand new!'); return; }
    this.panel();
  }

  // ---- handover ----
  pickFloor(id) {
    const s = this.session, pr = this.progress();
    if (s.phase !== 'work' || s.step !== 'floor') return;
    pr.floorPat = id;
    this.ps.colors.floor = id;
    this.audio.play('chime');
    this.rebuild();
    s.step = 'garden';
    this.makeGardenGhosts();
    this.panel();
  }
  makeGardenGhosts() {
    const done = new Set(this.progress().garden || []);
    this.pickables = [];
    for (const gi of V.gardenItems(this.site.L, this.site.proj)) {
      if (done.has(gi.id)) continue;
      const gm = gi.id === 'wall'
        ? new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), V.mats().hot)
        : new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.8, gi.w), Math.max(0.6, gi.h), Math.max(0.8, gi.d)), V.mats().ghost);
      if (gi.id === 'wall') gm.position.set(11.4, 0.7, 10.4); else gm.position.set(gi.x, gi.id === 'board' ? 2.75 : Math.max(0.3, gi.h / 2), gi.z);
      gm.userData = { garden: gi };
      this.site.root.add(gm); this.pickables.push(gm);
    }
  }
  tapGarden(gi, ghost) {
    ghost.parent?.remove(ghost);
    this.pickables = this.pickables.filter((p) => p !== ghost);
    const m = V.gardenMesh(gi, this.ps, this.site.L);
    m.scale.setScalar(0.01);
    this.site.root.add(m);
    this.audio.play('thud');
    this.run([{ dur: 0.5, fn: (e) => m.scale.setScalar(Math.max(0.01, ease(e))) }], () => {
      const pr = this.progress();
      (pr.garden ||= []).push(gi.id);
      this.site.h.garden[gi.id] = m;
      if (!this.pickables.length) this.inspect();
      this.panel();
    }, false);
  }
  inspect() {
    const s = this.session, { hw, hd } = this.site.L;
    s.step = 'inspect';
    s.checked = 0;
    const ins = this.inspector;
    ins.visible = true; this.site.root.add(ins);
    ins.position.set(0, 0, 13);
    const pts = [[0, 13], [hw + 1.5, hd + 1.5], [hw + 1.5, -hd - 1.5], [-hw - 1.5, -hd - 1.5], [-hw - 1.5, hd + 1.5], [0, hd + 2.5]];
    const steps = [];
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1], b = pts[k];
      const dur = Math.hypot(b[0] - a[0], b[1] - a[1]) / 2.2;
      steps.push({ dur, fn: (e) => { ins.position.set(lerp(a[0], b[0], e), 0, lerp(a[1], b[1], e)); ins.rotation.y = Math.atan2(b[0] - a[0], b[1] - a[1]); animateWorker(ins, this.game.time, 'walk'); }, end: () => { s.checked = k; this.audio.play('click'); this.panel(); } });
    }
    this.run(steps, () => { animateWorker(ins, 0, 'idle'); s.step = 'open'; this.audio.play('chime'); this.panel(); });
    this.panel();
  }
  openDoors() {
    const s = this.session;
    if (s.step !== 'open') return;
    s.step = 'arrive';
    const site = this.site;
    const door = V.openings(site.L).find((o) => o.f === 0 && o.o.kind !== 'window');
    const tx = door ? door.x : 0, tz = door ? door.z : site.L.hd;
    this.people.forEach((p, k) => { p.visible = true; site.root.add(p); p.position.set(tx - 1 + k, 0, 15 + k * 0.8); });
    this.audio.play('fanfare');
    this.confetti(V3(tx, 3, tz + 1));
    this.run([{ dur: 3.2, fn: (e) => {
      this.people.forEach((p, k) => {
        const sx = tx - 1 + k, sz = 15 + k * 0.8;
        const ee = clamp(e * 1.2 - k * 0.1, 0, 1);
        p.position.set(lerp(sx, tx + (k - 1) * 0.6, ee), ee > 0.85 ? B.PLINTH : 0, lerp(sz, tz + 1.2, ee));
        p.rotation.y = Math.PI;
        animateWorker(p, this.game.time, ee < 1 ? 'walk' : 'idle');
      });
    } }], () => this.done(`Welcome home! The ${site.proj.name} is open.`));
    this.panel();
  }

  // ---------- help: finish the current task automatically (max two stars) ----------
  help() {
    const s = this.session, st = this.stageIdx(), pr = this.progress();
    s.helped = true;
    s.stars = Math.min(s.stars, 2);
    this.audio.play('click');
    switch (st) {
      case ST.survey: {
        const next = () => {
          if (this.session !== s || s.phase !== 'work') return;
          const o = this.pickables.find((p) => p.userData.peg === (pr.pegs || 0));
          if (o) { this.tapPeg(o.userData.peg, o); setTimeout(next, 450); }
        };
        next();
        break;
      }
      case ST.clear: for (const k in this.site.h.debris) { this.site.h.debris[k].parent?.remove(this.site.h.debris[k]); } for (const d of V.debrisList(s.i)) { pr.cleared ||= []; if (!pr.cleared.includes(d.k)) pr.cleared.push(d.k); } this.site.h.debris = {}; this.done('The crew cleared the plot for you.'); break;
      case ST.dig: case ST.footing: s.auto = true; break;
      case ST.steel: this.chainTaps((o) => this.tapCage(o.userData.seg, o), 300); break;
      case ST.plinth: pr.plinth = 1; pr.backfill = 1; V.setPlinth(this.site.h, 1); V.setBackfill(this.site.h, 1); (this.site.h.heaps || []).forEach((m) => m.parent?.remove(m)); this.m.roller.visible = false; s.step = 'dpc'; this.layDpc(); break;
      case ST.columns: if (s.step === 'strip') this.stripShutters(); else this.chainTaps((o) => this.tapColumn(o.userData.col, o), 3300); break;
      case ST.walls: s.level = null; s.checks = []; pr.bricks = this.site.h.brickSlots.slots.length - 1; s.held = true; break;
      case ST.roof: {
        const rp = pr.roof;
        if (this.isSlab()) { rp.deck = rp.mesh = true; this.site.h.deck.visible = true; this.site.h.slabMesh.visible = true; this.site.h.slabMesh.children.forEach((b) => { b.visible = true; }); rp.pour = 0.999; if (!this.m.pump.visible) { const { hw, hd } = this.site.L; this.show('pump', hw + 3.2, hd + 7, Math.PI); } s.step = 'pour'; s.held = true; }
        else { rp.gablesK = 1; this.site.h.pitched.gables.visible = true; this.site.h.pitched.gables.children.forEach((m) => { m.scale.y = 1; }); rp.trusses = this.site.h.pitched.trusses.map((_, k) => k); this.site.h.pitched.trusses.forEach((t) => { t.visible = true; t.position.copy(t.userData.home); }); this.pickables.forEach((p) => p.parent?.remove(p)); this.pickables = []; rp.cover = 0.999; s.step = 'cover'; s.held = true; }
        break;
      }
      case ST.fittings: this.chainTaps((o) => this.tapFit(o.userData.fit, o), 250); break;
      case ST.finish: {
        for (const key in this.site.h.skins) {
          const u = this.site.h.skins[key].userData;
          if (s.step === 'plaster') B.fillMask(u.mask);
          else { this.paintAt({ object: this.site.h.skins[key], uv: { x: 0.5, y: 0.5 } }); B.fillMask(u.paint); }
        }
        this.checkSkins();
        break;
      }
      case ST.handover: this.chainTaps((o) => this.tapGarden(o.userData.garden, o), 400); break;
    }
    this.panel();
  }
  chainTaps(fn, gap) {
    const s = this.session;
    const list = [...this.pickables];
    list.forEach((o, k) => setTimeout(() => { if (this.session === s && o.parent) fn(o); }, k * gap));
  }

  // ---------- stage complete → review → next ----------
  done(text) {
    const s = this.session;
    if (!s || s.phase !== 'work') return;
    const i = s.i, ps = this.ps, st = ps.stage;
    const res = L.completeStage(this.state, i, st, this.state.rules.realMaterials);
    if (!res) { this.toast('Something is missing for this stage.'); return; }
    ps.quality ||= [];
    ps.quality.push(s.stars);
    ps.days = (ps.days || 0) + DAYS[st];
    s.phase = 'review';
    s.doneStage = st;
    s.review = text;
    s.nextLabel = ps.done ? '🎉 Finish' : res.nextFloor ? `Floor ${ps.floor + 1} ▶` : `Next: ${STAGES[ps.stage].name} ▶`;
    this.pickables.forEach((p) => p.parent?.remove(p));
    this.pickables = [];
    this.game.onStageComplete(i, res);
    this.panel();
  }
  afterReview() {
    const s = this.session, ps = this.ps;
    this.finishSeqs();
    this.rebuild();
    if (ps.done) { this.confetti(V3(0, 6, 0)); this.game.exitBuild(); return; }
    this.setupStage();
    void s;
  }
  rebuild() { V.buildSite(this.site, this.ps, this.game); this.reattach(); }
  reattach() {
    const root = this.site.root;
    for (const k in this.m) if (this.m[k].visible) root.add(this.m[k]);
    for (const w of [...this.crew, ...this.people, this.inspector]) if (w.visible) root.add(w);
    for (const p of this.pickables) root.add(p);
    root.add(this.arrow);
  }
  timeLapse(days) {
    const ps = this.ps;
    this.game.ui.toast(`⏩ ${days} days later…`, 'good');
    const dn = this.game.daynight;
    if (dn && dn.mode === 'cycle') { const h0 = dn.hour; this.run([{ dur: 1.5, fn: (e) => { dn.hour = (h0 + e * 24) % 24; } }], null, false); }
    void ps;
  }

  // ---------- crew ----------
  crewTo(k, x, z, mode = 'idle', lx = null, lz = null, y = 0) {
    const w = this.crew[k];
    if (!w.visible) { w.visible = true; this.site.root.add(w); }
    w.userData.goal = { x, z, y: y ?? 0, mode, lx, lz };
  }
  crewAround(mode, y, inside = false) {
    const { hw, hd } = this.site.L;
    const d = inside ? -0.8 : 1.0;
    const spots = [[-hw * 0.5, hd + d, 0, hd], [hw + d, 0, hw, 0], [hw * 0.4, -hd - d, 0, -hd], [-hw - d, -hd * 0.3, -hw, 0]];
    spots.forEach(([x, z, lx, lz], k) => this.crewTo(k, x, z, mode, lx, lz, inside ? y : 0));
  }
  freeWorker() {
    let best = 0, bd = 1e9;
    this.crew.forEach((w, k) => { const d = w.userData.goal ? 1e6 : 0; if (d < bd) { bd = d; best = k; } });
    this.session.rr = ((this.session.rr || 0) + 1) % this.crew.length;
    return bd >= 1e6 ? this.session.rr : best;
  }
  updateCrew(dt) {
    const t = this.game.time;
    for (const w of this.crew) {
      if (!w.visible) continue;
      const g = w.userData.goal;
      if (g) {
        const dx = g.x - w.position.x, dz = g.z - w.position.z, d = Math.hypot(dx, dz);
        if (d > 0.08) {
          const sp = Math.min(d, dt * 2.2);
          w.position.x += (dx / d) * sp; w.position.z += (dz / d) * sp;
          w.position.y = lerp(w.position.y, g.y || 0, Math.min(1, dt * 3));
          w.rotation.y = lerpAngle(w.rotation.y, Math.atan2(dx, dz), Math.min(1, dt * 8));
          animateWorker(w, t, 'walk');
          continue;
        }
        w.position.y = g.y || 0;
        if (g.lx != null) w.rotation.y = Math.atan2(g.lx - w.position.x, g.lz - w.position.z);
        w.userData.mode = g.mode === 'walk' ? 'work' : g.mode;
        w.userData.goal = null;
        if (w.userData.mode === 'work') setTimeout(() => { if (!w.userData.goal && this.session && this.stageIdx() < ST.walls) w.userData.mode = 'idle'; }, 1800);
      }
      animateWorker(w, t, w.userData.mode);
    }
  }

  // ---------- frame update ----------
  update(dt, keys) {
    if (!this.session) return;
    const s = this.session;
    s.t += dt;
    this.updateSeqs(dt);
    this.updateCrew(dt);
    this.updateParticles(dt);
    if (s.phase === 'work') {
      const st = this.stageIdx();
      if (st === ST.clear) this.updateClear(dt);
      else if (st === ST.dig) this.updateDig(dt);
      else if (st === ST.footing) this.updateFooting(dt);
      else if (st === ST.plinth) this.updatePlinth(dt);
      else if (st === ST.walls) this.updateWalls(dt);
      else if (st === ST.roof) this.updateRoof(dt);
      else if (st === ST.columns) this.craneIdle(dt);
    }
    // ease the camera towards the work
    const ob = this.game.rig.orbit;
    this.tmp.copy(this.focus);
    this.site.root.localToWorld(this.tmp);
    ob.center.lerp(this.tmp, Math.min(1, dt * 1.5));
    // glowing targets pulse
    const pulse = 0.5 + 0.5 * Math.sin(s.t * 5);
    V.mats().ghost.opacity = 0.3 + 0.35 * pulse;
    V.mats().hot.opacity = 0.45 + 0.35 * pulse;
    // a bouncing arrow over the next thing to tap
    const tgt = s.phase === 'work' && !this.busy() ? this.pickables.find((p) => p.parent) : null;
    this.arrow.visible = !!tgt;
    if (tgt) {
      this.box3.setFromObject(tgt);
      this.box3.getCenter(this.tmp);
      this.tmp.y = this.box3.max.y;
      this.site.root.worldToLocal(this.tmp);
      if (this.arrow.parent !== this.site.root) this.site.root.add(this.arrow);
      this.arrow.position.set(this.tmp.x, this.tmp.y + 0.9 + Math.abs(Math.sin(s.t * 4)) * 0.6, this.tmp.z);
      this.arrow.rotation.y += dt * 2;
    }
  }
  setFocus(x, y, z) { this.focus.set(x, y + 1, z); }

  // ---------- sequences (short scripted animations) ----------
  run(steps, done, block = true) { this.seqs.push({ steps, i: 0, t: 0, done, block }); }
  updateSeqs(dt) {
    for (const q of [...this.seqs]) {
      let guard = 0;
      while (q.i < q.steps.length && guard++ < 10) {
        const st = q.steps[q.i];
        if (q.t === 0 && st.start) st.start();
        if (st.until) { if (!st.until()) { q.t += dt; break; } }
        else {
          q.t += dt;
          const k = st.dur ? Math.min(1, q.t / st.dur) : 1;
          st.fn?.(k);
          if (k < 1) break;
        }
        st.end?.();
        q.i++; q.t = 0;
        dt = 0;
      }
      if (q.i >= q.steps.length) { this.seqs.splice(this.seqs.indexOf(q), 1); q.done?.(); }
    }
  }
  finishSeqs() {
    let n = 0;
    while (this.seqs.length && n++ < 50) {
      const q = this.seqs[0];
      for (; q.i < q.steps.length; q.i++) { const st = q.steps[q.i]; if (q.t === 0) st.start?.(); st.fn?.(1); st.end?.(); q.t = 0; }
      this.seqs.shift();
      q.done?.();
    }
  }
  driveSteps(name, pts, speed, reverse) {
    const o = this.m[name];
    const steps = [];
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1], b = pts[k];
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (d < 0.05) continue;
      const yaw = Math.atan2(b[0] - a[0], b[1] - a[1]) + (reverse ? Math.PI : 0);
      steps.push({ dur: d / speed, start: () => { this.yaw0 = o.rotation.y; }, fn: (e) => {
        o.position.set(lerp(a[0], b[0], e), o.position.y, lerp(a[1], b[1], e));
        o.rotation.y = lerpAngle(this.yaw0, yaw, Math.min(1, e * 4));
        for (const w of o.userData.wheels || []) w.rotation.x += (reverse ? -1 : 1) * 0.12;
        this.engine(0.016);
      } });
    }
    return steps;
  }
  engine(dt) { this._eng = (this._eng || 0) + dt; if (this._eng > 0.9) { this._eng = 0; this.audio.play('dig'); } }

  // ---------- particles ----------
  puff(pos, color, n = 3, size = 0.35) {
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(PUFF_GEO, new THREE.MeshStandardMaterial({ color, roughness: 1, transparent: true, opacity: 0.8, depthWrite: false }));
      m.position.copy(pos).add(V3((Math.random() - 0.5) * 0.6, Math.random() * 0.3, (Math.random() - 0.5) * 0.6));
      m.scale.setScalar(size);
      this.site.root.add(m);
      this.particles.push({ m, v: V3((Math.random() - 0.5) * 0.8, 0.6 + Math.random() * 0.8, (Math.random() - 0.5) * 0.8), life: 1.2 });
    }
  }
  confetti(pos) {
    const cols = [0xff5a5f, 0xffc531, 0x3ec46d, 0x4aa8ff, 0xb46bff];
    for (let k = 0; k < 60; k++) {
      const m = new THREE.Mesh(CONF_GEO, new THREE.MeshBasicMaterial({ color: cols[k % 5], side: THREE.DoubleSide, transparent: true }));
      m.position.copy(pos);
      this.site.root.add(m);
      this.particles.push({ m, v: V3((Math.random() - 0.5) * 7, 4 + Math.random() * 5, (Math.random() - 0.5) * 7), life: 2.6, spin: true, grav: 6 });
    }
  }
  updateParticles(dt) {
    for (const p of [...this.particles]) {
      p.life -= dt;
      p.v.y -= (p.grav || 0) * dt;
      p.m.position.addScaledVector(p.v, dt);
      if (p.spin) { p.m.rotation.x += dt * 6; p.m.rotation.y += dt * 4; } else p.m.scale.multiplyScalar(1 + dt * 0.8);
      p.m.material.opacity = Math.max(0, Math.min(1, p.life));
      if (p.life <= 0) { p.m.parent?.remove(p.m); p.m.material.dispose(); this.particles.splice(this.particles.indexOf(p), 1); }
    }
  }
  streamMesh() {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 1, 8), V.mats().wet);
    m.visible = false;
    this.site.root.add(m);
    return m;
  }
  toast(text, kind) { this.game.ui.toast(text, kind); }
}

const PUFF_GEO = new THREE.SphereGeometry(1, 6, 5);
const CONF_GEO = new THREE.PlaneGeometry(0.18, 0.1);

function lerpAngle(a, b, k) { return a + angDiff(b, a) * k; }

// place a unit-height cylinder between two site-local points (the mesh may sit inside a machine)
function stretch(mesh, a, b, root) {
  const parent = mesh.parent;
  if (!parent) return;
  const pa = a.clone(), pb = b.clone();
  if (parent !== root) { root.localToWorld(pa); root.localToWorld(pb); parent.worldToLocal(pa); parent.worldToLocal(pb); }
  const mid = pa.clone().add(pb).multiplyScalar(0.5);
  const len = pa.distanceTo(pb);
  mesh.position.copy(mid);
  mesh.scale.set(1, Math.max(0.01, len), 1);
  mesh.quaternion.setFromUnitVectors(V3(0, 1, 0), pb.clone().sub(pa).normalize());
}

function label(text) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ff5a1f'; ctx.beginPath(); ctx.arc(32, 32, 28, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 38px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 32, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false }));
  sp.scale.set(0.9, 0.9, 1);
  return sp;
}

// a family member: same body as a worker, everyday clothes and no hard hat
function civilian(w, k) {
  const shirts = [0x2e86de, 0xe84393, 0x20bf6b];
  w.children[2].material = new THREE.MeshStandardMaterial({ color: shirts[k % 3], roughness: 0.8 });
  w.children[3].visible = false;
  w.children[7].visible = false; w.children[8].visible = false;
  if (k === 2) w.scale.setScalar(0.65);
  w.visible = false;
  return w;
}
