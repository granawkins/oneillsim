# Oneill Sim — architectural asset and skin pipeline

## Goals

Create a small set of historically grounded, hand-authored 3D building and farm assets that can be arranged to recreate SP-413 illustrations. Use repeatable modules and planned variants, not runtime procedural architecture. Keep assets legible at visitor scale while controlling geometry, material count, texture memory, and draw calls.

## Source references and what they establish

The primary reference is the NASA-hosted SP-413 report; the working PDF copy is kept outside the served project root as described in `study-html-build.md`.

- **Figure 4-8, printed p. 50 (PDF p. 67):** an exploded modular interior-construction diagram: non-structural wall panels; lightweight honeycomb floor panels; shades/railings; structural supports; translucent/clear/opaque roofing kits; a structural frame stackable to four stories; walkable roof panels; ceiling panels; spanning planks/beams. The text favors a light tubular frame, non-load-bearing walls, and prefabricated integrated service systems (e.g. bathrooms).
- **Figures 5-5 to 5-7, printed pp. 91–92 (PDF pp. 108–109):** illustrative terrace-housing exteriors, an apartment plan, and a housing view. The accompanying text describes clusters of one- or two-level homes, buildings as tall as four or five stories, terraced homes along the central plain's edges, and generous windows. These are conceptual illustrations, not fully dimensioned house plans.
- **Figures 5-8 and 5-9, printed p. 93 (PDF p. 110):** projected-area allocation and a partial longitudinal section. The report describes multiple layers above and below the central plain, with below-plain layers illuminated artificially; residential, community/commercial, service, agriculture, and mechanical functions occupy different layers.
- **Appendix B, “Structural System for Housing,” printed p. 113 (PDF p. 131):** a typical 4 × 6 m aluminum-tube structural bay, beams at 2 m centers, fixed connections, 5 cm honeycomb floor elements, and a 10 cm cellular wall panel assumption. Use these as documented dimensional anchors, not as a mandatory finished-home design.
- **Appendix C, “Agriculture,”** contains the study's food-production assumptions. The artwork establishes layered allocation and lighting, but should not be mistaken for a complete cultivation-rack specification.

Keep a fact/interpretation label for every consequential feature. Do not silently invent a precise SP-413 floorplan where the report gives only a conceptual view.

## Asset families

### Housing kit

Author a reusable kit of real-metre parts: 4 × 6 m frame bays; 2 m beam/column rhythm; floor and ceiling panels; opaque and glazed infill panels; door/window units; stair/rail modules; walkable flat roof/terrace panels; and a packaged service core. Assemble curated variations by hand:

1. One- and two-level homes, including set-back terrace homes.
2. Small clusters and apartment blocks derived from Figures 5-5 to 5-7.
3. Four-/five-storey structural-frame variants for the larger stacks shown in the report.
4. Mixed neighborhood compositions with deliberate variation in footprint, glazing, terraces, privacy, and height. Use controlled design variation rather than random runtime generation.

### Agriculture kit

Treat the agricultural area as an explorable multi-level facility, not a single “farm” prop. Build bed/tray modules, crop-row modules, support decks, walkways, mechanical/service cores, and overhead light bars. Make the illumination visible in interior/cutaway views. Configure a few documented layouts from Figure 5-8/5-9; do not claim a particular shelf count, wavelength, or growing technology is specified unless the source supports it. The eventual material/energy model should distinguish daylight-fed areas from artificially lit lower tiers.

## Geometry, skin, and performance rules

- Model in metres and record the finished bounds and display scale in a sidecar manifest. The editor currently applies a default scale of 4.0, so normalize OBJ coordinates accordingly unless the editor's asset-scale behavior is changed deliberately.
- Prefer flat panels, beams, and silhouette-defining openings. Put panel seams, small vents, labels, light strips, and surface wear in a shared UV atlas instead of adding small polygons.
- Use OBJ + MTL for compatibility with the existing `OBJLoader`/`MTLLoader` pipeline. Reuse a small 512×512 or 1024×1024 habitat atlas, keep an asset to one atlas material where practical, and avoid external textures beyond the atlas.
- Initial close-view target: a residence hero asset at or below about 1,000 triangles and one material; repeated background modules should aim below 500 triangles or use a simplified LOD. Farm tray/rack units should be substantially simpler. Treat these as budgets to check, not absolute standards.
- Repeated assets need a draw-call strategy as well as a triangle budget. Reuse shared geometry/materials; profile grouped/instanced placement before filling large neighborhoods. Use simpler distant variants and reserve detailed models for close museum inspection.
- Avoid duplicate hidden box faces, tiny geometric trim, excessive separate materials, unnecessary transparency, and per-object unique textures. Ensure all meshes are centered on their placement origin with their feet at y=0 and local +Y up.

## First prototype: `TorusHome_ModA`

A first two-level, set-back terrace-home study is in `assets/ultimate-buildings/` with its atlas, editor thumbnail, manifest, and repeatable generator `assets/scripts/build_torus_home_a01.py`. It uses one 4 × 6 m structural bay, a 2 m column rhythm, exposed frame, non-bearing panel infill, generous glazing, a service-core block, flat walkable roof, and a front terrace. The rendered/model size is approximately 4 × 6 m for the main home, with the entry stair extending the overall depth; exact bounds are in the generated manifest. Its two-level arrangement, window pattern, storey height, railings, and stair are authored interpretations rather than dimensions copied from the report.

The editor catalog includes this asset, but `world.json` was not modified. The preview card is `torus-home-a01-preview.png` in this directory.

## Production workflow for each asset

1. Record source figure/page, known dimensions, and the unresolved choices in a short asset manifest.
2. Block out the silhouette at real scale using the shared frame/panel kit; compare against the source illustration before adding detail.
3. Set the triangle budget and material/atlas mapping first. Keep the asset origin at floor center, feet at y=0, and orient its principal facade toward local +Z.
4. Export OBJ/MTL and atlas; create a square editor thumbnail and an isometric review render from the same geometry.
5. Validate OBJ indices, material-map paths, bounds, triangle count, and thumbnail before registering the item in `src/editor/catalog.js`.
6. Load and inspect it in the editor at normal placement scale. Do not modify `world.json` or add assets to the public world without explicit scene/layout approval.
7. For changes to a generator, regenerate the asset and compare both the mesh metrics and preview. Keep the export deterministic.

## Later milestones

1. Approve/refine the first home silhouette and common atlas palette.
2. Build two complementary housing variants (a one-level home and a stepped multi-level terrace cluster) from the same part family.
3. Prototype a representative artificial-light agricultural rack and a multi-tier farm bay, then arrange one cutaway/longitudinal section based on Figure 5-9.
4. Profile real scene density; only then choose shared geometry/instancing and LOD thresholds for large-scale neighborhood placement.
5. Recreate selected SP-413 graphics as curated scenes with an explicit source/interpretation legend. Keep the rest visually related but not mislabeled as exact historical reconstructions.
