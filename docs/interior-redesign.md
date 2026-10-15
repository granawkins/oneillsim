# Interior reset — inhabited garden, first implementation

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
- Three residential spoke neighborhoods: multilevel housing envelopes,
  supported galleries/crossings, single-family asset placements at district
  ends, roof planting, orchards, ponds and outer-verge landscape volumes.
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

## Express walkway

Two turquoise lanes run at z=+5/-5 with opposite 18 m/s transport. Deck top
is a continuous 0.36 m level to clear retained 0.31 m spoke thresholds.
The height and speed are authored visitor interpretation. Surface motion is
recomputed each physics tick only while grounded within the physical lane and
height band. Stepping off removes belt velocity; high galleries do not propel
players. A sloped prototype repeatedly lost grounding at speed; the continuous
level fixes all six spoke crossings without widening airborne propulsion.

## Verification

- `node --test tests/interior-redesign.test.js tests/capacity-ground.test.js tests/exterior-assembly.test.js tests/character-controller.test.js`
  passed 15 tests. This command is targeted, not a claim that every historical
  version-1 inventory test still applies to the replacement layout.
- `node scripts/verify-interior-browser.mjs` passed against the real loopback
  scene, loaded all assets, found zero page errors and exercised full-world
  controller routes. A 2 s idle ride traveled 36.016 m; residual motion after
  step-off was about 0.00012 m. All six spoke crossings traveled 72.031 m in
  4 s and remained grounded.
- Real overview, eye-level, gallery and farm PNGs were captured with Chromium
  and visually reviewed. Review artifacts live in the private scratch
  `torus-interior-redesign/` directory, not source control.
- Runtime statistics: 259 authored shells, 14,433 physical solids, 375 merged
  render batches. These are not FPS or total scene draw-call claims.

## Remaining acceptance gaps

This is a functional first implementation, not the requested finished beautiful
experience. Reviewed housing still reads as repetitive long bands with many
thin support piers. Neighborhood silhouettes, intimate spaces, hill profiles
and the distinction between the three residential districts need stronger art
direction. Some elevated galleries run close to housing facades. Detailed
apartment entrances/interior circulation and roof access are incomplete.
Agricultural irradiance/yields and classified access/park/transport totals
remain unverified. Do not describe this checkpoint as a final source-compliant
settlement.

The existing unauthenticated public world PUT save endpoint remains unchanged.
