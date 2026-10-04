// Library roadmap, separate from the simulator's catalog of placeable models.
import {streetKit} from './street-kit.js';
import {residentialKit} from './residential-kit.js';
// References belong to a type; each variant has its own model manifest and stats.
export const assetGroups = [
  ['Homes & civic buildings', ['Houses', 'Apartments', 'Schools', 'Clinics', 'Community centers', 'Sports facilities']],
  ['Businesses & industry', ['Shops', 'Markets', 'Restaurants', 'Offices', 'Workshops', 'Factories', 'Warehouses']],
  ['Plants & landscape', ['Trees', 'Shrubs', 'Grasses', 'Flowers', 'Rocks', 'Ponds', 'Streams']],
  ['Food & agriculture', ['Grain crops', 'Beans & other legumes', 'Vegetable crops', 'Fruit trees', 'Greenhouses', 'Growing beds', 'Irrigation equipment', 'Cattle', 'Chickens', 'Rabbits', 'Fish', 'Animal housing', 'Aquaculture tanks']],
  ['Transport & access', ['Footpaths', 'Roads', 'Bridges', 'Stairs & ramps', 'Rail tracks', 'Transit stations', 'Buses', 'Utility carts', 'Bicycles']],
  ['Utilities & life support', ['Water tanks', 'Pumps', 'Water treatment', 'Air handling', 'Waste processing', 'Power distribution', 'Pipes & cables', 'Lighting']],
  ['Habitat structure', ['Hull panels', 'Structural frames', 'Spokes', 'Central hub', 'Docking facilities', 'Airlocks', 'Solar mirrors', 'Radiation shielding', 'Radiators']],
  ['Furniture & small props', ['Benches', 'Tables', 'Planters', 'Fences & railings', 'Signs', 'Waste bins']],
].map(([name, names]) => ({ name, types: names.map(name => ({
  name, slug: name.toLowerCase().replace(/ & /g, '-').replace(/[^a-z0-9]+/g, '-'),
  thumbnail: null, references: [], variants: [],
})) }));
export const assetTypes = assetGroups.flatMap(group => group.types);
const houses = assetTypes.find(type => type.slug === 'houses');
houses.references = [
  { label: 'Figure 5-5 · terrace-house exteriors', href: '/study/#figure-5-5', image: 'sp413-p0108-01.jpg' },
  { label: 'Figure 5-6 · possible apartment plan', href: '/study/#figure-5-6', image: 'sp413-p0109-02.jpg' },
  { label: 'Figure 5-7 · housing-area view', href: '/study/#figure-5-7', image: 'sp413-p0109-04.jpg' },
  { label: 'Figure 4-8 · modular construction components', href: '/study/#figure-4-8' },
  { label: 'Appendix B · structural system for housing', href: '/study/#appendix-b' },
];
houses.source = 'NASA SP-413 · housing';
houses.facts = [
  'Figure 4-8 shows a light modular frame with non-load-bearing wall panels, floor and roof panels, shades, and packaged service modules.',
  'Appendix B describes a typical 4 × 6 m aluminum-tube structural bay, beams on 2 m centers, and 5 cm honeycomb floor panels.',
  'Figures 5-5 to 5-7 show varied one- and two-level homes and terraces. They are concepts, not dimensioned construction drawings.',
];
houses.variants = [{ id: 'TorusHome_ModA', name: 'Modular Terrace Home A-01', directory: 'ultimate-buildings', thumbnail: null }];
for (const {id,slug,name} of streetKit) {
  const type = assetTypes.find(type => type.slug === slug);
  if (!type) throw new Error(`Missing street kit type: ${slug}`);
  type.thumbnail = `/oneillsim/assets/icons/ultimate-buildings/${id}.png`;
  type.references = [
    {label:'Figure 5-5 · terrace-house context',href:'/study/#sp413-s02259',image:'sp413-p0108-01.jpg'},
    {label:'Figure 5-7 · pedestrian housing streetscape',href:'/study/#sp413-s02284',image:'sp413-p0109-04.jpg'},
  ];
  type.source = 'NASA SP-413 · streetscape context; furniture is authored interpretation';
  type.facts = [
    'Figures 5-5 and 5-7 show terraced housing, planted edges and pedestrian spaces, not dimensioned furniture specifications.',
    'These props share the existing house palette. Dimensions, detailed forms and sign wording are authored interpretation, not historical specifications.',
    'One opaque material and a shared 512px atlas for the six-type kit; no functional seating or waste sorting is implied.',
  ];
  type.variants = [{id,name,directory:'ultimate-buildings',thumbnail:type.thumbnail}];
}
for (const {id,slug,name} of residentialKit) {
  const type = assetTypes.find(type => type.slug === slug);
  const thumbnail = `/oneillsim/assets/icons/ultimate-buildings/${id}.png`;
  type.variants.push({id,name,directory:'ultimate-buildings',thumbnail});
  if (!type.thumbnail) type.thumbnail = thumbnail;
  if (slug === 'apartments') {
    type.references = houses.references;
    type.source = 'NASA SP-413 · modular terrace housing';
    type.facts = houses.facts;
  }
}
export function findAssetType(slug) { return assetTypes.find(type => type.slug === slug); }
export function findModelType(id) { return assetTypes.find(type => type.variants.some(variant => variant.id === id)); }
