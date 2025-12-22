// Crop initialization for farm sections
// Generates crops procedurally from a compact config stored in world.json

import { GRID_COLS, GRID_ROWS } from './state.js';
import { addPlacedAsset, setTextureAt } from './state.js';
import { loadPlacedAssets } from './placement.js';

// Seeded random number generator (mulberry32)
function createRandom(seed) {
    return function() {
        let t = seed += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

// Convert column to theta (radians)
function colToTheta(col) {
    return (col / GRID_COLS) * 2 * Math.PI;
}

// Generate crops for one farm section
function generateSectionCrops(section, config, random, startId) {
    const assets = [];
    let assetId = startId;

    const { pathWidth, edgeMargin, zMin, zMax, gapZMin, gapZMax, crops } = config;

    // Calculate section width in meters
    const sectionCols = section.end - section.start + 1;
    const metersPerCol = (2 * Math.PI * 650) / GRID_COLS;
    const sectionWidth = sectionCols * metersPerCol;

    // Calculate block widths (one block per crop type)
    const numCrops = crops.length;
    const numPaths = numCrops - 1;
    const totalPathWidth = numPaths * pathWidth;
    const totalMargins = edgeMargin * 2;
    const availableWidth = sectionWidth - totalPathWidth - totalMargins;
    const blockWidth = availableWidth / numCrops;

    // Track position along section (in meters)
    let currentPos = edgeMargin;

    for (let cropIdx = 0; cropIdx < crops.length; cropIdx++) {
        const crop = crops[cropIdx];
        const blockStart = currentPos;
        const blockEnd = currentPos + blockWidth;

        // Place crops in a grid pattern
        for (let posInSection = blockStart; posInSection <= blockEnd; posInSection += crop.spacing) {
            for (let z = zMin; z <= zMax; z += crop.spacing) {
                // Skip the middle gap (path area)
                if (gapZMin !== undefined && gapZMax !== undefined && z >= gapZMin && z <= gapZMax) {
                    continue;
                }

                const colOffset = posInSection / metersPerCol;
                const col = section.start + colOffset;
                const theta = colToTheta(col);

                // Add randomness for natural look (seeded for consistency)
                const thetaJitter = (random() - 0.5) * 0.002;
                const zJitter = (random() - 0.5) * 0.5;
                const rotationJitter = random() * Math.PI * 2;
                const scaleJitter = 1.17 + random() * 0.33;

                assets.push({
                    id: `asset_${assetId++}`,
                    type: crop.type,
                    theta: theta + thetaJitter,
                    z: z + zJitter,
                    scale: scaleJitter,
                    rotation: rotationJitter
                });
            }
        }

        currentPos = blockEnd + pathWidth;
    }

    return { assets, nextId: assetId };
}

// Generate path texture updates between crop blocks
function generatePathTextures(section, config) {
    const updates = [];
    const { pathWidth, edgeMargin, crops } = config;

    // Skip path generation if pathWidth is 0 (crops are flush)
    if (pathWidth === 0) {
        return updates;
    }

    const sectionCols = section.end - section.start + 1;
    const metersPerCol = (2 * Math.PI * 650) / GRID_COLS;
    const sectionWidth = sectionCols * metersPerCol;

    const numCrops = crops.length;
    const numPaths = numCrops - 1;
    const totalPathWidth = numPaths * pathWidth;
    const totalMargins = edgeMargin * 2;
    const availableWidth = sectionWidth - totalPathWidth - totalMargins;
    const blockWidth = availableWidth / numCrops;

    let currentPos = edgeMargin + blockWidth;
    for (let i = 0; i < numPaths; i++) {
        const pathCenterCol = section.start + Math.floor(currentPos / metersPerCol);

        for (let row = 1; row < GRID_ROWS; row++) {
            updates.push({ row, col: pathCenterCol, texture: 2 });
        }

        currentPos += blockWidth + pathWidth;
    }

    return updates;
}

// Generate all crops from config (returns data, doesn't modify scene)
export function generateCropsFromConfig(config) {
    const random = createRandom(config.seed);
    let allAssets = [];
    let allPathUpdates = [];
    let currentId = 1;

    for (const section of config.sections) {
        const { assets, nextId } = generateSectionCrops(section, config, random, currentId);
        allAssets = allAssets.concat(assets);
        currentId = nextId;

        const pathUpdates = generatePathTextures(section, config);
        allPathUpdates = allPathUpdates.concat(pathUpdates);
    }

    return { assets: allAssets, pathUpdates: allPathUpdates };
}

// Apply crops to the scene from config
export async function applyCropsFromConfig(config) {
    const { assets, pathUpdates } = generateCropsFromConfig(config);

    for (const update of pathUpdates) {
        setTextureAt(update.row, update.col, update.texture);
    }

    for (const asset of assets) {
        addPlacedAsset(asset);
    }

    await loadPlacedAssets(assets);

    return { assets, pathUpdates };
}
