// Asset and texture catalog
import {streetKit, streetKitIds} from '../street-kit.js';
import {residentialKitIds} from '../residential-kit.js';
import {districtKit, districtKitIds} from '../district-kit.js';

// Ground textures (built-in, not loaded from files)
export const TEXTURES = [
    { id: 'grass', name: 'Grass', color: 0x1a3318 },
    { id: 'dirt', name: 'Dirt', color: 0x5c4033 },
    { id: 'sand', name: 'Sand', color: 0xc2b280 },
    { id: 'water', name: 'Water', color: 0x2a6099 },
    { id: 'path', name: 'Path', color: 0x808080 },
    { id: 'farm', name: 'Farm', color: 0x4a3728 }
];

// Curated residential and streetscape models; no planned-only assets.
const HOUSING = ['TorusHome_ModA', ...residentialKitIds];
export const BUILDINGS = [...HOUSING, ...streetKitIds, ...districtKitIds];
export const PLANTS = [];

// Only expose assets that belong to this curated client set.
export const CATEGORIES = {
    textures: {
        name: 'Ground Texture',
        icon: null,
        items: TEXTURES.map(tex => ({
            type: 'texture',
            id: tex.id,
            name: tex.name,
            color: tex.color,
            assetPath: null
        }))
    },
    buildings: {
        name: 'Buildings',
        icon: 'assets/icons/ultimate-buildings/',
        items: HOUSING.map(name => ({
            type: 'building',
            id: name,
            name: name.replace(/_/g, ' '),
            icon: `assets/icons/ultimate-buildings/${name}.png`,
            assetPath: 'assets/ultimate-buildings/'
        }))
    },
    district: {
        name: 'Residential A district',
        icon: 'assets/icons/ultimate-buildings/',
        items: districtKit.map(({id,name}) => ({type:'building',id,name,icon:`assets/icons/ultimate-buildings/${id}.png`,assetPath:'assets/ultimate-buildings/'}))
    },
    furniture: {
        name: 'Furniture & small props',
        icon: 'assets/icons/ultimate-buildings/',
        items: streetKit.map(({id,name}) => ({
            type: 'building', id, name,
            icon: `assets/icons/ultimate-buildings/${id}.png`,
            assetPath: 'assets/ultimate-buildings/'
        }))
    }
};

// Flat catalog retained for keyboard navigation/backwards compatibility.
export const ASSET_CATEGORIES = [
    { name: 'Housing', assets: HOUSING },
    { name: 'Furniture & small props', assets: streetKitIds },
    { name: 'Residential A district', assets: districtKitIds }
];

export function buildCatalog() {
    const catalog = [];
    for (const tex of TEXTURES) {
        catalog.push({ type: 'texture', id: tex.id, name: tex.name, color: tex.color });
    }
    for (const category of ASSET_CATEGORIES) {
        for (const assetName of category.assets) {
            catalog.push({
                type: 'asset',
                id: assetName,
                name: assetName.replace(/_/g, ' '),
                category: category.name
            });
        }
    }
    return catalog;
}

export const CATALOG = buildCatalog();
export function getCatalogItem(index) {
    return CATALOG[index] || null;
}
export function isTexture(index) {
    const item = CATALOG[index];
    return item && item.type === 'texture';
}
