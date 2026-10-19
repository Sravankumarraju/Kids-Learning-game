// Build My Town: Indian Railway Adventure — game bootstrap and main loop.
import * as THREE from 'three';
import { Track, RAIL_TOP } from './track.js';
import { Terrain } from './terrain.js';
import { World, STOP_AHEAD } from './world.js';
import { Scenery } from './scenery.js';
import { Town } from './town.js';
import { Train } from './train.js';
import { Vehicle } from './vehicles.js';
import { CameraRig, TRAIN_VIEWS, VEHICLE_VIEWS } from './cameras.js';
import { Construction } from './construction.js';
import { GameAudio } from './audio.js';
import { UI, goods } from './ui.js';
import { makeCar, makeTruck, makeSUV, makeAuto, makeTractor, setTruckCargo, setWagonCargo } from './models.js';
import { Passengers } from './passengers.js';
import { Learn } from './learn.js';
import * as L from './logic.js';
import * as DATA from './data.js';
import { CARGO, STAGES, MATERIALS, VEHICLE_COLORS } from './data.js';

const DRIVE_KINDS = ['car', 'suv', 'auto', 'truck', 'tractor'];
const MAKERS = { car: makeCar, suv: makeSUV, auto: makeAuto, truck: makeTruck, tractor: makeTractor };
import { fmtDist, fmtTime, clamp, canvasTexture } from './util.js';

const SETTINGS_KEY = 'bmt-settings';
const QUALITY = {
  low: { pr: 1, shadowSize: 1024, shadowRange: 70, density: 0.35, draw: 1000, fog: 1500 },
  medium: { pr: 1.5, shadowSize: 2048, shadowRange: 90, density: 0.7, draw: 1700, fog: 2400 },
  high: { pr: 2, shadowSize: 2048, shadowRange: 120, density: 1, draw: 2600, fog: 3400 },
};
// yield so the loading bar can repaint (falls back to a timer when the tab is in the background)
const nextFrame = () => new Promise((r) => {
  let done = false;
  const fin = () => { if (!done) { done = true; r(); } };
  requestAnimationFrame(() => setTimeout(fin, 0));
  setTimeout(fin, 60);
});

class Game {
  constructor() {
    const mobile = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600;
    this.settings = { quality: mobile ? 'low' : 'medium', shadows: !mobile, music: 0.45, sfx: 0.85, assisted: true, timeScale: 1 };
    try { Object.assign(this.settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); } catch { /* ignore */ }
    this.input = { throttle: 0, brakeHeld: false, vSteerL: false, vSteerR: false, vGas: false, vRev: false };
    this.keys = new Set();
    this.mode = 'train';
    this.vehicle = null;
    this.busy = null;
    this.objective = { title: '', sub: '' };
    this.machineAudio = {};
    this.time = 0;
    this.saveTimer = 0;
    this.data = DATA;
    this.vehicles = {};
    this.guide = null;
  }

  isDrive(m = this.mode) { return DRIVE_KINDS.includes(m); }
  get car() { return this.getVehicle('car'); }
  get truck() { return this.getVehicle('truck'); }

  // vehicles are created on demand and rebuilt when their colour changes
  getVehicle(kind, colorIdx) {
    let v = this.vehicles[kind];
    const want = colorIdx ?? v?.colorIdx ?? (kind === 'truck' ? -1 : 1);
    if (v && v.colorIdx === want) return v;
    let pos = null;
    if (v) { pos = { x: v.x, z: v.z, yaw: v.yaw }; this.scene.remove(v.obj); }
    const hex = want < 0 ? undefined : VEHICLE_COLORS[want]?.hex;
    v = new Vehicle(kind, MAKERS[kind](hex), this.world);
    v.colorIdx = want;
    v.onBump = () => this.audio.play('bump');
    v.obj.visible = true;
    const saved = pos || this.state?.vehicles?.[kind] || this.spawnFor(kind);
    v.place(saved.x, saved.z, saved.yaw);
    if (kind === 'truck' && this.state) setTruckCargo(v.obj, this.state.vehicles.truckCargo);
    this.vehicles[kind] = v;
    return v;
  }
  spawnFor(kind) {
    const tc = this.town.tc;
    const i = DRIVE_KINDS.indexOf(kind);
    return { x: tc.x + 170 + i * 14, z: tc.z + 20, yaw: -Math.PI / 2 };
  }

  progress(f, msg) {
    const now = performance.now();
    if (this._pt && location.search.includes('debug')) console.log(`[boot] ${this._pmsg} ${Math.round(now - this._pt)} ms`);
    this._pt = now; this._pmsg = msg;
    document.getElementById('loadFill').style.width = `${Math.round(f * 100)}%`;
    document.getElementById('loadMsg').textContent = msg;
  }

  async boot() {
    const canvas = document.getElementById('c');
    const q = QUALITY[this.settings.quality];
    const renderer = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.settings.quality !== 'low', powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, q.pr));
    renderer.setSize(innerWidth, innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const scene = this.scene = new THREE.Scene();
    const camera = this.camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.5, 6000);
    this.buildSky();
    this.progress(0.05, 'Laying the railway line…');
    await nextFrame();
    this.track = new Track();
    this.progress(0.15, 'Shaping hills, fields and the river…');
    await nextFrame();
    this.terrain = new Terrain(this.track);
    scene.add(this.terrain.buildMesh());
    this.progress(0.35, 'Building stations, bridges and overhead wires…');
    await nextFrame();
    this.world = new World(scene, this.track, this.terrain);
    this.town = new Town(this.world);
    this.town.defineRoads();
    this.world.build();
    for (const s of this.town.crossingS) this.world.buildCrossing(s);
    this.progress(0.55, 'Planting palms, paddy fields and villages…');
    await nextFrame();
    this.scenery = new Scenery(this.world);
    this.town.build(this.scenery);
    this.scenery.scatterTrees();
    this.scenery.build();
    this.world.buildRoadMeshes();
    this.progress(0.8, 'Coupling the goods wagons…');
    await nextFrame();
    this.train = new Train(scene, this.track);
    this.rig = new CameraRig(camera, this.world);
    this.rig.onCut = () => { const f = document.getElementById('fade'); f.classList.add('on'); setTimeout(() => f.classList.remove('on'), 160); };
    this.audio = new GameAudio();
    this.buildGuides();
    this.state = L.newState();
    this.ui = new UI(this);
    this.construction = new Construction(this);
    this.passengers = new Passengers(this);
    this.learn = new Learn(this);
    this.applySettings({}, false);
    this.applyState();
    this.rig.setContext('train');
    this.rig.t = 1;
    this.bindInput();
    addEventListener('resize', () => this.resize());
    this.progress(1, 'Ready!');
    // title screen
    const cont = document.getElementById('btnContinue');
    cont.hidden = !L.hasSave();
    document.getElementById('titleBtns').hidden = false;
    document.getElementById('loadMsg').textContent = L.hasSave() ? 'A saved game was found.' : 'Welcome, driver!';
    cont.onclick = () => this.start(false);
    document.getElementById('btnNew').onclick = () => {
      if (L.hasSave()) this.ui.confirm('Start a new game?', 'Your saved progress will be replaced.', 'Start new', () => this.start(true));
      else this.start(true);
    };
    (cont.hidden ? document.getElementById('btnNew') : cont).focus();
    this.last = performance.now();
    renderer.setAnimationLoop(() => this.frame());
    if (location.search.includes('selftest')) this.selfTest();
  }

  buildSky() {
    const geo = new THREE.SphereGeometry(5000, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { sunDir: { value: new THREE.Vector3(0.45, 0.62, 0.35).normalize() } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }',
      fragmentShader: `varying vec3 vDir; uniform vec3 sunDir;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
        float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<5;i++){ s+=a*n(p); p*=2.03; a*=0.5; } return s; }
        void main(){
          vec3 d = normalize(vDir);
          float y = max(d.y, 0.0);
          vec3 top = vec3(0.30,0.55,0.86), hor = vec3(0.80,0.88,0.93);
          vec3 col = mix(hor, top, pow(y, 0.55));
          float sd = max(dot(d, sunDir), 0.0);
          col += vec3(1.0,0.86,0.6) * (pow(sd, 600.0) * 4.0 + pow(sd, 12.0) * 0.18);
          if (d.y > 0.0) {
            vec2 uv = d.xz / (d.y + 0.15) * 1.6;
            float c = smoothstep(0.52, 0.8, fbm(uv + vec2(3.0, 1.0)));
            col = mix(col, vec3(1.0), c * 0.75 * smoothstep(0.0, 0.25, d.y));
          } else col = mix(hor, vec3(0.62,0.68,0.6), min(1.0, -d.y*4.0));
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
    this.scene.fog = new THREE.Fog(0xc6dbe6, 300, 2400);
    const hemi = new THREE.HemisphereLight(0xd6e8ff, 0x6a5a3a, 1.25);
    this.scene.add(hemi);
    const sun = this.sun = new THREE.DirectionalLight(0xfff0d4, 2.6);
    this.sunDir = new THREE.Vector3(0.45, 0.62, 0.35).normalize();
    sun.castShadow = true;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.6;
    this.scene.add(sun, sun.target);
  }

  buildGuides() {
    // destination beacon + direction arrow for car/truck
    const bm = new THREE.MeshBasicMaterial({ color: 0xffd23c, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
    this.beacon = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 70, 20, 1, true), bm);
    this.beacon.visible = false;
    this.scene.add(this.beacon);
    const am = new THREE.MeshBasicMaterial({ color: 0xffd23c });
    // flat chevron lying on its side, pointing along +z (lookAt aims it at the destination)
    const sh = new THREE.Shape();
    sh.moveTo(0, 1.3); sh.lineTo(0.9, -0.2); sh.lineTo(0.3, -0.2); sh.lineTo(0.3, -1.1); sh.lineTo(-0.3, -1.1); sh.lineTo(-0.3, -0.2); sh.lineTo(-0.9, -0.2); sh.closePath();
    const ag = new THREE.ShapeGeometry(sh);
    ag.rotateX(Math.PI / 2);
    am.side = THREE.DoubleSide;
    this.arrow = new THREE.Mesh(ag, am);
    this.arrow.visible = false;
    this.scene.add(this.arrow);
  }

  applySettings(patch, persist = true) {
    Object.assign(this.settings, patch);
    const s = this.settings, q = QUALITY[s.quality];
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, q.pr));
    this.renderer.shadowMap.enabled = s.shadows;
    this.sun.castShadow = s.shadows;
    this.sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    const sc = this.sun.shadow.camera;
    sc.left = -q.shadowRange; sc.right = q.shadowRange; sc.top = q.shadowRange; sc.bottom = -q.shadowRange; sc.near = 10; sc.far = 700;
    sc.updateProjectionMatrix();
    this.scene.fog.far = q.fog; this.scene.fog.near = q.fog * 0.15;
    this.drawDist = q.draw;
    this.scenery.setDensity(q.density);
    this.scene.traverse((o) => { if (o.material && o.material.needsUpdate !== undefined && 'fog' in o.material) o.material.needsUpdate = true; });
    this.audio.setVolumes(s.music, s.sfx);
    if (persist) try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
    if (patch.quality) this.ui?.toast(`Graphics: ${patch.quality}`);
  }

  resize() {
    if (!innerWidth || !innerHeight) return;
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  }

  // ---------------- state ----------------
  start(fresh) {
    this.audio.init();
    this.audio.setVolumes(this.settings.music, this.settings.sfx);
    if (fresh) { L.clearSave(); this.state = L.newState(); }
    else this.state = L.load() || L.newState();
    L.refreshBoard(this.state);
    this.applyState();
    document.getElementById('title').hidden = true;
    document.getElementById('hud').hidden = false;
    const m = this.state.mode;
    if (this.isDrive(m)) this.enterVehicle(m, true);
    else this.enterTrain(true);
    this.started = true;
    this.save();
    if (!this.state.player.name) this.ui.askName(() => this.ui.showHome());
    else this.ui.showHome();
  }

  applyState() {
    const s = this.state, tr = this.train;
    tr.headS = this.track.wrap(s.train.s);
    tr.dir = s.train.dir || 1;
    tr.speed = 0; tr.throttle = 0;
    this.input.throttle = 0;
    document.getElementById('throttle').value = 0;
    tr.setConsist(s.choice.train);
    tr.setLights(s.train.lights !== false);
    tr.assist = !!s.train.assist;
    tr.setCargo(s.trainCargo);
    tr.place();
    for (const k in this.vehicles) { this.scene.remove(this.vehicles[k].obj); }
    this.vehicles = {};
    // park the car and the truck in town, plus the player's chosen vehicle
    this.getVehicle('car');
    this.getVehicle('truck');
    this.getVehicle(s.choice.vehicle.type, s.choice.vehicle.color);
    setTruckCargo(this.truck.obj, s.vehicles.truckCargo);
    this.town.updateStock(s.warehouse);
    this.town.setExpansion(s.housesBuilt);
    this.construction.refreshAll();
  }

  save() {
    const s = this.state;
    if (!s) return;
    s.train = { s: this.train.headS, dir: this.train.dir, lights: this.train.lightsOn, assist: this.train.assist };
    for (const k in this.vehicles) { const v = this.vehicles[k]; s.vehicles[k] = { x: v.x, z: v.z, yaw: v.yaw }; }
    s.mode = this.mode === 'build' ? (this.isDrive(this.buildFrom) ? this.buildFrom : 'train') : this.mode;
    s.stats.distanceKm = Math.round(((s.stats.distanceKm || 0) + (this.train.travelled || 0) / 1000) * 100) / 100;
    this.train.travelled = 0;
    L.save(s);
  }

  resetProgress() {
    L.clearSave();
    this.state = L.newState();
    if (this.mode === 'build') this.construction.exit();
    this.applyState();
    this.enterTrain(true);
    this.save();
    this.ui.renderPanel();
    this.ui.toast('Progress reset. A fresh start!');
  }

  // ---------------- modes ----------------
  fadeSwap(fn) {
    const f = document.getElementById('fade');
    f.classList.add('on');
    setTimeout(() => { fn(); setTimeout(() => f.classList.remove('on'), 60); }, 260);
  }

  enterTrain(instant = false) {
    const go = () => {
      if (this.mode === 'build') this.construction.exit();
      this.mode = 'train';
      this.vehicle = null;
      this.rig.setContext('train');
      if (instant) this.rig.t = 1;
      this.ui.setMode('train');
    };
    instant ? go() : this.fadeSwap(go);
  }

  enterVehicle(kind, instant = false) {
    const go = () => {
      if (this.mode === 'build') this.construction.exit();
      this.mode = kind;
      this.vehicle = this.getVehicle(kind);
      this.vehicle.obj.visible = true;
      this.rig.vYaw = this.vehicle.yaw;
      this.rig.setContext(kind);
      if (instant) this.rig.t = 1;
      this.ui.setMode(kind);
    };
    instant ? go() : this.fadeSwap(go);
  }

  switchVehicle(kind) {
    if (kind === this.mode) return;
    if (this.mode === 'train' && !this.train.stopped) { this.ui.toast('Stop the train before leaving the cab.'); this.audio.play('error'); return; }
    if (this.busy) { this.ui.toast('Please wait for the loading to finish.'); return; }
    if (kind === 'train') this.enterTrain();
    else if (this.isDrive(kind)) this.enterVehicle(kind);
    this.ui.setPanels(false);
    this.save();
  }

  enterBuild(i) {
    if (!this.construction.canEnter(i)) return;
    this.buildFrom = this.mode;
    this.mode = 'build';
    this.rig.setContext('build');
    this.ui.setMode('build');
    this.construction.enter(i);
    this.audio.play('click');
    if (this.state.plots[i].stage === 0) setTimeout(() => this.learn.offer(['shapes', 'colour'], 'Before we build:'), 2500);
  }
  exitBuild() {
    this.construction.exit();
    const back = this.buildFrom;
    if (this.isDrive(back)) {
      this.mode = back;
      this.vehicle = this.getVehicle(back);
      this.rig.setContext(back);
      this.ui.setMode(back);
    } else {
      this.mode = 'train';
      this.vehicle = null;
      this.rig.setContext('train');
      this.ui.setMode('train');
      this.ui.showHome();
    }
    this.save();
  }

  // ---------------- choices from the home hub ----------------
  goHome() {
    if (this.mode === 'build') { this.buildFrom = 'home'; this.exitBuild(); return; }
    this.ui.setPanels(false);
    this.ui.showHome();
  }
  chooseTrain(choice) {
    const s = this.state;
    s.choice.train = choice;
    this.train.speed = 0;
    this.train.setConsist(choice);
    this.train.setCargo(s.trainCargo);
    this.input.throttle = 0; document.getElementById('throttle').value = 0;
    if (this.mode === 'build') this.construction.exit();
    this.enterTrain(true);
    this.rig.beginTransition(1.2);
    const name = s.player.name || 'Driver';
    this.ui.toast(this.train.service === 'passenger'
      ? `${name}, your ${this.train.def.name} is ready. Pick up passengers at every stop!`
      : `${name}, your goods train is ready. Let's carry materials for the town!`, 'good');
    this.save();
  }
  chooseVehicle(choice) {
    this.state.choice.vehicle = choice;
    if (this.mode === 'build') this.construction.exit();
    if (this.mode === 'train' && !this.train.stopped) this.train.speed = 0;
    const v = this.getVehicle(choice.type, choice.color);
    v.speed = 0;
    this.enterVehicle(choice.type, true);
    this.rig.beginTransition(1.2);
    this.save();
  }
  chooseBuild(i, design) {
    const p = this.state.plots[i];
    if (!p || p.done) return;
    if (p.stage === 0 && !(p.progress && Object.keys(p.progress).length)) p.design = design;
    else if (!p.design) p.design = design;
    if (this.mode === 'build') this.construction.exit();
    const from = this.isDrive() ? this.mode : 'home';
    this.construction.refreshAll();
    this.enterBuild(i);
    this.buildFrom = from;
    this.save();
  }

  setView(id) {
    if (TRAIN_VIEWS.some((v) => v.id === id)) this.rig.setTrainView(id);
    else this.rig.setVehicleView(id);
    this.train.loco.userData.setCabView(id === 'cab');
    this.audio.play('click');
  }

  // ---------------- controls ----------------
  toggleDirection() {
    if (this.mode !== 'train') return;
    if (!this.train.stopped) { this.ui.toast('Stop the train before changing direction.'); this.audio.play('error'); return; }
    this.train.setDirection(-this.train.dir);
    this.audio.play('click');
  }
  toggleLights() { this.train.setLights(!this.train.lightsOn); this.audio.play('click'); }
  toggleAssist() {
    this.train.assist = !this.train.assist;
    if (!this.train.assist) { this.input.throttle = 0; document.getElementById('throttle').value = 0; }
    this.ui.toast(this.train.assist ? 'Driving assist ON: the train drives to the next stop by itself.' : 'Driving assist OFF: you are in control.');
    this.audio.play('click');
  }
  setHorn(on) {
    if (this.mode === 'train') { this.audio.setHorn(on); this.hornVisual = on; }
    else this.audio.setCarHorn(on);
  }
  recoverVehicle() {
    if (!this.vehicle) return;
    this.vehicle.recover(this.town.spawn[this.vehicle.kind]);
    this.ui.toast('Vehicle recovered to the nearest road.');
    this.audio.play('click');
  }

  startMission(id) {
    const r = L.startMission(this.state, id);
    if (!r.ok) { this.ui.toast(r.msg); this.audio.play('error'); return; }
    this.ui.toast(`New mission: ${L.missionDef(this.state, id).title}`, 'good');
    this.audio.play('chime');
    this.save();
    this.ui.renderPanel();
  }

  buyTruck() {
    const r = L.buyTruck(this.state);
    if (!r.ok) { this.ui.toast(r.msg); this.audio.play('error'); return; }
    this.audio.play('coin');
    this.truck.obj.visible = true;
    const sp = this.town.spawn.truck;
    this.truck.place(sp.x, sp.z, sp.yaw);
    this.ui.celebrate('You bought a delivery truck!', ['It is parked at the Town Garage.', 'Use it to carry materials from the warehouse to Plot 1.']);
    this.save();
    this.ui.renderPanel();
  }

  buyPlot(i) {
    const r = L.buyPlot(this.state, i);
    if (!r.ok) { this.ui.toast(r.msg); this.audio.play('error'); return; }
    this.audio.play('coin');
    this.construction.refreshAll();
    this.ui.toast(`Plot ${i + 1} is yours. Time to build!`, 'good');
    this.save();
    this.ui.renderPanel();
  }

  onStageComplete(i, res) {
    this.audio.play('chime');
    this.save();
    if (res.houseDone) {
      this.audio.play('fanfare');
      this.town.setExpansion(this.state.housesBuilt);
      const exp = this.town.expansions[this.state.housesBuilt - 1];
      const lines = [`+${res.coins} coins`, exp ? `The town grows: ${exp.label}!` : 'Mitrapur is thriving!'];

      const tn = DATA.BUILDING_TYPES.find((b) => b.id === this.state.plots[i].design?.type)?.name || 'House';
      this.ui.celebrate(`${this.state.player.name ? this.state.player.name + ', your' : 'Your'} ${tn} is complete!`, lines);
      L.refreshBoard(this.state);
    } else {
      const used = Object.keys(res.consumed).map((k) => `${res.consumed[k]} ${CARGO[k].name.toLowerCase()}`).join(', ');
      this.ui.toast(`${STAGES[res.stage].name}: done!${used ? ` Used ${used}.` : ''}`, 'good');
    }
  }

  // ---------------- objectives & actions ----------------
  station(id) { return this.world.stations.find((s) => s.id === id); }

  passengerStops() {
    const def = this.train.def;
    return this.world.stations.filter((st) => def.stops === 'all' || st.kind !== 'halt');
  }
  nextPassengerStop() {
    const tr = this.train, last = this.state.passenger.lastStop;
    let best = null, bd = Infinity;
    for (const st of this.passengerStops()) {
      if (st.id === last) continue;
      if (tr.inStopZone(st)) return st;
      // just ran past an unserved stop: keep it as the target so we can back up to it
      const past = this.track.diff(st.s + STOP_AHEAD, tr.headS) * tr.dir;
      if (past > 0 && past < 400) return st;
      const d = tr.distanceTo(st);
      if (d < bd) { bd = d; best = st; }
    }
    return best;
  }
  startBoarding(st) {
    const s = this.state;
    const res = this.passengers.board(st.id, this.train, s.passenger.onboard);
    this.audio.play('hiss');
    this.busy = { kind: 'board', t: 0, dur: Math.max(2.5, res.duration), res, st };
  }
  currentObjectiveStation() { const o = L.nextObjective(this.state); return o ? o.station : null; }

  computeObjective() {
    const s = this.state, tr = this.train;
    let action = null, target = null;
    const o = { title: '', sub: '', ready: false };
    const who = 'Station Master';
    const name = s.player.name || 'Driver';
    let guide = '';
    if (this.mode === 'train' && this.train.service === 'passenger') {
      const st = this.nextPassengerStop();
      tr.targetStation = st ? st.id : null;
      this.world.setStopZone(st ? st.id : null);
      if (this.busy && this.busy.kind === 'board') {
        o.title = `Doors open at ${this.busy.st.name}`; o.sub = 'Passengers are getting on and off';
        guide = `Wait a moment, ${name} — let everyone get on and off safely.`;
      } else if (st && tr.inStopZone(st)) {
        if (tr.stopped) {
          const w = this.passengers.waitingAt(st.id);
          o.ready = true; o.title = `At ${st.name}`; o.sub = `${w} waiting · ${s.passenger.onboard} on board`;
          action = 'Open the doors';
          guide = `Well stopped, ${name}! Tap "Open the doors" so ${w} passengers can get on.`;
        } else { o.title = `Stop at ${st.name}`; o.sub = 'Brake now — stop anywhere in the green zone'; guide = `Brake now, ${name}! Stop anywhere along the green zone.`; }
      } else if (st) {
        const d = tr.distanceTo(st);
        const eta = (d / (tr.vmax * 0.85) + Math.max(0, tr.vmax * 0.85 - tr.speed)) / this.settings.timeScale;
        o.title = `Next stop: ${st.name}`;
        o.sub = `${fmtDist(d)} · ETA ${fmtTime(eta)} · ${s.passenger.onboard} on board`;
        const back = Math.abs(this.track.diff(st.s + STOP_AHEAD, tr.headS));
        if (tr.stopped && d > 400 && back < 400) { action = 'Move to the platform'; guide = `Oops, ${name}, we went past ${st.name}. Tap "Move to the platform" and I'll back the train up.`; }
        else if (tr.stopped && tr.throttle === 0) guide = `${name}, slide the throttle up (or tap Assist) to drive to ${st.name}.`;
        else if (d < 600) guide = `${st.name} is coming up, ${name}. Start braking gently!`;
        else guide = `Enjoy the ride, ${name}! Next stop is ${st.name}. Try the camera button for different views.`;
      }
    } else if (this.mode === 'train') {
      let obj = L.nextObjective(s);
      if (!obj) {
        const av = L.availableMissions(s);
        if (av.length && !this.busy) { L.startMission(s, av[0].id); obj = L.nextObjective(s); this.ui.toast(`New mission: ${av[0].title}`, 'good'); this.ui.renderPanel(); }
      }
      if (!obj) { o.title = 'All deliveries done for now'; o.sub = 'Tap Home to drive or build something.'; guide = `Brilliant work, ${name}! Tap the Home button to try something new.`; }
      else {
        const st = this.station(obj.station);
        const what = obj.kind === 'load' ? goods(obj.load) : goods(s.missions.active.loaded);
        tr.targetStation = st.id;
        if (this.busy) { o.title = this.busy.kind === 'load' ? `Loading ${what}…` : `Unloading ${what}…`; o.sub = 'Please wait'; guide = `Watch the cargo, ${name}!`; }
        else if (tr.inStopZone(st)) {
          if (tr.stopped) {
            o.ready = true; o.title = `At ${st.name}`; o.sub = obj.kind === 'load' ? 'Press LOAD to load the wagons' : 'Press UNLOAD to deliver the goods';
            action = obj.kind === 'load' ? `Load ${what}` : `Unload ${what}`;
            guide = obj.kind === 'load' ? `Great stop, ${name}! Tap "${action}" to fill the wagons.` : `You made it, ${name}! Tap "${action}" to deliver the goods.`;
          } else { o.title = `Stop in the green zone at ${st.name}`; o.sub = 'Use the brake now'; guide = `Brake now, ${name}! Stop anywhere along the green zone.`; }
        } else {
          o.title = obj.kind === 'load' ? `Collect ${what} at ${st.name}` : `Deliver ${what} to ${st.name}`;
          const d = tr.distanceTo(st);
          const other = tr.dir > 0 ? this.track.fwd(st.s + STOP_AHEAD, tr.headS) : this.track.fwd(tr.headS, st.s + STOP_AHEAD);
          // cruise ~17.5 m/s plus the time still needed to get up to speed
          const eta = (d / 17.5 + Math.max(0, 17.5 - tr.speed) * 0.9) / this.settings.timeScale;
          o.sub = `${fmtDist(d)} to go · ETA ${fmtTime(eta)}`;
          if (tr.dir < 0 && other < d) o.sub += ' · switch to FWD';
          if (tr.stopped && other < 400 && d > 400) {
            action = 'Move to the platform';
            o.sub = `Just passed it by ${fmtDist(other)}`;
            guide = `Oops, ${name}, we went past ${st.name}. Tap "Move to the platform" and I'll back the train up for you.`;
          } else if (tr.stopped && tr.throttle === 0) guide = `${name}, slide the throttle up (or tap Assist) and head to ${st.name}.`;
          else if (d < 600) guide = `Nearly at ${st.name}, ${name}. Start braking so you stop in the green zone.`;
          else guide = obj.kind === 'load' ? `We're off to ${st.name} to collect ${what}. You're doing great, ${name}!` : `Take the ${what} home to ${st.name}, ${name}.`;
        }
        this.world.setStopZone(st.id);
      }
      if (!obj) { this.world.setStopZone(null); tr.targetStation = null; }
    } else if (this.isDrive()) {
      this.world.setStopZone(null);
      const v = this.vehicle;
      const ai = L.activePlot(s);
      const real = s.rules.realMaterials;
      const stopped = Math.abs(v.speed) < 1;
      const plot = ai >= 0 ? this.town.plots[ai] : null;
      const inZone = (z) => Math.hypot(v.x - z.x, v.z - z.z) < z.r;
      const onTruck = L.truckLoad(s);
      if (this.mode === 'truck' && real) {
        const sugg = ai >= 0 ? L.suggestTruckLoad(s, ai) : {};
        const usefulStock = MATERIALS.some((k) => (sugg[k] || 0) > 0 && s.warehouse[k] > 0);
        if (plot && onTruck > 0) {
          target = plot.unload;
          o.title = `Take materials to Plot ${ai + 1}`;
          o.sub = `${fmtDist(Math.hypot(v.x - target.x, v.z - target.z))} · park in the yellow ring`;
          if (inZone(plot.unload) && stopped) { action = `Unload at Plot ${ai + 1}`; o.ready = true; o.sub = 'Press the button to unload'; }
        } else if (plot && usefulStock) {
          target = this.town.bay;
          o.title = 'Load materials at the warehouse';
          o.sub = `${fmtDist(Math.hypot(v.x - target.x, v.z - target.z))} · stop on the yellow loading bay`;
        } else if (plot && !L.canWorkStage(s.plots[ai], s.plots[ai].stage)) {
          o.title = 'The warehouse needs more goods';
          o.sub = 'Bring them by train (see Missions).';
        } else if (plot) {
          target = plot.unload; o.title = `Work on Plot ${ai + 1}`; o.sub = 'Drive to the yellow ring';
        } else { o.title = 'Explore the countryside'; o.sub = 'Buy the next plot in the Garage to keep building.'; }
        if (inZone(this.town.bay) && stopped) {
          if (onTruck < 14 && MATERIALS.some((k) => s.warehouse[k] > 0 && k !== 'produce')) { action = 'Load the truck'; o.ready = true; }
          else if (onTruck > 0 && !plot) action = 'Return load to warehouse';
        }
      } else if (!real) {
        // free build: any unfinished plot's yellow ring starts building
        const near = this.town.plots.find((p, i) => !s.plots[i].done && inZone(p.unload));
        if (plot) { target = plot.unload; o.title = `Drive to Plot ${ai + 1} to build`; o.sub = `${fmtDist(Math.hypot(v.x - target.x, v.z - target.z))} · follow the yellow arrow`; }
        else { o.title = 'Explore the countryside'; o.sub = 'Visit the villages, river and level crossings.'; }
        if (near && stopped) { const i = this.town.plots.indexOf(near); action = `Build on Plot ${i + 1}`; o.ready = true; o.sub = 'Press the button to choose what to build'; }
        guide = action ? `This is a building plot, ${name}! Tap "${action}" to choose what to build.` : v.stuck ? `Stuck, ${name}? Tap Recover.` : `Drive with the arrow buttons, ${name}. The yellow arrow shows where to go.`;
      } else {
        if (plot && L.canWorkStage(s.plots[ai], s.plots[ai].stage)) { target = plot.unload; o.title = `Drive to Plot ${ai + 1} and start building`; o.sub = `${fmtDist(Math.hypot(v.x - target.x, v.z - target.z))}`; }
        else if (plot && s.unlocks.truck) { o.title = 'Fetch materials with the truck'; o.sub = 'Switch to the truck in the Garage panel.'; }
        else if (plot) { o.title = 'Explore Mitrapur and the villages'; o.sub = s.unlocks.truckOffer ? 'Buy the truck in the Garage to carry materials.' : 'More train deliveries unlock the truck.'; }
        else { o.title = 'Explore the countryside'; o.sub = 'Visit the villages, river and level crossings.'; }
      }
      // work on site from any vehicle (after unloading)
      if (real && !action && plot && inZone(plot.unload) && stopped && (this.mode !== 'truck' || onTruck === 0)) {
        action = `Work on Plot ${ai + 1}`; o.ready = true; o.sub = 'Press the button to start building';
      }
      // board the train from the station forecourt
      const fs = this.track.point(this.station('MTP').s, -26, 0);
      if (!action && Math.hypot(v.x - fs.x, v.z - fs.z) < 25 && stopped) action = 'Board the train';
      if (v.stuck) o.sub = 'Stuck? Press Recover to return to the road.';
      if (!guide) guide = action ? `Tap "${action}", ${name}.` : `${o.title}, ${name}!`;
    } else if (this.mode === 'build') {
      this.world.setStopZone(null);
      const i = this.construction.session?.i ?? 0;
      const ps = s.plots[i];
      o.title = `Plot ${i + 1}: ${ps.stage < STAGES.length ? STAGES[ps.stage].name : 'complete'}`;
      o.sub = `Stage ${Math.min(ps.stage + 1, STAGES.length)} of ${STAGES.length}`;
      const hint = document.querySelector('.bp-hint')?.textContent || '';
      guide = ps.stage >= STAGES.length ? `It looks wonderful, ${name}! Tap Home to build or drive something else.` : `${name}: ${hint}`;
    }
    this.guide = { who, text: guide };
    this.objective = o;
    this.actionLabel = action;
    this.guideTarget = target;
    this.ui.setAction(action, !this.busy);
  }

  doAction() {
    const a = this.actionLabel;
    if (!a || this.busy) return;
    const s = this.state;
    if (a === 'Move to the platform') {
      this.train.assist = true;
      this.ui.toast('Assist is driving you back to the platform.');
      this.audio.play('click');
      return;
    }
    if (a === 'Open the doors') {
      const st = this.nextPassengerStop();
      if (st && this.train.stopped && this.train.inStopZone(st)) this.startBoarding(st);
      return;
    }
    if (a.startsWith('Build on Plot')) {
      const i = Number(a.split(' ').pop()) - 1;
      this.ui.pick('build', { plot: i });
      return;
    }
    if (this.mode === 'train') {
      const obj = L.nextObjective(s);
      if (!obj) return;
      const st = this.station(obj.station);
      if (!this.train.stopped || !this.train.inStopZone(st)) return;
      if (obj.kind === 'load') this.trainLoad(st);
      else this.trainUnload(st);
      return;
    }
    if (a.startsWith('Unload at Plot')) {
      const i = L.activePlot(s);
      const moved = L.unloadTruckAtPlot(s, i);
      if (moved && Object.keys(moved).length) {
        setTruckCargo(this.truck.obj, s.vehicles.truckCargo);
        this.audio.play('thud'); this.audio.play('clank');
        this.ui.toast(`Unloaded ${goods(moved)} at Plot ${i + 1}.`, 'good');
        this.construction.refreshPlot(i);
        this.save();
      }
    } else if (a === 'Load the truck') {
      const i = L.activePlot(s);
      const sugg = i >= 0 ? L.suggestTruckLoad(s, i) : {};
      this.ui.truckLoadDialog(sugg, (req) => {
        const moved = L.loadTruck(s, req);
        if (Object.keys(moved).length) {
          setTruckCargo(this.truck.obj, s.vehicles.truckCargo);
          this.town.updateStock(s.warehouse);
          this.audio.play('thud'); setTimeout(() => this.audio.play('clank'), 250);
          this.ui.toast(`Loaded ${goods(moved)}.`, 'good');
          this.save();
        }
      });
    } else if (a === 'Return load to warehouse') {
      const moved = L.unloadTruckAtWarehouse(s);
      setTruckCargo(this.truck.obj, s.vehicles.truckCargo);
      this.town.updateStock(s.warehouse);
      this.ui.toast(`Returned ${goods(moved)} to the warehouse.`);
      this.save();
    } else if (a.startsWith('Work on Plot')) {
      this.enterBuild(L.activePlot(s));
    } else if (a === 'Board the train') {
      this.switchVehicle('train');
    }
  }

  trainLoad(st) {
    const got = L.doLoad(this.state, st.id);
    if (!got) return;
    this.save();
    this.audio.play('hiss');
    this.busy = { kind: 'load', t: 0, step: 0, cargo: this.state.trainCargo.slice(), msg: `Loaded ${goods(got)} at ${st.name}.` };
  }
  trainUnload(st) {
    const res = L.doUnload(this.state, st.id);
    if (!res) return;
    this.save();
    this.audio.play('hiss');
    this.busy = { kind: 'unload', t: 0, step: 0, res };
  }

  updateBusy(dt) {
    const b = this.busy;
    if (!b) return;
    b.t += dt;
    if (b.kind === 'board') {
      if (b.t < b.dur) return;
      const s = this.state, fare = this.train.def.fare || 10;
      const { boarded, alighted } = b.res;
      s.passenger.onboard = Math.max(0, s.passenger.onboard + boarded - alighted);
      s.passenger.served += alighted;
      s.passenger.lastStop = b.st.id;
      if (this.train.stopped) this.train.dir = 1; // ready to carry on forwards after backing up
      const earned = boarded * fare + alighted * 2;
      s.coins += earned;
      this.busy = null;
      this.audio.play('coin');
      this.ui.toast(`${boarded} got on, ${alighted} got off at ${b.st.name}. +${earned} coins!`, 'good');
      setTimeout(() => this.learn.offer(['passengers', 'alphabet', 'bigsmall', 'numbers', 'signal'], 'Station stop!'), 1500);
      this.save();
      return;
    }
    const per = 0.55;
    const wagons = this.train.cars.slice(1);
    while (b.step < wagons.length && b.t > 0.4 + b.step * per) {
      const w = wagons[b.step];
      if (b.kind === 'load') {
        const e = b.cargo[b.step];
        setWagonCargo(w, e ? e.type : null, e ? e.fill : 1);
        w.userData.cargo.position.y = 6;
        b.drop = b.drop || [];
        b.drop.push({ w, t: 0 });
      } else {
        b.lift = b.lift || [];
        b.lift.push({ w, t: 0 });
      }
      this.audio.play(b.kind === 'load' ? 'thud' : 'clank');
      b.step++;
    }
    for (const d of b.drop || []) { d.t += dt; const k = Math.min(1, d.t / 0.35); d.w.userData.cargo.position.y = 1.34 + (1 - k * k) * 4.7; }
    for (const d of b.lift || []) {
      d.t += dt; const k = Math.min(1, d.t / 0.4);
      d.w.userData.cargo.position.y = 1.34 + k * 5;
      if (k >= 1 && !d.done) { d.done = true; setWagonCargo(d.w, null); d.w.userData.cargo.position.y = 1.34; }
    }
    if (b.t > 0.4 + wagons.length * per + 0.5) {
      this.busy = null;
      if (this.train.stopped) this.train.dir = 1;
      for (const w of wagons) w.userData.cargo.position.y = 1.34;
      this.train.setCargo(this.state.trainCargo);
      if (b.kind === 'load') {
        const next = L.nextObjective(this.state);
        this.ui.toast(`${b.msg} Next: ${next.kind === 'load' ? 'go to ' + this.station(next.station).name : 'deliver to ' + this.station(next.station).name}.`, 'good');
        setTimeout(() => this.learn.offer(['colour', 'countload', 'memory'], 'Cargo time!'), 1500);
        this.audio.play('chime');
      } else {
        const r = b.res;
        this.town.updateStock(this.state.warehouse);
        this.audio.play('coin'); this.audio.play('fanfare');
        const lines = [`${goods(r.goods)} added to the Mitrapur warehouse.`, `+${r.coins} coins`];
        if (r.unlocked.includes('car')) { lines.push('NEW: You unlocked the car! Find it in the Garage panel.'); this.car.obj.visible = true; }
        if (r.unlocked.includes('truckOffer')) lines.push('NEW: A delivery truck is for sale in the Garage panel.');
        this.ui.celebrate(`Delivery complete: ${r.title}`, lines);
        this.ui.renderPanel();
      }
    }
  }

  // ---------------- input ----------------
  bindInput() {
    addEventListener('keydown', (e) => {
      if (document.getElementById('title').hidden === false) return;
      if (!document.getElementById('modal').hidden) return;
      if (!document.getElementById('overlay').hidden) return;
      if (!document.getElementById('learn').hidden) return;
      const k = e.code;
      if (e.target.closest && e.target.closest('#camMenu')) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k) && !(e.target.tagName === 'INPUT')) e.preventDefault();
      if (e.repeat) { this.keys.add(k); return; }
      this.keys.add(k);
      const m = this.mode;
      if (k === 'KeyC') { this.ui.toggleCamMenu(); return; }
      if (k === 'KeyO') { this.ui.setPanels(!this.ui.prefs.panelsOpen); return; }
      if (k === 'KeyU') { this.ui.setScenic(!this.ui.scenic); return; }
      if (k === 'KeyM') { this.ui.openTab('map'); return; }
      if (k === 'Escape') { if (this.ui.scenic) this.ui.setScenic(false); else if (this.ui.camMenuOpen) this.ui.toggleCamMenu(false); else if (this.ui.prefs.panelsOpen) this.ui.setPanels(false); else if (m === 'build') this.exitBuild(); else this.goHome(); return; }
      if (/^Digit[1-6]$/.test(k) && m !== 'build') {
        const views = m === 'train' ? TRAIN_VIEWS : VEHICLE_VIEWS;
        const v = views[+k.slice(5) - 1];
        if (v) { this.setView(v.id); this.ui.renderPanel(); }
        return;
      }
      if ((k === 'KeyE' || k === 'Enter') && m !== 'build') { if (e.target.tagName === 'BUTTON' && k === 'Enter') return; this.doAction(); return; }
      if (k === 'KeyH') this.setHorn(true);
      if (m === 'train') {
        if (k === 'KeyL') this.toggleLights();
        if (k === 'KeyP') this.toggleAssist();
        if (k === 'KeyR') this.toggleDirection();
      } else if (this.isDrive(m)) {
        if (k === 'KeyR') this.recoverVehicle();
      } else if (m === 'build') {
        if (k === 'Space') this.construction.onButton('grab', true);
      }
    });
    addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'KeyH') this.setHorn(false);
    });
    addEventListener('blur', () => { this.keys.clear(); this.setHorn(false); });
    // pointer: orbit + picking on the building site
    const cv = this.renderer.domElement;
    let down = null;
    const pointers = new Map();
    cv.addEventListener('pointerdown', (e) => { pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); down = { x: e.clientX, y: e.clientY, moved: 0 }; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', (e) => {
      const p = pointers.get(e.pointerId);
      if (!p || this.mode !== 'build') return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      if (pointers.size === 2) {
        const pts = [...pointers.values()];
        const before = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        p.x = e.clientX; p.y = e.clientY;
        const after = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        this.rig.orbit.dist = clamp(this.rig.orbit.dist * (before / Math.max(1, after)), 14, 110);
        if (down) down.moved += 20;
        return;
      }
      p.x = e.clientX; p.y = e.clientY;
      if (down) down.moved += Math.abs(dx) + Math.abs(dy);
      if (down && down.moved > 6) {
        this.rig.orbit.yaw -= dx * 0.006;
        this.rig.orbit.pitch = clamp(this.rig.orbit.pitch + dy * 0.004, 0.12, 1.4);
      }
    });
    const up = (e) => {
      pointers.delete(e.pointerId);
      if (this.mode === 'build' && down && down.moved <= 6) {
        const ndc = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
        const rc = new THREE.Raycaster();
        rc.setFromCamera(ndc, this.camera);
        this.construction.pick(rc);
      }
      down = null;
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', (e) => { pointers.delete(e.pointerId); down = null; });
    cv.addEventListener('wheel', (e) => { if (this.mode === 'build') { e.preventDefault(); this.rig.orbit.dist = clamp(this.rig.orbit.dist * (1 + Math.sign(e.deltaY) * 0.1), 14, 110); } }, { passive: false });
  }

  readControls(dt) {
    const k = (c) => this.keys.has(c);
    const inp = this.input;
    if (this.mode === 'train' && !this.train.assist) {
      let changed = false;
      if (k('KeyW') || k('ArrowUp')) { inp.throttle = Math.min(1, inp.throttle + dt * 0.5); changed = true; }
      if (k('KeyS') || k('ArrowDown')) { inp.throttle = Math.max(0, inp.throttle - dt * 0.7); changed = true; }
      if (changed) document.getElementById('throttle').value = Math.round(inp.throttle * 100);
    }
    const brake = inp.brakeHeld || (this.mode === 'train' && k('Space'));
    this.trainBrake = clamp((this.trainBrake || 0) + (brake ? dt * 2.5 : -dt * 3), 0, 1);
    // vehicle
    const steer = ((k('KeyA') || k('ArrowLeft') || inp.vSteerL) ? 1 : 0) - ((k('KeyD') || k('ArrowRight') || inp.vSteerR) ? 1 : 0);
    const fwd = ((k('KeyW') || k('ArrowUp') || inp.vGas) ? 1 : 0) - ((k('KeyS') || k('ArrowDown') || inp.vRev) ? 1 : 0);
    return { steer, fwd, brake: this.isDrive() && k('Space') };
  }

  // ---------------- frame ----------------
  frame() {
    const now = performance.now();
    let dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    const started = document.getElementById('title').hidden;
    const simDt = dt * (started ? this.settings.timeScale : 0.25);
    const vc = this.readControls(dt);
    // train always simulates; it parks when you are elsewhere
    let ctl;
    if (!started) ctl = { throttle: 0.55, brake: 0, assistTarget: null };
    else if (this.mode !== 'train' || this.busy || this.ui.overlayOpen() || this.learn.isOpen()) ctl = { throttle: 0, brake: 1, assistTarget: null };
    else ctl = { throttle: this.input.throttle, brake: this.trainBrake, assistTarget: this.train.targetStation ? this.station(this.train.targetStation) : null };
    const assistWas = this.train.assist;
    if (!started) this.train.assist = false;
    else if (this.mode !== 'train' || this.busy || this.ui.overlayOpen() || this.learn.isOpen()) this.train.assist = false;
    const steps = simDt > 0.05 ? 2 : 1;
    for (let i = 0; i < steps; i++) this.train.update(simDt / steps, ctl);
    this.train.assist = assistWas;
    this.train.updateSmoke(dt);
    this.passengers.update(dt, this.time, this.train);
    if (started) this.learn.tick(dt, !this.learn.isOpen() && !this.ui.overlayOpen());
    if (started) {
      this.updateBusy(dt);
      if (this.vehicle) this.vehicle.update(simDt, vc, this.train.obstacles());
      this.construction.update(dt, this.keys);
      this.computeObjective();
    }
    // guides
    const tgt = this.guideTarget;
    if (tgt && this.vehicle && started) {
      const gy = this.terrain.heightAt(tgt.x, tgt.z);
      this.beacon.visible = true;
      this.beacon.position.set(tgt.x, gy + 35, tgt.z);
      this.beacon.material.opacity = 0.18 + 0.1 * Math.sin(this.time * 3);
      const vp = this.vehicle.obj.position;
      this.arrow.visible = Math.hypot(tgt.x - vp.x, tgt.z - vp.z) > 14;
      this.arrow.position.set(vp.x, vp.y + (this.vehicle.kind === 'truck' ? 4.6 : 3.0), vp.z);
      this.arrow.lookAt(tgt.x, vp.y + 3, tgt.z);
    } else { this.beacon.visible = false; this.arrow.visible = false; }
    // camera
    if (!started) { this.rig.trainView = 'left'; }
    this.rig.update(dt, { train: this.train, vehicle: this.vehicle });
    // world
    const bells = this.world.update(dt, this.time, this.train, this.camera.position, this.drawDist);
    this.scenery.updateLOD(this.camera.position);
    // billboards (stock labels face the camera)
    for (const k in this.town.stockPiles) this.town.stockPiles[k].lbl.lookAt(this.camera.position);
    // sun follows the view for crisp shadows
    const focus = this.rig.target;
    this.sun.target.position.copy(focus);
    this.sun.position.copy(focus).addScaledVector(this.sunDir, 300);
    this.sky.position.copy(this.camera.position);
    if (started) {
      this.audio.update(dt, {
        camera: this.camera, mode: this.mode, train: this.train, trainPos: this.train.loco.position,
        vehicle: this.vehicle, machine: this.machineAudio, bells, groundY: this.terrain.heightAt(this.camera.position.x, this.camera.position.z),
      });
      this.uiTimer = (this.uiTimer || 0) - dt;
      if (this.uiTimer <= 0) { this.uiTimer = 0.1; this.ui.update(); }
      this.saveTimer += dt;
      if (this.saveTimer > 15) { this.saveTimer = 0; this.save(); }
    }
    this.renderer.render(this.scene, this.camera);
    if (this.fps) this.fps.tick(dt);
  }

  // ---------------- verification helpers (used for testing in the browser) ----------------
  async selfTest() {
    const { runTests } = await import('./tests.js');
    const r = runTests();
    const fails = r.filter((t) => !t.ok);
    console.log(`[selftest] rules: ${r.length - fails.length}/${r.length} passed`, fails);
    const sp = this.checkWagonSpacing();
    console.log('[selftest] wagon coupler gaps across the whole loop (m):', sp);
    window.selfTestResult = { rules: r, spacing: sp };
  }

  checkWagonSpacing() {
    const tr = this.train, saved = tr.headS;
    let min = Infinity, max = -Infinity, minR = Infinity;
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    for (let s = 0; s < this.track.L; s += 25) {
      tr.headS = s; tr.place();
      for (let i = 0; i < tr.cars.length - 1; i++) {
        const c1 = tr.cars[i], c2 = tr.cars[i + 1];
        c1.updateMatrixWorld(); c2.updateMatrixWorld();
        c1.localToWorld(a.set(0, 1.0, -c1.userData.length / 2));
        c2.localToWorld(b.set(0, 1.0, c2.userData.length / 2));
        const d = a.distanceTo(b);
        min = Math.min(min, d); max = Math.max(max, d);
      }
    }
    // tightest curve radius on the route
    const o1 = {}, o2 = {};
    for (let s = 0; s < this.track.L; s += 10) {
      this.track.sample(s, o1); this.track.sample(s + 20, o2);
      const da = Math.abs(Math.atan2(o1.tx * o2.tz - o1.tz * o2.tx, o1.tx * o2.tx + o1.tz * o2.tz));
      if (da > 1e-6) minR = Math.min(minR, 20 / da);
    }
    tr.headS = saved; tr.place();
    return { minGap: +min.toFixed(3), maxGap: +max.toFixed(3), tightestRadius: Math.round(minR), routeKm: +(this.track.L / 1000).toFixed(2) };
  }
}

const game = new Game();
window.game = game;
if (location.search.includes('fps')) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99;font:12px monospace;color:#fff;background:#0008;padding:3px 6px;border-radius:4px;pointer-events:none';
  document.body.appendChild(el);
  let acc = 0, n = 0;
  game.fps = { tick(dt) { acc += dt; n++; if (acc > 1) { el.textContent = `${Math.round(n / acc)} fps · ${game.renderer.info.render.calls} calls · ${Math.round(game.renderer.info.render.triangles / 1000)}k tris`; acc = 0; n = 0; } } };
}
game.boot().catch((e) => {
  console.error(e);
  const m = document.getElementById('loadMsg');
  if (m) m.textContent = `Sorry, the game could not start: ${e.message}`;
});
