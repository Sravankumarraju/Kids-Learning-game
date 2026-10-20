// Shared realistic assets: CC0 PBR textures, HDR sky lighting and glTF props from Poly Haven (see assets/CREDITS.md).
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const BASE = './assets/';
const texLoader = new THREE.TextureLoader();
const cache = new Map();
const gltfCache = new Map();
let maxAniso = 4;

export const Assets = {
  ready: false,
  quality: 'medium',

  init(renderer, quality) {
    maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    this.renderer = renderer;
    this.quality = quality;
  },

  // one texture map, cached and shared; colour maps are sRGB
  tex(name, map = 'diff', repeat = [1, 1]) {
    const key = `${name}_${map}:${repeat.join('x')}`;
    if (cache.has(key)) return cache.get(key);
    const base = this._base(name, map);
    const t = base.clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
    t.needsUpdate = true;
    // clones share the image; refresh them when it arrives
    base.userData.clones.push(t);
    cache.set(key, t);
    return t;
  },
  _base(name, map) {
    const key = `base:${name}_${map}`;
    if (cache.has(key)) return cache.get(key);
    const t = texLoader.load(`${BASE}tex/${name}_${map}.jpg`, (tx) => { for (const c of tx.userData.clones) { c.image = tx.image; c.needsUpdate = true; } });
    t.userData.clones = [];
    t.colorSpace = map === 'diff' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = maxAniso;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    cache.set(key, t);
    return t;
  },

  // a PBR material from a texture set; normal + roughness maps skipped on "low"
  material(name, opts = {}) {
    const rep = opts.repeat || [1, 1];
    const p = {
      map: this.tex(name, 'diff', rep),
      color: opts.color != null ? new THREE.Color(opts.color) : new THREE.Color(0xffffff),
      roughness: opts.roughness ?? 1,
      metalness: opts.metalness ?? 0,
      side: opts.side ?? THREE.FrontSide,
    };
    if (this.quality !== 'low') {
      p.normalMap = this.tex(name, 'nor', rep);
      p.normalScale = new THREE.Vector2(opts.normal ?? 1, opts.normal ?? 1);
      p.roughnessMap = this.tex(name, 'rough', rep);
    }
    if (opts.vertexColors) p.vertexColors = true;
    if (opts.transparent) { p.transparent = true; p.opacity = opts.opacity ?? 1; }
    return new THREE.MeshStandardMaterial(p);
  },

  // HDR sky used for both reflections/lighting and the visible background
  async loadSky(scene) {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const hdr = await new RGBELoader().loadAsync(`${BASE}sky/sky_day.hdr`);
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    const env = pmrem.fromEquirectangular(hdr).texture;
    scene.environment = env;
    scene.background = hdr;
    scene.backgroundBlurriness = 0;
    pmrem.dispose();
    this.sky = hdr;
    return env;
  },

  // a glTF prop, loaded once, returned as a fresh clone each time
  async model(id, scale = 1) {
    if (!gltfCache.has(id)) {
      gltfCache.set(id, new GLTFLoader().loadAsync(`${BASE}models/${id}/${id}.gltf`).then((g) => {
        g.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        return g.scene;
      }));
    }
    const src = await gltfCache.get(id);
    const c = src.clone(true);
    c.scale.setScalar(scale);
    return c;
  },
};
