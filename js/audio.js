// Procedural sound: everything is synthesised with Web Audio (no audio files). Created after a user gesture.
import * as THREE from 'three';

const RAGA = [0, 2, 4, 7, 9, 12, 14]; // Bhupali-like pentatonic (semitones from Sa)

export class GameAudio {
  constructor() { this.ready = false; this.musicVol = 0.5; this.sfxVol = 0.8; }

  init() {
    if (this.ready) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.connect(this.master);
    this.music = ctx.createGain(); this.music.connect(this.master);
    this.setVolumes(this.musicVol, this.sfxVol);
    // noise buffer
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; d[i] = w; }
    this.brown = ctx.createBuffer(1, len, ctx.sampleRate);
    const bd = this.brown.getChannelData(0);
    for (let i = 0; i < len; i++) { b = (b + 0.02 * (Math.random() * 2 - 1)) / 1.02; bd[i] = b * 3.5; }
    this.buildTrain();
    this.buildVehicle();
    this.buildMachines();
    this.buildAmbience();
    this.buildMusic();
    this.ready = true;
  }

  setVolumes(music, sfx) {
    this.musicVol = music; this.sfxVol = sfx;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.music.gain.setTargetAtTime(music * 0.5, t, 0.1);
    this.sfx.gain.setTargetAtTime(sfx, t, 0.1);
  }

  noiseSrc(brown = false) {
    const s = this.ctx.createBufferSource();
    s.buffer = brown ? this.brown : this.noise;
    s.loop = true;
    s.start(0, Math.random());
    return s;
  }
  osc(type, f) { const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = f; o.start(); return o; }
  gain(v = 0) { const g = this.ctx.createGain(); g.gain.value = v; return g; }
  filt(type, f, q = 1) { const x = this.ctx.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = q; return x; }
  panner(ref = 25) {
    const p = this.ctx.createPanner();
    p.panningModel = 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = ref; p.rolloffFactor = 0.9; p.maxDistance = 3000;
    return p;
  }
  setPos(node, v) {
    if (node.positionX) { node.positionX.value = v.x; node.positionY.value = v.y; node.positionZ.value = v.z; } else node.setPosition(v.x, v.y, v.z);
  }

  buildTrain() {
    const c = this.ctx;
    this.trainPan = this.panner(30);
    this.trainBus = this.gain(0);
    this.trainBus.connect(this.trainPan); this.trainPan.connect(this.sfx);
    // transformer hum
    const hum = this.gain(0.05);
    const h1 = this.osc('sine', 100), h2 = this.osc('triangle', 200);
    const hf = this.filt('lowpass', 500);
    h1.connect(hum); h2.connect(hf); hf.connect(hum);
    hum.connect(this.trainBus);
    // traction motor whine
    this.motor = this.osc('sawtooth', 60);
    this.motor2 = this.osc('square', 120);
    this.motorF = this.filt('bandpass', 400, 3);
    this.motorG = this.gain(0);
    this.motor.connect(this.motorF); this.motor2.connect(this.motorF); this.motorF.connect(this.motorG); this.motorG.connect(this.trainBus);
    // blowers
    this.blowG = this.gain(0.02);
    const bn = this.noiseSrc(); const bf = this.filt('bandpass', 900, 0.8);
    bn.connect(bf); bf.connect(this.blowG); this.blowG.connect(this.trainBus);
    // rolling rumble
    this.rollG = this.gain(0);
    const rn = this.noiseSrc(true); const rf = this.filt('lowpass', 220);
    rn.connect(rf); rf.connect(this.rollG); this.rollG.connect(this.trainBus);
    // brake squeal
    this.squealG = this.gain(0);
    const sq = this.osc('sine', 2900); const sqv = this.osc('sine', 7); const sqvg = this.gain(60);
    sqv.connect(sqvg); sqvg.connect(sq.frequency);
    const sn = this.noiseSrc(); const sf = this.filt('bandpass', 3200, 6);
    sq.connect(this.squealG); sn.connect(sf); sf.connect(this.squealG);
    this.squealG.connect(this.trainBus);
    // horn
    this.hornG = this.gain(0);
    const hf2 = this.filt('lowpass', 2200);
    for (const f of [311, 392, 466]) { const o = this.osc('sawtooth', f); o.connect(hf2); }
    hf2.connect(this.hornG); this.hornG.connect(this.trainPan);
    this.clackDist = 0;
  }

  buildVehicle() {
    this.vehBus = this.gain(0);
    this.vehBus.connect(this.sfx);
    this.eng1 = this.osc('sawtooth', 40); this.eng2 = this.osc('square', 80);
    this.engF = this.filt('lowpass', 400, 2);
    this.eng1.connect(this.engF); this.eng2.connect(this.engF);
    this.engG = this.gain(0.0);
    this.engF.connect(this.engG); this.engG.connect(this.vehBus);
    this.vBrakeG = this.gain(0);
    const n = this.noiseSrc(); const f = this.filt('bandpass', 2600, 5);
    n.connect(f); f.connect(this.vBrakeG); this.vBrakeG.connect(this.vehBus);
    this.cHornG = this.gain(0);
    const hf = this.filt('lowpass', 3000);
    this.cHorn1 = this.osc('square', 420); this.cHorn2 = this.osc('square', 525);
    this.cHorn1.connect(hf); this.cHorn2.connect(hf); hf.connect(this.cHornG); this.cHornG.connect(this.sfx);
  }

  buildMachines() {
    this.hydG = this.gain(0);
    const h = this.osc('sawtooth', 75); const hn = this.noiseSrc(); const hf = this.filt('bandpass', 1400, 2);
    const hl = this.filt('lowpass', 600);
    h.connect(hl); hl.connect(this.hydG); hn.connect(hf); hf.connect(this.hydG);
    this.hydG.connect(this.sfx);
    this.idleG = this.gain(0);
    const io = this.osc('sawtooth', 32); const il = this.filt('lowpass', 180);
    io.connect(il); il.connect(this.idleG); this.idleG.connect(this.sfx);
    this.craneG = this.gain(0);
    const co = this.osc('square', 55); const cl = this.filt('lowpass', 350);
    co.connect(cl); cl.connect(this.craneG); this.craneG.connect(this.sfx);
    this.pourG = this.gain(0);
    const pn = this.noiseSrc(true); const pl = this.filt('lowpass', 500);
    pn.connect(pl); pl.connect(this.pourG); this.pourG.connect(this.sfx);
    this.sprayG = this.gain(0);
    const sn = this.noiseSrc(); const sh = this.filt('highpass', 4000);
    sn.connect(sh); sh.connect(this.sprayG); this.sprayG.connect(this.sfx);
  }

  buildAmbience() {
    this.windG = this.gain(0.05);
    const wn = this.noiseSrc(true); const wf = this.filt('lowpass', 500);
    const lfo = this.osc('sine', 0.08); const lg = this.gain(250);
    lfo.connect(lg); lg.connect(wf.frequency);
    wn.connect(wf); wf.connect(this.windG); this.windG.connect(this.sfx);
    this.birdTimer = 2;
    this.bellTimer = 0;
  }

  buildMusic() {
    // soft tanpura-like drone
    const sa = 146.83;
    this.drone = [];
    const lp = this.filt('lowpass', 900);
    lp.connect(this.music);
    [sa * 1.5 / 2, sa, sa, sa / 2].forEach((f, i) => {
      const o = this.osc('sawtooth', f * (1 + (Math.random() - 0.5) * 0.002));
      const g = this.gain(0);
      o.connect(g); g.connect(lp);
      this.drone.push(g);
    });
    this.droneIdx = 0; this.droneTimer = 0;
    this.melodyTimer = 3; this.sa = sa * 2;
  }

  pluck(g, t) {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.008, t + 2.2);
  }

  flute(freq, t, dur) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
    const v = c.createOscillator(); v.frequency.value = 5.5; const vg = c.createGain(); vg.gain.value = freq * 0.008;
    v.connect(vg); vg.connect(o.frequency);
    const breath = c.createBufferSource(); breath.buffer = this.noise; const bf = this.filt('bandpass', freq * 2, 8); const bg = this.gain(0.012);
    breath.connect(bf); bf.connect(bg);
    const g = c.createGain(); g.gain.value = 0;
    o.connect(g); bg.connect(g); g.connect(this.music);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.06, t + 0.12); g.gain.setValueAtTime(0.06, t + dur * 0.7); g.gain.linearRampToValueAtTime(0, t + dur);
    o.start(t); v.start(t); breath.start(t);
    o.stop(t + dur + 0.05); v.stop(t + dur + 0.05); breath.stop(t + dur + 0.05);
  }

  // ---------- one-shots ----------
  env(src, peak, attack, decay, dest = this.sfx, t = this.ctx.currentTime) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    src.connect(g); g.connect(dest);
    return g;
  }
  burst(freq, q, peak, decay, dest, t) {
    const n = this.ctx.createBufferSource(); n.buffer = this.noise;
    const f = this.filt('bandpass', freq, q);
    n.connect(f);
    this.env(f, peak, 0.003, decay, dest, t);
    n.start(t, Math.random()); n.stop(t + decay + 0.05);
  }
  tone(freq, type, peak, decay, dest = this.sfx, t = this.ctx.currentTime, slideTo = null) {
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + decay);
    this.env(o, peak, 0.005, decay, dest, t);
    o.start(t); o.stop(t + decay + 0.05);
  }
  clack(t, vol) {
    this.burst(2200, 2, 0.22 * vol, 0.05, this.trainBus, t);
    this.tone(110, 'sine', 0.25 * vol, 0.08, this.trainBus, t, 60);
  }
  play(name) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    switch (name) {
      case 'thud': this.tone(90, 'sine', 0.5, 0.25, this.sfx, t, 45); this.burst(400, 1, 0.2, 0.15, this.sfx, t); break;
      case 'clank': [520, 830, 1290, 1710].forEach((f, i) => this.tone(f, 'triangle', 0.08 / (i + 1), 0.4 + i * 0.1, this.sfx, t)); this.burst(3000, 3, 0.1, 0.08, this.sfx, t); break;
      case 'chime': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 'sine', 0.12, 0.6, this.sfx, t + i * 0.11)); break;
      case 'coin': this.tone(988, 'square', 0.06, 0.08, this.sfx, t); this.tone(1319, 'square', 0.06, 0.3, this.sfx, t + 0.08); break;
      case 'click': this.tone(1400, 'square', 0.05, 0.03, this.sfx, t); break;
      case 'snap': this.tone(300, 'square', 0.12, 0.06, this.sfx, t, 150); this.burst(2500, 2, 0.15, 0.05, this.sfx, t); break;
      case 'bump': this.tone(70, 'sine', 0.6, 0.3, this.sfx, t, 40); this.burst(800, 1, 0.25, 0.2, this.sfx, t); break;
      case 'hiss': this.burst(5000, 0.5, 0.25, 0.9, this.trainBus || this.sfx, t); break;
      case 'rustle': for (let i = 0; i < 5; i++) this.burst(3000 + Math.random() * 2000, 1, 0.1, 0.12, this.sfx, t + i * 0.06); break;
      case 'dig': this.burst(300, 0.7, 0.4, 0.4, this.sfx, t); this.tone(60, 'sine', 0.3, 0.3, this.sfx, t); break;
      case 'error': this.tone(220, 'square', 0.06, 0.15, this.sfx, t); this.tone(180, 'square', 0.06, 0.2, this.sfx, t + 0.12); break;
      case 'fanfare': [523, 659, 784, 1046, 784, 1046].forEach((f, i) => this.tone(f, 'triangle', 0.14, 0.35, this.sfx, t + i * 0.13)); break;
    }
  }

  setHorn(on) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.hornG.gain.setTargetAtTime(on ? 0.22 : 0, t, on ? 0.03 : 0.12);
  }
  setCarHorn(on) {
    if (!this.ready) return;
    this.cHornG.gain.setTargetAtTime(on ? 0.07 : 0, this.ctx.currentTime, 0.02);
  }

  // per-frame update
  update(dt, s) {
    if (!this.ready) return;
    const c = this.ctx, t = c.currentTime;
    const L = c.listener;
    const cam = s.camera;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    if (L.positionX) {
      L.positionX.value = cam.position.x; L.positionY.value = cam.position.y; L.positionZ.value = cam.position.z;
      L.forwardX.value = fwd.x; L.forwardY.value = fwd.y; L.forwardZ.value = fwd.z;
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else { L.setPosition(cam.position.x, cam.position.y, cam.position.z); L.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0); }
    // train
    const tr = s.train;
    this.setPos(this.trainPan, s.trainPos);
    const trainActive = s.mode === 'train' ? 1 : 0.6;
    this.trainBus.gain.setTargetAtTime(trainActive, t, 0.3);
    const v = tr.speed;
    this.motor.frequency.setTargetAtTime(45 + v * 26, t, 0.1);
    this.motor2.frequency.setTargetAtTime(90 + v * 52, t, 0.1);
    this.motorF.frequency.setTargetAtTime(300 + v * 60 + tr.throttle * 400, t, 0.1);
    this.motorG.gain.setTargetAtTime(0.02 + tr.throttle * 0.07 + Math.min(1, v / 20) * 0.03, t, 0.15);
    this.blowG.gain.setTargetAtTime(0.02 + tr.throttle * 0.05, t, 0.3);
    this.rollG.gain.setTargetAtTime(Math.min(1, v / 15) * 0.22, t, 0.2);
    const squeal = tr.brake > 0.1 && v > 0.3 && v < 12 ? tr.brake * Math.min(1, v / 2) * 0.05 : 0;
    this.squealG.gain.setTargetAtTime(squeal, t, 0.1);
    if (tr.brake > 0.5 && !this._brakeWas && v > 1) this.play('hiss');
    this._brakeWas = tr.brake > 0.5;
    // wheel-on-rail rhythm: every rail joint (13 m) the bogies pass in sequence
    this.clackDist += v * dt;
    if (this.clackDist >= 13 && v > 0.5) {
      this.clackDist -= 13;
      const vol = Math.min(1, v / 12);
      const axles = [0.9, 2.8, 4.7, 10.6, 12.5, 14.4, 21.6, 23.6, 27.9, 29.9];
      axles.forEach((a, i) => this.clack(t + a / v, vol * (1 - i * 0.06)));
    }
    // vehicle
    const vh = s.vehicle;
    const inVeh = s.mode === 'car' || s.mode === 'truck';
    this.vehBus.gain.setTargetAtTime(inVeh ? 1 : 0, t, 0.2);
    if (inVeh && vh) {
      const truck = s.mode === 'truck';
      const rpm = Math.min(1, Math.abs(vh.speed) / (truck ? 14 : 19)) * 0.7 + vh.throttle * 0.3;
      const base = truck ? 28 : 45, span = truck ? 55 : 120;
      this.eng1.frequency.setTargetAtTime(base + rpm * span, t, 0.08);
      this.eng2.frequency.setTargetAtTime((base + rpm * span) * 2, t, 0.08);
      this.engF.frequency.setTargetAtTime((truck ? 250 : 400) + rpm * 900, t, 0.1);
      this.engG.gain.setTargetAtTime((truck ? 0.08 : 0.05) + vh.throttle * 0.06, t, 0.1);
      this.vBrakeG.gain.setTargetAtTime(vh.braking && Math.abs(vh.speed) > 2 ? 0.03 : 0, t, 0.05);
    }
    // machines
    const m = s.machine || {};
    this.hydG.gain.setTargetAtTime((m.hyd || 0) * 0.08, t, 0.08);
    this.idleG.gain.setTargetAtTime(m.idle ? 0.06 : 0, t, 0.3);
    this.craneG.gain.setTargetAtTime((m.crane || 0) * 0.06, t, 0.08);
    this.pourG.gain.setTargetAtTime(m.pour ? 0.25 : 0, t, 0.1);
    this.sprayG.gain.setTargetAtTime(m.spray ? 0.05 : 0, t, 0.03);
    // ambience: wind stronger when high up, birds near trees
    this.windG.gain.setTargetAtTime(0.03 + Math.min(0.08, Math.max(0, cam.position.y - s.groundY) / 1500), t, 0.5);
    this.birdTimer -= dt;
    if (this.birdTimer < 0) {
      this.birdTimer = 1.5 + Math.random() * 4;
      if (cam.position.y - s.groundY < 120) this.bird(cam.position);
    }
    // crossing bells
    this.bellTimer -= dt;
    if (this.bellTimer < 0 && s.bells && s.bells.length) {
      this.bellTimer = 0.55;
      for (const b of s.bells) {
        if (b.pos.distanceTo(cam.position) > 700) continue;
        const p = this.panner(20);
        this.setPos(p, b.pos);
        p.connect(this.sfx);
        const o = c.createOscillator(); o.frequency.value = 1250; o.type = 'triangle';
        this.env(o, 0.25, 0.002, 0.4, p, t);
        o.start(t); o.stop(t + 0.5);
      }
    }
    // music
    this.droneTimer -= dt;
    if (this.droneTimer < 0) {
      this.droneTimer = 0.9;
      this.pluck(this.drone[this.droneIdx], t);
      this.droneIdx = (this.droneIdx + 1) % this.drone.length;
    }
    this.melodyTimer -= dt;
    if (this.melodyTimer < 0) {
      this.melodyTimer = 5 + Math.random() * 7;
      let n = Math.floor(Math.random() * 4);
      const notes = 3 + Math.floor(Math.random() * 4);
      let tt = t;
      for (let i = 0; i < notes; i++) {
        n = Math.max(0, Math.min(RAGA.length - 1, n + Math.floor(Math.random() * 3) - 1));
        const d = 0.4 + Math.random() * 0.6;
        this.flute(this.sa * Math.pow(2, RAGA[n] / 12), tt, d);
        tt += d;
      }
    }
  }

  bird(near) {
    const c = this.ctx, t = c.currentTime;
    const p = this.panner(15);
    this.setPos(p, { x: near.x + (Math.random() - 0.5) * 80, y: near.y + 5, z: near.z + (Math.random() - 0.5) * 80 });
    p.connect(this.sfx);
    const n = 2 + Math.floor(Math.random() * 4);
    const f0 = 2200 + Math.random() * 1800;
    for (let i = 0; i < n; i++) this.tone(f0, 'sine', 0.05, 0.09, p, t + i * 0.13, f0 * (1.2 + Math.random() * 0.4));
  }
}
