import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {OBJLoader} from 'three/addons/loaders/OBJLoader.js';
import {ColliderWorld} from '../src/physics/collider-world.js';
import {CharacterController} from '../src/physics/character-controller.js';
import {createBlockout} from '../src/editor/blockout.js';
import {orientToSurface} from '../src/editor/placement.js';

// Frozen pre-optimization solid construction. Explicit support policy is tested
// separately by settlement-farm-collision.test.js, including every OBJ floor.
class ReferenceWorld extends ColliderWorld {
    query(box) {
        this._seen.clear();this._result.length=0;
        this._keys(box,key=>{const cell=this.cells.get(key);if(cell)for(const entry of cell)this._seen.add(entry);});
        for(const entry of this._seen)if(entry.box.intersectsBox(box))this._result.push(entry.triangle);
        this.stats.queries++;this.stats.candidates+=this._seen.size;this.stats.narrowphase+=this._result.length;
        this.stats.maxCandidates=Math.max(this.stats.maxCandidates,this._seen.size);return this._result;
    }
    setObject(id,object,relativeTo=null,options={}) {
        if(options.enabled===false || object.userData.surface?.collisionMode && object.userData.surface.collisionMode!=='solid')
            return super.setObject(id,object,relativeTo,options);
        this.remove(id);object.updateWorldMatrix(true,true);
        const inverse=relativeTo?relativeTo.matrixWorld.clone().invert():new THREE.Matrix4();
        const matrix=new THREE.Matrix4(),entries=[];
        object.traverse(child=>{
            if(!child.isMesh || !child.geometry?.attributes.position || child.userData.collision===false)return;
            matrix.multiplyMatrices(inverse,child.matrixWorld);
            const position=child.geometry.attributes.position,index=child.geometry.index,count=index?index.count:position.count;
            for(let i=0;i<count;i+=3) {
                const triangle=new THREE.Triangle();
                for(const [offset,v] of [[0,triangle.a],[1,triangle.b],[2,triangle.c]])
                    v.fromBufferAttribute(position,index?index.getX(i+offset):i+offset).applyMatrix4(matrix);
                if(triangle.getArea()<1e-9)continue;
                const a=triangle.a,b=triangle.b,c=triangle.c;
                const box=new THREE.Box3(new THREE.Vector3(Math.min(a.x,b.x,c.x),Math.min(a.y,b.y,c.y),Math.min(a.z,b.z,c.z)),
                    new THREE.Vector3(Math.max(a.x,b.x,c.x),Math.max(a.y,b.y,c.y),Math.max(a.z,b.z,c.z)));
                const entry={triangle,box,keys:[]};
                this._keys(box,key=>{if(!this.cells.has(key))this.cells.set(key,new Set());this.cells.get(key).add(entry);entry.keys.push(key);});
                entries.push(entry);
            }
        });
        this.colliders.set(id,entries);this.triangleCount+=entries.length;
    }
}
const triangleValues=t=>[...t.a.toArray(),...t.b.toArray(),...t.c.toArray()];
function equivalent(actual,reference,id) {
    const a=actual.colliders.get(id),b=reference.colliders.get(id);
    assert.equal(a?.length,b?.length,id);
    if(!a)return;
    for(let i=0;i<a.length;i++) {
        assert.deepEqual(triangleValues(a[i].triangle),triangleValues(b[i].triangle),`${id} face ${i}`);
        assert.deepEqual(a[i].box,b[i].box);assert.deepEqual(a[i].keys,b[i].keys);
    }
    assert.deepEqual([...actual.cells.keys()],[...reference.cells.keys()]);
    for(const [key,cell] of actual.cells)assert.equal(cell.size,reference.cells.get(key).size,key);
    for(const i of [0,Math.floor(a.length/2),a.length-1])if(a[i]) {
        const q=a[i].box.clone().expandByScalar(.35);
        assert.deepEqual(actual.query(q).map(triangleValues),reference.query(q).map(triangleValues));
        assert.deepEqual(actual.stats,reference.stats);
    }
}

test('exact solid triangle/hash/query equivalence across full candidate, with construction comparison',()=>{
    const saved=JSON.parse(fs.readFileSync(process.env.ONEILLSIM_WORLD_FIXTURE || new URL('../world.json',import.meta.url)));
    const models=new Map(),habitat=new THREE.Group(),loader=new OBJLoader();
    let optimizedMs=0,referenceMs=0,optimizedCPU=0,referenceCPU=0,triangles=0,solids=0,supports=0,none=0,exterior=0,controllers=0;
    for(const [id,type,theta,z,scale,rotation,spec,surface] of saved.assets) {
        if(surface?.worldTransform){exterior++;continue;}
        const name=saved.assetTypes[type];
        if(!spec&&!models.has(name)) {
            const building=new URL(`../assets/ultimate-buildings/${name}.obj`,import.meta.url);
            models.set(name,loader.parse(fs.readFileSync(fs.existsSync(building)?building:new URL(`../assets/ultimate-nature/${name}.obj`,import.meta.url),'utf8')));
        }
        const object=spec?createBlockout(spec):models.get(name).clone();
        orientToSurface(object,theta,z,surface?.height??spec?.elevation??0);object.rotateY(rotation||0);object.scale.setScalar(scale||4);
        object.userData.surface=surface;habitat.add(object);
        const a=new ColliderWorld(),b=new ReferenceWorld();
        let cpu=process.cpuUsage(),start=performance.now();b.setObject(id,object,habitat);
        referenceMs+=performance.now()-start;const rc=process.cpuUsage(cpu);referenceCPU+=rc.user+rc.system;
        cpu=process.cpuUsage();start=performance.now();a.setObject(id,object,habitat);
        optimizedMs+=performance.now()-start;const ac=process.cpuUsage(cpu);optimizedCPU+=ac.user+ac.system;
        equivalent(a,b,id);triangles+=a.triangleCount;
        if(surface?.collisionMode==='none')none++;
        else if(surface?.collisionMode==='farm-zoned'||surface?.collisionMode==='support-only')supports++;
        else solids++;
        if(controllers<24 && a.triangleCount && surface?.collisionMode!=='none') {
            const center=a.colliders.get(id)[0].box.getCenter(new THREE.Vector3());
            const ca=new CharacterController(a),cb=new CharacterController(b);
            ca.teleport(center);cb.teleport(center);
            for(let i=0;i<60;i++) {
                const direction=new THREE.Vector3(-Math.sin(theta),Math.cos(theta),.1).normalize();
                ca.advance(1/120,direction);cb.advance(1/120,direction);
                assert.deepEqual(ca.position,cb.position);assert.deepEqual(ca.velocity,cb.velocity);assert.equal(ca.grounded,cb.grounded);
            }
            controllers++;
        }
        a.remove(id);b.remove(id);assert.equal(a.cells.size,0);assert.equal(b.cells.size,0);habitat.remove(object);
    }
    console.log(JSON.stringify({colliderEquivalence:{placements:saved.assets.length,solids,supports,none,exterior,triangles,controllers,optimizedMs,referenceMs,optimizedCPUms:optimizedCPU/1000,referenceCPUms:referenceCPU/1000}}));
    // This comparison intentionally has no substitute wall-clock gate. The full
    // parser+terrace+placement gate remains <5000ms in character-physics.test.js.
    assert.ok(solids>0);assert.ok(controllers>0);
});

test('shared corners remain placement-local; cache invalidates position/index replacement and version edits',()=>{
    const geometry=new THREE.BoxGeometry(2,2,2),root=new THREE.Mesh(geometry),world=new ColliderWorld(),ref=new ReferenceWorld();
    const check=id=>{world.setObject(id,root);ref.setObject(id,root);equivalent(world,ref,id);};
    check('one');const first=world.colliders.get('one').map(e=>triangleValues(e.triangle));
    root.position.set(7,-3,9);check('two');
    assert.deepEqual(world.colliders.get('one').map(e=>triangleValues(e.triangle)),first);
    world.remove('one');ref.remove('one');
    geometry.attributes.position.setX(0,5);geometry.attributes.position.needsUpdate=true;check('two');
    geometry.setAttribute('position',geometry.attributes.position.clone());check('two');
    const index=geometry.index.clone();index.setX(0,index.getX(1));geometry.setIndex(index);check('two');
    index.setX(0,0);index.needsUpdate=true;check('two');
    root.visible=false;root.userData.collision=false;check('two');assert.equal(world.triangleCount,0);
});
