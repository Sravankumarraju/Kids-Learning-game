// Day and night: HDR sky lighting by day, a moonlit sky at night, a moving sun and an in-game clock.
import * as THREE from 'three';
import { Assets } from './assets.js';
import { clamp, smoothstep, lerp } from './util.js';

export const TIME_MODES = [
  { id: 'cycle', label: 'Day and night cycle' },
  { id: 'day', label: 'Always day' },
  { id: 'sunset', label: 'Always sunset' },
  { id: 'night', label: 'Always night' },
];
const FIXED = { day: 10.5, sunset: 18.1, night: 22 };

export class DayNight {
  constructor(game) {
    this.game = game;
    this.hour = 8.5; // in-game clock, 0..24
    this.minutesPerHour = 1; // one real minute is one game hour
    this.mode = 'cycle';
    this.light = 1;
    this.lamps = []; // emissive materials that glow after dark
  }

  async load() {
    const { scene, renderer } = this.game;
    try {
      this.dayEnv = await Assets.loadSky(scene);
      this.dayBg = scene.background;
    } catch (e) {
      console.warn('sky failed to load, keeping the painted sky', e);
      return;
    }
    if (this.game.sky) this.game.sky.visible = false;
    // a dark blue environment for night reflections
    const night = new THREE.Scene();
    night.add(new THREE.Mesh(new THREE.SphereGeometry(10, 16, 8), new THREE.MeshBasicMaterial({ color: 0x0b1326, side: THREE.BackSide })));
    const moon = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 8), new THREE.MeshBasicMaterial({ color: 0x9fb4d8 }));
    moon.position.set(4, 6, -5);
    night.add(moon);
    const pm = new THREE.PMREMGenerator(renderer);
    this.nightEnv = pm.fromScene(night, 0.04).texture;
    pm.dispose();
    this.nightBg = new THREE.Color(0x0a1224);
  }

  addLamp(material, intensity = 2.5) { this.lamps.push({ m: material, i: intensity }); }

  get clockText() {
    const h = Math.floor(this.hour), m = Math.floor((this.hour - h) * 60 / 10) * 10;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  get isNight() { return this.light < 0.35; }

  update(dt) {
    const g = this.game;
    if (this.mode === 'cycle') this.hour = (this.hour + dt / (60 * this.minutesPerHour)) % 24;
    else this.hour = lerp(this.hour, FIXED[this.mode], Math.min(1, dt * 2));
    // sun height: rises 6:00, highest 12:00, sets 18:30
    const t = ((this.hour - 6) / 12.5) * Math.PI;
    const elev = Math.sin(t);
    const light = smoothstep(-0.12, 0.3, elev);
    this.light = light;
    const az = t * 0.9 - 0.4;
    g.sunDir.set(Math.cos(az) * 0.8, Math.max(0.08, elev), Math.sin(az) * 0.6 + 0.3).normalize();
    // warm light near sunrise and sunset, cool moonlight at night
    const warm = 1 - smoothstep(0.05, 0.45, elev);
    g.sun.color.setRGB(1, lerp(0.95, 0.68, warm), lerp(0.86, 0.48, warm));
    g.sun.intensity = lerp(0.25, 2.8, light);
    if (light < 0.2) g.sun.color.setRGB(0.6, 0.7, 1.0);
    g.hemi.intensity = lerp(0.18, 0.9, light);
    g.hemi.color.setRGB(lerp(0.35, 0.84, light), lerp(0.42, 0.91, light), lerp(0.62, 1, light));
    g.renderer.toneMappingExposure = lerp(0.55, 1.0, light);
    const sc = g.scene;
    if (this.dayEnv) {
      const night = light < 0.3;
      if (night && sc.environment !== this.nightEnv) { sc.environment = this.nightEnv; sc.background = this.nightBg; }
      if (!night && sc.environment !== this.dayEnv) { sc.environment = this.dayEnv; sc.background = this.dayBg; }
      sc.backgroundIntensity = lerp(0.35, 1, smoothstep(0.3, 0.8, light));
    }
    if (sc.fog) sc.fog.color.setRGB(lerp(0.05, 0.62, light) + warm * 0.1 * light, lerp(0.07, 0.7, light), lerp(0.14, 0.8, light));
    const glow = 1 - smoothstep(0.25, 0.5, light);
    for (const l of this.lamps) l.m.emissiveIntensity = l.i * glow;
  }
}
