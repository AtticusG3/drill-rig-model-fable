# BENCHMARK: Industrial 3D Scene Generation — Onshore Directional Drilling Rig

## ROLE AND OBJECTIVE

You are a senior Three.js developer, industrial mechanical visualisation specialist, and drilling equipment engineer.

Your task is to design and implement a detailed, interactive, browser-based 3D simulation of a modern onshore oil and gas drilling rig using Three.js.

The result must be a functional application, not a description, pseudocode, or static image.

You must construct the drilling rig procedurally using Three.js geometry, materials, lighting, transforms, and scene graph relationships.

The primary objective is to create a visually convincing and mechanically coherent drilling rig that demonstrates a correct understanding of three-dimensional geometry, industrial equipment placement, mechanical motion, and physical constraints.

This is a benchmark of your ability to reason about spatial relationships and produce a substantial working implementation.

Do not simplify the scene into a generic crane, construction tower, or collection of unrelated geometric primitives.

The rig must be recognisable as a modern land-based top-drive drilling rig.

---

# 1. SCENE CONCEPT AND VISUAL DIRECTION

## 1.1 Overall Environment

The scene depicts a modern 1,500–2,000 horsepower AC land drilling rig operating on a remote Australian onshore wellsite.

The visual reference is a contemporary high-specification drilling operation in the Cooper Basin or Surat Basin.

The scene should have the following characteristics:

- Large, elevated steel drilling substructure.
- Tall, rectangular, lattice-style drilling mast.
- Travelling block and top-drive assembly suspended inside the mast.
- Drill pipe passing vertically through the rotary table.
- Hydraulic pipe-handling equipment.
- Horizontal pipe racks beside the rig.
- Mud pumps, mud tanks, and solids-control equipment.
- Electrical generators and control buildings.
- Industrial safety railings, ladders, stairs, and walkways.
- Heavy-duty rig matting and compacted gravel.
- Red Australian soil extending beyond the prepared location.
- Dust, wear, oil staining, and realistic industrial surface finishes.
- Bright Australian sunlight with long, defined shadows.

The scene should resemble an engineering visualisation used for drilling equipment familiarisation or rig-layout planning.

Avoid a cartoon aesthetic.

Use physically based materials and carefully constructed geometry to produce an industrial appearance.

## 1.2 Visual Palette

Use the following approximate colours:

| Component | Colour |
|---|---|
| Mast structural steel | Industrial white / light grey |
| Substructure | Dark steel grey |
| Top drive | Yellow and dark grey |
| Travelling block | Yellow |
| Drawworks | Dark blue / grey |
| Pipe handling equipment | Yellow |
| Drill pipe | Dark metallic steel |
| Drill collars | Brushed steel |
| Mud tanks | Dark green / grey |
| Mud pumps | Industrial red |
| Safety railings | Safety yellow |
| Stairways | Galvanised steel |
| Electrical containers | Off-white |
| Rig mats | Dark brown / grey |
| Ground | Red-brown Australian earth |

Apply roughness and metalness values appropriate to each material.

Metal should respond convincingly to lighting.

Do not make every object glossy.

---

# 2. WORLD COORDINATE SYSTEM

Establish a consistent world coordinate system before constructing any geometry.

Three.js uses a Y-up coordinate system.

For this project:

- +Y is vertically upward.
- +X points toward the pipe-rack side of the rig.
- -X points toward the drawworks side.
- +Z points toward the front of the rig.
- -Z points toward the rear equipment area.

All measurements are in metres.

The well centre is located at:

`(0, 0, 0)`

The wellbore centreline must remain aligned with:

`X = 0, Z = 0`

The drill string, top drive, travelling block, rotary table opening, and wellhead must share this centreline.

This is a mandatory spatial constraint.

Do not independently position these components using arbitrary visual offsets.

## 2.1 Reference Dimensions

Use the following illustrative dimensions:

| Component | Dimension |
|---|---|
| Mast height above ground | 48 m |
| Mast base width | 7 m |
| Mast upper width | 4 m |
| Mast depth | 5 m |
| Drill floor elevation | 8 m |
| Drill floor footprint | 16 × 12 m |
| Substructure height | 8 m |
| Rig site | 110 × 90 m |
| Drill pipe OD | 0.127 m |
| Drill pipe stand length | 28 m |
| Top-drive assembly height | 5 m |
| Travelling block height | 2.5 m |
| Pipe rack length | 30 m |
| Mud tank length | 12 m |
| Mud tank width | 3 m |

These are visualisation reference dimensions, not engineering-certified equipment specifications.

Preserve realistic proportions and internal consistency.

---

# 3. DRILLING MAST

Construct a detailed lattice mast rising approximately 48 metres above ground.

The mast must be a rectangular steel truss structure, not a solid rectangular tower.

## 3.1 Primary Structural Members

Include:

- Four primary vertical or slightly inclined corner legs.
- Horizontal cross-members at regular intervals.
- Diagonal X-bracing between structural bays.
- Structural reinforcement around the crown.
- Additional reinforcement around the drill-floor connection.
- Internal guide rails for the top-drive assembly.
- Cable trays or service lines attached to the structure.

The mast should taper slightly toward the crown.

Use box beams or cylindrical steel members.

The four main mast legs must remain spatially coherent and form a continuous structural assembly.

## 3.2 Crown Block

At the top of the mast, construct a crown block assembly.

Include:

- Multiple sheaves.
- A common support structure.
- Sheave axles.
- Steel support beams.
- Visible drilling-line routing.

The sheaves should appear as grooved steel wheels.

The crown block must sit above the travelling block.

## 3.3 Mast Bracing

Each structural bay should contain diagonally arranged braces.

The braces must actually connect the intended structural nodes.

Do not create floating diagonal members.

Use mathematical calculations to determine the length, midpoint, and orientation of each brace between its endpoints.

---

# 4. SUBSTRUCTURE AND DRILL FLOOR

The drill floor is elevated approximately 8 metres above ground.

Construct a heavy steel substructure supporting the drill floor.

## 4.1 Substructure

Include:

- Heavy steel support columns.
- Horizontal load-bearing beams.
- Diagonal structural braces.
- Multiple support frames.
- Ground-level base skids.
- Access openings beneath the drill floor.

The structure must visibly support the drill floor.

No structural columns should terminate in empty space.

## 4.2 Drill Floor

Construct a large rectangular steel platform.

Include:

- Steel grating or checker-plate decking.
- Perimeter safety railings.
- Yellow toe boards.
- Stair access.
- Pipe-handling work area.
- Rotary table opening.
- Setback area for drill pipe stands.
- Driller's cabin.
- Equipment storage areas.

The floor must not obstruct the vertical well centreline.

## 4.3 Rotary Table and Well Centre

Position the rotary table opening directly above the wellhead.

Include:

- Circular rotary table housing.
- Central bore opening.
- Master bushing representation.
- Slip area.
- Metallic ring details.

The drill pipe must pass through the centre of this assembly.

Do not cap the opening with solid geometry.

---

# 5. TOP DRIVE AND HOISTING SYSTEM

This is one of the most important parts of the benchmark.

Construct a top-drive assembly suspended within the mast.

## 5.1 Travelling Block

The travelling block must include:

- Multiple sheaves.
- Steel housing.
- Suspension structure.
- Hook or integrated connection to the top drive.
- Visible drilling-line segments extending toward the crown block.

It must move vertically along the mast.

## 5.2 Top Drive

Construct a mechanically plausible top-drive assembly.

Include:

- Main motor housing.
- Gearbox housing.
- Rotating quill.
- Pipe connection.
- Torque reaction structure.
- Guide rollers or guide shoes.
- Elevator links.
- Pipe elevator.
- Service loop representation.

The top drive must be aligned with the well centreline.

The main housing must not rotate with the drill string.

Only the appropriate rotating components should rotate.

## 5.3 Top-Drive Guide System

Construct two vertical guide rails inside the mast.

The top-drive assembly should travel along these rails.

The guide rails must be parallel to the mast centreline.

The top-drive assembly must remain constrained to the rails throughout its vertical motion.

## 5.4 Drilling Line

Represent the drilling line using thin cylindrical or curved line geometry.

The line must visually connect the crown and travelling block.

Use multiple line segments to suggest a reeved hoisting system.

The line arrangement must update coherently as the travelling block moves.

Do not create a single static cable that stretches through unrelated machinery.

---

# 6. DRILL STRING

Create a vertical drill string extending downward from the top drive through the rotary table.

## 6.1 Drill Pipe

The drill pipe should have:

- A dark steel cylindrical body.
- Slightly enlarged tool joints.
- Repeated pipe sections.
- Correct axial alignment.
- A consistent outer diameter.

The visible pipe must remain centred on the wellbore.

## 6.2 Tool Joints

Represent tool joints as short cylinders with a larger diameter than the pipe body.

Tool joints should appear at appropriate intervals.

## 6.3 Rotation

The drill string must be capable of rotating.

Rotation should occur about the vertical Y-axis.

The drill string must not orbit around the well centre.

The top-drive motor housing must remain stationary while the quill and drill string rotate.

---

# 7. DRAWWORKS

Position the drawworks on the negative X side of the rig, mechanically associated with the drill floor.

Construct:

- Main drum housing.
- Drum.
- Drum shaft.
- Motor housings.
- Brake assemblies.
- Gearbox.
- Structural mounting frame.
- Protective guards.

Use cylindrical geometry for the drum.

The drum axis must be horizontal.

The drawworks should be located where its drilling line can plausibly route toward the mast.

Do not position the drawworks on the pipe-rack side.

---

# 8. PIPE HANDLING SYSTEM

Position the pipe handling equipment primarily on the positive X side of the rig.

## 8.1 Pipe Racks

Construct multiple horizontal pipe racks beside the rig.

Include:

- Steel support beams.
- Raised pipe supports.
- Several layers of drill pipe.
- Repeated pipe sections.
- Visible tool joints.
- Pipe end details.

The drill pipe should be stored horizontally.

All pipe sections on a given rack should be parallel.

Use instanced geometry where practical.

## 8.2 Catwalk

Construct a long catwalk extending from the pipe-rack area toward the drill floor.

Include:

- Steel frame.
- Walking surface.
- Side rails.
- Pipe trough.
- Mechanical lifting structure.

The catwalk must have a physically understandable relationship to the drill floor.

## 8.3 Pipe Transfer

Include a simplified animated pipe-transfer sequence.

The pipe should:

1. Begin horizontally on the pipe rack.
2. Move into the catwalk trough.
3. Translate toward the rig.
4. Be raised or presented toward the drill floor.
5. Transition toward a vertical handling position.

Use interpolation and rotation to produce smooth movement.

Avoid teleportation between positions.

The transfer path must not pass through the substructure or mast.

This sequence is a visual demonstration rather than a certified model of a particular manufacturer's pipe-handling system.

---

# 9. MUD CIRCULATION SYSTEM

Construct a simplified but recognisable drilling fluid circulation system.

## 9.1 Mud Tanks

Position the mud tanks behind the rig toward negative Z.

Create at least four rectangular mud tanks.

Include:

- Steel tank bodies.
- Top walkways.
- Handrails.
- Access ladders.
- Interconnecting pipework.
- Agitator motor housings.
- Visible piping manifolds.

## 9.2 Mud Pumps

Construct three triplex mud pumps.

Each pump should have:

- Large rectangular power end.
- Fluid end.
- Three-cylinder arrangement.
- Suction manifold.
- Discharge manifold.
- Motor or drive system.
- Heavy mounting skid.

Position the pumps near the mud tanks.

## 9.3 Standpipe and Rotary Hose

Construct a standpipe extending upward along the mast.

Connect it to a curved flexible rotary hose leading to the moving top-drive assembly.

The hose must update as the top drive moves.

It must not remain attached to the top drive's original position.

The hose should form a plausible curved service loop.

## 9.4 Flowline and Solids Control

Include:

- Flowline representation.
- Shale shaker assembly.
- Mud return area.
- Solids-control equipment.
- Connecting pipes.

Use simplified geometry where necessary, but preserve correct system relationships.

---

# 10. WELL CONTROL EQUIPMENT

Construct a simplified BOP stack beneath the drill floor.

Include:

- Annular preventer.
- Ram preventer bodies.
- Flanged connections.
- Hydraulic control lines.
- Wellhead connection.
- Choke and kill line representations.

The BOP must be located directly below the rotary table.

It must be coaxial with the well centreline.

Its geometry must not intersect the drill floor or unrelated structural members.

Use realistic relative scale.

---

# 11. AUXILIARY EQUIPMENT

Populate the wellsite with additional industrial equipment.

Include:

### Electrical Power

- Three large diesel generator containers.
- Exhaust stacks.
- Cooling vents.
- Electrical cable trays.
- Power distribution building.

### Driller's Cabin

- Elevated cabin adjacent to the drill floor.
- Large windows facing well centre.
- External access door.
- Control console representation.
- Dark tinted glass.

### Site Infrastructure

- Perimeter fencing.
- Floodlight towers.
- Site access road.
- Safety barriers.
- Equipment containers.
- Fuel tank.
- Tool storage area.
- Walkways and access stairs.

The additional equipment must be arranged logically.

Do not randomly scatter industrial objects around the site.

Maintain service access around major equipment.

---

# 12. GROUND AND ENVIRONMENT

Construct a prepared drilling pad approximately 110 × 90 metres.

## 12.1 Ground

Include:

- Compacted gravel beneath the rig.
- Red-brown Australian soil around the pad.
- Subtle terrain irregularities.
- Tire tracks.
- Oil-stained working areas.
- Drainage or containment features.

Use procedural textures or geometry where appropriate.

## 12.2 Background

Create a sparse Australian inland environment.

Include:

- Low scrub vegetation.
- Dry grasses.
- Distant terrain.
- Clear blue sky.
- Atmospheric haze.

Do not create a dense forest.

The rig must remain the dominant visual feature.

## 12.3 Lighting

Use a combination of:

- Directional sunlight.
- Ambient illumination.
- Hemisphere lighting.
- Physically reasonable shadows.
- Tone mapping.

The sun should be positioned to reveal the mast's lattice structure and the elevated drill floor.

Shadows should help communicate the spatial relationships between equipment.

---

# 13. CAMERA SYSTEM

Implement OrbitControls.

The user must be able to:

- Orbit around the rig.
- Zoom in and out.
- Pan across the site.
- Inspect the mast from ground level.
- View the rig from above.
- Examine the drill floor.
- Inspect the pipe racks and mud system.

Provide camera presets:

1. Overview — elevated three-quarter perspective.
2. Front — looking toward the rig from positive Z.
3. Side — looking along the X-axis.
4. Top — looking vertically down.
5. Drill Floor — close-up of the rotary table and top drive.
6. Pipe Handling — focused on the catwalk and pipe racks.
7. Mud System — focused on tanks and pumps.

Camera transitions should be smooth.

The initial camera should frame the entire rig with the mast clearly visible.

---

# 14. ANIMATION SYSTEM

Implement the following independent animations.

## 14.1 Hoisting

The travelling block and top drive should move vertically.

Use an adjustable hoist position.

The top drive must remain aligned with the well centre.

The drilling line and rotary hose must update accordingly.

## 14.2 Drill String Rotation

Provide an adjustable RPM control.

Suggested range:

0–200 RPM.

The pipe must rotate around its own axis.

## 14.3 Pipe Handling

Provide a button to begin a pipe transfer animation.

The pipe should move through the defined handling stages.

## 14.4 Mud Circulation

Provide a visual indicator for mud circulation.

This may include:

- Animated flow indicators.
- Moving particles within selected pipework.
- Pump piston motion.
- Animated flow-direction arrows.

## 14.5 Operational Modes

Provide the following modes:

- Idle.
- Drilling.
- Hoisting.
- Pipe Handling.

Only mechanically compatible actions should be active simultaneously.

For example, pipe transfer should not begin while the top drive is rotating at drilling RPM.

---

# 15. USER INTERFACE

Create a compact industrial control panel using HTML and CSS.

Use a dark control-room aesthetic.

The UI should be readable and should not obscure the central rig.

Include:

### Rig Controls

- Hoist position slider.
- Drill string RPM slider.
- Start/stop rotation.
- Start pipe transfer.
- Reset animation.
- Operational mode selector.

### View Controls

- Camera preset selector.
- Show/hide structural bracing.
- Show/hide drill string.
- Show/hide mud system.
- Show/hide equipment labels.
- Wireframe mode.

### Diagnostics

Display:

- Current FPS.
- Number of rendered triangles.
- Draw calls.
- Current hoist position.
- Current drill string RPM.
- Active operational mode.

Use Three.js renderer information for available rendering statistics.

Do not invent telemetry.

---

# 16. EQUIPMENT LABELS

Implement optional labels for major equipment.

Labels should identify:

- Crown Block.
- Travelling Block.
- Top Drive.
- Mast.
- Drill Floor.
- Rotary Table.
- Drawworks.
- BOP Stack.
- Pipe Rack.
- Catwalk.
- Mud Pumps.
- Mud Tanks.
- Shale Shakers.
- Driller's Cabin.

Labels should be positioned near their respective equipment.

Use HTML overlays or Three.js sprites.

Labels should not permanently obstruct the scene.

---

# 17. IMPLEMENTATION REQUIREMENTS

Use Three.js with modern JavaScript modules.

You may use Vite as the development environment.

Implement the project as a working application.

Prefer a modular architecture.

Suggested files:

- `package.json`
- `index.html`
- `src/main.js`
- `src/scene.js`
- `src/materials.js`
- `src/rig/mast.js`
- `src/rig/substructure.js`
- `src/rig/topDrive.js`
- `src/rig/drawworks.js`
- `src/rig/drillString.js`
- `src/rig/pipeHandling.js`
- `src/rig/mudSystem.js`
- `src/rig/wellControl.js`
- `src/environment.js`
- `src/animations.js`
- `src/ui.js`
- `src/styles.css`

You may choose a different structure if justified.

All imports must resolve.

Do not reference files that you have not implemented.

Do not use placeholder functions.

Do not leave TODO comments in place of required functionality.

Do not depend on external 3D model assets.

The rig should be generated procedurally.

External libraries should be limited to Three.js and lightweight supporting utilities where necessary.

---

# 18. GEOMETRIC CONSTRUCTION REQUIREMENTS

Create reusable geometry helpers.

At minimum implement:

### Beam Between Two Points

A helper that creates a cylindrical or box-shaped structural member between two arbitrary 3D coordinates.

It must calculate:

- Direction vector.
- Midpoint.
- Length.
- Orientation quaternion.

The beam must correctly connect both endpoints.

### Structural Truss Generator

A helper that constructs a truss bay between four or more structural nodes.

### Pipe Generator

A helper that creates pipe sections with tool joints.

### Equipment Skid Generator

A helper that creates a steel skid frame.

### Stair Generator

A helper that creates stairs between two elevations.

### Rail Generator

A helper that creates safety railings along a platform edge.

### Hose Generator

A helper that creates curved flexible hoses between endpoints.

The hose generator must support dynamic endpoint updates.

Use mathematically consistent transformations.

Avoid arbitrary rotations selected solely because they look approximately correct from one camera angle.

---

# 19. SPATIAL REASONING CONSTRAINTS

The following constraints are mandatory and should be treated as testable invariants.

**Constraint A — Well Centre**

The top-drive quill, drill string, rotary table opening, BOP stack, and wellhead must share the vertical axis X = 0, Z = 0.

**Constraint B — Vertical Ordering**

The crown block must be above the travelling block.

The travelling block must be above the top drive.

The top drive must be above the rotary table.

The rotary table must be above the BOP stack.

**Constraint C — Structural Support**

The drill floor must be supported by the substructure.

The mast must be structurally connected to its base.

The pipe racks must be supported above the ground.

**Constraint D — Mechanical Movement**

The top drive must travel vertically without lateral drift.

The drill string must rotate without orbiting.

The pipe transfer must follow a continuous path.

**Constraint E — Equipment Arrangement**

The pipe racks must be on the positive X side.

The drawworks must be on the negative X side.

The mud tanks must be primarily behind the rig toward negative Z.

**Constraint F — Collision Avoidance**

Moving equipment must not visibly pass through unrelated structures.

The travelling block must not pass through the crown.

The top drive must not pass through the drill floor.

**Constraint G — Coordinate Integrity**

Do not confuse local coordinates with world coordinates.

When parenting objects to moving groups, calculate transformations correctly.

**Constraint H — Rig Scale**

The mast must be substantially taller than the drill floor is wide.

The drill pipe must be much thinner than the primary mast legs.

Mud tanks must be substantially smaller than the overall wellsite.

---

# 20. ADDITIONAL SPATIAL REASONING CHALLENGES

These requirements are intended to test reasoning rather than basic geometry generation.

## Challenge 1 — Correctly Orient Every Structural Brace

Given two arbitrary points A and B, construct a beam whose longitudinal axis connects them.

Do not assume that every beam is vertical or horizontal.

## Challenge 2 — Maintain a Moving Hose Connection

The rotary hose must connect a fixed standpipe outlet to a moving top-drive inlet.

As the top drive moves, the hose curve must update.

The hose must retain a plausible hanging shape.

## Challenge 3 — Coordinate Pipe Transfer

A pipe begins horizontally on a rack and ends vertically near the well centre.

The animation must use coherent translations and rotations.

Do not independently animate the two pipe ends in ways that change pipe length.

## Challenge 4 — Preserve Coaxial Alignment

The drill string must remain aligned with the well centre while rotating.

Its world-space centre must not drift when the top-drive assembly changes elevation.

## Challenge 5 — Preserve Structural Hierarchy

Static rig components should not move when the travelling block moves.

The mast should not be parented to the moving top-drive group.

The drilling line and hose should respond to the motion without moving the fixed equipment.

## Challenge 6 — Correct Drill-Floor Access

Stairs must connect ground level to the elevated drill floor.

Stair treads must remain horizontal.

The stairs must not terminate below or above the platform.

## Challenge 7 — Camera-Independent Geometry

The scene must remain mechanically coherent when viewed from any direction.

Do not use billboard geometry to fake major equipment.

---

# 21. PERFORMANCE REQUIREMENTS

Target smooth operation on a desktop browser with a discrete GPU.

Use:

- Shared geometries where possible.
- InstancedMesh for repeated pipe and structural details where appropriate.
- Sensible shadow settings.
- Efficient animation updates.
- Object grouping.
- Limited per-frame allocations.

Avoid unnecessarily rebuilding static geometry every frame.

The scene should remain usable while animations are running.

Visual detail is important, but avoid uncontrolled geometry counts.

---

# 22. VALIDATION AND SELF-TESTING

Implement programmatic checks where practical.

At minimum, verify:

1. Well centre alignment.
2. Crown block elevation above travelling block.
3. Travelling block elevation above top drive.
4. Top drive elevation above rotary table.
5. Drill floor elevation approximately 8 metres.
6. Mast height approximately 48 metres.
7. Pipe racks positioned on positive X.
8. Drawworks positioned on negative X.
9. Mud tanks positioned toward negative Z.
10. Drill string rotation axis parallel to world Y.
11. Hoisting travel remains within defined limits.
12. Pipe transfer path remains continuous.

Display validation results in the browser console.

Use explicit pass/fail messages.

Do not silently ignore failed checks.

---

# 23. OUTPUT REQUIREMENTS

Produce a complete implementation.

First, provide:

1. A concise architecture summary.
2. The world-coordinate layout.
3. The scene graph hierarchy.
4. The mathematical approach for structural beams and moving assemblies.

Then provide the implementation files.

For each file:

- State the filename.
- Provide its complete source code.
- Include necessary imports.
- Ensure exported functions and classes are consistent.

After the code, provide:

- Installation instructions.
- Run instructions.
- Controls documentation.
- Known limitations.
- A validation checklist.

Do not substitute prose descriptions for implementation.

Do not omit required code to reduce output length.

Do not write "implementation left as an exercise."

If the implementation exceeds the available response budget, prioritise a runnable core application and explicitly identify which requirements remain incomplete. Do not claim unimplemented features are complete.

---

# 24. FINAL ACCEPTANCE TEST

A successful implementation should allow a user to:

1. Launch the application locally.
2. See the entire drilling rig from an elevated perspective.
3. Rotate the camera around the rig.
4. Inspect the mast and its structural bracing.
5. See a top drive suspended inside the mast.
6. Move the top drive vertically.
7. Rotate the drill string.
8. Inspect the drill floor and rotary table.
9. See the BOP beneath the drill floor.
10. Inspect pipe racks and the catwalk.
11. Run a pipe-handling animation.
12. Inspect the mud tanks and pumps.
13. View equipment labels.
14. Switch camera presets.
15. View rendering diagnostics.
16. Run spatial validation checks.

The model must demonstrate that it understands the physical and spatial relationships of a drilling rig rather than merely reproducing its general silhouette.

**BEGIN IMPLEMENTATION NOW.**