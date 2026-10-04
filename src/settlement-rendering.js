import * as THREE from 'three';

// Render-only acceleration. Logical roots remain in the scene, retain IDs and
// transforms, and are still the sole inputs to saving, picking and collision.
// Identity, not a material/kit name, is the compatibility contract. Transparent
// meshes (notably water) keep their original sorting and individual draw calls.
export function createSettlementRendering(habitatGroup, { cellSize = 128 } = {}) {
    if (!(cellSize > 0)) throw new RangeError('render batch cellSize must be positive');
    const group = new THREE.Group();
    group.name = 'settlement-render-batches';
    group.userData.collision = false;

    const hidden = new Map();
    let batches = [];
    let stats = { logicalRoots: 0, sourceMeshes: 0, batchedMeshes: 0, batches: 0, savedDrawCalls: 0 };

    function clear() {
        for (const [mesh, visible] of hidden) mesh.visible = visible;
        hidden.clear();
        for (const batch of batches) {
            group.remove(batch);
            // InstancedMesh.dispose frees instance buffers, NEVER borrowed geometry,
            // materials or their textures. Those belong to the loader/owning asset.
            batch.dispose();
        }
        batches = [];
        habitatGroup.remove(group);
    }

    function refresh(roots) {
        clear();
        const logicalRoots = [...roots];
        habitatGroup.updateWorldMatrix(true, true);
        const inverse = habitatGroup.matrixWorld.clone().invert();
        const pools = new Map();
        const identities = new Map();
        const identity = resource => {
            if (!identities.has(resource)) identities.set(resource, identities.size);
            return identities.get(resource);
        };
        stats = { logicalRoots: logicalRoots.length, sourceMeshes: 0, batchedMeshes: 0, batches: 0, savedDrawCalls: 0 };
        for (const root of logicalRoots) {
            if (!root || root.parent !== habitatGroup) continue;
            root.traverseVisible(mesh => {
                if (!mesh.isMesh) return;
                stats.sourceMeshes++;
                const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                if (mesh.isSkinnedMesh || mesh.isInstancedMesh || mesh.children.length
                    || mesh.morphTargetInfluences?.length || !mesh.geometry?.attributes.position
                    || !materials.length || materials.some(m => !m || !m.visible || m.transparent || m.opacity < 1 || m.isShaderMaterial)
                    || mesh.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender
                    || mesh.onAfterRender !== THREE.Object3D.prototype.onAfterRender
                    || mesh.customDepthMaterial || mesh.customDistanceMaterial) return;
                const matrix = new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld);
                // Three r160 does not support negatively scaled instances.
                if (matrix.determinant() <= 0) return;
                let ancestor = mesh.parent;
                while (ancestor && ancestor !== habitatGroup && ancestor.renderOrder === 0) ancestor = ancestor.parent;
                if (ancestor && ancestor !== habitatGroup) return;
                // Whole-ring instances would defeat per-object culling during a
                // human walk. Chunk by actual geometry center, not root origin:
                // authored curved models can contain offset/baked coordinates.
                if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
                const center = mesh.geometry.boundingSphere.center.clone().applyMatrix4(matrix);
                const cell = [center.x, center.y, center.z].map(value => Math.floor(value / cellSize)).join(',');
                const key = [identity(mesh.geometry), Array.isArray(mesh.material) ? 'array' : 'single',
                    ...materials.map(identity), mesh.castShadow, mesh.receiveShadow,
                    mesh.layers.mask, mesh.renderOrder, mesh.frustumCulled, cell].join('|');
                if (!pools.has(key)) pools.set(key, []);
                pools.get(key).push({ mesh, matrix, id: root.userData.assetId });
            });
        }
        for (const entries of pools.values()) {
            if (entries.length < 2) continue;
            const first = entries[0].mesh;
            const batch = new THREE.InstancedMesh(first.geometry, first.material, entries.length);
            batch.name = 'settlement-instance-batch';
            batch.castShadow = first.castShadow;
            batch.receiveShadow = first.receiveShadow;
            batch.layers.mask = first.layers.mask;
            batch.renderOrder = first.renderOrder;
            batch.frustumCulled = first.frustumCulled;
            batch.userData.collision = false;
            // Raycast consumers can map an instance back to the original saved ID.
            batch.userData.assetIds = entries.map(entry => entry.id);
            entries.forEach(({ mesh, matrix }, index) => {
                batch.setMatrixAt(index, matrix);
                hidden.set(mesh, mesh.visible);
                mesh.visible = false;
            });
            batch.instanceMatrix.needsUpdate = true;
            batch.computeBoundingBox();
            batch.computeBoundingSphere();
            group.add(batch);
            batches.push(batch);
            stats.batchedMeshes += entries.length;
            // Geometry groups cause multiple draws when using a material array.
            const draws = Array.isArray(first.material) ? first.geometry.groups.length : 1;
            stats.savedDrawCalls += (entries.length - 1) * draws;
        }
        stats.batches = batches.length;
        if (batches.length) habitatGroup.add(group);
        return { ...stats };
    }

    return {
        group, refresh,
        get stats() { return { ...stats }; },
        dispose() { clear(); habitatGroup.remove(group); }
    };
}

// Optional reversible lookdev for parent integration, not enabled by placement.
// Actual scene has a dark-gray ambient at intensity 25 and twelve warm ring
// point lights at 20 (src/lighting.js), with no fog/tone-map in src/scene.js.
// Keep those physical/local lights and water materials intact; filmic mapping
// softens bright atlas surfaces. No fog: an orbital overview must retain vistas.
export function createSettlementPresentation({ renderer, exposure = 1 }) {
    const previous = { toneMapping: renderer.toneMapping, toneMappingExposure: renderer.toneMappingExposure };
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = exposure;
    return { dispose() { Object.assign(renderer, previous); } };
}
