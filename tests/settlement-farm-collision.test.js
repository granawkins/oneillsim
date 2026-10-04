import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {OBJLoader} from 'three/addons/loaders/OBJLoader.js';
import {ColliderWorld} from '../src/physics/collider-world.js';
import {CharacterController} from '../src/physics/character-controller.js';
import {buildFarms, farmCollision} from '../src/settlement-farms.js';
import {orientToSurface} from '../src/editor/placement.js';
import {applyPlacementTransform, isExteriorPlacement} from '../src/editor/placement-transform.js';

const raw=fs.readFileSync(new URL('../assets/settlement-source-world.json',import.meta.url));
const source=JSON.parse(raw), farms=buildFarms(source), placements=[...farms.replacements,...farms.additions];
const prototypes=new Map();
function fixture(p,habitat=new THREE.Group()) {
    if(!prototypes.has(p.type)) prototypes.set(p.type,new OBJLoader().parse(fs.readFileSync(new URL(`../assets/ultimate-buildings/${p.type}.obj`,import.meta.url),'utf8')));
    const object=prototypes.get(p.type).clone();
    applyPlacementTransform(object,{theta:p.theta,z:p.z,elevation:p.surface.height,rotation:p.rotation,scale:p.scale,surface:p.surface},orientToSurface);
    habitat.add(object); object.updateWorldMatrix(true,true);
    return object;
}
function point(p,x,z,h=.05) {
    const r=p.surface.collisionSupport.curveRadiusMeters;
    return new THREE.Vector3((r-h)*Math.sin(x/r)/4,(r-(r-h)*Math.cos(x/r))/4,z/4);
}
function intrinsic(p,object,worldPoint) {
    const v=worldPoint.clone().applyMatrix4(object.matrixWorld.clone().invert()).multiplyScalar(4),r=p.surface.collisionSupport.curveRadiusMeters;
    return {x:r*Math.atan2(v.x,r-v.y),z:v.z,h:r-Math.hypot(v.x,r-v.y)};
}
function travel(c,p,object,x,z) {
    const target=point(p,x,z).applyMatrix4(object.matrixWorld);
    for(let i=0;i<900;i++) {
        const v=intrinsic(p,object,c.position);
        if(Math.hypot(v.x-x,v.z-z)<.14) return i;
        c.tick(target.clone().sub(c.position).normalize());
        assert.ok(c.grounded,`${p.id} lost support: ${JSON.stringify(v)}`);
    }
    assert.fail(`${p.id} route stalled at ${JSON.stringify(intrinsic(p,object,c.position))}, target ${x},${z}`);
}

test('strict farm zoning rejects malformed metadata atomically; legacy modes remain independent of render visibility',()=>{
    const w=new ColliderWorld(),root=new THREE.Mesh(new THREE.BoxGeometry(1,1,1));root.visible=false;
    w.setObject('prior',root);assert.equal(w.triangleCount,12);const prior=w.colliders.get('prior');
    const good=farmCollision('processing',58,30,0);
    const invalid=[{...good,collisionSolids:undefined},{...good,collisionSolids:[]},
        {...good,collisionSupport:{kind:'flat',width:1,depth:1,y:0}},
        {...good,collisionSupport:{...good.collisionSupport,width:'58'}},
        {...good,collisionSupport:{...good.collisionSupport,heightMeters:NaN}},
        ...['name','x','z','width','depth','minHeight','maxHeight'].map(key=>({...good,collisionSolids:[{...good.collisionSolids[0],[key]:key==='name'?4:'1'}]})),
        {...good,collisionSolids:[{...good.collisionSolids[0],x:1000}]},
        {...good,collisionSolids:[{...good.collisionSolids[0],maxHeight:0}]}];
    for(const surface of invalid) {root.userData.surface=surface;assert.throws(()=>w.setObject('prior',root));assert.equal(w.colliders.get('prior'),prior);assert.equal(w.triangleCount,12);}
    root.userData.surface={collisionMode:'solid'};w.setObject('prior',root);assert.equal(w.triangleCount,12);
    root.userData.surface={collisionMode:'support-only',collisionSupport:{kind:'flat',width:2,depth:3,y:0}};w.setObject('prior',root);assert.equal(w.triangleCount,2);
    root.userData.surface={collisionMode:'none'};w.setObject('prior',root);assert.equal(w.triangleCount,0);
    assert.equal(isExteriorPlacement({deckId:'exterior-structures',...good}),true);
});

test('actual Farm A allocation and ground/deck OBJ support agree with intrinsic curved contract; per-face winding/error bound',()=>{
    assert.equal(createHash('sha256').update(raw).digest('hex'),'98b71f7a70b06603dc080287c3025ca95242be1f64c5f4f463837b7020fb2591');
    assert.equal(farms.replacements.length,78);
    const floorCounts={};let compared=0,rayHits=0,maxVertexError=0,maxSagitta=0,maxFloorRayError=0;
    for(const p of placements) {
        const r=p.surface.collisionSupport.curveRadiusMeters,object=fixture(p),w=new ColliderWorld();w.setObject(p.id,object);
        if(p.surface.sourcePlot) {
            const rec=source.assets.find(a=>a[0]===p.id);
            assert.deepEqual(p.surface.sourcePlot,rec[6]);assert.equal(p.theta,rec[2]);assert.equal(p.z,rec[3]);
            assert.equal(p.footprint.width*p.footprint.depth,rec[6].width*rec[6].depth);
        }
        const inverse=object.matrixWorld.clone().invert(),supportCount=2*Math.ceil(p.footprint.width/r/(4*Math.asin(Math.sqrt(.01/(2*r)))));
        const entries=w.colliders.get(p.id);
        // Support comes first; use its normal against the local radial up at EACH face.
        for(const {triangle} of entries.slice(0,supportCount)) {
            const t=triangle.clone();for(const v of [t.a,t.b,t.c])v.applyMatrix4(inverse).multiplyScalar(4);
            const center=t.getMidpoint(new THREE.Vector3()),up=new THREE.Vector3(-center.x,r-center.y,0).normalize();
            assert.ok(t.getNormal(new THREE.Vector3()).dot(up)>.999);
            const error=r-.05-Math.hypot(center.x,r-center.y);maxSagitta=Math.max(maxSagitta,error);assert.ok(error<=.010001&&error>=-1e-6);
        }
        object.traverse(child=>{
            if(!child.isMesh||child.name!=='support')return;
            floorCounts[p.surface.deckId]=(floorCounts[p.surface.deckId]||0)+1;
            const pos=child.geometry.attributes.position;
            for(let i=0;i<pos.count;i++) {
                const v=new THREE.Vector3().fromBufferAttribute(pos,i).multiplyScalar(4);
                const h=r-Math.hypot(v.x,r-v.y);
                // Authored soil floor is h=0; lane/apron paving is h=.05/.07.
                assert.ok(h>-.00001&&h<.071,`not a floor ${p.id}: ${h}`);
                const x=r*Math.atan2(v.x,r-v.y),expected=point(p,x,v.z,h).multiplyScalar(4);
                const err=expected.distanceTo(v);maxVertexError=Math.max(maxVertexError,err);assert.ok(err<1e-6);compared++;
                // Compare the actual OBJ FLOOR (never opaque ornament/canopy)
                // with the registered support via an inward/outward radial ray.
                const up=new THREE.Vector3(-v.x,r-v.y,0).normalize();
                const ray=new THREE.Ray(v.clone().addScaledVector(up,.2),up.clone().negate());
                const hit=new THREE.Vector3();let best=Infinity;
                for(const entry of entries.slice(0,supportCount)) {
                    const t=entry.triangle.clone();for(const q of [t.a,t.b,t.c])q.applyMatrix4(inverse).multiplyScalar(4);
                    if(ray.intersectTriangle(t.a,t.b,t.c,false,hit)) best=Math.min(best,hit.distanceTo(v));
                }
                // Edge vertices need tiny inward inset for floating-point ray
                // boundary tolerance; their analytic radius was checked above.
                if(Number.isFinite(best)) {
                    rayHits++;
                    maxFloorRayError=Math.max(maxFloorRayError,best);
                    assert.ok(best<.061,`${p.id} floor/collider mismatch ${best}`);
                    if(Math.abs(h-.05)<.00001)assert.ok(best<.010001,`${p.id} paving mismatch ${best}`);
                }
            }
        });
    }
    assert.equal(Object.keys(floorCounts).length,8);assert.ok(compared>1000);assert.ok(rayHits>compared*.5);
    console.log(JSON.stringify({farmSupport:{placements:placements.length,comparedFloorVertices:compared,rayHits,floorGroupsByDeck:floorCounts,maxVertexError,maxSagitta,maxFloorRayError}}));
});

test('zoned curved faces retain placement yaw/scale and exclude rotating habitat transforms exactly once',()=>{
    const p={...farms.additions.find(p=>p.footprint.category==='processing'),rotation:.37,scale:6};
    const habitat=new THREE.Group();habitat.position.set(13,-8,7);habitat.rotation.set(.2,.7,-.9);
    const object=fixture(p,habitat),w=new ColliderWorld();w.setObject(p.id,object,habitat);
    const inverse=habitat.matrixWorld.clone().invert(),matrix=new THREE.Matrix4().multiplyMatrices(inverse,object.matrixWorld);
    const a=point(p,-p.footprint.width/2,-p.footprint.depth/2).applyMatrix4(matrix);
    assert.ok(w.colliders.get(p.id)[0].triangle.a.distanceTo(a)<1e-9);
    const first=w.colliders.get(p.id).map(e=>e.triangle.clone());
    habitat.rotation.set(-.5,.1,1.2);habitat.position.set(-15,23,-17);
    w.setObject(p.id,object,habitat);
    for(let i=0;i<first.length;i++)for(const key of ['a','b','c'])assert.ok(first[i][key].distanceTo(w.colliders.get(p.id)[i].triangle[key])<1e-9);
});

test('actual speed-15 controller walks every Farm A cross/perimeter aisle and Farm B/C landscapes without canopy collisions',()=>{
    const begin=performance.now(),w=new ColliderWorld(),objects=new Map();
    const habitat=new THREE.Group();
    for(const p of placements) {const object=fixture(p,habitat);objects.set(p.id,object);w.setObject(p.id,object,habitat);}
    const buildMs=performance.now()-begin;let routes=0,ticks=0;const times=[];
    for(const p of placements) {
        const object=objects.get(p.id),d=p.footprint.depth,width=p.footprint.width;
        const c=new CharacterController(w,{groundExists:()=>false});
        c.teleport(point(p,0,-d/2+.6,.07).applyMatrix4(object.matrixWorld));
        for(let i=0;i<30;i++)c.tick(new THREE.Vector3());
        let t=performance.now();ticks+=travel(c,p,object,0,d/2-.6);times.push(performance.now()-t);routes++;
        if(width>1.5) {
            c.teleport(point(p,-width/2+.6,-d/2+.6,.07).applyMatrix4(object.matrixWorld));
            for(let i=0;i<30;i++)c.tick(new THREE.Vector3());
            t=performance.now();ticks+=travel(c,p,object,width/2-.6,-d/2+.6);times.push(performance.now()-t);routes++;
        }
        assert.ok(c.grounded);assert.ok(c.clear());const v=intrinsic(p,object,c.position);assert.ok(Math.abs(v.h-.05)<.015,`${p.id} floor height ${v.h}`);
    }
    times.sort((a,b)=>a-b);
    console.log(JSON.stringify({farmController:{placements:placements.length,routes,ticks,triangles:w.triangleCount,cells:w.cells.size,buildMs,routeP95Ms:times[Math.floor(times.length*.95)],queries:w.stats.queries,avgCandidates:w.stats.candidates/w.stats.queries,maxCandidates:w.stats.maxCandidates}}));
});

test('actual capsule cannot enter blocking barns, collection equipment, pumps or tree trunks, but walks beneath canopy',()=>{
    const results=[];
    for(const [scope,category,name] of [['ground','cattle','shed'],['ground','processing','collection-crate'],['ground','water','pump-filter'],['ground','orchard','tree-trunk'],['deck','cattle','shed'],['deck','processing','collection-crate'],['deck','water','pump-filter']]) {
        const list=scope==='ground'?farms.additions:farms.replacements;
        const p=list.find(p=>p.footprint.category===category&&p.surface.collisionSolids.some(s=>s.name===name)),object=fixture(p),w=new ColliderWorld();w.setObject(p.id,object);
        const s=p.surface.collisionSolids.find(s=>s.name===name),face=s.z-s.depth/2;
        const c=new CharacterController(w,{groundExists:()=>false});
        c.teleport(point(p,s.x,face-1.5,.07).applyMatrix4(object.matrixWorld));
        for(let i=0;i<30;i++)c.tick(new THREE.Vector3());
        for(let i=0;i<180;i++)c.tick(new THREE.Vector3(0,0,1).transformDirection(object.matrixWorld));
        const v=intrinsic(p,object,c.position);assert.ok(v.z<face-.30,`${name} entered ${JSON.stringify(v)}`);assert.ok(Math.abs(v.x-s.x)<.15);assert.ok(c.grounded);assert.ok(c.clear());
        if(category==='orchard') {
            c.teleport(point(p,s.x+1.1,s.z-1.5,.07).applyMatrix4(object.matrixWorld));
            for(let i=0;i<30;i++)c.tick(new THREE.Vector3());
            travel(c,p,object,s.x+1.1,s.z+1.5);assert.ok(c.clear());
        }
        results.push({scope,category,name,face,stoppedZ:v.z,height:v.h});
    }
    console.log(JSON.stringify({farmBlocking:results}));
});
