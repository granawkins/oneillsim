import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {createCylinder} from '../src/cylinder.js';
import {configureTerraces,inTerraceSector} from '../src/terrace-surfaces.js';
import {planCapacityFarmLayers,createCapacityFarmLayers} from '../src/capacity-farm-layers.js';
import {planCapacityResidentialLayers,createCapacityResidentialLayers} from '../src/capacity-residential-layers.js';
import {createCapacityGround} from '../src/capacity-ground.js';
import {ColliderWorld} from '../src/physics/collider-world.js';
import {CharacterController} from '../src/physics/character-controller.js';

const file=new URL('./fixtures/pre-interior-reset-world.json',import.meta.url),bytes=fs.readFileSync(file),world=JSON.parse(bytes);
const hash=b=>createHash('sha256').update(b).digest('hex');
const point=(t,z,h)=>new THREE.Vector3((830-h)*Math.cos(t),(830-h)*Math.sin(t),z);
const height=c=>830-Math.hypot(c.position.x,c.position.y);
const freeze=o=>{if(o&&typeof o==='object'){Object.values(o).forEach(freeze);Object.freeze(o);}return o;};
const input=freeze(JSON.parse(JSON.stringify(world)));
const plans=[planCapacityFarmLayers(input),planCapacityResidentialLayers(input)];
function fixture(usePlans=plans){
    configureTerraces(world.terraces);const group=new THREE.Group(),{ground}=createCylinder(group),cw=new ColliderWorld();
    const original=(t,z)=>!inTerraceSector(t)&&Math.abs(z)<=65;
    const controller=new CharacterController(cw,{groundExists:original});
    const runtime=createCapacityGround({ground,habitatGroup:group,plans:usePlans,colliderWorld:cw,controller});
    return {group,ground,cw,controller,runtime,original};
}
function rayHit(ground,t,z){
    ground.updateWorldMatrix(true,false);
    const ray=new THREE.Raycaster(point(t,z,1),new THREE.Vector3(Math.cos(t),Math.sin(t),0),0,2);
    return ray.intersectObject(ground,false).length>0;
}
function walk(c,t,z,max=4000){
    for(let i=0;i<max;i++){
        let theta=Math.atan2(c.position.y,c.position.x);if(theta<0)theta+=2*Math.PI;
        const arc=(t-theta)*Math.hypot(c.position.x,c.position.y),dz=z-c.position.z;
        if(Math.hypot(arc,dz)<.12){for(let j=0;j<30;j++)c.tick(new THREE.Vector3());return;}
        c.tick(new THREE.Vector3(-Math.sin(theta)*arc,Math.cos(theta)*arc,dz).normalize());
    }
    assert.fail('controller route stalled '+JSON.stringify({position:c.position.toArray(),target:[t,z],height:height(c)}));
}

test('actual original cylinder: exact narrow holes, both sides and protected districts; immutable world',()=>{
    const before=JSON.stringify(input),{ground,cw,controller,runtime,original}=fixture();
    assert.equal(runtime.openings.length,4);assert.equal(controller.config.speed,15);
    assert.equal(runtime.stats.triangles,cw.triangleCount);
    assert.ok(runtime.stats.triangles<60000);
    for(const h of runtime.openings){
        const t=(h.thetaStart+h.thetaEnd)/2,z=(h.zMin+h.zMax)/2;
        assert.equal(rayHit(ground,t,z),false,h.id+' hole');
        for(const [a,b] of [[h.thetaStart-.02/830,z],[h.thetaEnd+.02/830,z],[t,h.zMin-.02],[t,h.zMax+.02]])
            assert.equal(rayHit(ground,a,b),true,h.id+' narrowly preserved edge');
    }
    for(const d of world.masterPlan.districts){
        assert.equal(controller.groundExists(d.center,0),/^(farm|residential)-[bc]$/.test(d.id)?false:original(d.center,0),d.id);
        if(original(d.center,0))assert.equal(rayHit(ground,d.center,0),true,d.id+' retained ground');
    }
    // All original public parks remain visible, not just the new partition.
    for(const p of plans[1].publicSpaceMasks){const r=p.rect;assert.equal(rayHit(ground,(r[0]+r[1])/1660,(r[2]+r[3])/2),true,p.id);}
    assert.equal(JSON.stringify(input),before);assert.equal(hash(fs.readFileSync(file)),hash(bytes));
    console.log(JSON.stringify(runtime.stats));runtime.dispose();
});

test('sub-cell seam-crossing and overlapping openings clip faces, not triangle centroids',()=>{
    configureTerraces({decks:[],stairs:[]});const group=new THREE.Group(),{ground}=createCylinder(group),cw=new ColliderWorld();
    const c=new CharacterController(cw),a=.12/830;
    const runtime=createCapacityGround({ground,habitatGroup:group,colliderWorld:cw,controller:c,plans:[{
        districts:[{id:'farm-b',start:2*Math.PI-.1,end:2*Math.PI+.1}],
        groundOpenings:[{thetaStart:2*Math.PI-a,thetaEnd:a,zMin:.21,zMax:.41},
            {thetaStart:-a/2,thetaEnd:a*1.5,zMin:.31,zMax:.51}]}]});
    for(const t of [-a*.75,0,a*.75])assert.equal(rayHit(ground,t,.35),false);
    for(const [t,z] of [[-a*1.2,.35],[a*1.7,.35],[0,.18],[0,.54]])assert.equal(rayHit(ground,t,z),true);
    assert.equal(c.groundExists(-.01,0),false);assert.equal(c.groundExists(.2,0),true);
    assert.ok(runtime.stats.clippedTriangles<20);runtime.dispose();
});

test('rendered geometry and registered real sheet provide support above and ceiling below; holes stay open',()=>{
    const {ground,controller:c,runtime}=fixture(),district=world.masterPlan.districts.find(d=>d.id==='farm-b'),t=district.center;
    c.teleport(point(t,0,8));for(let i=0;i<300;i++)c.tick(new THREE.Vector3());
    assert.ok(c.grounded);assert.ok(Math.abs(height(c))<.03,'physical sheet support');
    walk(c,t+20/830,0);assert.ok(c.grounded);assert.ok(Math.abs(height(c))<.03);
    // An upward jump started below the sheet must collide at the head, never
    // emerge through grass. No floor is needed to verify a forced jump impulse.
    c.teleport(point(t,0,-2.5));c.grounded=true;c.queueJump();let max=-Infinity;
    for(let i=0;i<70;i++){c.tick(new THREE.Vector3());max=Math.max(max,height(c));}
    assert.ok(max<=-1.97,'head collided with opaque ground: '+max);
    const h=runtime.openings[0],ht=(h.thetaStart+h.thetaEnd)/2,hz=(h.zMin+h.zMax)/2;
    c.teleport(point(ht,hz,-2.5));c.grounded=true;c.queueJump();let holeMax=-Infinity;
    for(let i=0;i<100;i++){c.tick(new THREE.Vector3());holeMax=Math.max(holeMax,height(c));}
    assert.ok(holeMax>-.2,'real opening permits upward passage: '+holeMax);
    assert.equal(rayHit(ground,ht,hz),false);runtime.dispose();
});

test('real farm and residential layers: speed15 descent, below-plain walking outside hole, return through hole',()=>{
    configureTerraces(world.terraces);const group=new THREE.Group(),{ground}=createCylinder(group),cw=new ColliderWorld();
    const farm=createCapacityFarmLayers({habitatGroup:group,world:input});
    const residential=createCapacityResidentialLayers({habitatGroup:group,world:input});
    for(const layer of [farm,residential])for(const item of layer.colliders)cw.setObject(item.id,item.object,group);
    const c=new CharacterController(cw,{groundExists:(t,z)=>!inTerraceSector(t)&&Math.abs(z)<=65});
    const runtime=createCapacityGround({ground,habitatGroup:group,plans:[farm.plan,residential.plan],colliderWorld:cw,controller:c});
    const results=[];
    for(const districtId of ['farm-b','farm-c']){
        const s=farm.plan.stairs.find(s=>s.districtId===districtId);
        c.teleport(point(s.start-1/830,s.z,.01));for(let i=0;i<30;i++)c.tick(new THREE.Vector3());
        walk(c,s.end+2/840,s.z);assert.ok(Math.abs(height(c)+10)<.08);assert.ok(c.grounded);assert.ok(c.clear());
        walk(c,s.end+15/840,0);assert.ok(Math.abs(height(c)+10)<.08,'outside entry stays below');
        results.push({districtId,belowHeight:height(c)});
        walk(c,s.end+2/840,s.z);walk(c,s.start-1/830,s.z);assert.ok(Math.abs(height(c))<.08);assert.ok(c.grounded);
    }
    for(const districtId of ['residential-b','residential-c']){
        const s=residential.plan.stairs.find(s=>s.districtId===districtId&&s.height1===-16),r=s.rect,z=(r[2]+r[3])/2;
        c.teleport(point((r[0]-1)/830,z,.2));for(let i=0;i<30;i++)c.tick(new THREE.Vector3());
        walk(c,(r[1]+1.5)/830,z);assert.ok(Math.abs(height(c)+16)<.12);assert.ok(c.grounded);
        walk(c,(r[1]+1.5)/830,22.5);assert.ok(Math.abs(height(c)+16)<.12,'residential gallery stays below');
        results.push({districtId,belowHeight:height(c)});
        walk(c,(r[1]+1.5)/830,z);walk(c,(r[0]-1)/830,z);assert.ok(Math.abs(height(c)-.15)<.12);assert.ok(c.grounded);
    }
    console.log(JSON.stringify({physicalGroundRoutes:results}));runtime.dispose();residential.dispose();farm.dispose();
});

test('idempotent disposal restores borrowed geometry/callback/material and preserves unrelated colliders',()=>{
    configureTerraces(world.terraces);const group=new THREE.Group(),{ground}=createCylinder(group),cw=new ColliderWorld(),c=new CharacterController(cw);
    const geometry=ground.geometry,material=ground.material,callback=c.groundExists,positions=Array.from(geometry.attributes.position.array),indices=Array.from(geometry.index.array);
    let geometryDisposed=0,materialDisposed=0,ownedDisposed=0;
    geometry.addEventListener('dispose',()=>geometryDisposed++);material.addEventListener('dispose',()=>materialDisposed++);
    const other=new THREE.Mesh(new THREE.BoxGeometry(1,1,1));group.add(other);cw.setObject('unrelated',other,group);
    const otherEntries=cw.colliders.get('unrelated'),runtime=createCapacityGround({ground,habitatGroup:group,plans,colliderWorld:cw,controller:c});
    ground.geometry.addEventListener('dispose',()=>ownedDisposed++);
    assert.throws(()=>createCapacityGround({ground,habitatGroup:group,plans,colliderWorld:cw,controller:c}),/already registered/);
    runtime.dispose();runtime.dispose();assert.equal(ground.geometry,geometry);assert.equal(ground.material,material);assert.equal(c.groundExists,callback);
    assert.equal(geometryDisposed,0);assert.equal(materialDisposed,0);assert.equal(ownedDisposed,1);
    assert.equal(cw.colliders.size,1);assert.equal(cw.colliders.get('unrelated'),otherEntries);
    assert.deepEqual(Array.from(geometry.attributes.position.array),positions);assert.deepEqual(Array.from(geometry.index.array),indices);
    assert.equal(hash(fs.readFileSync(file)),hash(bytes));other.geometry.dispose();other.material.dispose();
});
