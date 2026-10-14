# Complete exterior assembly

The exterior is a runtime-owned, metre-scale engineering scene, separate from the compact saved-world/editor inventory. It completes the station as a connected assembly rather than enlarging or repeating the nine inspection coupons. `world.json` and its 1,573 saved records remain untouched.

## Coordinate and frame contract

The habitat wheel occupies XY; +Z is north. Rotating spokes, hub, pressure envelope, solar-cell sectors and secondary mirrors attach once beneath `habitatGroup`. Docking, fabrication, main mirror, radiator, shield and remote industry attach beneath a separate stationary scene group. Visual references remain separate under arbitrary ring rotation; no counter-rotation is incorrectly applied twice.

Exterior sunlight/fill is enabled only while the exterior envelope is displayed; the interior's environment/material settings are not reassigned. Surface illumination is presentational, not a modeled energy system.

## Components and source authority

- **Six hollow spokes:** 15 m diameter, aligned with the six actual district/spoke centers; joints link the central hub to the inner torus rim. Elevator/cable/heat-transfer roles are documented in SP-413 printed p.89, `sp413-s02206/07`.
- **Central hub and North Pole:** 130 m hub diameter and 15 m × 60 m docking body follow Figure 5-3 (`sp413-s02235`); north/south de-spin collars, ports, pipes, service ribs and hatches are authored detail, not certified mechanisms.
- **Fabrication sphere:** 100 m diameter, south of the hub, documented at `sp413-s02225/26`. Its exact axial offset, airlock layout and structural detail are interpretation.
- **Pressure envelope:** the source describes one-third glazing and two-thirds aluminum, `sp413-s02208/09`; this mesh follows Figure 5-1's 120° angular aperture, not an exact one-third torus surface-area calculation. A 0.5 m outward tessellation allowance keeps flat faces outside the nominal interior; the solid shield uses the same allowance to preserve relative gap/thickness. Window ribs and panel segmentation are authored geometry.
- **Radiation shield:** separate shell, 1.5 m gap and 1.7 m thickness, `sp413-s02211/12`. Window-region mirrored chevrons follow the described concept (`sp413-s02213`) but are not a radiation-transport solution. The shield is represented stationary; the study's possible counter-rotation is not simulated.
- **Solar-cell fields:** silicon arrays between hub, spokes and secondary mirrors, facing north, `sp413-s02232/33`. Panel counts/area are geometry measurements, not a demonstrated electrical output.
- **Optics:** stationary main mirror and rotating, independently directed secondary segments, `sp413-s02218/19`. Main-mirror size, 45° central tangent, position and shallow sag are authored; nominal central reflection sends incoming −X toward −Z. Secondary normals use a single-bounce reflection construction toward the windows. This is not complete optical ray tracing or habitat illumination simulation.
- **Radiator:** the tour gives 490,000 m² at printed p.89 (`sp413-s02227/28`), while the thermal discussion gives 940,000 m² at p.103 (`sp413-s02458`). The displayed 700 m × 700 m physical sheet uses the tour area once, not an invented reconciliation or a doubled face area. Segmented bays, feed/return headers and attachment detail are authored.
- **Solar furnace/thermal power:** the source describes a 200 MW plant and fabrication furnace (`sp413-s02227`); a static concentrator/receiver/process assembly represents the stated system, not operational power generation.
- **Remote extraction:** the vacuum-operated plant is placed 10 km south of the hub, with maintenance spheres, its own solar furnaces/power plant and pressurized transport, printed p.103 (`sp413-s02464–68`). The authored transport body spans from the fabrication-side adapter at z=−230 m to the plant at z=−10,000 m; do not call that body a 10,000 m tube. Plant dimensions, tube diameter, module layout and static tug silhouettes are interpretation.

Original source figures 5-1, 5-2 and 5-3 are consulted but not republished as textures.

## Runtime and inspection

- Builders: `src/exterior-structure.js`, `exterior-energy.js`, `exterior-industry.js`.
- Integration/ownership: `src/exterior-assembly.js`.
- Named camera poses and existing God-mode controls: `src/exterior-views.js`, `exterior-controls.js`.
- Envelope visibility is restricted to free exterior views outside the inhabited tube. Returning to human/planner mode restores the legacy cutaway, original specimen visibility and interior clipping distances. Existing inspection records are never deleted or rewritten.
- Distant exterior views reversibly cull interior asset roots, terrain-paint patches and circulation rendering behind the envelope; all logical objects, collider geometry and saved fields remain intact. Close window inspection restores them. User-added free-transform exterior objects are not treated as interior scenery.
- **Inspect the station exterior** offers whole-station, spokes/hub, docking, fabrication, solar/secondary optics, main mirror, radiator, shield and remote-industry views. **Return to gardens** uses the existing garden visit/controller flow.
- Direct inspection URL query: `?exterior=overview`; use the named view IDs in `exteriorViews`. The existing game snapshot API validates `scene=game&exterior=overview` and rejects unknown names. A real 480×320 loopback API capture succeeded in 42.21 seconds, but public API capture requests hit the existing gateway timeout. Public browser inspection and all nine direct browser screenshots passed; the public HTTP snapshot timeout remains an operational limitation. No additional renderer/server/port or proxy configuration is introduced.
- Exterior camera clipping extends to 20 km for the remote facility. Gameplay restores near 0.05 m / far 5,000 m. Exterior components are visual inspection geometry and do not enter the human collision index.

## Verification

`tests/exterior-structure.test.js`, `exterior-energy.test.js`, `exterior-industry.test.js` exercise actual geometry, source/interpretation contracts, frame transforms, clearance, normals, areas and owned disposal. `exterior-assembly.test.js` verifies frame separation, reversible visibility, preservation and camera target parity. `snapshot-options.test.js` preserves old requests and validates exterior overrides.

`tests/exterior.browser.test.js` uses the existing server under the shared render lock: decoded full scene, every named inspection capture, stationary transform parity, no new colliders, exact compact editor/data preservation, grounded return to gardens and actual visible UI clicks. Run state loading at a small software-WebGL viewport, then resize for screenshot review. Browser tests never PUT world fixtures.

The combined transport junction shows an open annular hatch around the bore rather than a closed disc cutting through the joined tube. That clearance is tested with actual rays; it is not a claim of engineered pressure-door mechanisms or human transit gameplay.

This is a sourced visual museum assembly, not a validated spacecraft, working industrial ecosystem, walkable zero-gravity transport system or moving docking/pressure mechanism. Chevron folds are thin illustrative reflectors, not volumetric certified shielding.
