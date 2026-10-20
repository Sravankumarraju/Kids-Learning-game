// Game data: cargo, fictional stations, missions, construction stages.
// All stations and the route are fictional and only inspired by Indian railways.

export const CARGO = {
  timber:   { name: 'Timber',       color: '#8a5a2b' },
  bricks:   { name: 'Bricks',       color: '#b5482f' },
  cement:   { name: 'Cement',       color: '#9a9a96' },
  tiles:    { name: 'Roof tiles',   color: '#c0622f' },
  glass:    { name: 'Glass',        color: '#7fc4d8' },
  paint:    { name: 'Paint',        color: '#e0a21b' },
  saplings: { name: 'Saplings',     color: '#4f9a3a' },
  produce:  { name: 'Farm produce', color: '#e2603a' },
};
export const MATERIALS = ['timber', 'bricks', 'cement', 'tiles', 'glass', 'paint', 'saplings', 'produce'];

// f = fraction of the loop where the station centre sits. All platforms are on the inner (right) side.
export const STATIONS = [
  { id: 'MTP', name: 'Mitrapur Junction', hi: 'मित्रपुर जंक्शन', code: 'MTPJ', f: 0.0, kind: 'town', supplies: [] },
  { id: 'DHN', name: 'Dhanpur', hi: 'धानपुर', code: 'DHN', f: 0.13, kind: 'farm', supplies: ['produce', 'saplings'] },
  { id: 'ITK', name: 'Itkheda', hi: 'ईंटखेड़ा', code: 'ITKD', f: 0.33, kind: 'brick', supplies: ['bricks', 'tiles'] },
  { id: 'VNG', name: 'Vanagiri', hi: 'वनगिरि', code: 'VNGR', f: 0.46, kind: 'forest', supplies: ['timber'] },
  { id: 'SLP', name: 'Shilapur', hi: 'शिलापुर', code: 'SLPR', f: 0.60, kind: 'cement', supplies: ['cement'] },
  { id: 'RGP', name: 'Rangpura', hi: 'रंगपुरा', code: 'RGPA', f: 0.83, kind: 'industry', supplies: ['glass', 'paint'] },
  { id: 'PHW', name: 'Phoolwadi Halt', hi: 'फूलवाड़ी हॉल्ट', code: 'PHWH', f: 0.92, kind: 'halt', supplies: [] },
];

export const STORY_MISSIONS = [
  { id: 'm1', title: 'Timber from the Forest', desc: 'Collect timber at Vanagiri forest goods station and bring it to the Mitrapur warehouse.',
    stops: [{ st: 'VNG', load: { timber: 12 } }], dest: 'MTP', coins: 150 },
  { id: 'm2', title: 'Bricks from Itkheda Depot', desc: 'Load bricks at the quarry-side brick depot in Itkheda.',
    stops: [{ st: 'ITK', load: { bricks: 16 } }], dest: 'MTP', coins: 150, unlock: 'car' },
  { id: 'm3', title: 'Cement for the Town', desc: 'Shilapur cement works has bags of cement ready for Mitrapur.',
    stops: [{ st: 'SLP', load: { cement: 12 } }], dest: 'MTP', coins: 200, unlock: 'truckOffer' },
  { id: 'm4', title: 'Farm Fresh Delivery', desc: 'Bring produce and young saplings from the Dhanpur farms.',
    stops: [{ st: 'DHN', load: { produce: 6, saplings: 6 } }], dest: 'MTP', coins: 220 },
  { id: 'm5', title: 'Multi-Stop: Roof & Windows', desc: 'Load roof tiles at Itkheda, then glass and paint at Rangpura, then return to Mitrapur.',
    stops: [{ st: 'ITK', load: { tiles: 8 } }, { st: 'RGP', load: { glass: 4, paint: 4 } }], dest: 'MTP', coins: 320 },
  { id: 'm6', title: 'Glass for the Clinic', desc: 'The new clinic needs windows: fetch glass and paint from the Rangpura factories.',
    stops: [{ st: 'RGP', load: { glass: 6, paint: 4 } }], dest: 'MTP', coins: 340 },
  { id: 'm7', title: 'Flowers and Farm Goods', desc: 'Collect produce at Dhanpur, then saplings from the Phoolwadi flower nursery.',
    stops: [{ st: 'DHN', load: { produce: 8 } }, { st: 'PHW', load: { saplings: 6 } }], dest: 'MTP', coins: 380 },
  { id: 'm8', title: 'The Big Cement Order', desc: 'A heavy train: cement from Shilapur and bricks from Itkheda for the school.',
    stops: [{ st: 'SLP', load: { cement: 14 } }, { st: 'ITK', load: { bricks: 10 } }], dest: 'MTP', coins: 420 },
  { id: 'm9', title: 'Hill Timber Run', desc: 'Climb to the Vanagiri forest for timber, then pick up cement on the way back.',
    stops: [{ st: 'VNG', load: { timber: 10 } }, { st: 'SLP', load: { cement: 6 } }], dest: 'MTP', coins: 460 },
  { id: 'm10', title: 'Grand Supply Tour', desc: 'The final run: tiles, glass, timber and saplings from four stations for the Town Hall.',
    stops: [{ st: 'ITK', load: { tiles: 6 } }, { st: 'RGP', load: { glass: 4 } }, { st: 'VNG', load: { timber: 6 } }, { st: 'DHN', load: { saplings: 4 } }], dest: 'MTP', coins: 600 },
];
STORY_MISSIONS.forEach((m, i) => { m.level = i + 1; });

// passenger service levels: passengers carried in total to reach each level, and the bonus for it
export const PASSENGER_LEVELS = [5, 12, 20, 30, 42, 56, 72, 90, 110, 135].map((need, i) => ({ level: i + 1, need, bonus: 50 + i * 30 }));

// Repeatable supply-run templates (ids are generated with a counter so each is rewarded once).
export const SUPPLY_TEMPLATES = [
  { st: 'VNG', load: { timber: 10 }, coins: 120 },
  { st: 'ITK', load: { bricks: 12, tiles: 4 }, coins: 140 },
  { st: 'SLP', load: { cement: 10 }, coins: 140 },
  { st: 'DHN', load: { saplings: 4, produce: 6 }, coins: 150 },
  { st: 'RGP', load: { glass: 3, paint: 3 }, coins: 150 },
];

export const TRUCK_PRICE = 250;
export const PLOT_PRICES = [0, 200, 300];
export const TRUCK_CAPACITY = 14;

// Real construction order. Columns, walls and slab/roof repeat for every floor.
export const STAGES = [
  { key: 'survey',   name: 'Survey and mark out',       need: {} },
  { key: 'clear',    name: 'Clear the site',            need: {} },
  { key: 'dig',      name: 'Dig the foundation trenches', need: {} },
  { key: 'steel',    name: 'Steel reinforcement',       need: { timber: 1 } },
  { key: 'footing',  name: 'Pour the concrete footing', need: { cement: 3 } },
  { key: 'plinth',   name: 'Plinth and damp-proof layer', need: { bricks: 2, cement: 1 } },
  { key: 'columns',  name: 'Concrete columns',          need: { cement: 2, timber: 1 } },
  { key: 'walls',    name: 'Brick walls',               need: { bricks: 8, cement: 2 } },
  { key: 'roof',     name: 'Slab and roof',             need: { timber: 2, tiles: 3 } },
  { key: 'fittings', name: 'Doors, windows, wiring and pipes', need: { timber: 2, glass: 2 } },
  { key: 'finish',   name: 'Plaster and paint',         need: { paint: 2, cement: 1 } },
  { key: 'handover', name: 'Floors, garden and handover', need: { saplings: 3 } },
];
export const STAGE_COLUMNS = 6, STAGE_ROOF = 8;
export const PLOT_COUNT = 10;
export const HOUSE_REWARD = 300; // plus 100 more for each later project

export const PAINT_COLORS = [
  { name: 'Sky blue', hex: '#7fb8e0' },
  { name: 'Rose pink', hex: '#e79ab0' },
  { name: 'Turmeric', hex: '#efc350' },
  { name: 'Mint', hex: '#9fd8b0' },
  { name: 'Lavender', hex: '#b7a6e0' },
  { name: 'Lime white', hex: '#f1ede2' },
];

// ---------------- player choices ----------------
export const TRAIN_TYPES = [
  { id: 'goods', name: 'Goods Freight', desc: 'Electric loco with open wagons. Carry timber, bricks and cement to build the town.', service: 'freight', cars: [6], vmax: 20.8,
    liveries: [{ name: 'Classic red', body: '#9c2219', band: '#efe2bf' }, { name: 'Royal blue', body: '#1f4f9c', band: '#efe2bf' }, { name: 'Forest green', body: '#2f6b3a', band: '#f2d27a' }, { name: 'Saffron', body: '#e07a1c', band: '#ffffff' }] },
  { id: 'express', name: 'Passenger Express', desc: 'Fast blue coaches. Stops only at the big stations. Passengers pay more.', service: 'passenger', stops: 'major', cars: [4, 6, 8], vmax: 25, fare: 15,
    liveries: [{ name: 'Express blue', body: '#2a4f9a', band: '#f2efe6' }, { name: 'Rajdhani red', body: '#a3262a', band: '#f2d27a' }, { name: 'Sky white', body: '#e8eef2', band: '#2f6db5' }] },
  { id: 'local', name: 'Local Shuttle', desc: 'Electric multiple unit with a driving cab at each end. Stops at every station.', service: 'passenger', stops: 'all', cars: [2, 4, 6], vmax: 20, fare: 8,
    liveries: [{ name: 'Maroon & cream', body: '#7a1f2b', band: '#f2d27a' }, { name: 'Purple', body: '#5a3a8a', band: '#f2efe6' }, { name: 'Mint', body: '#3d9b7a', band: '#f2efe6' }] },
  { id: 'steam', name: 'Heritage Steam', desc: 'A puffing steam engine pulling wooden coaches. Slow and full of smoke!', service: 'passenger', stops: 'all', cars: [3, 4, 5], vmax: 15, fare: 12,
    liveries: [{ name: 'Black & red', body: '#1d1d1d', band: '#b0262a' }, { name: 'Green & gold', body: '#1f4a2e', band: '#d4a83a' }, { name: 'Blue & brass', body: '#1f3a6a', band: '#d4a83a' }] },
];

export const VEHICLE_TYPES = [
  { id: 'car', name: 'Hatchback', desc: 'Small and nippy. Great for exploring.' },
  { id: 'suv', name: 'Jeep', desc: 'Rugged 4x4 that handles fields and hills.' },
  { id: 'auto', name: 'Auto-rickshaw', desc: 'Three wheels, lots of fun, tight turns.' },
  { id: 'truck', name: 'Delivery truck', desc: 'Carries building materials from the warehouse.' },
  { id: 'tractor', name: 'Tractor', desc: 'Slow but strong. Drives anywhere on the farm.' },
];
export const VEHICLE_COLORS = [
  { name: 'Red', hex: '#c8302a' }, { name: 'Blue', hex: '#2f78c4' }, { name: 'White', hex: '#eeeeea' },
  { name: 'Yellow', hex: '#f2c21c' }, { name: 'Green', hex: '#3d9b56' },
];

export const BUILDING_TYPES = [
  { id: 'house', name: 'Family House', desc: 'A cosy home with a garden.', w: 10, d: 8, roof: 'tiles', extra: 'plate' },
  { id: 'shop', name: 'Corner Shop', desc: 'A little shop with a striped awning.', w: 9, d: 7, roof: 'flat', extra: 'awning' },
  { id: 'school', name: 'Village School', desc: 'A long classroom block with a flag.', w: 14, d: 8, roof: 'tiles', extra: 'flag' },
  { id: 'clinic', name: 'Health Clinic', desc: 'A clean clinic with a red cross sign.', w: 11, d: 8, roof: 'flat', extra: 'cross' },
];
export const ROOF_STYLES = [
  { id: 'tiles', name: 'Clay tiles' },
  { id: 'tin', name: 'Green tin sheets' },
  { id: 'flat', name: 'Flat terrace' },
];
