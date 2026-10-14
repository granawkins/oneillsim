# Full settlement capacity audit

Read-only baseline: **1,573 saved records**, world SHA-256 `30fa3a8784133571c948aa44425db43087197c18033d095d3b706675be83b3fb`. No world, geometry, runtime, terrain or assets were changed. Run `node scripts/audit-settlement-capacity.mjs` from any working directory (absolute script path works); optional argument is repository root. JSON goes to stdout, not world.json. Tests: `node --test tests/settlement-capacity-audit.test.js`.

## Source verified, not normalized

Original private NASA PDF rendered with installed pypdfium2 and visually read: PDF108/printed91; PDF110/printed93 Figures5-8/5-9; PDF111/printed94 Table5-1; PDF43/printed26 Table3-2; PDF130/printed113 AppendicesB/C; PDF132/printed115 Table5-18. Reading-edition segments include sp413-s02271–s02280, s02289, s00907–s00908, s00708. Figure5-8 is on printed93, **not** printed92; the manifest currently omits its independent image segment.

* Printed91: projected 43m²/person residential/community, 20 agriculture/food processing, 4 mechanical/life support. At 10,000: 430,000 / 200,000 / 40,000m². Available projection 678,000m². The 15m deck separation is a conditional volume estimate, not permission to multiply decorative crop instances by 15.
* Table5-1: community **980,000 surface / 430,000 projected**, agriculture/processing/mechanical **650,000 surface / 240,000 projected**. Printed total **1,680,000 surface / 670,000 projected**. Original digits confirmed visually. Category surface sum is **1,630,000**, leaving **50,000m² unresolved printed inconsistency**. Neither total is silently corrected.
* Figure5-8 shows four residential layers and three agriculture/processing layers; Table3-2 specifies residential49 surface/12 projected (4 levels), plant44/14.7 (3), animal5/1.7 (3), processing4/1.3 (3), drying8/2.7 (3), all agricultural overhead15m. Rounding is printed; exact division need not reproduce rounded projection.
* Table3-2 public open space10m²/person is 100,000m², transportation12 is 120,000m². Residential49 includes exterior access; the current A plan splits37 internal plates and12 exterior reserve. These must not be compared as if 49 were all indoor net dwelling space.
* Chapter3 AppendixB defines projected area as total allocated surface divided by stack levels. Figure5-9 depicts high/low density housing, pedestrian community activities, mechanical core and below-plain industry/storage/processing. Chapter5 AppendixB specifies aluminum-column typical4×6m bays and2m beam centers, not an occupancy formula. AppendixC Table5-18 is **g/person/day**, not square metres: animal feed and byproduct flows matter. It does not justify calling all B/C flat plots livestock or parks extra edible crop capacity.

## Measured saved-world inventory

All quantities below are m². Projection is the master-plan **reserve**, not constructed usable floor.

| District | Records | Planned projection | Quantified modeled floor | Housing floor subset | Farm parcel gross reservation |
|---|---:|---:|---:|---:|---:|
| residential-a | 630 | 145,035.30 | 185,780.32 | 122,555.05 | 0.00 |
| farm-a | 92 | 80,949.93 | 0.00 | 0.00 | 217,666.67 |
| residential-b | 381 | 145,035.30 | 34,729.13 | 11,936.70 | 0.00 |
| farm-b | 34 | 80,949.93 | 0.00 | 0.00 | 38,976.00 |
| residential-c | 399 | 145,035.30 | 42,603.54 | 18,561.24 | 0.00 |
| farm-c | 37 | 80,949.93 | 0.00 | 0.00 | 38,976.00 |

The modeled full reference strip is 2π×830×130 = 677,955.69m² = **0.677956km²**, not 679km². Sector totals are 435,105.89 community and242,849.80 agricultural/mechanical; their430:240 ratio was deliberately spread over the whole strip. An allocation slightly exceeding source projection establishes no layered surface compliance.

Floor inventory reads actual placed-model manifests: `floorAllocation.netFloorSquareMeters` for baked district models, or `collisionIntent.floorSurfaces` tagged `floor` for residential kit shells. Scale uses placement scale × OBJ coordinate scale (normally4×0.25=1), not scale4 squared again. Net district slabs subtract manifest stair openings; they still include walls/circulation and are **not certified net habitable area**. Roofs, terraces, entrances, ornament, trees and silhouette volumes receive no indoor floor credit. No inferred occupants. B/C flat placement of models baked at A curvature is itself an integration caveat, not evidence of successful usable access.

Housing modeled floor is **153,052.99m²** versus490,000m² source residential surface: **336,947.01m² unverified difference**, with exterior access excluded and unquantified shells still possible. Therefore this is not an exact physical residential deficit, and certainly not proof of10,000-person capacity. Total supported floor across all categories is263,112.99m²; adding farm reservations or decks to it would double count nested supports.

Neighborhood metadata claims201 **new** B/C housing instances,295 explicit residence units and24 unquantified housing instances, with populationCapacity null. The full geometric census includes existing B housing and gives219 B/C housing instances. No per-instance manifest `dwellingUnits` exists for these models, so the audit separately preserves the aggregate metadata claims, rather than presenting them as independently certified dwellings or multiplying them by guessed occupants. B/C additions698 and A original parcels297 are provenance, not areas.

Explicit named A park supports total **33,330m²** versus100,000m² required open space. B/C have substantial unoccupied ground and landscaping, but it is not disjointly classified public-open-space geometry. Accordingly **66,670m² remains unverified**, not proven absent. Decorative grass/tree reservations and aggregate `unoccupiedProjectionLowerBoundSquareMeters` are not automatically public parks; retained paths, building aprons, ponds and transport are separate uses.

### Agriculture: neither B nor C is a livestock-only district

142 plot instances:78 fitted A replacements carrying full sourcePlot;32 each B/C flat intrinsic parcels. The13-item sourceAllocation is in `settlementDesign.summaries`, **not on142 records**: per-record sourceAllocation count is0. The script exposes both correctly. A totals217,666.67m² gross source reservation, B/C38,976 each, total295,618.67. A contains147,333.33 crop,17,000 animals/fish,26,666.67 drying,13,333.33 processing,13,333.33 water. The B/C lists contain grain, soy, vegetables, rice, livestock, ponds, processing/water/drying, greenhouse, garden and orchard—not merely livestock.

Known crop categories (sorghum/soybeans/wheat/rice/corn/vegetables) total **173,433.33m² gross**, leaving **266,566.67m² below440,000m² plant surface** even before internal lanes, equipment and setbacks. Orchard/garden/greenhouse are ambiguous and not silently converted to sourced edible production. All plot types together are still only295,618.67m² gross, so that ambiguity cannot establish440,000m² crop compliance. Farm A contains the original one-third source crop allocation; B/C are much smaller authored additions, not the remaining two-thirds.

## Analytic supports, not additive production capacity

Deck area = (end-start)×(830-height)×union-of-z-bands. Stair rectangles are intersected with bands and subtracted once. There are no authored apron dimensions on analytic deck definitions; plot lanes and building aprons require a separate net-use mask and are not invented. Reference projection uses830 rather than each deck radius. Plot unions are evaluated on each level and across all levels separately, preventing projection/floor conflation.

| Deck | Height m inward | Gross support | After upper-deck stair holes |
|---|---:|---:|---:|
| residential-a-basin | -48 | 80,251.97 | 80,251.97 |
| residential-a-middle | -32 | 48,664.11 | 48,664.11 |
| residential-a-outer | -12 | 33,953.58 | 33,953.58 |
| residential-a-services | -61.5 | 43,139.60 | 43,139.60 |
| farm-a-ponds | 5 | 25,995.51 | 25,876.23 |
| farm-a-grain | -10 | 45,373.98 | 45,252.53 |
| farm-a-gardens | -25 | 64,144.76 | 64,021.14 |
| farm-a-livestock | -40 | 63,964.70 | 63,880.85 |
| farm-a-drying | -50 | 51,495.86 | 51,444.97 |
| farm-a-processing | -56 | 39,882.28 | 39,839.59 |
| farm-a-water | -61 | 26,738.24 | 26,738.24 |
| spoke-farm-a | 5 | 576.00 | 576.00 |
| spoke-residential-b | 0 | 576.00 | 576.00 |
| spoke-farm-b | 0 | 576.00 | 576.00 |
| spoke-residential-c | 0 | 576.00 | 576.00 |
| spoke-farm-c | 0 | 576.00 | 576.00 |

A farm seven supports total **317,053.54m² after stair holes**, while fitted plots reserve217,666.67. This excess is support/circulation reserve, not automatically planted floor. Heights5,-10,-25,-40,-50,-56,-61 imply15,15,15,10,6,5m successive separations—not seven uniform15m crop layers. Support union across nested levels is not their sum in projection. Plot reference-plane union across all farms is **147,529.86m²**, far below their combined stacked gross295,618.67; the JSON exposes per-deck unions for reproducibility. Spoke landings overlap ground and are not extra production area.

## One disjoint source-use budget mapping

Assign each placed instance exactly one primary manifest/source category in the JSON ledger; preserve its ID. Quantified indoor floor, plot reservation, source allocation and support areas are **separate measures of the same hierarchy**, never additive. For a final compliance ledger, clip polygon masks by (district, deck, level), union same-use pieces, resolve overlaps with transport/entry aprons before net credits. Category budget mappings:

| Source category (Table3-2 unless stated) | 10,000-person surface m² | Evidence now |
|---|---:|---|
| Residential including exterior access |490,000|153,052.99 slab floor plus separately preserved A exterior reserves; walls/net interiors unresolved|
| Shops |23,000|quantified district shop slabs only; market shells unquantified|
| Offices |10,000|manifest office slabs|
| Schools |10,000|manifest school slabs|
| Hospital |3,000|manifest clinic slabs|
| Assembly |15,000|manifest hall slabs; community shells unresolved|
| Recreation |10,000|manifest recreation slabs|
| Public open space |100,000|33,330 A park; B/C disjoint open-space masks missing|
| Service industry |40,000|workshop slabs; factory shells unresolved|
| Storage |50,000|manifest storage slabs|
| Transportation |120,000|A circulation reserves and routes; overlap/aprons unresolved; no ornamental road double credit|
| Communications |500|unquantified static utility systems|
| Water/waste |40,000|farm water reservations are primary water use, not crop area|
| Electrical |1,000|unquantified static utility systems|
| Miscellaneous |29,000|manifest community category needs exact source-use mapping|
| Plant growing |440,000|173,433.33 gross known-crop ceiling; net beds smaller|
| Animal areas |50,000|fish/chickens/rabbits/cattle plot ledger, not crop credit|
| Food processing/collection/storage |40,000|processing reservations; do not also credit community storage|
| Agriculture drying |80,000|drying reservations; no crops credit|

These Table3-2 rows are themselves planning approximations and do not silently sum to Table5-1's later totals.

Actual manifest slab totals across all six districts (m²): shops22,973.22; offices3,316.68; schools6,605.07; hospital1,999.80; assembly6,249.38; industry13,320.03; storage16,645.42; recreation9,999.00; miscellaneous28,951.40. Housing-category district slabs141,347.95 plus11,705.04 home/apartment slabs lacking manifest categories yield153,052.99 housing total. JSON budgetLedger supplies each source comparison and evidence gap. Near-target recreation/shops/miscellaneous quantities do not certify wall deductions, access or operations; other floor categories remain substantially below their source allocations. Mechanical allocations partially occur in community Table3-2; do not add a second40,000 water reserve merely because printed91 groups mechanical separately. Remaining Table5-1 differences stay an unresolved source reconciliation bucket, not fabricated floor.

## Source-faithful bounded next geometry step (proposal only)

**All three agricultural sectors need layered productive surfaces or an explicitly rebalanced settlement-wide equivalent.** The study does not require identical seven-deck clones. Maintain A's current seven supports/142 existing plot IDs and landscapes; audit its net beds, support gaps and abbreviated service headroom. B/C should retain their surface orchards, ponds, scenic fields and promenade while adding under-plain crop/service capacity. They cannot simply be relabeled livestock to excuse missing crop floor. Equal-share crop target would be146,666.67m² per farm from Table3-2 (rounded44); A detailed crop ledger147,333.33 differs slightly from that rounded total. Original printed98/PDF115 Table5-4 was also visually checked:3.8 sorghum,23.5 soybeans,7.2 wheat,3.6 rice,0.9 corn,5.2 vegetables m²/person, printed total44.2. Table5-5 animal/fish total5.1. Thus detailed source crop target442,000m² (versus rounded440,000 in Table3-2); detailed crop evidence gap268,566.67m². Equal-share detailed crop147,333.33 exactly matches A's gross source ledger, but not its smaller net planting. B's detailed gap133,413.33 and C's135,153.33m² are gross lower bounds before paths. Fruit trees are explicitly outside Table5-4 and grow in residential parks; orchard surfaces are not added to the442,000 crop quota.

* Farm A: conserve78 fitted IDs/sourcePlot/sourceAllocation; quantify internal crop masks and net plant areas, then address source rounding and lighting/service clearances without wholesale replacement.
* Farm B: add candidate crop shelves below existing plain and separate animal/processing/water zones; retain mixed wheat/soy/rice/vegetable surface parcels and garden district identity.
* Farm C: retain orchard/cattle landscape, add needed crop/animal/service layers below it; source-equivalent total balance can differ from B but must be explicit.
* Residential A: preserve297 original parcels and modeled storeys, garden basins and access reserves; classify exterior vs indoor floor, wall deductions and route feasibility.
* Residential B: preserve Garden Commons homes and north bypass; add sidewall terrace housing, quantify remaining public-space polygons, and move only selected new service reservations below plain in a reviewed transaction.
* Residential C: preserve Civic Gardens houses, courts, promenade and landscapes; selectively add sidewall density and below-plain workshops/storage, not a wholesale A clone. B/C current civic models need ground-curvature/access verification.

Proposed **pure planning API**, not implemented: `planFarmLayers(world, districtId, {targets, deckProfiles, protectedIds, protectedPolygons}) -> {decksToAdd, reanchors, newReservations, deficits, conflicts}`. First provide candidate B/C profiles, e.g.3 productive stages separated near15m where tube envelope allows, plus independently justified drying/processing/mechanical zones. Compute chord widths from the true tube envelope at each height; use `(830-height)*sectorAngle` for available arc length and subtract stairs, spoke voids, lanes/edge clearance. Do not transplant A heights blindly. A's service gaps and arbitrary bands are prototype choices, not sourced layer designs.

For64 B/C parcels: dry-run reanchor **only reviewed crop/service IDs**, leaving orchards, public water and protected surface landscape unchanged; add new reservations for remaining deficits instead of squeezing all source area into small existing meshes. Preserve entire record array, ID/type/scale/yaw/static fields and metadata by deep-copy; update theta/z, `deckId`, `height`, `anchorHeight`, collisionSupport radius and regenerated curvature together, retain provenance and original transform. Required baked-curvature rebuild: `buildFarmVariant({intrinsicReservation,category,radius,sourcePlot})` with quarter OBJ scale unchanged; mere theta/elevation edits leave models baked at830 on wrong curved layers. Allocate reanchored footprints using category budget and checked support/landing access, publish before/after hashes/IDs and net-use masks; require zero protected-ID deletion, unchanged static systems and promenade, no overlaps, finite dimensions and disjoint accounting before any parent-approved migration.

**No10,000-person completion claim is supported.** The audit measures substantiated geometry, preserves unknown shell capacity, and publishes deficits in evidence rather than an invented occupancy model. Net usable interiors, B/C open-space masks, tube-envelope/headroom validation and exact p98 category reconciliation remain implementation/research gates.
