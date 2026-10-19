// Rule tests. Run in Node:  node js/tests.js   (or open index.html?selftest=1 to see results in the browser console)
import * as L from './logic.js';
import { STAGES, STORY_MISSIONS, TRUCK_CAPACITY } from './data.js';

const results = [];
function check(name, cond) { results.push({ name, ok: !!cond }); }

function memStore() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; }

export function runTests() {
  results.length = 0;
  // --- station loading rules ---
  let s = L.newState();
  check('no mission: cannot load anywhere', !L.canLoadAt(s, 'VNG'));
  check('start m1', L.startMission(s, 'm1').ok);
  check('cannot start m2 before m1', !L.startMission(L.newState(), 'm2').ok);
  check('m1 loads only at Vanagiri', L.canLoadAt(s, 'VNG') && !L.canLoadAt(s, 'ITK') && !L.canLoadAt(s, 'MTP'));
  check('cannot unload before loading', !L.canUnloadAt(s, 'MTP') && L.doUnload(s, 'MTP') === null);
  check('load at wrong station refused', L.doLoad(s, 'SLP') === null);
  const loaded = L.doLoad(s, 'VNG');
  check('load at Vanagiri gives 12 timber', loaded && loaded.timber === 12);
  check('cargo visible on 6 wagons', s.trainCargo.filter(Boolean).length === 6 && s.trainCargo.every((w) => w.type === 'timber'));
  check('second load at same station refused', L.doLoad(s, 'VNG') === null);
  check('switching mission with cargo refused', !L.startMission(s, 'm2').ok);
  // --- delivery destinations / rewards once ---
  check('unload refused at wrong station', L.doUnload(s, 'VNG') === null && L.doUnload(s, 'ITK') === null);
  const coins0 = s.coins;
  const r1 = L.doUnload(s, 'MTP');
  check('unload at Mitrapur succeeds', r1 && r1.coins === 150);
  check('warehouse +12 timber', s.warehouse.timber === 12);
  check('coins granted', s.coins === coins0 + 150);
  check('repeat unload grants nothing', L.doUnload(s, 'MTP') === null && s.coins === coins0 + 150 && s.warehouse.timber === 12);
  check('cannot restart a completed mission', !L.startMission(s, 'm1').ok);
  check('train empty after delivery', s.trainCargo.every((w) => w === null));
  // --- multi-stop ---
  s.missions.completed.push('m2', 'm3', 'm4');
  L.refreshBoard(s);
  check('supply board generated after story progress', s.missions.board.length === 3);
  check('start m5', L.startMission(s, 'm5').ok);
  check('m5 first stop is Itkheda', L.canLoadAt(s, 'ITK') && !L.canLoadAt(s, 'RGP'));
  L.doLoad(s, 'ITK');
  check('m5 then Rangpura', L.canLoadAt(s, 'RGP') && !L.canUnloadAt(s, 'MTP'));
  L.doLoad(s, 'RGP');
  check('mixed cargo on wagons', new Set(s.trainCargo.map((w) => w.type)).size === 3);
  const r5 = L.doUnload(s, 'MTP');
  check('m5 delivers tiles, glass, paint', r5 && s.warehouse.tiles === 8 && s.warehouse.glass === 4 && s.warehouse.paint === 4);
  // --- unlocks ---
  let u = L.newState();
  u.rules.realMaterials = true; u.plots[1].unlocked = false; u.plots[2].unlocked = false;
  for (const m of STORY_MISSIONS.slice(0, 3)) { L.startMission(u, m.id); for (const st of m.stops) L.doLoad(u, st.st); L.doUnload(u, m.dest); }
  check('car unlocked after 2 deliveries', u.unlocks.car);
  const c = u.coins;
  check('truck available from the start, buying it again costs nothing', u.unlocks.truck && !L.buyTruck(u).ok && u.coins === c);
  // --- inventory transfers ---
  const wh = { ...u.warehouse };
  const mv = L.loadTruck(u, { cement: 6, bricks: 8 }); L.loadTruck(u, {});
  check('truck capacity respected', L.truckLoad(u) <= TRUCK_CAPACITY);
  check('warehouse decreased by moved amount', u.warehouse.cement === wh.cement - (mv.cement || 0) && u.warehouse.bricks === wh.bricks - (mv.bricks || 0));
  check('no negative warehouse stock', Object.values(u.warehouse).every((v) => v >= 0));
  const onTruck = { ...u.vehicles.truckCargo };
  L.unloadTruckAtPlot(u, 0);
  check('truck unloaded to plot', u.plots[0].site.cement === onTruck.cement && L.truckLoad(u) === 0);
  check('unload empty truck is harmless', Object.keys(L.unloadTruckAtPlot(u, 0)).length === 0);
  check('locked plot refuses unload', L.unloadTruckAtPlot(u, 1) === null);
  // --- truck suggestion follows stage order ---
  const sg = L.newState();
  Object.assign(sg.warehouse, { timber: 12, bricks: 16, cement: 12, tiles: 8, glass: 4, paint: 4, saplings: 6 });
  const sug = L.suggestTruckLoad(sg, 0);
  check('suggestion starts with cement for the foundation', sug.cement >= 6 && Object.values(sug).reduce((a, b) => a + b, 0) <= TRUCK_CAPACITY);
  // --- construction consumption ---
  const p = u.plots[0];
  check('clear stage needs nothing', L.canWorkStage(p, 0));
  check('cannot skip stages', L.completeStage(u, 0, 2) === null);
  L.completeStage(u, 0, 0); L.completeStage(u, 0, 1);
  const cem = p.site.cement;
  const rc = L.completeStage(u, 0, 2);
  check('concrete consumes 4 cement', rc && p.site.cement === cem - 4);
  check('stage cannot be completed twice', L.completeStage(u, 0, 2) === null && p.site.cement === cem - 4);
  p.site.bricks = 3;
  check('walls blocked without enough bricks', !L.canWorkStage(p, 3) && L.completeStage(u, 0, 3) === null && p.site.bricks === 3);
  // finish the house
  for (const k in p.site) p.site[k] = 50;
  const coinsB = u.coins;
  for (let i = 3; i < STAGES.length; i++) L.completeStage(u, 0, i);
  check('house complete', p.done && u.housesBuilt === 1 && u.coins === coinsB + 300);
  check('house reward once', L.completeStage(u, 0, 7) === null && u.coins === coinsB + 300);
  check('plot 2 can be bought after house 1', L.canBuyPlot(u, 1));
  // --- free-build mode ---
  const fb = L.newState();
  check('free build: all plots open', fb.plots.every((p) => p.unlocked) && fb.unlocks.car && fb.unlocks.truck);
  for (let i = 0; i < 8; i++) L.completeStage(fb, 0, i);
  check('free build: house completes with no materials and stock never negative', fb.plots[0].done && Object.values(fb.plots[0].site).every((v) => v === 0));
  // --- save / load ---
  const store = memStore();
  L.save(u, store);
  const back = L.load(store);
  check('save/load round trip', back && back.coins === u.coins && back.plots[0].done && back.warehouse.timber === u.warehouse.timber);
  store.setItem(L.SAVE_KEY, JSON.stringify({ version: 1, coins: 77, warehouse: { timber: -5 }, vehicles: { truck: { cargo: { bricks: 4 } } } }));
  const old = L.load(store);
  check('v1 save migrates and keeps progress', old.coins === 77 && old.vehicles.truckCargo.bricks === 4 && old.warehouse.timber === 0 && old.plots.length === 3 && old.plots.every((p) => p.unlocked));
  store.setItem(L.SAVE_KEY, '{broken');
  check('corrupt save does not crash', L.load(store) === null);
  return results;
}

if (typeof process !== 'undefined' && process.argv?.[1]?.endsWith('tests.js')) {
  const r = runTests();
  for (const t of r) console.log(`${t.ok ? 'PASS' : 'FAIL'}  ${t.name}`);
  const f = r.filter((t) => !t.ok).length;
  console.log(`\n${r.length - f}/${r.length} passed`);
  process.exit(f ? 1 : 0);
}
