import * as THREE from 'three';

// Repeated OBJ clones share geometry. Cache only model-local indexed vertex
// expansion, never transformed triangles/hash cells (placements stay independent).
// Attribute identity/version invalidates edited geometry; WeakMap does not pin
// disposed prototypes. Collision retains the original all-triangle semantics.
const geometryTriangles = new WeakMap();
function triangleCoordinates(geometry) {
    const position=geometry.attributes.position, index=geometry.index;
    const cached=geometryTriangles.get(geometry);
    if (cached && cached.position===position && cached.index===index
        && cached.positionVersion===position.version && cached.indexVersion===index?.version) return cached.coordinates;
    const count=index?index.count:position.count;
    const vertices=[],indices=new Uint32Array(count),unique=new Map();
    // OBJLoader expands face vertices. Weld only EXACT coordinates (including
    // signed zero); no tolerance, quantization, omitted faces or winding changes.
    for(let i=0;i<count;i++) {
        const vertex=index?index.getX(i):i;
        const x=position.getX(vertex),y=position.getY(vertex),z=position.getZ(vertex);
        const key=`${Object.is(x,-0)?'-0':x},${Object.is(y,-0)?'-0':y},${Object.is(z,-0)?'-0':z}`;
        let n=unique.get(key);
        if(n===undefined) { n=vertices.length/3;unique.set(key,n);vertices.push(x,y,z); }
        indices[i]=n;
    }
    const coordinates={vertices:new Float64Array(vertices),indices};
    geometryTriangles.set(geometry,{position,index,positionVersion:position.version,indexVersion:index?.version,coordinates});
    return coordinates;
}

// Opt-in ONLY via persisted placement surface metadata. Never infer collision
// from asset names, foliage materials or render visibility. 'support-only' is
// for an authored crop/pond floor, not solid homes, equipment or retaining walls.
// 'farm-zoned' adds explicit collisionSolids in the same intrinsic metre frame:
// [{name,x,z,width,depth,minHeight,maxHeight}]. Blocks must fit inside the floor,
// have positive finite dimensions and maxHeight>minHeight; no coercion/inference.
// Flat/legacy curved supports, default solid meshes and none retain their policy.
// collisionSupport is in ROOT MODEL coordinates (placement scale/rotation apply):
// flat: {kind:'flat', width, depth, y, centerX?:0, centerZ?:0}
// curved: {kind:'curved', radius, thetaStart, thetaEnd, zMin, zMax}
// Farm authoring contract (metres at canonical OBJ scale 4):
// {width, depth, curveRadiusMeters, heightMeters:0}. Here width is the
// intrinsic arc footprint, +Y is inward. Generator mapping is
// X=(R-h)sin(x/R), Y=R-(R-h)cos(x/R), Z=z.
// Values are divided by 4, then the SAME root placement matrix applies.
// Authors must supply the actual floor footprint/elevation, not the visual AABB.
// A curved inward-facing floor is conservatively represented by chords with
// <= 1 cm radial error in final placement units (slightly inward/above the arc).
function supportTriangles(object) {
    const surface = object.userData?.surface;
    const mode = surface?.collisionMode;
    if (mode == null || mode === 'solid' || mode === 'none') return { mode, triangles: null };
    if (mode !== 'support-only' && mode !== 'farm-zoned') throw new TypeError(`Unknown placement collisionMode: ${mode}`);
    const p = surface.collisionSupport;
    if (mode === 'farm-zoned' && (!p || p.kind != null)) {
        throw new TypeError('farm-zoned requires explicit intrinsic metre collisionSupport');
    }
    const finite = (...values) => values.every(value => typeof value === 'number' && Number.isFinite(value));
    const triangles = [];
    const quad = (a, b, c, d) => {
        triangles.push(new THREE.Triangle(a, b, c), new THREE.Triangle(a.clone(), c.clone(), d));
    };
    if (p && p.kind == null && finite(p.width,p.depth,p.curveRadiusMeters,p.heightMeters)
        && p.width > 0 && p.depth > 0 && p.curveRadiusMeters > p.width/2
        && p.heightMeters < p.curveRadiusMeters) {
        object.updateWorldMatrix(true, false);
        const radius=p.curveRadiusMeters, scale=object.matrixWorld.getMaxScaleOnAxis()/4;
        const solids = mode === 'farm-zoned' ? surface.collisionSolids : [];
        if (!Array.isArray(solids) || solids.length > 8192 || !solids.length && mode === 'farm-zoned'
            || !Array.from(solids).every(s => s && typeof s.name === 'string' && s.name.trim().length
                && finite(s.x,s.z,s.width,s.depth,s.minHeight,s.maxHeight)
                && s.width > 0 && s.depth > 0 && s.maxHeight > s.minHeight
                && s.maxHeight < radius
                && Math.abs(s.x)+s.width/2 <= p.width/2
                && Math.abs(s.z)+s.depth/2 <= p.depth/2)) {
            throw new TypeError('farm-zoned requires nonempty collisionSolids with named finite numeric curved footprint/elevation bounds inside collisionSupport');
        }
        // Bound EACH curved face at the largest authored radial extent. Use asin
        // rather than acos(1-epsilon), which loses precision at small tolerances.
        const extent=Math.max(radius-p.heightMeters,...solids.map(s=>radius-s.minHeight));
        const step=4*Math.asin(Math.sqrt(Math.min(.01/(2*extent*scale),.5)));
        const segments = width => {
            const n=Math.max(1,Math.ceil(width/radius/step));
            if (!Number.isFinite(n)||n>8192) throw new RangeError('collisionSupport curved floor exceeds conservative segment budget');
            return n;
        };
        const point=(x,z,h)=>new THREE.Vector3((radius-h)*Math.sin(x/radius)/4,
            (radius-(radius-h)*Math.cos(x/radius))/4,z/4);
        const count=segments(p.width);
        for(let i=0;i<count;i++) {
            const a=-p.width/2+p.width*i/count, b=-p.width/2+p.width*(i+1)/count;
            quad(point(a,-p.depth/2,p.heightMeters),point(a,p.depth/2,p.heightMeters),
                point(b,p.depth/2,p.heightMeters),point(b,-p.depth/2,p.heightMeters));
        }
        // Closed curved precincts, NOT a whole-plot AABB or ornamental OBJ mesh.
        // Clockwise intrinsic footprint gives inward/upward tops and outward walls.
        for (const s of solids) {
            const n=segments(s.width), z0=s.z-s.depth/2,z1=s.z+s.depth/2;
            for(let i=0;i<n;i++) {
                const x0=s.x-s.width/2+s.width*i/n,x1=s.x-s.width/2+s.width*(i+1)/n;
                const a=point(x0,z0,s.minHeight),b=point(x0,z1,s.minHeight),
                    c=point(x1,z1,s.minHeight),d=point(x1,z0,s.minHeight);
                const A=point(x0,z0,s.maxHeight),B=point(x0,z1,s.maxHeight),
                    C=point(x1,z1,s.maxHeight),D=point(x1,z0,s.maxHeight);
                quad(A,B,C,D); quad(d,c,b,a);
                quad(a,A,D,d); quad(c,C,B,b);
                // No internal slice walls: avoid phantom contact seams.
                if(i===0) quad(b,B,A,a);
                if(i===n-1) quad(d,D,C,c);
            }
        }
    } else if (p?.kind === 'flat' && finite(p.width, p.depth, p.y, p.centerX ?? 0, p.centerZ ?? 0) && p.width > 0 && p.depth > 0) {
        const x = p.centerX ?? 0, z = p.centerZ ?? 0, w = p.width / 2, d = p.depth / 2;
        quad(new THREE.Vector3(x-w,p.y,z-d), new THREE.Vector3(x-w,p.y,z+d),
            new THREE.Vector3(x+w,p.y,z+d), new THREE.Vector3(x+w,p.y,z-d));
    } else if (p?.kind === 'curved' && finite(p.radius,p.thetaStart,p.thetaEnd,p.zMin,p.zMax)
        && p.radius > 0 && p.thetaEnd > p.thetaStart && p.thetaEnd-p.thetaStart <= Math.PI*2 && p.zMax > p.zMin) {
        object.updateWorldMatrix(true, false);
        const scale = object.matrixWorld.getMaxScaleOnAxis();
        const step = 2 * Math.acos(1 - Math.min(.01 / (p.radius * scale), 1));
        const count = Math.ceil((p.thetaEnd-p.thetaStart) / step);
        if (!Number.isFinite(count) || count > 8192) throw new RangeError('collisionSupport curved floor exceeds conservative segment budget');
        const point = (theta,z) => new THREE.Vector3(p.radius*Math.cos(theta),p.radius*Math.sin(theta),z);
        for (let i=0; i<count; i++) {
            const a=p.thetaStart+(p.thetaEnd-p.thetaStart)*i/count;
            const b=p.thetaStart+(p.thetaEnd-p.thetaStart)*(i+1)/count;
            quad(point(a,p.zMin),point(a,p.zMax),point(b,p.zMax),point(b,p.zMin));
        }
    } else {
        throw new TypeError('support-only requires explicit finite, positive flat/curved collisionSupport floor dimensions');
    }
    return { mode, triangles };
}

// Keep scalar bounds during bulk construction. Most triangles are never queried;
// materialize their public Box3 only on inspection, not three objects per face.
class ColliderEntry {
    constructor(triangle,keys,minX,minY,minZ,maxX,maxY,maxZ) {
        this.triangle=triangle;this.keys=keys;
        this.minX=minX;this.minY=minY;this.minZ=minZ;
        this.maxX=maxX;this.maxY=maxY;this.maxZ=maxZ;this._box=null;
    }
    get box() {
        return this._box ??= new THREE.Box3(new THREE.Vector3(this.minX,this.minY,this.minZ),
            new THREE.Vector3(this.maxX,this.maxY,this.maxZ));
    }
    intersectsBox(box) {
        // Same rejection ordering/comparisons as THREE.Box3.intersectsBox.
        return !(box.max.x<this.minX || box.min.x>this.maxX ||
            box.max.y<this.minY || box.min.y>this.maxY ||
            box.max.z<this.minZ || box.min.z>this.maxZ);
    }
}

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

    // Replace at simulation-call boundaries. relativeTo excludes habitat rotation
    // while retaining every child transform. Support-only floors are explicit.
    setObject(id, object, relativeTo = null, { enabled = true } = {}) {
        // Validate before replacing an existing collider; bad metadata must not
        // silently remove solids or fabricate a floor from a foliage AABB.
        const support = enabled ? supportTriangles(object) : { mode: 'none' };
        this.remove(id);
        if (!enabled || support.mode === 'none') return;
        object.updateWorldMatrix(true, true);
        const inverse = relativeTo ? relativeTo.matrixWorld.clone().invert() : new THREE.Matrix4();
        const entries = [];
        const matrix = new THREE.Matrix4();
        // Adjacent faces usually occupy the same cells. Share immutable key lists
        // across those faces, but retain independent entries/triangles/AABBs.
        let lastBounds = null, lastKeys = null;
        const insert = triangle => {
            if (triangle.getArea() < 1e-9) return;
            const a=triangle.a,b=triangle.b,c=triangle.c;
            const minX=Math.min(a.x,b.x,c.x),minY=Math.min(a.y,b.y,c.y),minZ=Math.min(a.z,b.z,c.z),
                maxX=Math.max(a.x,b.x,c.x),maxY=Math.max(a.y,b.y,c.y),maxZ=Math.max(a.z,b.z,c.z);
            const s = this.cellSize;
            const x0=Math.floor(minX/s),x1=Math.floor(maxX/s),
                y0=Math.floor(minY/s),y1=Math.floor(maxY/s),
                z0=Math.floor(minZ/s),z1=Math.floor(maxZ/s);
            let keys;
            if (lastBounds && x0===lastBounds[0] && x1===lastBounds[1]
                && y0===lastBounds[2] && y1===lastBounds[3]
                && z0===lastBounds[4] && z1===lastBounds[5]) keys=lastKeys;
            else {
                keys=[];
                for(let x=x0;x<=x1;x++) for(let y=y0;y<=y1;y++) {
                    const prefix=`${x},${y},`;
                    for(let z=z0;z<=z1;z++) keys.push(prefix+z);
                }
                lastBounds=[x0,x1,y0,y1,z0,z1];lastKeys=keys;
            }
            const entry = new ColliderEntry(triangle,keys,minX,minY,minZ,maxX,maxY,maxZ);
            for (const key of keys) {
                let cell=this.cells.get(key);
                if (!cell) { cell=new Set();this.cells.set(key,cell); }
                cell.add(entry);
            }
            entries.push(entry);
        };
        if (support.triangles) {
            matrix.multiplyMatrices(inverse, object.matrixWorld);
            for (const localTriangle of support.triangles) {
                // Faces share authored corners; never transform shared vertices
                // in-place repeatedly (especially closed farm precincts).
                const triangle = localTriangle.clone();
                triangle.a.applyMatrix4(matrix); triangle.b.applyMatrix4(matrix); triangle.c.applyMatrix4(matrix);
                insert(triangle);
            }
        } else {
            object.traverse(child => {
                if (!child.isMesh || !child.geometry?.attributes.position || child.userData?.collision === false) return;
                matrix.multiplyMatrices(inverse, child.matrixWorld);
                const {vertices,indices}=triangleCoordinates(child.geometry);
                // Static collider corners are read-only. Transform each exact
                // model-local corner once per mesh/placement, never across roots.
                // applyMatrix4 is retained verbatim, including projective divide.
                const transformed=new Array(vertices.length/3);
                for(let i=0;i<vertices.length;i+=3) transformed[i/3]=
                    new THREE.Vector3(vertices[i],vertices[i+1],vertices[i+2]).applyMatrix4(matrix);
                for(let i=0;i<indices.length;i+=3)
                    insert(new THREE.Triangle(transformed[indices[i]],transformed[indices[i+1]],transformed[indices[i+2]]));
            });
        }
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
        for (const entry of this._seen) if (entry.intersectsBox(box)) this._result.push(entry.triangle);
        this.stats.queries++;
        this.stats.candidates += this._seen.size;
        this.stats.narrowphase += this._result.length;
        this.stats.maxCandidates = Math.max(this.stats.maxCandidates, this._seen.size);
        return this._result;
    }
}

export const characterColliders = new ColliderWorld();