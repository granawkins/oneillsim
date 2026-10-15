# Inhabited garden — asymmetric neighborhood art-direction pass

This is a replacement interior, not full source compliance or final visual approval.
The torus/exterior assemblies are unchanged; nine saved exterior transforms are
compared exactly with the immutable pre-reset fixture. The original live world
was backed up under `~/.local/share/oneillsim/backups/interior-reset/` before
replacement. Never rerun the reset against an already replaced world.

## Design and source ledger

`src/interior-plan.js` owns architectural composition and the explicit source
ledger. `src/interior-runtime.js` builds physical curved floors, supported
structures, galleries, landscape volumes and transport. `world.json` remains
for reusable model placements, original farm surfaces and exterior transforms;
it no longer has to encode all architectural runtime geometry.

- Six alternating residential/agriculture districts.
- Best existing farm A arrangement reused in all three farm districts: seven
  levels each, 78 existing agricultural parcels each. These are retained model
  geometry, not a new claim that every crop/yield allocation is satisfied.
- Three residential spoke neighborhoods: 32 larger stepped housing shells per
  district, composed as three compact courtyard clusters rather than continuous
  contour rows. Raised homes sit on continuous masonry retaining plinths with
  actual front stairs; there are no above-plain thin support piers. Existing
  single-family assets at district ends remain uncredited and unchanged.
- Twelve broad park hills occupy the gaps between clusters. Their footprints
  are 123–129 m along the ring by 40 m across the tube; the 5.5–6.3 m smooth
  cosine-based, gently skewed landforms meet the plain with a zero-gradient skirt. Their inner toes
  are at |z|=15, outer toes at |z|=55: not strips pressed against |z|=65 walls.
  Each has a 3 m meandering summit walk, 6 m toe aprons and transverse crossings
  to the ground contour walks at z=±9. Render and collision use the same sampled
  curved triangles. Grounded trees are grouped beside, not inside, summit walks.
- The former aerial contour galleries/crossbridges were replaced by grounded
  contour walks and park crossings, removing their forest of piers and facade
  conflicts. Existing camera/control modules and the .36 m belts are untouched.
  The old paired 95-tree promenade rows were replaced by groves, roof planting,
  orchards and interrupted ground shrub pockets; this also clears home stairs.
- Below-plain civic precincts have physical floors/stairs, narrow ground
  openings and an intact ceiling outside those openings. They are not fully
  equipped services or certified accessible/evacuation-safe facilities.

Source locations (verified against local study manifest and original scans):
- Population target: 10,000, SP-413 printed p.66 / PDF p.83,
  `sp413-s01662`.
- Community program: Table 3-2, printed p.26 / PDF p.43,
  `sp413-s00708`.
- Housing: printed p.32 / PDF p.49, `sp413-s00912`; illustrations
  Figs.5-5 and 5-7, printed pp.91–92. The 49 m²/person residential
  allocation includes 37 indoor and 12 exterior access, not 49 indoor.
- Composition inspiration: Fig.5-9, printed p.93 / PDF p.110,
  `sp413-s02286`. Exact architecture and terrain remain interpretation.
- Plant/animal areas: original scan Tables 5-4 / 5-5, printed p.98 / PDF
  p.115, `sp413-s02395` and `sp413-s02393`. Reader captions appear transposed;
  original scan labels control.

Modeled gross shell floor area (m²): housing 370,000; schools 10,000;
hospital 3,000; assembly 15,000; shops 23,000; offices 10,000;
recreation 10,000; industry 40,000; storage 50,000; miscellaneous
29,000; communications 500; water 40,000; electrical 1,000.
These are geometrical envelopes, not net usable areas, demonstrated occupancy,
or functional institutions. Additional detailed homes are not credited.
Exterior residential access (120,000), park and transportation program totals
are not yet independently reconciled. The public source panel states these
limitations and `fullSourceCompliance` deliberately remains false.

## Asymmetric neighborhood composition (authored interpretation)

The preceding real overview/meadow/plinth screenshots still showed reflected
banks, repetitive slab skylines and horizontal black gable ribbons. This pass
changes geometry/composition, not just color, while retaining the white terraced
housing family of Figs.5-5/5-7 and the source program:

- Independent bank offsets and three authored district width/height sequences.
  Houses are 29–44 m wide and 4–13 storeys, with low garden houses interleaved
  with narrower shouldered upper floors. Three distinct terrace setback depths
  replace the single universal profile. Upper-floor shoulders stay within their
  supporting footprint; no new stilts or cantilevered disconnected floors.
- `housingLevelShape` is shared by runtime, floor ledger and roof dressing.
  Every shouldered floor polygon contributes its actual width × depth; housing
  remains 370,000 m² and all civic categories remain unchanged. This is still
  gross shell area, not occupancy or certification.
- Opposite park centers differ by more than 25 m rather than sharing a mirror
  axis. Bank-specific crossings end at their own toes instead of cutting across
  the other bank's displaced hill. Differently bent/rippled summit paths still
  pass the same real-controller routes. Restrained landform skew, three meadow
  tones and three irregular copse/woodland-edge recipes leave open grassy rooms
  rather than filling the whole meadow with evenly spaced trees.
- Gable glazing is now separated, household-scale vertical window groups rather
  than a single long ribbon per floor. Front/rear openings are smaller and
  interspersed with muted earth/sage/clay shutters. White/cream masonry stays
  dominant; retaining plinths are stone-toned. Rear garden facades are no longer
  completely blank. These are visual window panels, not new navigable openings.
- Six arrival rooms follow the actual bank-specific housing gaps. Each district
  has one water court and one shaded grove/table court, with planted edges and
  a clear entry aisle. There are no paired duplicate ponds. All existing farm,
  exterior, detailed-home and unrelated saved placement records remain exact.

The guarded dressing pass updates only its owned placements/landmark ledger,
regrounds crown plants, and reuses existing OBJ types/atlases. The live scene has
1,292 saved placements, including 719 owned garden details. Rendered appearance
of this pass still requires the parent's single-browser review; passing the
geometry/controller checks is **not** a claim that the result is beautiful.

## Express walkway

Two turquoise lanes run at z=+5/-5 with opposite 18 m/s transport. Deck top
is a continuous 0.36 m level to clear retained 0.31 m spoke thresholds.
The height and speed are authored visitor interpretation. Surface motion is
recomputed each physics tick only while grounded within the physical lane and
height band. Stepping off removes belt velocity; high galleries do not propel
players. A sloped prototype repeatedly lost grounding at speed; the continuous
level fixes all six spoke crossings without widening airborne propulsion.

## Verification

- `node --test tests/interior-landscape.test.js tests/interior-redesign.test.js tests/interior-boundaries.test.js tests/capacity-ground.test.js tests/exterior-assembly.test.js tests/character-controller.test.js`
  passed **26/26 tests** after the guarded world update. This includes two new
  composition/plant-support regressions. Controller tests traverse
  all twelve complete summit walks at 15 m/s with 144 real hill-tree OBJ
  colliders plus 33 real arrival-court trees, enter all six arrival courts,
  climb/descend a transverse grass face at 6 m/s, and ascend the
  physical 4.5 m housing-plinth stair onto its balcony. Additional checks cover
  hill/housing and contour-path/balcony separation, skirt continuity, tube
  containment, floor ledger, exterior/farm preservation and dressing idempotence.
  These are targeted tests, not a full historical version-1 test-suite claim.
- At the **previous checkpoint**, `node scripts/verify-interior-browser.mjs`
  passed against the real loopback
  scene, loaded all assets, found zero page errors and exercised full-world
  controller routes. A 2 s idle ride traveled 36.016 m; residual motion after
  step-off was about 0.00012 m. All six spoke crossings traveled 72.031 m in
  4 s and remained grounded.
- Previous-checkpoint overview, eye-level, gallery and farm PNGs were captured
  with Chromium and reviewed in private scratch `torus-interior-redesign/`.
  They do **not** establish visual approval of this landscape/podium revision;
  its render/full-world browser QA belongs to the integrating parent agent.
- Revision runtime statistics: 132 authored shells, 10,406 physical solids,
  460,502 registered triangles and 453 merged render batches. These are not FPS
  or total scene draw-call claims. Tests include 177 additional real hill/court
  tree colliders separately from that procedural runtime triangle total.

## Dressing safety

`node scripts/dress-interior-gardens.mjs` is now read-only by default. An explicit
`--apply` makes a private timestamped backup in
`~/.local/share/oneillsim/backups/interior-garden-terraces/`, checks concurrent
world changes, verifies exact unrelated-placement/farm-surface/exterior preservation,
requires unchanged asset types and byte-idempotent dressing,
and reads back the exact written payload. The only removed/replaced records are
`interior-garden-detail-*` and the old `interior-residential-?-tree-N-SIDE` twin
rows. All other placement records, including farms and detailed homes, remain
exact. The immutable pre-reset source fixture is never changed or regenerated.

## Render QA handoff

Use the existing browser helper's `capture(name,t,z,h,targetT,targetZ,targetH)`
convention (angles radians, height radial, z metres), after readiness and with
one software-WebGL session only:

- **Composition overview (same comparison pose)**:
  `('overview', .49, 0, 59, .60, 0, 0)`.
  Compare against the previous PNG: opposing banks and parks should visibly
  begin/end at different x positions, with alternating low/shouldered silhouettes.
- **Oblique skyline**:
  `('oblique-skyline', 350/830, -9, 13, 590/830, 25, 17)`.
  This is intentionally off-axis; look for varied heights/widths and smaller
  separated gable windows, not cloned striped slabs.
- **Meadow approach**:
  `('meadow', 350/830, 35, 1.81, 445/830, 35, 4.5)`.
  The positive-bank hill now centers at x=429.914 m, not the old x=414.164 m.
  Expect a wooded edge framing an open meadow, not eight evenly spaced pairs.
- **Grass-face approach**:
  `('grass-face', 429.91403434482515/830, 12, 1.81, 429.91403434482515/830, 38, 4)`.
- **Housing plinth/stair**:
  `('housing-plinth', 285/830, -7, 1.81, 301/830, -17, 5)`.
  The tested 4.5 m plinth house centers at x=308 m, front z=-15.554 m.
  Look for continuous stone-toned masonry and the existing parallel entry stair.
- **Hill summit to city**:
  `('summit-city', 429.91403434482515/830, 35, 7.205, 590/830, 25, 16)`.
- **Shaded arrival court**:
  `('arrival-grove', 572.8280686896503/830, 11, 1.81, 572.8280686896503/830, 29, 3)`.
  Expect a planted gathering room and clear center entry rather than a second pond.
- **Opposing water court**:
  `('arrival-water', 545.0780686896503/830, -12, 1.81, 545.0780686896503/830, -28, 2.2)`.
  Court centers in B/C differ again; use `plan.courts` instead of adding a constant
  district rotation to A's court offsets.

## Integrated visual and full-world verification

`src/main.js` mounts the opaque boundaries under the interior runtime and disposes
them before their parent. All six complete tube partitions remain opaque at
lower farm levels; their 18 permanently open framed surface portals carry the
central promenade and both moving lanes. Lower-level district shortcuts are
intentionally sealed; use the existing stairs and surface crossings.

The integrating parent ran the combined 26-test suite successfully and exercised
an unrouted browser against the complete loaded scene. All twelve hill summit
routes and all 18 portals in both directions (36 crossings) passed with all saved
assets loaded. All six spoke/belt routes passed and step-off removed propulsion.
Nine new real rendered views, including the summit approach, masonry entry stair,
shaded court, partition doorway and lower-farm wall, were inspected. The plain's
grass color is now harmonized with the meadow slopes and restored on runtime
disposal; no global lighting, exterior material or camera change was required.

Visual style remains simplified, not photorealistic. Housing/civic floor totals
are preserved; full net-space/source certification is not claimed.

## Remaining acceptance gaps

This is a substantive geometry/landscape revision, not final visual approval or
source certification. Detailed apartment entrances/interior circulation, roof
access, neighborhood furnishing and certified accessible routes remain incomplete.
Housing entry uses stairs; the parks are gentle physical walking slopes, not an
accessibility certification. Agricultural irradiance/yields and classified
access/park/transport totals remain unverified. No claim is made that replacing
landscape geometry completes the study's 120,000 m² exterior-access allocation.

The existing unauthenticated public world PUT save endpoint remains unchanged.
