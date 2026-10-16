import * as THREE from 'three';

/** Original authored textures. All tiles cover four metres, never one parcel. */
export const INTERIOR_TILE_METRES = 4;
export const INTERIOR_SURFACES = Object.freeze({
    grass: Object.freeze({bumpScale: .018}),
    concrete: Object.freeze({bumpScale: .006}),
    paving: Object.freeze({bumpScale: .012}),
});
export const INTERIOR_MATERIAL_FAMILIES = Object.freeze({
    ivory: 'concrete', cream: 'concrete', earth: 'concrete', sage: 'concrete', clay: 'concrete',
    path: 'paving', stone: 'paving', green: 'grass', meadow: 'grass', grove: 'grass',
});

/**
 * Explicit initialization only: importing this module never touches DOM/network.
 * One library per interior lifetime, not one library per material or batch.
 * Await .ready in the scene readiness gate; failures reject rather than silently
 * claiming a complete scene. Inject a TextureLoader-compatible loader for Node.
 */
export function createInteriorMaterialLibrary({renderer, loader, baseUrl = new URL('../assets/textures/interior-lookdev/', import.meta.url), bump = true, anisotropy = 4} = {}) {
    if (!Number.isFinite(anisotropy) || anisotropy < 1) throw new RangeError('anisotropy must be >= 1');
    const textureLoader = loader || new THREE.TextureLoader();
    const maxAnisotropy = renderer?.capabilities?.getMaxAnisotropy?.() || 1;
    const textures = {}, owned = new Set(), applied = new Map();
    let disposed = false;
    const urlRoot = String(baseUrl).replace(/\/?$/, '/');
    const load = (filename, color) => new Promise((resolve, reject) => {
        const texture = textureLoader.load(urlRoot + filename, loaded => {
            if (disposed) { loaded.dispose(); reject(new Error('Interior material library disposed during loading')); }
            else resolve(loaded);
        }, undefined, error => reject(new Error('Failed to load interior texture ' + filename, {cause: error})));
        owned.add(texture);
        texture.name = 'interior-lookdev/' + filename;
        texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1 / INTERIOR_TILE_METRES, 1 / INTERIOR_TILE_METRES);
        texture.magFilter = THREE.LinearFilter;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.generateMipmaps = true;
        texture.anisotropy = Math.min(anisotropy, maxAnisotropy);
        textures[filename] = texture;
    });
    const jobs = Object.keys(INTERIOR_SURFACES).flatMap(name => [load(name + '-color.png', true), load(name + '-surface.png', false)]);
    const ready = Promise.all(jobs).then(() => {
        if (disposed) throw new Error('Interior material library disposed');
        return textures;
    });
    function restore(material) {
        const record = applied.get(material);
        if (!record) return false;
        // Do not clobber fields subsequently replaced by another owner.
        for (const key of Object.keys(record.after)) if (material[key] === record.after[key]) material[key] = record.before[key];
        material.needsUpdate = true;
        applied.delete(material);
        return true;
    }
    function apply(material, family, options = {}) {
        if (disposed) throw new Error('Interior material library disposed');
        if (!INTERIOR_SURFACES[family]) throw new TypeError('Unknown interior surface: ' + family);
        if (!material?.isMeshStandardMaterial || material.transparent || material.transmission > 0 || material.metalness > .1)
            throw new TypeError('Only opaque, nonmetallic Standard/Physical materials are eligible');
        if (applied.has(material)) {
            if (applied.get(material).family !== family) throw new Error('Restore material before changing surface family');
            return material;
        }
        if (material.map || material.bumpMap || material.normalMap || material.roughnessMap)
            throw new Error('Refusing to replace existing authored material maps');
        const before = Object.fromEntries(['map', 'roughnessMap', 'bumpMap', 'roughness', 'bumpScale'].map(key => [key, material[key]]));
        const surface = textures[family + '-surface.png'];
        const after = {map: textures[family + '-color.png'], roughnessMap: surface,
            bumpMap: (options.bump ?? bump) ? surface : null, roughness: 1,
            bumpScale: INTERIOR_SURFACES[family].bumpScale};
        Object.assign(material, after);
        material.needsUpdate = true;
        applied.set(material, {before, after, family});
        return material;
    }
    return {ready, textures, apply, restore,
        applyPalette(materials) {
            for (const [name, family] of Object.entries(INTERIOR_MATERIAL_FAMILIES)) if (materials[name]) apply(materials[name], family);
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            for (const material of applied.keys()) restore(material);
            for (const texture of owned) texture.dispose();
        },
    };
}

/**
 * Replace normalized parcel UVs with habitat-anchored METRE coordinates.
 * Coordinates after `matrix` must be habitat local: XY ring, +Z tube axis.
 * Ground's CylinderGeometry needs matrix = ground.matrix (rotation X = PI/2).
 * Runtime curved solids/landscape already inhabit that frame; omit matrix.
 *
 * Top/bottom: (arc, Z); axial-facing wall: (arc, inward height);
 * circumferential-facing wall: (Z, inward height). Dominant FACE normals choose
 * the projection, not smoothed vertex normals. There are no shader hooks or
 * extra draws. Duplicate only vertices that need another face/seam projection.
 * Returns a new owned geometry; never mutates/disposes the input geometry.
 */
export function createInteriorMetreUVs(geometry, {matrix = new THREE.Matrix4(), radius = 830, tileMetres = INTERIOR_TILE_METRES, surface = 'auto'} = {}) {
    if (!(Number.isFinite(radius) && radius > 0 && Number.isFinite(tileMetres) && tileMetres > 0)) throw new RangeError('Positive radius and tileMetres are required');
    if (!['auto', 'top', 'axial', 'end'].includes(surface)) throw new TypeError('Unknown surface projection');
    if (!geometry?.isBufferGeometry || !geometry.attributes.position || geometry.attributes.position.itemSize !== 3) throw new TypeError('Position BufferGeometry required');
    if (geometry.isInstancedBufferGeometry || Object.keys(geometry.morphAttributes).length || geometry.attributes.skinIndex || Object.values(geometry.attributes).some(a => a.isInterleavedBufferAttribute || a.isInstancedBufferAttribute))
        throw new TypeError('UV mapping supports static, non-interleaved geometry only; bake/clone instances first');
    const position = geometry.attributes.position, index = geometry.index;
    const count = index?.count ?? position.count;
    if (count % 3) throw new TypeError('Triangle geometry required');
    if (!matrix.elements.every(Number.isFinite) || matrix.determinant() === 0) throw new TypeError('Finite invertible habitat matrix required');
    const points = Array.from({length: position.count}, (_, i) => new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(matrix));
    if (points.some(p => ![p.x, p.y, p.z].every(Number.isFinite) || Math.hypot(p.x, p.y) < 1e-6)) throw new TypeError('Finite torus positions away from ring axis required');
    // An integer repeat count closes the ring, with < tile/(2*circumference)
    // relative scale adjustment. Both branches of atan2 therefore match exactly.
    const circumference = Math.round(2 * Math.PI * radius / tileMetres) * tileMetres;
    if (!circumference) throw new RangeError('Radius too small for tile period');
    const arcScale = circumference / (2 * Math.PI), sourceIds = [], uvs = [], indices = [], cache = new Map();
    const a = new THREE.Vector3(), b = new THREE.Vector3(), normal = new THREE.Vector3(), center = new THREE.Vector3();
    for (let i = 0; i < count; i += 3) {
        const ids = [0, 1, 2].map(k => index ? index.getX(i + k) : i + k);
        const ps = ids.map(id => points[id]);
        center.copy(ps[0]).add(ps[1]).add(ps[2]).multiplyScalar(1 / 3);
        const theta = Math.atan2(center.y, center.x), c = Math.cos(theta), s = Math.sin(theta);
        normal.crossVectors(a.subVectors(ps[1], ps[0]), b.subVectors(ps[2], ps[0])).normalize();
        const radial = Math.abs(normal.x * c + normal.y * s), tangent = Math.abs(-normal.x * s + normal.y * c), axial = Math.abs(normal.z);
        const projection = surface === 'auto' ? (radial >= tangent && radial >= axial ? 'top' : axial >= tangent ? 'axial' : 'end') : surface;
        for (let k = 0; k < 3; k++) {
            const p = ps[k], angle = Math.atan2(p.y, p.x);
            const turns = Math.round((theta - angle) / (2 * Math.PI));
            const key = `${ids[k]}:${projection}:${projection === 'end' ? 0 : turns}`;
            if (!cache.has(key)) {
                const arc = (angle + turns * 2 * Math.PI) * arcScale, height = radius - Math.hypot(p.x, p.y);
                const uv = projection === 'top' ? [arc, p.z] : projection === 'axial' ? [arc, height] : [p.z, height];
                cache.set(key, sourceIds.length); sourceIds.push(ids[k]); uvs.push(...uv);
            }
            indices.push(cache.get(key));
        }
    }
    const result = geometry.clone();
    for (const [name, attribute] of Object.entries(geometry.attributes)) {
        if (name === 'uv') continue;
        const array = new attribute.array.constructor(sourceIds.length * attribute.itemSize);
        sourceIds.forEach((id, i) => array.set(attribute.array.subarray(id * attribute.itemSize, (id + 1) * attribute.itemSize), i * attribute.itemSize));
        const replacement = new THREE.BufferAttribute(array, attribute.itemSize, attribute.normalized);
        replacement.name = attribute.name; replacement.setUsage(attribute.usage); replacement.gpuType = attribute.gpuType;
        result.setAttribute(name, replacement);
    }
    result.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    result.setIndex(indices);
    result.userData.interiorMetreUVs = {radius, tileMetres, circumference, surface, frame: 'habitat XY ring / Z axis'};
    return result;
}
