// Asset and texture catalog

// Ground textures (built-in, not loaded from files)
export const TEXTURES = [
    { id: 'grass', name: 'Grass', color: 0x1a3318 },
    { id: 'dirt', name: 'Dirt', color: 0x5c4033 },
    { id: 'sand', name: 'Sand', color: 0xc2b280 },
    { id: 'water', name: 'Water', color: 0x2a6099 },
    { id: 'path', name: 'Path', color: 0x808080 },
    { id: 'farm', name: 'Farm', color: 0x4a3728 }
];

// Buildings (from ultimate-buildings pack)
export const BUILDINGS = [
    '1Story', '1Story_GableRoof', '1Story_RoundRoof', '1Story_Sign',
    '2Story', '2Story_2', '2Story_Balcony', '2Story_Center', '2Story_Columns',
    '2Story_Double', '2Story_GableRoof', '2Story_RoundRoof', '2Story_Sidehouse',
    '2Story_Sign', '2Story_Slim', '2Story_Stairs', '2Story_Wide', '2Story_Wide_2Doors',
    '3Story_Balcony', '3Story_Slim', '3Story_Small',
    '4Story', '4Story_Center', '4Story_Wide_2Doors', '4Story_Wide_2Doors_Roof',
    '6Story_Stack'
];

// Plants/nature assets (from ultimate-nature pack)
export const PLANTS = [
    // Trees
    'CommonTree_1', 'CommonTree_2', 'CommonTree_3', 'CommonTree_4', 'CommonTree_5',
    'BirchTree_1', 'BirchTree_2', 'BirchTree_3', 'BirchTree_4', 'BirchTree_5',
    'PineTree_1', 'PineTree_2', 'PineTree_3', 'PineTree_4', 'PineTree_5',
    'Willow_1', 'Willow_2', 'Willow_3', 'Willow_4', 'Willow_5',
    'PalmTree_1', 'PalmTree_2', 'PalmTree_3', 'PalmTree_4',
    // Autumn Trees
    'CommonTree_Autumn_1', 'CommonTree_Autumn_2', 'CommonTree_Autumn_3', 'CommonTree_Autumn_4', 'CommonTree_Autumn_5',
    'BirchTree_Autumn_1', 'BirchTree_Autumn_2', 'BirchTree_Autumn_3', 'BirchTree_Autumn_4', 'BirchTree_Autumn_5',
    'PineTree_Autumn_1', 'PineTree_Autumn_2', 'PineTree_Autumn_3', 'PineTree_Autumn_4', 'PineTree_Autumn_5',
    'Willow_Autumn_1', 'Willow_Autumn_2', 'Willow_Autumn_3', 'Willow_Autumn_4', 'Willow_Autumn_5',
    // Rocks
    'Rock_1', 'Rock_2', 'Rock_3', 'Rock_4', 'Rock_5', 'Rock_6', 'Rock_7',
    'Rock_Moss_1', 'Rock_Moss_2', 'Rock_Moss_3', 'Rock_Moss_4', 'Rock_Moss_5', 'Rock_Moss_6', 'Rock_Moss_7',
    // Small Plants
    'Bush_1', 'Bush_2', 'BushBerries_1', 'BushBerries_2',
    'Plant_1', 'Plant_2', 'Plant_3', 'Plant_4', 'Plant_5',
    'Grass', 'Grass_2', 'Grass_Short', 'Flowers',
    // Crops
    'Corn_1', 'Corn_2', 'Wheat',
    // Other
    'TreeStump', 'TreeStump_Moss',
    'WoodLog', 'WoodLog_Moss',
    'Cactus_1', 'Cactus_2', 'Cactus_3', 'Cactus_4', 'Cactus_5',
    'CactusFlower_1', 'CactusFlowers_2', 'CactusFlowers_3', 'CactusFlowers_4', 'CactusFlowers_5',
    'Lilypad'
];

// Main categories for the editor UI
export const CATEGORIES = {
    textures: {
        name: 'Ground Texture',
        icon: null, // Will use color swatches
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
        icon: '/assets/icons/ultimate-buildings/',
        items: BUILDINGS.map(name => ({
            type: 'building',
            id: name,
            name: name.replace(/_/g, ' '),
            icon: `/assets/icons/ultimate-buildings/${name}.png`,
            assetPath: '/assets/ultimate-buildings/'
        }))
    },
    plants: {
        name: 'Plants',
        icon: '/assets/icons/ultimate-nature/',
        items: PLANTS.map(name => ({
            type: 'plant',
            id: name,
            name: name.replace(/_/g, ' '),
            icon: `/assets/icons/ultimate-nature/${name}.png`,
            assetPath: '/assets/ultimate-nature/'
        }))
    }
};

// For backwards compatibility, keep the flat catalog
export const ASSET_CATEGORIES = [
    {
        name: 'Trees',
        assets: [
            'CommonTree_1', 'CommonTree_2', 'CommonTree_3', 'CommonTree_4', 'CommonTree_5',
            'BirchTree_1', 'BirchTree_2', 'BirchTree_3', 'BirchTree_4', 'BirchTree_5',
            'PineTree_1', 'PineTree_2', 'PineTree_3', 'PineTree_4', 'PineTree_5',
            'Willow_1', 'Willow_2', 'Willow_3', 'Willow_4', 'Willow_5',
            'PalmTree_1', 'PalmTree_2', 'PalmTree_3', 'PalmTree_4'
        ]
    },
    {
        name: 'Autumn',
        assets: [
            'CommonTree_Autumn_1', 'CommonTree_Autumn_2', 'CommonTree_Autumn_3', 'CommonTree_Autumn_4', 'CommonTree_Autumn_5',
            'BirchTree_Autumn_1', 'BirchTree_Autumn_2', 'BirchTree_Autumn_3', 'BirchTree_Autumn_4', 'BirchTree_Autumn_5',
            'PineTree_Autumn_1', 'PineTree_Autumn_2', 'PineTree_Autumn_3', 'PineTree_Autumn_4', 'PineTree_Autumn_5',
            'Willow_Autumn_1', 'Willow_Autumn_2', 'Willow_Autumn_3', 'Willow_Autumn_4', 'Willow_Autumn_5'
        ]
    },
    {
        name: 'Rocks',
        assets: [
            'Rock_1', 'Rock_2', 'Rock_3', 'Rock_4', 'Rock_5', 'Rock_6', 'Rock_7',
            'Rock_Moss_1', 'Rock_Moss_2', 'Rock_Moss_3', 'Rock_Moss_4', 'Rock_Moss_5', 'Rock_Moss_6', 'Rock_Moss_7'
        ]
    },
    {
        name: 'Plants',
        assets: [
            'Bush_1', 'Bush_2', 'BushBerries_1', 'BushBerries_2',
            'Plant_1', 'Plant_2', 'Plant_3', 'Plant_4', 'Plant_5',
            'Grass', 'Grass_2', 'Grass_Short', 'Flowers'
        ]
    },
    {
        name: 'Crops',
        assets: ['Corn_1', 'Corn_2', 'Wheat']
    },
    {
        name: 'Other',
        assets: [
            'TreeStump', 'TreeStump_Moss',
            'WoodLog', 'WoodLog_Moss',
            'Cactus_1', 'Cactus_2', 'Cactus_3', 'Cactus_4', 'Cactus_5',
            'CactusFlower_1', 'CactusFlowers_2', 'CactusFlowers_3', 'CactusFlowers_4', 'CactusFlowers_5',
            'Lilypad'
        ]
    }
];

// Flatten into a single catalog array: textures first, then assets
export function buildCatalog() {
    const catalog = [];

    // Add textures
    for (const tex of TEXTURES) {
        catalog.push({
            type: 'texture',
            id: tex.id,
            name: tex.name,
            color: tex.color
        });
    }

    // Add assets by category
    for (const cat of ASSET_CATEGORIES) {
        for (const assetName of cat.assets) {
            catalog.push({
                type: 'asset',
                id: assetName,
                name: assetName.replace(/_/g, ' '),
                category: cat.name
            });
        }
    }

    return catalog;
}

// The full catalog
export const CATALOG = buildCatalog();

// Get item at index
export function getCatalogItem(index) {
    return CATALOG[index] || null;
}

// Check if item is a texture
export function isTexture(index) {
    const item = CATALOG[index];
    return item && item.type === 'texture';
}
