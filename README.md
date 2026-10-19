# Build My Town: Indian Railway Adventure

A 3D browser game built with Three.js. You drive an electric freight train round a fictional loop line, bring building materials to the town of Mitrapur, then use a car, a delivery truck and construction machines to build houses. Each finished house makes the town grow.

**How it plays:** you type your name once, then a home hub opens. Trains, vehicles and buildings are all open from the start; nothing is locked. The Station Master guide bubble talks to you by name and tells you the next step.

- **Trains (4):** goods freight, passenger express, local shuttle (EMU) and heritage steam. Choose the paint scheme and the number of coaches. Passenger trains pick people up at each stop: tap **Open the doors**, watch passengers walk on and off, and earn fares.
- **Vehicles (5):** hatchback, jeep, auto-rickshaw, delivery truck and tractor, each in 5 colours.
- **Buildings (4):** house, corner shop, village school and health clinic. Choose clay-tile, tin-sheet or flat-terrace roof, a wall colour and a plot. Free-build is the default. Turn on **Real materials** to make buildings need goods delivered by train and truck.
- **Stops are forgiving:** anywhere from 30 m short to 60 m past the marker counts. If you overshoot further, tap **Move to the platform** and assist backs the train up.
- **Learning Games (Batch 1, ages 3–10):** Colour Station, Shape Sorter Yard, Alphabet Express, Big & Small Letters, Number Train, Count & Load, Count the Passengers, Signal Says and Cargo Memory. Open them from the 🧩 card on the home hub, or accept an offer that pops up at stations and building sites. Each game is 5 rounds. Instructions are spoken aloud, the right answer glows after a wrong try, and stars earn coins. Difficulty starts from the age chosen on the name screen and moves up or down with the child's answers. **👪 Grown-ups** (behind a sum) shows skill meters, letters and numbers learned, time played, play-together ideas and a break reminder setting.

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
| **Excavator** | A/D swing · W/S boom · Q/E arm · R/F dig/dump | On-screen pad |
| **Crane** | A/D turn · W/S trolley · Q/E hook up/down · Space grab/release | On-screen pad |
| **Everywhere** | E or Enter: context action · C camera picker (then 1–6 or arrow keys + Enter) · 1–6 switch view directly · O panels · M map · U scenic mode · Esc closes things | Buttons in the top-right corner. In scenic mode, "Show controls" brings them back |

On the building site, drag to orbit and scroll or pinch to zoom. **Helper mode** (Settings, on by default) turns on "do it for me" buttons for younger players. **Faster journeys** (Settings) runs the simulation at 2× speed.

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

**Missions.** There are five story missions:

1. Timber from Vanagiri
2. Bricks from the Itkheda depot
3. Cement from Shilapur
4. Farm produce and saplings from Dhanpur
5. A multi-stop run: tiles at Itkheda, then glass and paint at Rangpura

After those, repeatable supply runs appear. You can only load at the right station while stopped in the green stop zone, and only unload at the destination. Each mission's reward is paid once.

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

**Construction.** A house is built in 8 stages:

1. Clear the plot: tap debris.
2. Excavate: drive the excavator arm and bucket and dig 4 scoops.
3. Pour concrete: hold to pour from the mixer.
4. Build walls: lift 4 wall panels with the crane and set them on the outlines, where they snap into place.
5. Fit the roof: same as the walls, with 2 roof halves.
6. Doors and windows: choose a part, then tap its opening.
7. Paint: pick from 6 colours and paint each wall.
8. Garden: fence, path and saplings.

Each stage uses specific materials from the plot's stock, and they are taken exactly once:

| Stage | Materials used |
|---|---|
| Concrete | 4 cement |
| Walls | 8 bricks, 2 cement |
| Roof | 3 timber, 4 tiles |
| Doors and windows | 2 timber, 2 glass |
| Paint | 2 paint |
| Garden | 3 saplings, 1 timber |

Finished houses stay in the world. Each one pays 300 coins, lets you buy the next plot, and adds to the town: street lamps and a bus stop, then a school, then a park with a fountain and a town hall.

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

**Saving.** The game saves automatically to `localStorage`, every 15 seconds and after each important event. The save format has a version number (currently 2) and is migrated forward when the format changes. Values are cleaned on load so stock can never go negative, and duplicate entries are removed. Resetting progress asks you to confirm. There are no ads, purchases, chat or accounts, and no personal data is collected.

**Graphics settings.** Low, Medium and High change pixel ratio, shadow-map size, tree density and draw distance. Shadows can be switched on or off. Touch devices start on Low.

## Project layout

```
index.html          HUD markup, import map for the bundled Three.js
css/style.css       interface styling (desktop and phone layouts)
js/main.js          start-up, game modes, objectives, actions, input, main loop
js/logic.js         the game rules with no rendering (missions, inventory, unlocks, construction, save/migrate)
js/data.js          stations, cargo, missions, construction stages
js/track.js         loop line measured by distance along it, nearest-point lookups, swept track geometry
js/terrain.js       height map: hills, river, flattened town and track bed, regional ground colours
js/world.js         ballast, sleepers, rails, overhead wires, stations, signals, bridges, river, roads, level crossings
js/scenery.js       instanced trees, palms, paddy fields, villages, kilns, silos, factories, distance-based detail
js/town.js          Mitrapur layout, warehouse and stock piles, garage, plots, town expansion
js/train.js         train physics, placing cars on the track, assisted driving
js/vehicles.js      car and truck handling, collisions, getting stuck, recovery
js/construction.js  building stages, excavator, mixer, crane, snapping, painting, garden
js/cameras.js       camera views, transitions, keeping clear of obstacles
js/audio.js         generated sound
js/ui.js            panels, camera picker, scenic mode, dialogs, construction panel
js/tests.js         rule tests (Node or ?selftest)
vendor/             three.module.js r160 and its MIT licence
serve.py            local server with caching turned off
```

## Credits and licences

- **Three.js r160**, © 2010–2023 three.js authors, MIT licence (`vendor/THREE_LICENSE.txt`).
- Everything else was written for this project: models, textures, terrain, sounds, music and code. No outside images, models, fonts or audio are used. Station boards use the system font, such as Nirmala UI or Noto Sans Devanagari.

## Verification results

These were run in the Claude desktop app's built-in Chromium browser, using the dev server above.

| Check | How it was checked | Result |
|---|---|---|
| Game rules: loading only at the right station, correct destinations, reward paid once, no negative stock, materials used once per stage, save/migrate, corrupt save | 45 automated tests, in Node and in the browser (`?selftest=1`) | 45/45 pass |
| Wagon spacing on curves | Train placed every 25 m round the whole loop; gap between coupler faces measured | 0–0.08 m everywhere; tightest curve radius 381 m |
| Assisted stopping | Simulation run in the browser with Assist on, Mitrapur → Vanagiri → Mitrapur | Stopped 1.1 m from the marker both times; about 4 min 50 s and 5 min 30 s per leg |
| Full delivery | Same run: Load, then pressing Unload twice | 6 wagons showed timber; warehouse +12 timber; +150 coins once; next mission started |
| Car/truck → construction | Truck driven by the real vehicle physics: loading bay → Plot 1 → unload → all 8 stages with Helper mode | House finished; consumption matched the stage table; +300 coins once; town expansion 1 shown; Plot 2 offered |
| Save/reload | Reload, then Continue | Coins, finished house, expansion, vehicles, warehouse and mission state all restored |
| Interface | Real clicks and key presses | Start-new confirmation; panels and Garage; switching vehicles; camera picker opened, moved with arrow keys + Enter, closed and returned focus; tapping debris; scenic mode on and off; panel preference kept |
| Level crossings | Gate state sampled as the train approached and passed | Closed from about 520 m before the crossing until the tail cleared; car-blocking active only while the gates are down |
| Phone layout | 375×812 emulation | HUD and construction panel fit after a fix |

**Limits of this testing:**

- The browser pane was often in the background, which slows its drawing. Many long checks were done by stepping the simulation from the console rather than playing in real time.
- Frame rate was only seen in that pane: about 20–28 fps at Medium with 0.3–1.3 M triangles. That is **not** a real performance measurement. Real phones, Safari and Firefox were not tested.
- Sound was confirmed to start (the Web Audio context is running), but nobody listened to it.

## Known limitations

- Everything is procedural and low-poly. It is a clean stylised look, not photorealistic. The locomotive and wagons have no detailed interiors; the cab view uses a simple desk and window frame.
- The line is a single loop with no points, sidings or other trains. Goods are loaded beside the platform, not in a separate siding.
- In the right-side view at stations, the platform shelters hide part of the train. The default left-side view stays clear.
- Car and truck handling is arcade-style, and there is no other traffic. Getting stuck is detected and **Recover** fixes it.
- It is always daytime; there is no weather.
- Hindi board text needs a Devanagari font on the device. Most systems have one; if not, the browser will substitute a fallback.
- Loading takes about 4 seconds on a desktop because the world is generated on the device.
