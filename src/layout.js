/**
 * World layout constants. All units metres, Y-up.
 *   +X -> pipe-rack side, -X -> drawworks / power side
 *   +Z -> front of rig (V-door / catwalk), -Z -> mud system
 * Well centre is the world origin (0,0,0); the wellbore axis is X=0, Z=0.
 */
export const LAYOUT = Object.freeze({
  // Site
  siteX: 110,
  siteZ: 90,

  // Substructure / drill floor
  floorY: 8.0,            // top of drill floor deck
  floorX: 16,             // footprint along X
  floorZ: 12,             // footprint along Z
  deckThickness: 0.25,

  // Mast (sits on drill floor; water table / crown base at 48 m above ground)
  mastBaseY: 8.0,
  mastTopY: 48.0,
  mastBays: 10,
  mastBaseHalfX: 3.5,     // base width 7 m
  mastTopHalfX: 2.0,      // upper width 4 m
  mastHalfZ: 2.5,         // depth 5 m
  crownUndersideY: 47.8,  // underside of the water-table beams (travelling block must stay below)
  guideRailX: 1.5,
  guideRailZ: -1.5,
  monkeyBoardY: 35.0,

  // Hoisting assembly, local datum 0 = quill bottom (top of saver sub thread)
  topDriveHeight: 5.0,    // quill bottom .. bail
  blockHeight: 2.5,       // integrated block-hook above the top drive
  blockTopLocal: 7.5,
  linkPivotLocal: 0.9,    // elevator-link ears on the top-drive body
  linkLength: 3.0,
  elevatorSeat: 0.45,     // elevator seats this far below the box end of a tubular
  saverSubLength: 0.5,
  hoistMin: 9.35,         // drilled-down: connection 0.4 m above the rotary table
  hoistMax: 39.8,         // crown-saver limit: block top 0.5 m under the water table
  hoistSpeed: 3.0,        // m/s
  elevatorMinY: 8.65,     // elevator must stay above rotary table + clearance (link tilt enforces this)
  drillDownTiltDeg: 58,   // link-tilt "drill-down" position
  pickupTiltDeg: 50,      // link tilt to reach the V-door pick-up point
  backTiltDeg: -20,       // link tilt toward the fingerboard

  // Tubulars
  pipeOD: 0.127,
  toolJointOD: 0.168,
  pipeJointLength: 9.5,
  standJoints: 3,         // triple rig: 28.5 m stands
  stickup: 0.7,           // tool joint above rotary when the string is in the slips
  rop: 0.8,               // drilling descent rate in the (time-accelerated) animation, m/s

  // Rotary table
  rotaryTopY: 8.45,
  rotaryRadius: 1.35,
  rotaryBoreRadius: 0.5,

  // Setback / fingerboard (stands rack behind well centre, between the guide rails)
  setbackY: 8.05,
  setbackXs: [-1.1, -0.7, -0.3, 0.3, 0.7, 1.1],
  setbackZs: [-2.0, -2.35],
  fingerPullZ: -1.55,     // derrickman pulls a stand top out to here before swinging it to the elevator

  // Drawworks (-X side on drill floor)
  drawworksPos: [-4.8, 8.0, -0.9],

  // Driller cabin
  cabinPos: [-6.0, 8.0, 2.0],

  // Mousehole
  mousehole: [1.0, 8.0, 3.0],

  // Iron roughneck rail (+X side of the rotary)
  roughneckReach: 2.1,
  roughneckParkX: 4.0,
  roughneckWorkX: 2.1,

  // Standpipe (inside the mast, -X/+Z leg)
  standpipeX: -2.1,
  standpipeZ: 2.15,
  standpipeTopY: 29.0,

  // Hydraulic catwalk: trough tail rides on the base, rig end lifts to the V-door
  catwalkZ0: 6.5,
  catwalkZ1: 38.8,
  catwalkTailY: 1.1,
  catwalkTailZ0: 38.1,    // tail position when lowered (trough rig end at z = 6.5)
  catwalkTailZ1: 35.0,    // tail position when raised and run forward
  troughLength: 31.6,
  troughRaiseDeg: 14.5,
  troughAxisOffset: 0.3,  // pipe axis above trough floor

  // Pipe racks (+X)
  rackXs: [5.5, 9.5, 13.5],
  rackZ0: 12,
  rackLength: 30,
  rackY: 1.0,
  rackLayers: 3,
  rackPerLayer: 14,
  rackPitchX: 0.2,
  rackRows: 3,

  // Mud system (-Z)
  shakerTankZ: -14,
  mudTankZs: [-22, -26, -30, -34],
  mudTankLength: 12,
  mudTankWidth: 3,
  mudTankHeight: 3,
  mudTankX: 2,
  mudPumpXs: [-13, -19, -25],
  mudPumpZ: -30,

  // Power / aux (-X)
  generatorX: -30,
  generatorZs: [-8, 0, 8],
  powerHouse: [-20, 0, 0],
  fuelTank: [-42, 0, 0],

  // Third-party service cabins (directional drilling project)
  ddOffice: [-18.5, 0.2, 15],     // directional driller, on the rig mats, driller side
  mwdUnit: [-29.5, 0.02, 15],     // MWD / LWD unit next to it
  mudLab: [14.5, 0.02, -27],      // mud engineer lab beside the mud tanks
});
