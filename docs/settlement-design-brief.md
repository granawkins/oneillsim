# Whole-settlement landscape design brief

## Authorized scope

Grant requested a complete beautiful, populated, connected settlement, not a symmetrical arrangement of sample assets; approved reconsidering terrain and time for iterative screenshot review. Work on main; parent owns final integration, saved-world apply, commit/push and service. Baseline: a6c5779; immutable input assets/settlement-source-world.json, 482 records, SHA256 98b71f7a70b06603dc080287c3025ca95242be1f64c5f4f463837b7020fb2591. Preserve saved IDs and unrelated fields; replacements must be specifically named. Leave exterior 9 existing inspection specimens untouched. No new servers/ports, dependencies, credentials, infrastructure changes or PUT testing.

## Visual brief and source

Actually reviewed source Figures 5-4 (sp413-s02237), 5-5 (sp413-s02259/60), 5-7 (sp413-s02284): broad long vistas; a planted pedestrian sequence between grouped varied-height homes; stepped buildings integrated with gardens rather than bare continuous slabs; trees in foreground/middle distance; open-space relief between dense clusters; structures framing views; lateral connections and stairs. Printed p91 source segments sp413-s02262..76 support central plain, varied modular housing clusters and 4/5-story groups, window openness, lower-volume commerce/service, layered space and pedestrian facilitation. Fruit trees in neighborhoods/parks: sp413-s02373, p98. Interpret unsourced detailed floorplans and all new landscape geometry explicitly; do not label inferred exact counts or fully operational systems as sourced.

## Settlement-wide composition

- Residential A: retain all existing parcel IDs/buildings, enrich the long garden basin into connected planted public rooms; soften upper/middle terrace edges, add landmarks and access without burying doors or making uniform rows.
- Residential B: Garden Commons. A lively market/transit center around the existing spoke, clustered low-rise court neighborhoods, trees/benches/flower borders, asymmetric green ribbons, a quiet water garden. Preserve the existing Garden Court and 47 sample IDs.
- Residential C: Civic Gardens. A distinct civic/school/recreation center near its spoke, denser modular housing clusters graduating to quiet orchard edges. Compose groups and framed open spaces rather than mirror B.
- Farm A: retain ledger/deck/stair IDs and source allocation; replace 78 colored agricultural blockout appearances with appropriate visible crop/pond/animal/processing treatments. Keep real walking aprons and access. Below-ground layers have authored visible artificial lighting treatment.
- Farm B: productive agrarian landscape with crop mosaics, greenhouse precinct, orchard/pond park and accessible service center.
- Farm C: orchard/pastoral/food gardens, a distinct working landscape with animal housing, grain/legume/vegetable fields and utility precinct.
- Reserve continuous central circulation corridor z in [-7,7] on undeveloped ground sectors. Keep plots/houses out of that corridor; crossings only walkable paving. Road/transit sits beside pedestrian routes, not on them.
- Build terrain/circulation that connects full ring, Farm A access and Residential A basin/terraces. Existing cut ground gaps must not silently become impassable. Preserve analytic support and physics; do not add decorative geometry pretending to be walkable.

## Worker contract

Each owns only assigned new modules/tests/assets. Layout module exports a deterministic build... function accepting immutable baseline world and returning {additions, replacements, decks, stairs, routes, landmarks, summary}. additions/replacements are named objects {id,type,theta,z,scale,rotation,surface}; scale4 for existing OBJ assets unless genuinely justified; surface {deckId,height,anchorHeight,...}. Ground display height=-.05, canonical0; deck display=canonical-.05. Existing IDs replacements explicit. Additional IDs start settlement- and include district/role/stable index; no random runtime distribution. Route/landmark metadata documented. No mutating inputs/live world.

Inspect manifest/actual OBJ geometry (new bounds normalization exists) at actual scale. Validate tube containment, band/sector/stair/slab clearance, building entry/aisle access and clashes with baseline or owned new items. Avoid stretching generic homes into giant footprints or placing full curved Residential A landscape slabs on unrelated decks. Layered crops may use efficient repeated geometry/model assets rather than thousands of tiny separate colliders. Target complete composed scenes rather than arbitrary object count; maintain explicit inventory, coverage and open-space/circulation intent.

All browsers/rendering use exclusive global flock at /home/granawkins/.hermes/cache/scratch/oneillsim-render.lock. No concurrent software-WebGL/performance-gate jobs. Parent applies only after combined actual-object, traversal, renderer and screenshot review. Private exact backup, pinned SHA, atomic write, concurrent-change refusal and readback; deterministic/idempotent apply. Preserve existing controllers/editor/capture/public save API; default view may improve to showcase a genuinely walkable neighborhood, with old query presets retained.
