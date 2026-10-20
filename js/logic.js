// Pure game rules shared by every system: missions, inventory, rewards, unlocks, construction, saving.
// No DOM / Three.js here so the rules can be unit-tested (see tests.js).
import { STORY_MISSIONS, SUPPLY_TEMPLATES, MATERIALS, STAGES, HOUSE_REWARD, TRUCK_PRICE, PLOT_PRICES, TRUCK_CAPACITY, STATIONS, STAGE_COLUMNS, STAGE_ROOF, PLOT_COUNT } from './data.js';

export const SAVE_VERSION = 4;
export const SAVE_KEY = 'bmt-save';
export const WAGONS = 6;

const emptyInv = () => Object.fromEntries(MATERIALS.map((m) => [m, 0]));

export function newState() {
  return {
    version: SAVE_VERSION,
    coins: 50,
    warehouse: emptyInv(),
    unlocks: { car: true, truck: true, truckOffer: true },
    player: { name: '' },
    choice: { train: { type: 'goods', livery: 0, cars: 6 }, vehicle: { type: 'car', color: 1 } },
    rules: { realMaterials: false },
    passenger: { onboard: 0, served: 0, lastStop: null },
    learn: { age: '', levels: {}, stats: {}, seen: { letters: {}, numbers: {}, colours: {}, shapes: {} }, minutes: {}, play: {}, speak: true, offers: true, breakMin: null, lastOffer: 0 },
    learn: { age: '', levels: {}, stats: {}, seen: { letters: {}, numbers: {}, colours: {}, shapes: {} }, minutes: {}, play: {}, speak: true, offers: true, breakMin: null, lastOffer: 0 },
    missions: { completed: [], active: null, supplyCounter: 0, board: [] },
    trainCargo: new Array(WAGONS).fill(null),
    train: { s: 60, dir: 1, lights: true, assist: false },
    vehicles: { car: null, truck: null, truckCargo: emptyInv() },
    plots: newPlots(),
    housesBuilt: 0,
    mode: 'train',
    stats: { deliveries: 0, distanceKm: 0 },
    log: [],
  };
}

// one plot per building project; each opens when the one before it is finished
function newPlots() {
  return Array.from({ length: PLOT_COUNT }, (_, i) => ({ unlocked: i === 0, stage: 0, floor: 0, site: emptyInv(), progress: {}, quality: [], colors: null, done: false, design: null }));
}
export function unlockPlots(s) {
  s.plots.forEach((p, i) => { p.unlocked = i === 0 || !!s.plots[i - 1].done || p.stage > 0 || p.done; });
}

// Merge a loaded save onto defaults so new fields added in updates keep old progress.
export function migrate(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.version !== 'number') return newState();
  const base = newState();
  const s = deepMerge(base, raw);
  if (raw.version < 2) {
    // v1 stored truck cargo on vehicles.truck.cargo
    if (raw.vehicles?.truck?.cargo) s.vehicles.truckCargo = { ...emptyInv(), ...raw.vehicles.truck.cargo };
  }
  // sanitise numbers so a damaged save can never produce negative stock
  for (const inv of [s.warehouse, s.vehicles.truckCargo, ...s.plots.map((p) => p.site)]) {
    for (const k of MATERIALS) inv[k] = Math.max(0, Math.floor(Number(inv[k]) || 0));
  }
  s.coins = Math.max(0, Math.floor(Number(s.coins) || 0));
  // vehicles are always available
  s.unlocks = { car: true, truck: true, truckOffer: true };
  if (raw.version < 4) {
    // the construction site changed from 8 to 12 stages: finished buildings stay finished, started ones restart
    s.plots = newPlots().map((fresh, i) => {
      const old = (raw.plots || [])[i];
      if (old && old.done) return { ...fresh, done: true, stage: STAGES.length, colors: old.colors || null };
      return fresh;
    });
  }
  while (s.plots.length < PLOT_COUNT) s.plots.push(newPlots()[0]);
  unlockPlots(s);
  s.missions.completed = [...new Set(s.missions.completed)];
  s.version = SAVE_VERSION;
  return s;
}
function deepMerge(a, b) {
  if (Array.isArray(a)) {
    if (!Array.isArray(b)) return a;
    if (a.length && typeof a[0] === 'object' && a[0] !== null) return a.map((x, i) => (b[i] !== undefined ? deepMerge(x, b[i]) : x));
    return b.slice();
  }
  if (a && typeof a === 'object') {
    if (!b || typeof b !== 'object') return a;
    const out = { ...a };
    for (const k in b) out[k] = k in a ? deepMerge(a[k], b[k]) : b[k];
    return out;
  }
  return b === undefined ? a : b;
}

export function save(state, storage = globalThis.localStorage) {
  try { storage.setItem(SAVE_KEY, JSON.stringify(state)); return true; } catch { return false; }
}
export function load(storage = globalThis.localStorage) {
  try {
    const t = storage.getItem(SAVE_KEY);
    if (!t) return null;
    return migrate(JSON.parse(t));
  } catch { return null; }
}
export function hasSave(storage = globalThis.localStorage) {
  try { return !!storage.getItem(SAVE_KEY); } catch { return false; }
}
export function clearSave(storage = globalThis.localStorage) {
  try { storage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}

// ---------------- missions ----------------
export function stationName(id) { return STATIONS.find((s) => s.id === id)?.name || id; }

export function missionDef(state, id) {
  return STORY_MISSIONS.find((m) => m.id === id) || state.missions.board.find((m) => m.id === id) || null;
}

export function refreshBoard(state) {
  const storyDone = STORY_MISSIONS.filter((m) => state.missions.completed.includes(m.id)).length;
  if (storyDone < 3) return;
  while (state.missions.board.length < 3) {
    const n = state.missions.supplyCounter++;
    const t = SUPPLY_TEMPLATES[n % SUPPLY_TEMPLATES.length];
    const loadNames = Object.keys(t.load).map((k) => k).join(' & ');
    state.missions.board.push({ id: `s${n}`, title: `Supply run: ${loadNames} from ${stationName(t.st)}`, desc: `Pick up ${loadNames} at ${stationName(t.st)} and bring it to Mitrapur.`, stops: [{ st: t.st, load: { ...t.load } }], dest: 'MTP', coins: t.coins, supply: true });
  }
}

export function availableMissions(state) {
  const out = [];
  const nextStory = STORY_MISSIONS.find((m) => !state.missions.completed.includes(m.id));
  if (nextStory) out.push(nextStory);
  for (const m of state.missions.board) if (!state.missions.completed.includes(m.id)) out.push(m);
  return out;
}

export function startMission(state, id) {
  const a = state.missions.active;
  if (a && Object.keys(a.loaded).some((k) => a.loaded[k] > 0)) return { ok: false, msg: 'Deliver the cargo on your train first.' };
  if (state.missions.completed.includes(id)) return { ok: false, msg: 'Already completed.' };
  const def = missionDef(state, id);
  if (!def || !availableMissions(state).some((m) => m.id === id)) return { ok: false, msg: 'Mission not available yet.' };
  state.missions.active = { id, stopIdx: 0, loaded: {} };
  return { ok: true };
}

// what the train should do next for the active mission
export function nextObjective(state) {
  const a = state.missions.active;
  if (!a) return null;
  const def = missionDef(state, a.id);
  if (!def) return null;
  if (a.stopIdx < def.stops.length) {
    const stop = def.stops[a.stopIdx];
    return { kind: 'load', station: stop.st, load: stop.load, def };
  }
  return { kind: 'unload', station: def.dest, def };
}

export function canLoadAt(state, stationId) {
  const o = nextObjective(state);
  return !!o && o.kind === 'load' && o.station === stationId;
}
export function canUnloadAt(state, stationId) {
  const o = nextObjective(state);
  return !!o && o.kind === 'unload' && o.station === stationId;
}

export function doLoad(state, stationId) {
  if (!canLoadAt(state, stationId)) return null;
  const a = state.missions.active;
  const def = missionDef(state, a.id);
  const stop = def.stops[a.stopIdx];
  for (const k in stop.load) a.loaded[k] = (a.loaded[k] || 0) + stop.load[k];
  a.stopIdx++;
  state.trainCargo = distributeCargo(a.loaded);
  return { ...stop.load };
}

// Completes the mission: credits warehouse + coins exactly once.
export function doUnload(state, stationId) {
  if (!canUnloadAt(state, stationId)) return null;
  const a = state.missions.active;
  const def = missionDef(state, a.id);
  if (state.missions.completed.includes(a.id)) { state.missions.active = null; return null; }
  state.missions.completed.push(a.id);
  for (const k in a.loaded) state.warehouse[k] = (state.warehouse[k] || 0) + Math.max(0, a.loaded[k]);
  state.coins += def.coins;
  state.stats.deliveries++;
  const res = { id: a.id, title: def.title, goods: { ...a.loaded }, coins: def.coins, unlocked: [] };
  if (def.unlock === 'car' && !state.unlocks.car) { state.unlocks.car = true; res.unlocked.push('car'); }
  if (def.unlock === 'truckOffer' && !state.unlocks.truckOffer) { state.unlocks.truckOffer = true; res.unlocked.push('truckOffer'); }
  state.missions.active = null;
  state.trainCargo = new Array(WAGONS).fill(null);
  if (def.supply) state.missions.board = state.missions.board.filter((m) => m.id !== def.id);
  refreshBoard(state);
  return res;
}

export function distributeCargo(load) {
  const types = Object.keys(load).filter((k) => load[k] > 0);
  const total = types.reduce((s, k) => s + load[k], 0);
  const out = new Array(WAGONS).fill(null);
  if (!total) return out;
  const alloc = types.map((t) => ({ t, n: Math.max(1, Math.round((load[t] / total) * WAGONS)) }));
  let sum = alloc.reduce((s, a) => s + a.n, 0);
  while (sum > WAGONS) { const big = alloc.reduce((m, a) => (a.n > m.n ? a : m)); big.n--; sum--; }
  while (sum < WAGONS) { const pick = alloc.reduce((m, a) => (load[a.t] / a.n > load[m.t] / m.n ? a : m)); pick.n++; sum++; }
  let w = 0;
  for (const a of alloc) for (let i = 0; i < a.n && w < WAGONS; i++) out[w++] = { type: a.t, fill: Math.min(1, load[a.t] / a.n / 3) };
  return out;
}

// ---------------- vehicles ----------------
export function buyTruck(state) {
  if (state.unlocks.truck) return { ok: false, msg: 'You already own the truck.' };
  if (!state.unlocks.truckOffer) return { ok: false, msg: 'Complete the cement delivery first.' };
  if (state.coins < TRUCK_PRICE) return { ok: false, msg: `You need ${TRUCK_PRICE} coins.` };
  state.coins -= TRUCK_PRICE;
  state.unlocks.truck = true;
  return { ok: true };
}

export function truckLoad(state) {
  return MATERIALS.reduce((s, k) => s + (state.vehicles.truckCargo[k] || 0), 0);
}

// Load requested amounts from warehouse into the truck (clamped by stock and capacity).
export function loadTruck(state, req) {
  const moved = {};
  let space = TRUCK_CAPACITY - truckLoad(state);
  for (const k of MATERIALS) {
    const want = Math.max(0, Math.floor(req[k] || 0));
    const n = Math.min(want, state.warehouse[k] || 0, space);
    if (n <= 0) continue;
    state.warehouse[k] -= n;
    state.vehicles.truckCargo[k] = (state.vehicles.truckCargo[k] || 0) + n;
    space -= n;
    moved[k] = n;
  }
  return moved;
}

// Suggest a load for the plot being built: what its next stages still need, earliest stage first,
// limited by warehouse stock and the truck's free space.
export function suggestTruckLoad(state, plotIdx) {
  const p = state.plots[plotIdx];
  const out = {};
  if (!p) return out;
  const have = {};
  for (const k of MATERIALS) have[k] = (p.site[k] || 0) + (state.vehicles.truckCargo[k] || 0);
  let space = TRUCK_CAPACITY - truckLoad(state);
  for (let st = p.stage; st < STAGES.length && space > 0; st++) {
    for (const k in STAGES[st].need) {
      const use = Math.min(have[k], STAGES[st].need[k]);
      have[k] -= use;
      const missing = STAGES[st].need[k] - use;
      const n = Math.min(missing, (state.warehouse[k] || 0) - (out[k] || 0), space);
      if (n > 0) { out[k] = (out[k] || 0) + n; space -= n; }
    }
  }
  return out;
}

export function unloadTruckAtPlot(state, plotIdx) {
  const p = state.plots[plotIdx];
  if (!p || !p.unlocked) return null;
  const moved = {};
  for (const k of MATERIALS) {
    const n = state.vehicles.truckCargo[k] || 0;
    if (n > 0) { p.site[k] = (p.site[k] || 0) + n; state.vehicles.truckCargo[k] = 0; moved[k] = n; }
  }
  return moved;
}
export function unloadTruckAtWarehouse(state) {
  const moved = {};
  for (const k of MATERIALS) {
    const n = state.vehicles.truckCargo[k] || 0;
    if (n > 0) { state.warehouse[k] += n; state.vehicles.truckCargo[k] = 0; moved[k] = n; }
  }
  return moved;
}

// ---------------- construction ----------------
export function missingFor(plot, stageIdx) {
  const need = STAGES[stageIdx]?.need || {};
  const miss = {};
  for (const k in need) { const m = need[k] - (plot.site[k] || 0); if (m > 0) miss[k] = m; }
  return miss;
}
// realMaterials = false is the free-build mode: stages never wait for deliveries
export function canWorkStage(plot, stageIdx, realMaterials = true) {
  return plot.unlocked && plot.stage === stageIdx && (!realMaterials || Object.keys(missingFor(plot, stageIdx)).length === 0);
}

// Consume materials and advance exactly once.
export function completeStage(state, plotIdx, stageIdx) {
  const p = state.plots[plotIdx];
  const real = state.rules ? state.rules.realMaterials !== false : true;
  if (!p || !canWorkStage(p, stageIdx, real)) return null;
  const need = real ? STAGES[stageIdx].need : {};
  for (const k in need) p.site[k] -= need[k];
  const res = { stage: stageIdx, consumed: { ...need }, houseDone: false, coins: 0, nextFloor: false };
  const floors = p.floors || 1;
  if (stageIdx === STAGE_ROOF && (p.floor || 0) + 1 < floors) {
    // another storey: columns, walls and slab again on the next floor
    p.floor = (p.floor || 0) + 1;
    p.stage = STAGE_COLUMNS;
    p.progress = {};
    res.nextFloor = true;
    return res;
  }
  p.stage = stageIdx + 1;
  p.progress = {};
  if (p.stage >= STAGES.length && !p.done) {
    p.done = true;
    state.housesBuilt++;
    const reward = HOUSE_REWARD + 100 * plotIdx;
    state.coins += reward;
    res.houseDone = true;
    res.coins = reward;
    if (state.plots[plotIdx + 1]) state.plots[plotIdx + 1].unlocked = true;
  }
  return res;
}

export function plotPrice(i) { return PLOT_PRICES[i] || 0; }
export function canBuyPlot(state, i) {
  const p = state.plots[i];
  return !!p && !p.unlocked && i > 0 && state.plots[i - 1].done;
}
export function buyPlot(state, i) {
  if (!canBuyPlot(state, i)) return { ok: false, msg: 'Finish the previous house first.' };
  if (state.coins < plotPrice(i)) return { ok: false, msg: `You need ${plotPrice(i)} coins.` };
  state.coins -= plotPrice(i);
  state.plots[i].unlocked = true;
  return { ok: true };
}

export function activePlot(state) {
  const i = state.plots.findIndex((p) => p.unlocked && !p.done);
  return i;
}
