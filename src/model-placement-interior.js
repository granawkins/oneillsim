import { completedModels } from './completed-models.js';

// Authored first placements, NOT a reconstruction of SP-413 floorplans or a
// whole-sector population. Coordinates are metres from the Garden Court's
// 149-degree meridian, or from the start of the named, existing Farm A deck.
// Bounds below are the reviewed OBJ vertices at scale 4 (not catalogue sizes).
const D = Math.PI / 180;
export const interiorLayout = {
  interpretation: 'A walkable neighborhood commons, service court and Farm A apron demonstration; all original parcels and records retained.',
  sourceFacts: [
    { segmentId: 'sp413-s02273', printedPage: 91, fact: 'The study uses multiple layers above and below the central plain.' },
    { segmentId: 'sp413-s02274', printedPage: 91, fact: 'Layers below the central plain have artificial illumination.' },
    { segmentId: 'sp413-s02753', printedPage: 114, fact: 'The example food-production herd includes fish, chickens, rabbits and cows.' },
  ],
  // Open ground corridors. Road/bridge are intentional walkable surfaces in
  // the commons corridor, not obstacles. No new ground/terrace is fabricated.
  routes: [
    { id: 'commons-promenade', anchor: 149 * D, x: [-125, -22], z: [-2, 2], height: 0, allowed: ['roads', 'bridges', 'stairs-ramps'] },
    { id: 'market-courtyard', anchor: 149 * D, x: [-110, -90], z: [-10, 10], height: 0, allowed: ['stairs-ramps'] },
    { id: 'service-front-aisle', anchor: 149 * D, x: [-187, -127], z: [-8, 8], height: 0, allowed: [] },
    { id: 'service-commons-link', anchor: 149 * D, x: [-187, -115], z: [-2, 2], height: 0, allowed: ['stairs-ramps'] },
    // All garden exhibits use the positive band served by the real stairs.
    // Route turns go around the eastern ends of stair holes, not across them.
    { id: 'farm-garden-south-apron', deckId: 'farm-a-gardens', x: [32, 38], z: [8, 22], allowed: [] },
    { id: 'farm-garden-stair2-south-turn', deckId: 'farm-a-gardens', x: [32, 46], z: [21, 23], allowed: [] },
    { id: 'farm-garden-stair2-bypass', deckId: 'farm-a-gardens', x: [40, 46], z: [21, 29], allowed: [] },
    { id: 'farm-garden-stair2-north-turn', deckId: 'farm-a-gardens', x: [32, 46], z: [27, 29], allowed: [] },
    { id: 'farm-garden-middle-apron', deckId: 'farm-a-gardens', x: [32, 38], z: [28, 38], allowed: [] },
    { id: 'farm-garden-stair1-south-turn', deckId: 'farm-a-gardens', x: [32, 46], z: [36, 38], allowed: [] },
    { id: 'farm-garden-stair1-bypass', deckId: 'farm-a-gardens', x: [40, 46], z: [38, 43], allowed: [] },
    { id: 'farm-garden-stair1-north-turn', deckId: 'farm-a-gardens', x: [32, 46], z: [42, 44], allowed: [] },
    { id: 'farm-garden-north-apron', deckId: 'farm-a-gardens', x: [32, 38], z: [42, 56], allowed: [] },
    { id: 'farm-grain-east-apron', deckId: 'farm-a-grain', x: [44.5, 48], z: [34, 54], allowed: [] },
    { id: 'farm-grain-pond-stair-link', deckId: 'farm-a-grain', x: [39, 48], z: [49, 51], allowed: [] },
    { id: 'farm-livestock-apron', deckId: 'farm-a-livestock', x: [31, 32.5], z: [-25, 25], allowed: [] },
  ],
};

// slug, circumferential metres, axial metres, rotation, deck, actual bounds.
const layout = [
  ['markets', -100, -18, 0, 'ground', [[-8.74,8.74],[0,4.45],[-5.95,5.95]]],
  ['restaurants', -100, 18, Math.PI, 'ground', [[-7,7],[0,4.2],[-5.7,4.9]]],
  ['factories', -135, -35, 0, 'ground', [[-10,10],[0,6.35],[-6.75,6.75]]],
  ['trees', -84, 24, 0, 'ground', [[-2.849988,2.595112],[0,6.289752],[-2.114176,2.236144]]],
  ['shrubs', -76, 32, 0, 'ground', [[-1.349996,1.46196],[0,1.609036],[-.942828,1.183868]]],
  ['grasses', -77, -30, 0, 'ground', [[-.594084,.664612],[0,.85],[-.593064,.631596]]],
  ['flowers', -90, 31, 0, 'ground', [[-1.269076,1.354228],[0,.735],[-.688164,.688164]]],
  ['rocks', -89, -29, 0, 'ground', [[-1.185568,1.197108],[0,1.3],[-.86974,.79282]]],
  ['ponds', -82, -35, 0, 'ground', [[-3.903116,3.765688],[0,.865108],[-2.517524,2.520864]]],
  ['streams', -82, -20, 0, 'ground', [[-1.968416,2.011592],[0,.68],[-4,4]]],
  ['grain-crops', 42, 37, 0, 'farm-a-grain', [[-1.8,1.8],[0,1.76],[-1.3,1.3]]],
  ['beans-other-legumes', 12, 12, 0, 'farm-a-gardens', [[-1.8,1.8],[0,.8],[-1.3,1.3]]],
  ['vegetable-crops', 22, 12, 0, 'farm-a-gardens', [[-1.8,1.8],[0,.59],[-1.3,1.3]]],
  ['greenhouses', 42, 49, 0, 'farm-a-gardens', [[-3.015812,3.015812],[0,4.066],[-4,4]]],
  ['growing-beds', 42, 18, 0, 'farm-a-gardens', [[-2.5,2.5],[0,3.265],[-1.8,1.8]]],
  ['irrigation-equipment', 42, 31, Math.PI, 'farm-a-gardens', [[-2.4,2.4],[0,1.95],[-1.5,1.5]]],
  ['animal-housing', 42, -16, 0, 'farm-a-livestock', [[-4.017556,4.017556],[0,4.56518],[-4,4]]],
  ['aquaculture-tanks', 42, 15, 0, 'farm-a-livestock', [[-3.23,3.23],[0,1.64],[-2.3,1.43]]],
  ['cattle', 34, -16, 0, 'farm-a-livestock', [[-.43,.43],[0,1.86],[-1.114306,1.45076]]],
  ['chickens', 34, -12, 0, 'farm-a-livestock', [[-.161,.161],[0,.6651236],[-.34,.285]]],
  ['rabbits', 34, -10, 0, 'farm-a-livestock', [[-.165,.165],[0,.5599808],[-.31882,.3076]]],
  // Surface-swimming visual specimen: opaque water would hide a submerged
  // fish. Bottom is 1 cm above the tank's 1.12 m water surface; no air-floating
  // specimen, no fluid/animal simulation. Offset avoids the central inlet.
  ['fish', 40.2, 15.6, 0, 'farm-a-livestock', [[-.111,.111],[0,.285],[-.32,.25]], 1.13],
  ['roads', -55, 0, Math.PI/2, 'ground', [[-3,3],[0,.11],[-5,5]]],
  // Built-in approach wedges connect ground to the actual .4 m deck.
  // This is a short raised promenade, not a fictitious upper terrace link.
  ['bridges', -80, 0, Math.PI/2, 'ground', [[-1.1,1.1],[0,1.510312],[-5.035,5.0175]]],
  // Rotate long axis around the major circle, never across the tube wall.
  // Actual 1.8 m shared landing and both ground entries remain unobstructed.
  ['stairs-ramps', -114, 0, Math.PI/2, 'ground', [[-2.230312,2.235],[0,2.910312],[-8.6,8.4]]],
  ['rail-tracks', -55, 17, Math.PI/2, 'ground', [[-1.35,1.35],[0,.35],[-4,4]]],
  ['transit-stations', -55, 10, Math.PI/2, 'ground', [[-2.5,2.5],[0,3.03],[-4,4]]],
  ['buses', -55, -5, Math.PI/2, 'ground', [[-1.235,1.235],[0,2.65],[-3.1,3.145]]],
  ['utility-carts', -66, -5, Math.PI/2, 'ground', [[-.785,.785],[0,2.02],[-1.3,1.345]]],
  ['bicycles', -48, 5.5, Math.PI/2, 'ground', [[-.315496,.315],[0,1.065],[-1.06,1.06]]],
  ['water-tanks', -180, -13, 0, 'ground', [[-3.9,3.9],[0,4.18],[-3,2.8]]],
  ['pumps', -165, -13, 0, 'ground', [[-3.9,3.9],[0,2.64],[-3,2.8]]],
  ['water-treatment', -150, -13, 0, 'ground', [[-3.9,3.9],[0,3.58],[-3,2.8]]],
  ['air-handling', -135, -13, 0, 'ground', [[-3.9,3.9],[0,3.65],[-3,2.8]]],
  ['waste-processing', -180, 13, Math.PI, 'ground', [[-3.9,3.9],[0,3.5],[-3,2.8]]],
  ['power-distribution', -165, 13, Math.PI, 'ground', [[-3.9,3.9],[0,3.825],[-3,2.8]]],
  ['pipes-cables', -150, 13, Math.PI, 'ground', [[-3.9,3.9],[0,3.525],[-3,2.8]]],
  ['lighting', -135, 13, Math.PI, 'ground', [[-3.9,3.9],[0,4.06],[-3,2.8]]],
];

export function interiorModelPlacements(world) {
  if (!Array.isArray(world?.assets) || !Array.isArray(world?.terraces?.decks)) {
    throw new TypeError('A saved world with assets and terrace decks is required');
  }
  const models = completedModels.filter(m => m.materialKit !== 'structure');
  if (models.length !== 38 || layout.length !== 38) throw new Error('Interior model contract changed');
  return layout.map(([slug, x, z, rotation, deckId, bounds, lift = 0]) => {
    const model = models.find(m => m.slug === slug);
    if (!model) throw new Error(`Unregistered interior model: ${slug}`);
    const deck = deckId === 'ground' ? null : world.terraces.decks.find(d => d.id === deckId);
    if (deckId !== 'ground' && !deck) throw new Error(`Missing required existing deck: ${deckId}`);
    // Preserve the engine's default transform. Nonzero display height uses
    // R=830-height-.05: -.05 exactly aligns feet with analytic ground R830,
    // and canonical deck height-.05 aligns feet with the real terrace top.
    // anchorHeight is the actual support; height is the display-origin value.
    const anchorHeight = deck?.height ?? 0;
    const height = anchorHeight - .05 + lift;
    const theta = (deck?.start ?? 149 * D) + x / (830 - (deck?.height ?? 0));
    const zone = deck ? 'farm-a-apron-demonstration' : model.materialKit === 'utility' || slug === 'factories' ? 'residential-b-service-court' : 'residential-b-garden-commons';
    const entry = {
      id: `completed-model-${slug}`, type: model.id, theta, z, scale: 4, rotation,
      surface: { height, deckId, anchorHeight }, zone,
      label: `${model.name} · authored ${zone}${slug === 'fish' ? ' · visible surface-swimming tank display' : ''}`,
      sourceFacts: structuredClone(model.facts),
      sourceReferences: structuredClone(model.references),
      layoutInterpretation: deck ? 'Uses the existing pre-plot apron (plots begin at 50 m); no farm blockout or stair is replaced.' : 'Shared access and landscape west of the existing Garden Court; static first placement, not a functioning transport or life-support network.',
      reservation: { anchor: deck?.start ?? 149 * D, localX: x, localZ: z, supportHeight: deck?.height ?? 0, boundsMeters: structuredClone(bounds) },
    };
    if (slug === 'fish') entry.overlapAllowance = {
      with: 'completed-model-aquaculture-tanks', reason: 'Surface-swimming display in the left tank, above opaque water and clear of rims/inlet.',
      localTankCenterMeters: [-1.8, 0], waterHeightMeters: 1.12, bottomAboveWaterMeters: .01,
    };
    if (slug === 'bridges' || slug === 'stairs-ramps') entry.layoutInterpretation += ' Ground-to-own-raised-landing route only; no connection to an invented upper terrace.';
    return entry;
  });
}
