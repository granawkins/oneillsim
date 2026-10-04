---
name: 3d-assets
description: Use when creating or reviewing habitat 3D assets.
version: 0.1.0
author: Grant (granawkins), Hermes Agent
license: MIT
platforms: [linux]
metadata:
  hermes:
    tags: [assets, modeling, obj, mtl, textures, snapshots]
    related_skills: [stanford-torus, space-settlements-design-study-reference]
---

# 3D Assets

Create curated, hand-authored assets for the Stanford Torus digital museum. This workflow is shared by parent agents and asset-making subagents, so outputs fit one visual/technical kit and can be integrated without overwriting each other's work. Do not create runtime-random architecture unless explicitly requested.

## When to use

Use for generating, revising, reviewing, rendering, or registering buildings, farms, public spaces, or system assets. Read `stanford-torus` for project/deployment rules and `space-settlements-design-study-reference` before historical modeling. Detailed design/pipeline rationale lives in `docs/reference/asset-pipeline-plan.md`.

## Source and visual guidelines

- SP-413 controls the design. Identify the relevant figure/table/printed page and retrieve it through the reference skill before modeling. Keep source-established dimensions separate from an authored interpretation; do not invent a precise floorplan where the study provides only conceptual art.
- Housing anchors: Figure 4-8 modular frame/panels; Figures 5-5 to 5-7 terrace housing; Appendix B structural bays. Verify details rather than copying stale numbers from skills.
- Agriculture anchors: Figures 5-8/5-9 and Appendix C. Visible artificial lighting and multiple layers should follow the study's documented allocation; unspecified rack geometry is interpretation.
- Build related hand-authored variants from a shared modular kit. Preserve opening geometry, walkable terraces, stair/rail silhouettes, and human-scale legibility. Put seams, small vents and fine details in the texture skin, not excess polygons.

## Files and coordinate conventions

- Models/skins: `assets/ultimate-buildings/` or `assets/ultimate-nature/`: OBJ, MTL, shared atlas, sidecar `<asset>.asset.json`.
- Editor thumbnails: `assets/icons/ultimate-buildings/` or the appropriate family directory; development preview image can accompany the asset.
- Real placeable names: `src/editor/catalog.js`; reference/library group, type slug and variants: `src/asset-library.js`. Planned names are not real editor assets.
- Viewer: `assets/gallery.js`, mounted by `app/assets/[slug]/`; current scene snapshot allowlist comes from the asset-library registry.
- Existing example: `TorusHome_ModA` and deterministic generator `assets/scripts/build_torus_home_a01.py`. Inspect actual current files rather than treating example geometry as a universal template.
- Define dimensions in metres, feet at local `y=0`, local +Y up and principal facade toward +Z. Inspect editor default scale before export; record OBJ coordinate scale and intended placed scale explicitly so assets are not accidentally enlarged.
- Prefer a shared 512/1024px atlas and very few material groups. Target about 1,000 triangles/one material for an initial residence hero asset; simpler repeated modules below about 500 triangles where practical. These are performance budgets, not sourced historical values.

## Manifest contract

Each asset manifest/review report must identify:

- Stable asset ID/name, variant/family, generator/export files.
- Triangle/vertex/material counts; actual bounds and dimensions at intended scale.
- Atlas and MTL texture paths; origin/orientation and coordinate/placement scale.
- Historical source pages/figures/tables, sourced facts, interpretation choices, unresolved questions.
- Preview/snapshot paths and verification performed.
- Collision-relevant intent: solid panels, door/window openings, floors/ceilings, walkable roofs and any required future moving parts. Do not claim a moving door works merely because it is modeled.

## Authoring and preview procedure

1. Establish source, silhouette, dimensions, shared palette/atlas, and budget before detail. Assign a unique stable name; confirm it does not conflict with another asset.
2. Generate deterministically or hand-author from the common kit. Validate OBJ indices, triangulation, MTL references, file-relative texture paths, normals, bounds, scale, feet/orientation, and material counts.
3. Create an isometric preview from the same geometry, not an unrelated illustration. Load it with `vision_analyze`, then inspect facade/openings and human/planner-distance appearance in the actual Three.js viewer.
4. Stage registry/catalog integration deliberately. Because legacy files are live-served, public integration happens immediately. Parent integrates only reviewed outputs; don't edit `world.json` simply to preview an asset.
5. Run applicable unit/browser tests, commit/push intended files on `main` under the project default, and redeploy if needed. World/layout placement remains a separate explicitly scoped change.

## Snapshot tools

Read `docs/reference/snapshot-api.md` for validated parameters. The existing HTTP renderer accepts only local simulation/registered asset pages (not arbitrary URLs), with at most two active renders. Use `terminal` to download a snapshot, then `vision_analyze` on the real output:

```text
curl -fsS 'http://127.0.0.1:3200/oneillsim/api/snapshot?scene=asset&asset=TorusHome_ModA&azimuth=38&elevation=22&distance=17&imageWidth=1280&imageHeight=900' -o "$HOME/.hermes/cache/scratch/torus-home-review.png"
```

For another asset, first confirm its ID is registered/allowlisted; otherwise use a local offline generator or browser-only viewer fixture until approved registration. Choose capture distance from actual asset bounds. Do not issue dozens of simultaneous snapshot requests: coordinate a queue, retry boundedly on HTTP 429, and never treat an error page as an image. Browser snapshots are screenshots of the existing renderer, not fabricated previews.

## Parallel-agent coordination

- Parent gives each task unique output filenames/directories, source references, shared-kit/palette contract, budgets, and acceptance criteria. Batch within the runtime's actual concurrency limit; do not assume fifty agents can run at once.
- Subagents own only their assigned assets/generator/manifest/preview. Return exact paths and measured metrics, plus limitations; do not independently modify shared registries, save world data, push or restart production.
- Use disjoint files or scratch output directories while working on shared `main`; parent performs serialized registry integration and verified deployment. Separate branches/worktrees are not the default for this unannounced project.
- Parent reads actual files, validates all asset counts/paths, inspects previews, and tests placeability. A child's claim of success is not verification.

## Pitfalls and verification

- `assets/*` is ignored by Git; force-add only intended reviewed deliverables, not whole asset trees/private research/generated bulk data.
- Preserve source images' reuse constraints. Reference art is not automatically approved as a published texture.
- Reusing a model requires a draw-call/shared-geometry strategy as well as a triangle budget. Measure scene density before filling neighborhoods. `docs/street-furniture-kit.md` records a complete six-type example, measured court and clone-versus-instance experiment; cached clones are not runtime instancing.
- Share a material creator only for an explicit kit whose MTL definitions/atlas are identical; do not pool unrelated materials merely by name. Cache readiness must include atlas failures/retries. Mark borrowed geometry/material identities outside serialized userData; deleting a clone must not dispose resources used by other clones, while unique blockouts/replacements still dispose.
- Test library file links and thumbnail URLs after registering shared atlases; `${id}_Atlas.png` is not a valid convention for every model. Frame small props from actual bounds while preserving established house capture poses.
- Keep additive world placement repeatable and bounded: private backup, stable new IDs, exact preservation of original records/fields, concurrent-change guard and read-back. Use `scripts/populate-street-pilot.mjs` or `scripts/populate-residential-kit.mjs` as references, not a license to regenerate the live world.
- Validate stairs with the actual gameplay controller at current speed, not just geometric headroom/route tests. Ground entry crossings and all stair flights must settle on their floors/landings; contact projection must not turn horizontal input into a ballistic jump. Residential example/checks: `docs/residential-kit.md`, `tests/residential-stairs.test.js`.
- Full-world physics tests must load authored OBJ models from both building and nature directories as well as procedural blockouts once placed. Exclude exterior worldTransform specimens from tube gameplay colliders; compare loaded IDs/counts against current saved records rather than stale fixed totals.
- Align new interior feet through explicit saved display heights (ground −0.05, terrace canonical height−0.05) while retaining canonical anchorHeight metadata; do not change legacy height-zero transforms. Validate full geometry, circulation and actual-controller routes against the complete candidate scene before a guarded additive apply.
- Generate JSON-compatible exterior quaternion components (avoid authored negative zero) and test exact serialization/idempotency. Do not silently normalize or repair imported explicit transforms. Keep layered farm review cameras below overhead slabs rather than using an occluded high planner view.
- Bake cylinder curvature into long parcel assets rather than exporting tangent slabs. At radius r=830-elevation, map intrinsic arc x and height y to X=(r-y)sin(x/r), Y=r-(r-y)cos(x/r), and rotate normals; validate intrinsic reservations separately from curved Cartesian bounds. See `docs/residential-district-assets.md`.
- Use a checked-in immutable source fixture for replacement-kit generators. Once live blockouts are removed, generators reading mutable world.json lose their original dimensions. Keep raw authored manifests intact and normalize differing schemas in the library/viewer; test every registered variant.
- Run wall-clock physics performance gates separately from browser/software-WebGL jobs on this shared host. Concurrent work can exceed the same threshold that the unchanged serial benchmark passes; report both honestly rather than weakening the gate.
- Create a dedicated private backup subdirectory when a shared backup root has broader permissions; do not chmod unrelated storage silently.
- Normalize source-fact objects to display prose, object min/max bounds under either bounds key to axis pairs, and named material arrays to counts. Validate every model's resulting fields before rendering; raw schemas can otherwise cause React child errors or NaN framing. Preserve raw manifests.
- Gate viewer readiness on decoded atlas completion, propagate texture failures, and show actual pixel dimensions rather than a fixed atlas-size label. Track materials before awaiting textures so navigation during loading still disposes resources.
- Include both building- and nature-directory registrations in explicit material-pool eligibility. Verify all kit members share one material/map and download each atlas once; do not infer plant-brush behavior merely from a model's directory. Keep exterior-only full systems out of terrain placement menus.
- Verify ground paving in actual rendered views, not only support tests: the analytic circle lies outside chordal cylinder triangles, and terrain paint is lifted 10 cm. A real 15 cm paving crown avoids burial; use the same mesh for rendering and collision, and do not shift existing terrace/OBJ floors.
- Preserve new route/landmark/design metadata in both editor import and export. Browser-test exact compact asset and metadata round trips, and exercise actual destination controls at small and normal viewport sizes; a higher-z-index existing UI can intercept clicks on an apparently visible panel.
- Freeze browser animation only after readiness; bootstrap state at a small software-WebGL viewport, then resize for actual high-resolution visual review. Render one early loading frame rather than an unbatched partial dense scene every RAF if drawing starves OBJ/atlas progress.
- Keep historical pilot tests on immutable source fixtures once the live world grows. Never change acceptance counts merely to match a new scene; separately test full-scene preservation, inventory, actual controller routes and the unchanged isolated performance gate.
- Use explicit per-placement collision metadata for nonblocking low foliage and curved farm floor/solid zones. Retain tree trunks, furniture, buildings and equipment; validate contract keys/dimensions with actual model-floor rays and controller aisle/blocking tests before world application.
- Completion means a real decoded preview, valid OBJ/MTL/texture references, measured bounds/counts, correct orientation/scale, viewer/editor proof, and explicit source-versus-interpretation notes. World contents and other agents' files stay unchanged unless separately approved.
