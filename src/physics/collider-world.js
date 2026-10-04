import * as THREE from 'three';

// Habitat-local static triangle hash. Only explicitly registered collision geometry
// is indexed: never the high-resolution ground, editor previews, hull or skybox.
// Rendering visibility is deliberately irrelevant to physics.
export class ColliderWorld {
    constructor(cellSize = 8) {
        this.cellSize = cellSize;
        this.cells = new Map();
        this.colliders = new Map();
        this.triangleCount = 0;
        this.stats = { queries: 0, candidates: 0, narrowphase: 0, maxCandidates: 0 };
        this._seen = new Set();
        this._result = [];
    }

    _keys(box, visit) {
        const s = this.cellSize;
        for (let x = Math.floor(box.min.x / s); x <= Math.floor(box.max.x / s); x++)
            for (let y = Math.floor(box.min.y / s); y <= Math.floor(box.max.y / s); y++)
                for (let z = Math.floor(box.min.z / s); z <= Math.floor(box.max.z / s); z++)
                    visit(`${x},${y},${z}`);
    }

    // Replace atomically at simulation-call boundaries. Call again after a door
    // moves; remove(id) (or enabled:false) clears an opened door's proxy.
    // relativeTo excludes habitat rotation while retaining every child transform.
    setObject(id, object, relativeTo = null, { enabled = true } = {}) {
        this.remove(id);
        if (!enabled) return;
        object.updateWorldMatrix(true, true);
        const inverse = relativeTo ? relativeTo.matrixWorld.clone().invert() : new THREE.Matrix4();
        const entries = [];
        const matrix = new THREE.Matrix4();
        object.traverse(child => {
            if (!child.isMesh || !child.geometry?.attributes.position || child.userData?.collision === false) return;
            matrix.multiplyMatrices(inverse, child.matrixWorld);
            const geometry = child.geometry, position = geometry.attributes.position, index = geometry.index;
            const count = index ? index.count : position.count;
            for (let i = 0; i < count; i += 3) {
                const triangle = new THREE.Triangle();
                const vertices = [triangle.a, triangle.b, triangle.c];
                for (let j = 0; j < 3; j++) vertices[j].fromBufferAttribute(position, index ? index.getX(i + j) : i + j).applyMatrix4(matrix);
                if (triangle.getArea() < 1e-9) continue;
                const box = new THREE.Box3().setFromPoints(vertices);
                const entry = { triangle, box, keys: [] };
                this._keys(box, key => {
                    if (!this.cells.has(key)) this.cells.set(key, new Set());
                    this.cells.get(key).add(entry);
                    entry.keys.push(key);
                });
                entries.push(entry);
            }
        });
        this.colliders.set(id, entries);
        this.triangleCount += entries.length;
    }

    remove(id) {
        const entries = this.colliders.get(id);
        if (!entries) return false;
        for (const entry of entries) for (const key of entry.keys) {
            const cell = this.cells.get(key);
            cell.delete(entry);
            if (!cell.size) this.cells.delete(key);
        }
        this.triangleCount -= entries.length;
        this.colliders.delete(id);
        return true;
    }

    // Result is reusable scratch storage; consume before another query.
    query(box) {
        this._seen.clear();
        this._result.length = 0;
        this._keys(box, key => {
            const cell = this.cells.get(key);
            if (cell) for (const entry of cell) this._seen.add(entry);
        });
        for (const entry of this._seen) if (entry.box.intersectsBox(box)) this._result.push(entry.triangle);
        this.stats.queries++;
        this.stats.candidates += this._seen.size;
        this.stats.narrowphase += this._result.length;
        this.stats.maxCandidates = Math.max(this.stats.maxCandidates, this._seen.size);
        return this._result;
    }
}

export const characterColliders = new ColliderWorld();
