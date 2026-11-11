# Onshore Top-Drive Drilling Rig — Procedural Three.js Visualisation

An interactive, browser-based 3D model of a modern 1,500–2,000 hp AC triple land rig drilling a
directional well on a remote Australian wellsite. Every part of the site is generated procedurally
from Three.js geometry; there are no external model assets. The rig's operations (drilling
connections, tripping, picking up pipe) are driven by a step-by-step simulation of standard
top-drive rig procedures, and those procedures are dry-run and checked against mechanical rules
at start-up. Around the rig the site is alive: third-party service cabins (directional driller,
MWD/LWD, mud engineer), water and fuel trucks on the access road, cattle, horses, kites and
tumbleweeds.

![Overview](docs/overview.png)

| | |
|---|---|
| ![Stand pick-up at the racking board](docs/stand-pickup.png) | ![Iron roughneck making up a stand](docs/iron-roughneck.png) |
| ![Catwalk presenting a joint to the elevator](docs/pipe-transfer.png) | ![Crown block on the water table](docs/crown.png) |
| ![DD office, MWD unit and toolpusher office](docs/service-cabins.png) | ![Water truck spraying the pad for dust](docs/water-truck.png) |
| ![Fuel truck on the access road](docs/fuel-truck.png) | ![Cattle near the stock bore](docs/livestock.png) |
| ![Dusk: floodlights on](docs/dusk.png) | ![Night operations](docs/night.png) |
| ![Double being lowered into the mousehole](docs/stand-building.png) | ![Live telemetry panel with flagged faults](docs/live-telemetry.png) |

---

## 1. Running it

```bash
npm install
npm run dev        # Vite dev server -> http://localhost:5173
npm run build      # production bundle in dist/
npm run preview    # serve the production bundle
npm run check      # headless procedure checks + telemetry checks (no browser)
npm run telemetry  # simulated rig feed on ws://localhost:8787 (add -- --faults, -- --imperial)
npm run smoke      # headless build of the whole site, 12 simulated minutes of site life, all 18 checks
```

Requires Node 18+ and a WebGL2 browser. Built against three r170 and Vite 6.

## 2. Architecture

The code is split into a **pure simulation** (no meshes, runs in Node) and a **view** that renders it.

| Layer | Files | Responsibility |
|---|---|---|
| Layout | `src/layout.js` | Single source of truth for dimensions, elevations, limits and positions |
| Simulation state | `src/sim/rigState.js` | Rig state (hoist, link tilt, elevator, slips, string, handled tubulars, catwalk, roughneck, setback slots), derived kinematics (elevator point, link-tilt clearance, trough pose, pick-up geometry) |
| Procedures | `src/sim/sequences.js` | Operating procedures as generator programs of timed steps: drilling + connection, trip out, single pick-up |
| Sequencer | `src/sim/sequencer.js` | Runs a program step by step; stops only at safe points; headless `simulate()` |
| Procedure checks | `src/sim/checks.js` | Per-tick mechanical rules and full dry runs of every procedure |
| Animator | `src/animations.js` | Owns state + sequencer, mode changes, manual control, pushes state into the scene each frame |
| Rig views | `src/rig/*.js` | `mast`, `substructure`, `topDrive` (block, top drive, links, elevator, drilling line), `drillString`, `floorEquipment` (slips, iron roughneck, setback stands), `drawworks`, `pipeHandling` (racks, catwalk, transfer joint), `mudSystem`, `wellControl`, `auxiliary`, `thirdParty` (DD office, MWD/LWD unit, mud engineer lab, utes, windsock, signage) |
| Site | `src/site/*.js` | `terrain` (ground height, road centreline, wind), `vehicles` (truck models, routes, traffic controller, dust, spray, wet ground), `wildlife` (cattle, horses, kites, tumbleweeds), `dayNight` (sun / moon, sky colours, rig lighting), `particles`, `signs` |
| Live telemetry | `src/telemetry/*.js` | `validator` (units, plausibility, spike filter, cross-checks, link state), `liveDriver` (maps the validated feed onto the rig state and infers pipe handling), `client` (WebSocket with reconnect) |
| Rendering | `src/scene.js`, `src/materials.js`, `src/environment.js`, `src/geometry.js` | Renderer, lights, procedural sky with drifting clouds (also baked into the image-based lighting), terrain, road, vegetation, stock bore, PBR materials and procedural textures, geometry helpers |
| UI / labels / checks | `src/ui.js`, `src/labels.js`, `src/validation.js` | Control panel, CSS2D labels, 18 spatial + procedural checks |

## 3. World layout

Y-up, metres. **Well centre = (0, 0, 0); the wellbore axis is X = 0, Z = 0.**

| Direction | Contents |
|---|---|
| +X | Iron roughneck track, pipe racks (X 3.8 → 15.2), deadline anchor, choke manifold, tool storage, truck lane, gate and access road (X 24) |
| −X | Drawworks, driller's cabin, standpipe, VFD house, generators, fuel tank, toolpusher office, **DD office (−18.5, 15)** and **MWD/LWD unit (−29.5, 15)** |
| +Z (front) | V-door and hydraulic catwalk (Z 6.5 → 38.8) |
| −Z (rear) | Setback and fingerboard (behind well centre, between the guide rails), flowline, shakers, mud tanks, mud pumps, **mud engineer lab (14.5, −27)** |
| Off the pad | Access road north of the gate (cattle grid, entry board), stock bore with windmill to the north-west (cattle), horse paddock to the east |

Key elevations: drill floor 8.0 · rotary 8.45 · string in slips: tool joint 0.7 m above the rotary ·
racking board 35 · water table / crown base 48 · crown sheaves ≈ 49.3 · hoist travel 9.35 → 39.8 m
(block top stays 0.5 m under the water table) · stands 3 × 9.5 = 28.5 m.

## 4. Operating procedures (logic checked against standard top-drive land-rig practice)

**Drilling mode: drill a stand down, then make a connection.**
1. Drill ahead: rotating, circulating, links in the drill-down tilt so the elevator clears the floor.
2. Drilled down: stop rotation, pick up off bottom to connection height, stop the pumps.
3. Set power slips; break out the saver sub (pipe-handler backup grips, quill turns left).
4. Hoist the empty elevator to the racking board, links tilting back toward the fingerboard.
5. Derrickman pulls the next stand out of the fingerboard into the elevator; elevator latches below the box tool joint.
6. Link tilt brings the stand top to well centre; pick the stand up off the setback; floor crew guides the pin over the stump.
7. Stab, then the iron roughneck travels in, spins in and torques the connection, and parks.
8. Top drive comes down (the elevator slides down the pipe), stabs the saver sub and makes it up.
9. Open the elevator and tilt links to drill-down; pick up and pull slips; start pumps; start rotation; tag bottom; drill ahead.

**Hoisting mode: trip out of the hole on elevators, racking back.** Set slips and break out the
top drive, latch the elevator below the stump tool joint, pull slips, pull one stand, set slips
under the next connection, the iron roughneck breaks out and spins out, the crew walks the pin to
the setback, set it down, link tilt and the derrickman rack the top into the fingerboard, lower
the empty elevator, repeat until the setback is full.

**Pipe-handling mode: build triple stands in the mousehole and rack them.** The string stays in
the slips with the top drive broken out. For each joint: the rack indexer releases one joint, it
rolls along the rack and across the indexer arms, kicker arms tip it into the catwalk trough, the
catwalk lifts its rig end and runs forward to the V-door, the skate pushes the box end into the
elevator (links tilted 50°), the elevator latches, and the joint is hoisted while a floorhand tails
the pin in until it hangs plumb over the mousehole.
1. Joint 1 is lowered into the mousehole and the elevator opens.
2. Joint 2 is stabbed onto it; the iron roughneck slews and extends to the mousehole, spins in and
   torques the connection. The double is lowered into the (deep) mousehole and released.
3. Joint 3 is made up the same way. The triple is pulled out of the mousehole, the link tilt brings
   it back over well centre, the crew walks the pin to the setback, and the derrickman racks it in
   the fingerboard.

The mode repeats until the setback is full or the catwalk side of the rack runs out of joints.

Setback slots are worked front row first (racking back fills the back row first) so a stand is
never dragged through the stands still in the fingerboard. Mode changes requested mid-operation
wait for the next safe point (string made up, or string in the slips with an empty elevator).

## 5. Controls

| Control | Effect |
|---|---|
| Left-drag / right-drag / wheel | Orbit / pan / zoom |
| Keys `1`–`9` or *Camera preset* | Overview, Front, Side, Top, Drill Floor, Pipe Handling, Mud System, Service Cabins, Gate & Access Road |
| *Mode* | Idle (manual), Drilling, Hoisting (trip out), Pipe Handling (build stands), Live telemetry |
| *Hoist position* | Manual hoist target, Idle only (string made up: 9.35–39.8 m) |
| *RPM set-point* | 0–200 rpm used when drilling or rotating manually |
| *Sim speed* / *Pause* | 0.25×–4× simulation time, freeze |
| *Start/Stop rotation* | Idle only; refused when the string is in the slips or broken out |
| *Build stands* | Runs Pipe Handling; refused while rotating manually |
| *Time of day* / *Day / night cycle* | Set the clock by hand, or let 24 h run in 10 minutes |
| *Live Telemetry* → address + *Connect* | Connects to a WebSocket feed and switches to Live telemetry mode |
| *Reset* | String made up off bottom, setback and rack restocked |
| *Run validation* | Re-runs all checks; results in the browser console |
| *Traffic, livestock and tumbleweeds* | Turns the ambient site life on or off |
| *Call water truck* / *Call fuel truck* | Sends that truck in now (one truck on site at a time) |

## 6. Validation (runs at start-up; 18 checks)

Spatial checks on the scene: well-centre alignment; crown above block at max hoist; block above
top drive; top drive and drill-down elevator above the rotary/deck at min hoist; floor ≈ 8 m;
mast ≈ 48 m with the crown on the water table; racks +X; drawworks −X; tanks −Z; string rotates
about world Y without orbiting; hoist travel clamped; fast line and deadline clear the mast faces.

Procedure checks (headless dry runs, rules applied every 1/30 s tick): string always supported
(made up, in slips or latched); pumps only with the top drive made up; no rotation in the slips or
during pipe transfer; elevator never below the rotary clearance; saver sub never driven into a
tubular; anything latched sits exactly in the elevator; no tubular through the deck, the stump or a
racked stand; no tubular jumps between ticks; catwalk trough above deck height inside the floor
footprint. Runs: one drilling connection, one trip-out stand, one complete stand build (three joints from
the rack through the mousehole to the fingerboard), and a full cycle
(drill until the setback is empty, then trip out until it is full).

Site checks: the three third-party cabins sit on the pad and do not overlap any other equipment;
both truck routes are swept against every mesh on the pad and must keep more than 0.3 m clear
(currently 1.9 m for the water truck and 1.6 m for the fuel truck).

## 7. Site life

- **Third-party services.** Directional driller office and MWD/LWD unit (satellite dish, radio mast,
  tool rack, cable tray toward the rig) on the driller's side; mud engineer lab with test bench and
  sack pallets beside the mud tanks. Each has its own label and signage.
- **Water truck.** Comes in through the gate, loops the east side of the pad with the spray bar on,
  and drives back out. The wet ground it leaves darkens the gravel and dries out over about 80 s;
  wheel dust is suppressed on wet ground.
- **Fuel truck.** Drives round the rear of the pad to the fuel tank bund, connects a hose and unloads
  for 16 s, turns in the yard and leaves the way it came.
- **Timing.** The first water truck arrives a few seconds after loading; after that a truck arrives
  every 45–120 s, alternating fuel and water. Vehicles keep left and slow for corners and the gate.
- **Livestock.** Eleven cattle around the stock bore (windmill, tank, trough) and four horses in the
  east paddock graze, look around, wander, and occasionally move off as a mob (the horses canter).
  Paddocks are fenced off in logic: animals never enter the pad or the road corridor.
- **Wind.** One wind direction drives the windsock, windmill, cloud drift, dust and the tumbleweeds,
  which roll through every 5–20 s on lines that pass either side of the pad.

## 8. Day and night

The clock runs 24 hours in 10 minutes by default (*Day / night cycle*), or set *Time of day* by
hand. The sun rises over the pipe-rack side (+X) at 06:00, peaks at 65° at noon and sets over the
drawworks side at 18:00; at night the same shadow-casting light becomes the moon. Sky, horizon
haze, fog, clouds and the image-based lighting follow the sun, with a warm glow at dawn and dusk
and stars at night. At dusk the four floodlight towers, the mast and racking-board lights, the
cabin windows and the red crown beacon switch on; kites roost and dust dims with the light.

## 9. Live telemetry (external rig control)

The model can be driven by a real rig's data instead of its built-in procedures. Enter the feed
address under *Live Telemetry* and press *Connect* (this also selects *Live telemetry* mode).
Try it without a rig: `npm run telemetry` serves a simulated rig on `ws://localhost:8787`;
`-- --faults` injects a different out-of-spec fault every ~15 s and prints each one.

**Message format.** One JSON object per WebSocket frame (or an array of them), sent at any rate:

```json
{ "ts": 1767225600000, "blockHeight": 12.4, "rpm": 120, "slips": false, "hookload": 720,
  "wob": 110, "torque": 17, "spp": 17500, "flow": 2300, "bitDepth": 1888.2, "holeDepth": 1888.2 }
```

| Channel | Meaning | Internal unit | Also accepted |
|---|---|---|---|
| `blockHeight` | Top-drive saver sub above the rotary table | m | `BPOS`, `blockPosition`, `hookHeight`; ft |
| `rpm` | String rotation | rpm | `rotarySpeed`, `topDriveRpm`, `RPMA` |
| `slips` | Slips set | boolean | `true/false`, `1/0`, `"set"/"out"`, `"in"/"pulled"` |
| `hookload` | Hook load including block and top drive | kN | `HKLD`, `weight`; klbf, t, kdaN |
| `wob`, `torque` | Weight on bit, surface torque | kN, kN·m | klbf, kft·lbf |
| `spp`, `flow` | Standpipe pressure, flow in | kPa, L/min | psi, bar, gpm |
| `bitDepth`, `holeDepth` | Depths | m | `DBTM`, `DMEA`; ft |

Only `blockHeight` is needed to move the model; everything else is optional. Units default to the
internal ones; send `"unitSystem": "imperial"` or `"units": { "blockHeight": "ft" }` to convert.
`{"config": {"blockDatum": 1.2, "blockWeight": 310}}` re-zeros the block height and sets the
empty-hook weight (kN) used to infer slips.

**Out-of-spec data.** Nothing invalid reaches the model; every case below is flagged in the panel
with the channel, the value and what was done about it.

| Situation | Handling |
|---|---|
| Frame is not JSON, value is `null` / text / NaN | Ignored; the last good value is held |
| Value outside the plausible range (block 75 m, hookload −9999) | Rejected as a sensor fault; last good value held |
| Jump faster than the equipment can move (block +18 m in one sample) | Held back; accepted as a real step only if 3 consecutive samples agree |
| Real value beyond what the model can show (block above the crown-saver limit, reverse rotation) | Clamped to the limit, shown amber, original value in the tooltip |
| Out-of-order or duplicate timestamp | Dropped; a clock that jumps back more than a minute is treated as a feed restart |
| No valid data for 3 s / 10 s | STALE: model holds. LOST: position held, rotation and pumps shown stopped. Reconnects automatically |
| One channel stops updating | That channel is flagged stale and held; the rest keep running |
| No slips signal | Slips inferred from hookload against the empty-hook weight |
| Slips read SET while the hook carries the string and the string turns | Slips sensor overridden (treated as OUT) |
| RPM reported with the slips set | Rotation is not applied to the string |
| Block height that would drive the top drive into pipe standing in the slips | Top drive held above the pipe |
| Bit depth deeper than hole depth; flow with no pressure | Flagged; hole depth used |

**What the model infers.** Telemetry has no channel for pipe handling, so the model works it out
from the mechanics: with the slips set the string cannot move, so a block that moves away means
the top drive is broken out; a top drive hoisted to the racking board over a floor-height stump
is fetching a stand, which is shown in the elevator, swung in and stabbed; a block that comes
down past a tall stump means that stand was racked back; a string picked up with the block about
1.2 m higher than a made-up connection, with no rotation or pumps, is tripping on elevators. The
operation line shows the detected rig state (drilling, sliding, connection, tripping,
circulating). Leaving Live mode hands the rig back to the built-in procedures at a safe state.

`rig.live.validator.configure({...})` in the browser console changes limits such as `staleAfterMs`.

## 10. Known limitations

- Animation time is accelerated (drilling 0.8 m/s); the drawworks drum turns at a quarter of its true 10-line speed so it reads at 60 fps.
- Thread make-up advance (≈0.1 m) is not modelled; the derrickman and floor crew are implied by the motion, not modelled as figures.
- The drill string below ground is a fixed 95 m visual; there is no hole depth, hookload or torque.
- Over-crown drilling-line wraps are straight links rather than arcs.
- Around 1,900 draw calls. Fine on a discrete GPU; integrated GPUs may prefer the Shadows toggle off.
- The directional-drilling side is surface kit only (DD and MWD cabins); there is no well path, survey or toolface display.
- Live telemetry animates the hoist, rotation, slips, pumps and stand handling at well centre. The catwalk, mousehole and iron roughneck are not driven by the feed, and trip-in on elevators is shown as made up to the top drive until the block geometry says otherwise.
- A fault that persists (for example a block-height sensor reading feet as metres) is accepted after three agreeing samples, then clamped if it leaves the model's travel.
- Stand building assumes a deep, cased mousehole that takes a double; rigs with a single-joint mousehole build doubles only.
- Animals and trucks are low-poly and do not react to each other; only one truck is on site at a time.
- Livestock and tumbleweeds sit outside the sun shadow map, so they use simple blob shadows.
