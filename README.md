# Build My Town: Indian Railway Adventure

A 3D browser game built with Three.js for children aged 3–10. Drive trains, cars and big machines, build ten real buildings stage by stage, watch the town of Mitrapur come alive, and play learning games — in a realistic 3D world with HDR sky lighting, real-world (CC0) textures, a day and night cycle, traffic and people.

**How it plays:** you type your name once, take a short tour, then a home hub opens with four activities. Everything is open from the start, and **every activity has 10 levels** — finish one to open the next. The Station Master guide talks to you by name and a yellow arrow shows where to go.

- **Trains (4):** goods freight, passenger express, local shuttle (EMU) and heritage steam, with paint schemes and coach counts. **10 goods levels** (from one-stop timber runs to a four-station Grand Supply Tour) and **10 passenger levels** (bonus coins as you carry more passengers). Stops are forgiving: 30 m short to 60 m past the marker counts, and **Move to the platform** backs up if you overshoot.
- **Vehicles (5):** hatchback, SUV, auto-rickshaw, goods truck and tractor, with clear-coat paint, tinted glass, alloy wheels, Indian number plates and lights that glow at night. **10 driving challenges** with glowing checkpoints, a timer and stars: Market Day, Around the Block, Station Pick-up, Warehouse Run, Village Visit, Town Time Trial, Farm Road, Night Patrol, Railway Crossing and the Grand Tour.
- **Buildings (10 projects × 12 real stages):** Family House, Corner Shop, Village School, Health Clinic, Two-Storey Home, Post Office, Police Station, Library, Bus Station and Town Hall. Each opens after the one before it. See *Construction* below.
- **Learning Games:** Colour Station, Shape Sorter Yard, Alphabet Express, Big & Small Letters, Number Train, Count & Load, Count the Passengers, Signal Says and Cargo Memory — **each with 10 stages** (90 in all) that add rounds, widen the letters and numbers used and get harder. Instructions are spoken aloud, the right answer glows after a wrong try, and stars earn coins. **👪 Grown-ups** (behind a sum) shows skill meters, time played, play-together ideas and a break reminder.
- **Town life:** cars, autos, trucks and tractors drive round the town on the left, keep their distance and stop (with a toot) for you; people walk the footpaths; cows rest by the road.

The stations, the route and the town are fictional. They are inspired by Indian railways but are not a real place or a real railway line.

## Running it

Players install nothing. The game is static files, so any web server works. ES modules don't load from `file://`, so you can't just double-click `index.html`.

```bash
python serve.py
```

Then open http://localhost:8765/. (The `vendor/` folder holds three.module.js r160; if it's missing, download that file from the three npm package.) `serve.py` is a small server that turns caching off, which helps during development. Any static host also works (GitHub Pages, Netlify, `npx serve`, and so on). Three.js r160 is included in `vendor/`, so the game runs offline.

URL options:

- `?fps=1` shows frame rate, draw calls and triangle count.
- `?selftest=1` runs the rule tests and the wagon-spacing check, then logs the results to the console.
- `?debug=1` logs how long each loading step takes.

Run the rule tests without a browser:

```bash
node js/tests.js
```

## Controls

| | Keyboard | Touch / mouse |
|---|---|---|
| **Train** | W/S or ↑/↓ throttle · Space brake (hold) · R forward/reverse (only when stopped) · H horn · L headlights · P driving assist | Throttle slider, BRAKE, FWD/REV, Assist, horn and light buttons |
| **Car / truck** | W/A/S/D or arrows · Space brake · H horn · R recover | ◀ ▶ steering, GO, BRAKE/REV, Recover |
| **Building site** | Space: the big action (hold for DIG / POUR / LAY BRICKS…) | Big round action button (hold or tap) · tap glowing targets · swipe walls to plaster and paint · 🤝 Help me |
| **Everywhere** | E or Enter: context action · C camera picker (then 1–6 or arrow keys + Enter) · 1–6 switch view directly · O panels · M map · U scenic mode · Esc closes things | Buttons in the top-right corner. In scenic mode, "Show controls" brings them back |

On the building site, drag to orbit and scroll or pinch to zoom; the camera follows the work. A bouncing arrow points at the next thing to tap. **Faster journeys** (Settings) runs the simulation at 2× speed.

## What's in it

**Railway.** The loop is about 10.4 km long with 7 stations: Mitrapur Junction, Dhanpur, Itkheda, Vanagiri, Shilapur, Rangpura and Phoolwadi Halt. Each station has a yellow name board in Hindi and English, a platform, a shelter, benches, lamps, a stop board, a goods shed with stacked cargo, and an entry signal whose aspect reacts to the train. The line also has:

- overhead wire masts with contact and messenger wires
- two steel truss bridges over a river
- three level crossings with gates that lower, flashing lights and a bell

**Scenery changes along the route:** paddy fields, coconut palms and villages near Dhanpur; brick kilns with smoking chimneys at Itkheda; forest hills and a timber depot at Vanagiri; silos and a quarry at Shilapur; factories and palms at Rangpura; flower fields at Phoolwadi.

**Train.** The locomotive is modelled on an Indian electric freight loco (Co-Co). It has:

- a red body with cream stripes
- a raised pantograph touching the wire
- headlights you can switch on and off
- six-wheel bogies that swivel, with wheels that turn
- centre-buffer couplers

It pulls six open goods wagons, and cargo shows on the wagons (logs, brick pallets, cement bags, crates, tiles, glass crates, paint drums, saplings). Each car's position is taken from two bogie points along the track, so spacing stays the same on curves. Acceleration has a power limit, there's rolling resistance and a gentle effect from gradients. Braking is forgiving.

**Missions.** Ten goods levels, played in order (the Missions panel shows the ladder):

1. Timber from the Forest · 2. Bricks from Itkheda · 3. Cement for the Town · 4. Farm Fresh Delivery · 5. Roof & Windows (2 stops) · 6. Glass for the Clinic · 7. Flowers and Farm Goods (2 stops) · 8. The Big Cement Order (2 stops) · 9. Hill Timber Run (2 stops) · 10. Grand Supply Tour (4 stops)

After those, repeatable supply runs appear. You can only load at the right station while stopped in the green stop zone, and only unload at the destination. Each reward is paid once.

**Cameras.** There are six train views:

- left side (the default)
- right side
- chase
- driver's cab
- aerial
- trackside cinematic

The side views move in and out so the whole train fits. Switching views uses a smooth arcing transition. The camera stays above terrain, trees and buildings, and rises to see over obstacles between it and the train. The car and truck have four views.

**Interface.** Large panels (Missions, Map, Garage, Camera, Settings) start minimised, and the game remembers whether you left them open. The small controls always on screen are:

- speedometer and throttle
- brake
- current objective, with remaining distance and arrival time
- the context action button
- the Assist toggle
- the camera button
- the panels button
- the scenic-mode button

**Construction.** Every project is built the way real buildings are, in 12 stages. Columns, walls and the slab repeat for every floor of the two-storey buildings. Each stage opens with a short **lesson card** (a real fact — a different one for each project) and a **method choice** (a wrong choice is explained kindly and the crew does it the right way, for one star less). Then you do the work with real machines and a site crew:

| # | Stage | What you do | Machines |
|---|---|---|---|
| 1 | Survey and mark out | Tap the corner pegs 1→4; strings and a chalk outline appear | Surveyor's tripod |
| 2 | Clear the site | Hold PUSH to drive the bulldozer lane by lane, or tap rubbish for the workers | Bulldozer |
| 3 | Dig the trenches | Hold DIG and let go in the green zone (1 m deep); spoil goes in heaps | Excavator or JCB backhoe, tipper |
| 4 | Steel reinforcement | Tap each trench to lower a rebar cage | Crew |
| 5 | Concrete footing | Choose the mix (1:2:4), hold POUR to the green line | Transit mixer |
| 6 | Plinth and DPC | Raise the brick plinth, roll the backfill, lay the damp-proof course | Road roller |
| 7 | Columns | Tap each column; the pump boom swings over and fills the shuttering; cure 7 days; strip the boxes | Concrete pump, tower crane |
| 8 | Brick walls | Hold LAY BRICKS (thousands of bricks, row by row, lintels over openings); spirit-level checks | Tower crane, crew |
| 9 | Slab and roof | Props and deck → steel mesh → pour; or gables → crane-lifted trusses → tiles / metal sheets | Pump, crane |
| 10 | Doors, windows, wiring | Tap each opening; answer a wiring or plumbing question | Crew |
| 11 | Plaster and paint | Swipe across the walls to plaster, then pick a colour and swipe to paint | Crew |
| 12 | Floors, garden, handover | Choose floor tiles, plant the garden, the inspector checks, the family moves in | Inspector, family |

Every stage earns 1–3 stars; **🤝 Help me** finishes the step for younger players (two stars at most). A day counter and quick time-lapses show how long real building takes. In **Real materials** mode each stage also uses goods brought by train and truck:

| Stage | Materials used |
|---|---|
| Steel | 1 timber |
| Footing | 3 cement |
| Plinth | 2 bricks, 1 cement |
| Columns (each floor) | 2 cement, 1 timber |
| Walls (each floor) | 8 bricks, 2 cement |
| Slab and roof (each floor) | 2 timber, 3 tiles |
| Doors and windows | 2 timber, 2 glass |
| Plaster and paint | 2 paint, 1 cement |
| Handover | 3 saplings |

Finished buildings stay in the town with their garden, boundary wall and name board. Each pays coins (more for later projects) and opens the next project.

**Sound.** All sound is generated with Web Audio and starts after your first click. It includes:

- a transformer hum and a traction-motor whine that follow throttle and speed
- wheel clicks over rail joints, timed by speed
- the horn, brake hiss and squeal
- loading thuds and clanks
- car and truck engines and horns
- excavator hydraulics, crane motor, concrete pour and spray paint
- wind and birds that you hear from a direction
- crossing bells you hear from a direction
- soft background music (a drone with a flute-like tune)

Music and sound effects have separate volume controls. Nothing important is communicated by sound alone.

**Saving.** The game saves automatically to `localStorage`, every 15 seconds and after each important event. The save format has a version number (currently 4) and is migrated forward when the format changes. Values are cleaned on load so stock can never go negative, and duplicate entries are removed. Resetting progress asks you to confirm. There are no ads, purchases, chat or accounts, and no personal data is collected.

**Graphics settings.** Low, Medium and High change pixel ratio, shadow-map size, tree density and draw distance. Shadows can be switched on or off. Touch devices start on Low.

## Project layout

```
index.html          HUD markup, import map for the bundled Three.js
css/style.css       interface styling (desktop, tablet and phone layouts)
js/main.js          start-up, game modes, objectives, actions, input, main loop
js/logic.js         game rules with no rendering (missions, inventory, construction stages and floors, save/migrate)
js/data.js          stations, cargo, 10 goods levels, passenger levels, construction stages
js/assets.js        CC0 textures, HDR sky and glTF props
js/daynight.js      sun, sky, lights and clock for the day and night cycle
js/track.js         loop line measured by distance, nearest-point lookups, swept track geometry
js/terrain.js       height map, textured ground blend, holes for foundation trenches
js/world.js         ballast, rails, overhead wires, stations, signals, bridges, river, roads, level crossings
js/scenery.js       instanced trees, palms, paddy fields, villages, kilns, silos, factories
js/town.js          Mitrapur layout, footpaths, warehouse, garage, 10 building plots, town expansion
js/train.js         train physics, placing cars on the track, assisted driving
js/vehicles.js      vehicle handling, collisions, recovery
js/cars.js          realistic vehicle models (hatchback, SUV, auto-rickshaw, truck, tractor)
js/traffic.js       town traffic, pedestrians and cows
js/challenges.js    10 driving challenges with checkpoints and stars
js/buildgeo.js      the 10 building projects: layouts, openings, brick courses, plaster masks
js/sitevis.js       what a site looks like at every stage (trenches, steel, concrete, bricks, roofs, garden)
js/machines.js      bulldozer, excavator, backhoe, tipper, transit mixer, pump, roller, workers
js/construction.js  the real-time construction stages: lessons, choices, work, stars, time-lapse
js/lessons.js       stage facts, method choices and quiz questions
js/learn.js, js/learngames.js   learning games with 10 stages each, parent page
js/cameras.js       camera views, transitions, keeping clear of obstacles
js/audio.js         generated sound
js/ui.js            home hub, tour, pickers, panels, construction card and action button
js/tests.js         rule tests (Node or ?selftest)
tools/              fetch_assets.py (downloads the CC0 assets), sitetest.js (plays a project through)
assets/             CC0 textures, HDR sky and models (see assets/CREDITS.md)
vendor/             three.module.js r160 + addons, MIT licence
serve.py            local server with caching turned off
```

## Credits and licences

- **Three.js r160** and its addons, © 2010–2023 three.js authors, MIT licence (`vendor/THREE_LICENSE.txt`).
- **Textures, HDR sky and props** from [Poly Haven](https://polyhaven.com) and [ambientCG](https://ambientcg.com), all **CC0** (public domain). The full list is in `assets/CREDITS.md`.
- Everything else — vehicles, machines, buildings, terrain, sounds, music and code — was written for this project. Station boards use the system font, such as Nirmala UI or Noto Sans Devanagari.

## Verification results

Run in the Claude desktop app's built-in Chromium browser with the dev server above, plus Node and a jsdom harness.

| Check | How it was checked | Result |
|---|---|---|
| Game rules, incl. 12-stage construction, two-storey floors, 10 goods levels, 10 projects in order | 53 automated tests (`node js/tests.js`, or `?selftest=1`) | 53/53 pass |
| Construction, every stage | `tools/sitetest.js` played the Family House, Corner Shop and Town Hall (2 floors) through all stages in the browser | All completed, no errors; floor 2 repeated columns → walls → slab |
| Real interactions | Pegs tapped in order (wrong order loses a star), bulldozer held lane by lane, dig released in the green zone, spirit-level check, swipe plastering and painting by ray-cast | All worked |
| Driving challenges | Challenge 1 played through; every checkpoint of all 10 checked against the road network | Stars, coins and next level unlocked; checkpoints on roads (the loading bay is a paved yard beside the service road) |
| Learning games | jsdom harness: all 9 games at stages 1, 4 and 10 | All finish with 3 stars when answered right; wrong answers glow a hint; signal game at stage 10 is long (8 rounds) |
| Phone and tablet | 375×812 and 768×1024 emulation | Stage card and big action button do not overlap |

**Limits of this testing:**

- The browser pane was mostly hidden, so frames were stepped from the console; no real frame-rate measurement was possible. Real phones, Safari and Firefox were not tested.
- Rendering load with the town in view: about 140 draw calls and 0.6 M triangles on Medium.
- Sound was not listened to.

## Known limitations

- Vehicles, machines and buildings are procedural models with real-world textures and physically based materials — realistic in look, but not scanned or photoreal.
- The line is a single loop with no points, sidings or other trains.
- Vehicle handling is arcade-style. AI traffic stays on the town loop roads; it does not go out to the villages.
- Walking people and cows are simple animated figures.
- Hindi board text needs a Devanagari font on the device. Most systems have one; if not, the browser will substitute a fallback.
- Loading takes a few seconds on a desktop: the world is generated on the device and about 55 MB of textures and sky are downloaded the first time.
