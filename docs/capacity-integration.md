# Capacity-layer integration and verification

The additive runtime preserves `world.json` (1,573 saved instances, SHA-256 `30fa3a8784133571c948aa44425db43087197c18033d095d3b706675be83b3fb`). No saved IDs, editor transforms, source allocations or A terraces are replaced.

## Runtime

`main.js` loads the saved world before `createCapacityAssembly`. The assembly registers only returned physical proxies, constructs `createCapacityGround` using explicit full master-plan district boundaries, and adds canonical-floor inspection destinations to the existing garden tour without writing them into saved metadata. Disposal unregisters owned proxies and restores borrowed geometry/callbacks. Known-floor visits bypass the old highest-roof support ray. Distant exterior inspection reversibly hides these interior groups while retaining collision geometry.

The ground helper exactly clips four narrow entrance rectangles from the original indexed chordal grass sheet. The displayed mesh is also its real two-sided collision floor/ceiling: 52,224 original triangles become 52,298, with 108 source triangles clipped and 260 added vertices. Only physically supported B/C sectors replace the old analytic half-space; the original callback remains outside those sectors. No altitude-only ceiling bypass or whole-sector visual cutaway is used.

Farm entrances are 45 m along the sector from each spoke, beyond the generated promenade's z=6 bypass (which returns to z=0 at 35 m). First prototypes at 14 m would have sat below solid promenade paving even after grass clipping. Lower connecting strips and cross aisles were updated together; the 190 m cross aisle avoids stair voids/rails. Crop-mosaic separators are 0.28 m, not credited pedestrian circulation.

## Measured ledgers, not occupancy claims

- Known existing crop-bed footprints: 101,999.453 m², independently reconstructed against actual OBJ crop surfaces.
- New B/C crop-bed masks: 340,433.696 m².
- Combined quantified crop footprints: 442,433.150 m², including a declared 433.150 m² reserve over detailed Table 5-4. Every detailed crop category has separate geometric closure.
- New B/C housing interiors: 243,131.127 m².
- New community/service interiors: 79,863.586 m².
- New disjoint B/C classified public-open ground: 66,670 m²; combined with the audit's known A park allocation, the ledger reaches 100,000 m². A's baseline area definition remains identified separately.
- Farm geometry: 73,400 triangles / 50 material submissions; physical proxies: 43,016 triangles / 30 objects.
- Residential geometry: 198,494 triangles / 8 submissions and proxies, including actual transparent front-gallery parapets. Rooms have real portals/windows, roofs and floors; interiors are presently unfurnished.

Run `node scripts/audit-capacity-layers.mjs` for per-category definitions, source discrepancies and remaining gaps. Baseline housing manifest allocations are not certified net interiors and are not added to new measured floors to imply net capacity. Animal/processing/drying/water quotas, complete exterior-access/transport accounting, operational yields, universal egress and 10,000-person capacity remain unproven. Source rounded/detailed agriculture and printed total discrepancies are not normalized away.

## Actual verification

- 86 targeted Node tests passed, including exact clipped-ground behavior, layer geometry/area/clearance, saved-model avoidance, continuous controllers, ownership, exterior optics/interfaces and unchanged legacy physics gate. The saved-world legacy collider benchmark was 3,331.051 ms build and 0.806 ms controller p95; this benchmark excludes additive runtime geometry and is not presented as its build time.
- The complete additive-runtime movement probe recorded 10,419 movement ticks at 0.600 ms controller p95 on this host. This is a browser physics observation, not a GPU/FPS guarantee.
- `tests/capacity-layers.browser.test.js` exercises the complete decoded live scene: both farm stair chains down/up, both seven-level housing approaches and physical portals, both service descents/portals/return ascents; no intermediate teleports. Ten reachable layer/gallery/service views render with grounded, clear controllers and exact canonical heights.
- `tests/exterior.browser.test.js` checks all nine exterior views, twelve full-scene spoke crossings, exact registered-proxy accounting and saved/editor preservation, frame independence and real return/UI controls. The full collision inventory is 1,236,830 triangles; exterior engineering scenery remains excluded except the six explicitly approved interior spoke roots.

Browser fixtures block non-GET/HEAD requests, never PUT world data, and use the existing service and shared render lock. Both full browser suites also passed through the canonical public domain after deployment. Public verification exposed a delayed resize clearing a frozen capture buffer; capture-only resize repaint and explicit canvas-size synchronization fixed it without weakening PNG pixel assertions. Geometry submission counts are not FPS measurements or engineering certification.
