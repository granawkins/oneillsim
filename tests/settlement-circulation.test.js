import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { buildCirculation, createSettlementCirculation, circulationPoint, circulationRibbon, sampleCirculationRoute, validateCirculationRoute, circulationReservations, normalizeCirculationRoute } from '../src/settlement-circulation.js';
import { characterColliders } from '../src/physics/collider-world.js';
import { CharacterController, CHARACTER } from '../src/physics/character-controller.js';
import { configureTerraces, inTerraceSector, getTerraces } from '../src/terrace-surfaces.js';
import { createTerraces, terraceMeshes } from '../src/terraces.js';
import { createBlockout } from '../src/editor/blockout.js';
import { buildNeighborhoods } from '../src/settlement-neighborhoods.js';
import { buildResidentialA } from '../src/settlement-residential-a.js';
import { buildFarms } from '../src/settlement-farms.js';
const source=fs.readFileSync(new URL('../assets/settlement-source-world.json',import.meta.url));
const world=JSON.parse(source),original=JSON.stringify(world),plan=buildCirculation(world);

function loadScene(input=world) {
    const group=new THREE.Group();configureTerraces(input.terraces);createTerraces(group);
    const loader=new OBJLoader(),templates=new Map(),ids=[];
    for(const a of input.assets) {
        const [id,typeIndex,theta,z,scale,rotation,spec,surface]=Array.isArray(a)?a:[a.id,input.assetTypes.indexOf(a.type),a.theta,a.z,a.scale,a.rotation,a.spec || a.blockout,a.surface];
        if(surface?.worldTransform)continue;
        let model;
        if(spec)model=createBlockout(spec);
        else {
            const type=Array.isArray(a)?input.assetTypes[typeIndex]:a.type;
            if(!templates.has(type)) {
                const path=['ultimate-buildings','ultimate-nature'].map(d=>new URL(`../assets/${d}/${type}.obj`,import.meta.url)).find(p=>fs.existsSync(p));
                assert.ok(path,`Missing actual OBJ ${type}`);
                templates.set(type,loader.parse(fs.readFileSync(path,'utf8')));
            }
            model=templates.get(type).clone();model.scale.setScalar(scale);
        }
        const up=new THREE.Vector3(-Math.cos(theta),-Math.sin(theta),0),forward=new THREE.Vector3(0,0,1),right=new THREE.Vector3().crossVectors(up,forward),h=surface?.height || 0;
        model.position.set((830-h)*Math.cos(theta),(830-h)*Math.sin(theta),z);
        model.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right,up,forward));model.rotateY(rotation || 0);group.add(model);
        model.userData.surface=surface;characterColliders.setObject(id,model,group);ids.push(id);
    }
    return {group,ids,dispose(){ids.forEach(id=>characterColliders.remove(id));terraceMeshes.splice(0).forEach(m=>{characterColliders.remove(m);m.geometry.dispose();m.material.dispose();});}};
}
function walk(points,{startIndex=0,endIndex=points.length-1,controller=null}={}) {
    const c=controller || new CharacterController(characterColliders,{groundExists:(theta)=>!inTerraceSector(theta)});
    if(!controller)c.teleport(circulationPoint(points[startIndex]).addScaledVector(new THREE.Vector3(-Math.cos(points[startIndex][0]),-Math.sin(points[startIndex][0]),0),.03));
    for(let j=0;j<45;j++)c.tick(new THREE.Vector3());
    let maxHeightError=0,maxAir=0,air=0,ticks=0,airAt=null;
    for(let i=startIndex+1;i<=endIndex;i++) {
        const target=circulationPoint(points[i]);let remaining=target.distanceTo(c.position),limit=Math.ceil(remaining/CHARACTER.speed*120)*3+120;
        while(remaining>.20&&limit-->0) {
            const direction=target.clone().sub(c.position);direction.addScaledVector(c.radialUp(),-direction.dot(c.up));if(direction.lengthSq()>0)direction.normalize();
            c.tick(direction);ticks++;remaining=target.distanceTo(c.position);air=c.grounded?0:air+1;if(air>maxAir){maxAir=air;airAt={target:points[i],position:c.position.toArray(),height:830-Math.hypot(c.position.x,c.position.y)};}
            // Compare only radial support after attaining each sample, not target
            // height while approaching a slope (that is not a support error).
        }
        assert.ok(remaining<=.20,`stalled at ${JSON.stringify(points[i])}; actual ${JSON.stringify(c.position.toArray())}, remaining ${remaining}`);
        maxHeightError=Math.max(maxHeightError,Math.abs(830-Math.hypot(c.position.x,c.position.y)-points[i][2]));
    }
    for(let j=0;j<45;j++)c.tick(new THREE.Vector3());
    assert.equal(c.grounded,true,'arrival is not grounded');assert.equal(c.clear(),true,'arrival capsule intersects');
    assert.ok(maxHeightError<.20,`radial support error ${maxHeightError}`);
    assert.ok(maxAir<20,`ballistic or unsupported crossing ${maxAir} ticks ${JSON.stringify(airAt)}`);
    return {ticks,maxHeightError,maxAir,height:830-Math.hypot(c.position.x,c.position.y),z:c.position.z};
}

test('immutable authored plan connects six sectors and all A levels without changing support data',()=>{
    assert.equal(crypto.createHash('sha256').update(source).digest('hex'),'98b71f7a70b06603dc080287c3025ca95242be1f64c5f4f463837b7020fb2591');
    assert.equal(world.assets.length,482);assert.deepEqual(buildCirculation(world),plan);assert.equal(JSON.stringify(world),original);
    assert.equal(plan.summary.mainPromenadeConnected,true,JSON.stringify(plan.diagnostics));assert.equal(plan.summary.residentialAConnected,true,JSON.stringify(plan.diagnostics));
    const main=plan.routes.find(r=>r.kind==='main-promenade');assert.deepEqual(main.points[0],[0,0,0]);assert.deepEqual(main.points.at(-1),[Math.PI*2,0,0]);
    assert.equal(plan.routes.filter(r=>r.kind==='lateral-bridge').length,4);
    assert.equal(plan.routes.filter(r=>r.kind==='stair-mouth-link').length,5,JSON.stringify(plan.diagnostics));
    for(const r of plan.routes)assert.deepEqual(validateCirculationRoute(r,world),[],r.id);
});

test('ribbons share banked corners, fit actual tube and reject fake short 48m ramps and occupied routes',()=>{
    for(const r of plan.routes) {
        const {samples,edges}=circulationRibbon(r);assert.equal(samples.length,edges.length);
        for(const pair of edges)for(const p of pair)assert.ok(Math.hypot(p[2]-.24,p[1])<65,`${r.id} hull breach`);
    }
    assert.match(validateCirculationRoute({id:'fake',width:4,points:[[.1,0,0],[.11,0,-48]]},world).join(','),/grade/);
    assert.match(validateCirculationRoute({id:'outside',width:4,points:[[3,64,0],[3.1,64,0]]},world).join(','),/tube/);
    assert.match(validateCirculationRoute({id:'occupied',width:4,points:[[.06,24,-48],[.07,24,-48]]},world).join(','),/occupied/);
    assert.ok(circulationReservations(world).filter(r=>r.unknown).length===0);
});

function proveControllerJourneys(testWorld=world,additionalRoutes=[]) {
    const scene=loadScene(testWorld),before=getTerraces(),beforeIds=[...characterColliders.colliders.keys()],runtime=createSettlementCirculation(scene.group,testWorld,additionalRoutes);
    try {
        for(const mesh of runtime.meshes) {
            const p=mesh.geometry.attributes.position;
            for(let i=0;i<p.count;i++)assert.ok(Math.hypot(Math.hypot(p.getX(i),p.getY(i))-830,p.getZ(i))<=65,`${mesh.name} actual vertex outside tube`);
        }
        assert.equal(getTerraces(),before);assert.ok(beforeIds.every(id=>characterColliders.colliders.has(id)));if(!additionalRoutes.length)assert.equal(runtime.plan.diagnostics.filter(d=>d.status==='rejected').length,0,JSON.stringify(runtime.plan.diagnostics));
        if(additionalRoutes.length) {
            assert.ok(runtime.stats.meshes<=40,JSON.stringify(runtime.stats));assert.ok(runtime.stats.triangles<125000);
            assert.equal(runtime.plan.routes.length+runtime.stats.rejectedRoutes,13+additionalRoutes.length);
            for(const r of additionalRoutes.filter(r=>r.entryFor))assert.ok(runtime.plan.routes.some(p=>p.id===r.id),`Lost actual door apron ${r.id}`);
            for(const r of runtime.plan.routes)assert.deepEqual(validateCirculationRoute(r,testWorld),[],r.id);
        }
        const results=[];
        for(const r of runtime.plan.routes) {
            const points=sampleCirculationRoute(r,2);
            try{results.push({id:r.id,forward:walk(points),reverse:walk([...points].reverse())});}catch(error){console.error('FAILED ROUTE',r.id,JSON.stringify([r.points[0],r.points.at(-1)]));error.message=`${r.id}: ${error.message}`;throw error;}
        }
        const ramp=runtime.plan.routes.find(r=>r.kind==='garden-ramp'),journey=[[ramp.points[0][0],0,0],...ramp.points.slice(0,5)];
        for(const branch of runtime.plan.routes.filter(r=>r.kind==='lateral-bridge'&&r.deckId==='residential-a-outer'))journey.push(...branch.points.slice(1),...branch.points.slice(0,-1).reverse());
        journey.push(ramp.points[5]);
        for(const branch of runtime.plan.routes.filter(r=>r.kind==='lateral-bridge'&&r.deckId==='residential-a-middle'))journey.push(...branch.points.slice(1),...branch.points.slice(0,-1).reverse());
        journey.push(ramp.points.at(-1));
        results.push({id:'continuous-main-A-outer-middle-basin-no-teleports',forward:walk(sampleCirculationRoute({points:journey},2)),reverse:walk(sampleCirculationRoute({points:[...journey].reverse()},2))});
        // Walk all existing flights too: transitions into our mouths cannot be
        // proven by checking an invented proxy ramp instead of real stair meshes.
        for(const s of testWorld.terraces.stairs) {
            const upper=testWorld.terraces.decks.find(d=>d.id===s.upper),lower=testWorld.terraces.decks.find(d=>d.id===s.lower),flight=[];
            // Real steps are NOT the analytic placement ramp. Drive horizontal
            // input continuously over the entire flight, then verify its landing.
            for(const reverse of [false,true]) {
                const begin=reverse?[s.end+1/830,s.z,lower.height]:[s.start-1/830,s.z,upper.height];
                const end=reverse?s.start-1/830:s.end+1/830,expected=reverse?upper.height:lower.height;
                const c=new CharacterController(characterColliders,{groundExists:theta=>!inTerraceSector(theta)});c.teleport(circulationPoint(begin));
                for(let i=0;i<45;i++)c.tick(new THREE.Vector3());
                let ticks=0;
                while(ticks<1200) {
                    const theta=Math.atan2(c.position.y,c.position.x);
                    if(reverse?theta<=end:theta>=end)break;
                    c.tick(new THREE.Vector3(-Math.sin(theta),Math.cos(theta),0).multiplyScalar(reverse?-1:1));ticks++;
                }
                for(let i=0;i<80;i++)c.tick(new THREE.Vector3());
                assert.ok(ticks<1200,`${s.id} flight stalled`);assert.ok(Math.abs(830-Math.hypot(c.position.x,c.position.y)-expected)<.08,`${s.id} wrong real landing`);
                assert.equal(c.grounded,true,s.id);assert.equal(c.clear(),true,s.id);flight.push({reverse,ticks,height:830-Math.hypot(c.position.x,c.position.y)});
            }
            results.push({id:s.id,flight});
        }
        const entry=runtime.plan.routes.find(r=>r.id.endsWith('entry-north')),chain=new CharacterController(characterColliders,{groundExists:theta=>!inTerraceSector(theta)});
        chain.teleport(circulationPoint(entry.points[0]));
        const chainResults=[walk(sampleCirculationRoute(entry,2),{controller:chain})];
        for(const [index,s] of testWorld.terraces.stairs.entries()) {
            const lower=testWorld.terraces.decks.find(d=>d.id===s.lower);let ticks=0;
            while(Math.atan2(chain.position.y,chain.position.x)<s.end+1/830&&ticks<1200) {
                const t=Math.atan2(chain.position.y,chain.position.x);chain.tick(new THREE.Vector3(-Math.sin(t),Math.cos(t),0));ticks++;
            }
            for(let i=0;i<80;i++)chain.tick(new THREE.Vector3());
            assert.ok(ticks<1200,`${s.id} continuous chain stalled`);assert.equal(chain.grounded,true);assert.equal(chain.clear(),true);
            assert.ok(Math.abs(830-Math.hypot(chain.position.x,chain.position.y)-lower.height)<.08,`${s.id} continuous chain wrong landing`);
            chainResults.push({stair:s.id,height:830-Math.hypot(chain.position.x,chain.position.y)});
            const transfer=runtime.plan.routes.find(r=>r.id.endsWith(`stair-transfer-${index}`));
            if(transfer)chainResults.push(walk(sampleCirculationRoute(transfer,2),{controller:chain}));
        }
        results.push({id:'continuous-main-farm-A-all-seven-decks-no-teleports',stages:chainResults});
        const reverseChain=[];
        for(let i=testWorld.terraces.stairs.length-1;i>=0;i--) {
            const s=testWorld.terraces.stairs[i],upper=testWorld.terraces.decks.find(d=>d.id===s.upper);let ticks=0;
            while(Math.atan2(chain.position.y,chain.position.x)>s.start-1/830&&ticks<1200){const t=Math.atan2(chain.position.y,chain.position.x);chain.tick(new THREE.Vector3(Math.sin(t),-Math.cos(t),0));ticks++;}
            for(let j=0;j<80;j++)chain.tick(new THREE.Vector3());
            assert.ok(ticks<1200,`${s.id} continuous reverse chain stalled`);assert.equal(chain.grounded,true);assert.equal(chain.clear(),true);
            assert.ok(Math.abs(830-Math.hypot(chain.position.x,chain.position.y)-upper.height)<.08,`${s.id} continuous reverse wrong landing`);
            reverseChain.push({stair:s.id,height:upper.height});
            const transfer=runtime.plan.routes.find(r=>r.id.endsWith(`stair-transfer-${i-1}`));
            if(transfer)reverseChain.push(walk([...sampleCirculationRoute(transfer,2)].reverse(),{controller:chain}));
        }
        reverseChain.push(walk([...sampleCirculationRoute(entry,2)].reverse(),{controller:chain}));
        results.push({id:'continuous-farm-A-seven-decks-back-to-main-no-teleports',stages:reverseChain});
        console.log(JSON.stringify({circulation:runtime.stats,combined:additionalRoutes.length>0,traversalCount:results.length,traversals:additionalRoutes.length?{routeJourneys:results.filter(r=>r.forward).length,maximumAir:Math.max(...results.filter(r=>r.forward).flatMap(r=>[r.forward.maxAir,r.reverse.maxAir])),maximumHeightError:Math.max(...results.filter(r=>r.forward).flatMap(r=>[r.forward.maxHeightError,r.reverse.maxHeightError])),realStairFlights:results.filter(r=>r.flight).length,continuousJourneys:results.filter(r=>r.id.startsWith('continuous-')).map(r=>r.id)}:results,diagnostics:runtime.plan.diagnostics.filter(d=>d.status==='rejected')}));
    } finally {runtime.dispose();runtime.dispose();assert.ok(runtime.stats.colliderIds.every(id=>!characterColliders.colliders.has(id)));scene.dispose();}
}

test('real triangle support, full baseline OBJ/blockout colliders and speed-15 controller cross the whole ring and multi-level links',()=>proveControllerJourneys());

test('additional worker streets are clipped at same-level junctions and reject invalid plans with explicit diagnostics',()=>{
    const group=new THREE.Group(),w={assets:[],assetTypes:[],terraces:{decks:[],stairs:[]}};
    const runtime=createSettlementCirculation(group,w,[{id:'crossing',width:4,deckId:'park',points:[[3,0,0],[3,20,0]]},{id:'impossible',width:4,points:[[2,0,0],[2.001,0,-48]]}]);
    try {
        const origin=circulationPoint([3.001,1.234,5]),direction=new THREE.Vector3(Math.cos(3.001),Math.sin(3.001),0),ray=new THREE.Raycaster(origin,direction,0,10);
        group.updateMatrixWorld(true);
        const hits=ray.intersectObjects(runtime.meshes.filter(m=>m.userData.kind==='surface'),false);
        assert.equal(hits.length,1,'same-level junction is double-covered or unsupported');
        assert.ok(runtime.plan.reservations.some(r=>r.routeId==='crossing'&&r.noVegetation));
        assert.ok(runtime.plan.routes.some(r=>r.id==='crossing'));assert.ok(runtime.plan.diagnostics.some(d=>d.routeId==='impossible'));assert.ok(runtime.stats.triangles>0);assert.equal(runtime.group.parent,group);}finally{runtime.dispose();}
});

function combinedFixture() {
    const parts=[buildNeighborhoods(world),buildResidentialA(world),buildFarms(world)];
    const replacements=new Map(parts.flatMap(p=>p.replacements || []).map(a=>[a.id,a]));
    return {world:{...world,assets:[...world.assets.map(a=>replacements.get(a[0]) || a),...parts.flatMap(p=>p.additions)]},routes:parts.flatMap(p=>p.routes),parts};
}

test('combined immutable 698/329/64 layouts and 78 farm appearances retain controller journeys and door aprons',()=>{
    const fixture=combinedFixture();
    assert.deepEqual(fixture.parts.map(p=>p.additions.length),[698,329,64]);
    assert.equal(fixture.world.assets.length,1573);assert.equal(fixture.routes.length,783);
    assert.equal(circulationReservations(fixture.world).filter(r=>r.unknown).length,0);
    const preserved=world.assets.filter(a=>!fixture.parts[2].replacements.some(r=>r.id===a[0]));
    assert.ok(preserved.every(a=>fixture.world.assets.includes(a)), 'legacy samples/exterior moved');
    proveControllerJourneys(fixture.world,fixture.routes);
    assert.equal(JSON.stringify(world),original);
});

test('actual new OBJ vertices fit reservations in the exact THREE placement frame, not swapped axes',()=>{
    const {world:w,parts}=combinedFixture(),reservations=circulationReservations(w),cache=new Map();let vertices=0;
    for(const a of parts.slice(0,2).flatMap(p=>p.additions)) {
        if(!cache.has(a.type)) {
            const path=['ultimate-buildings','ultimate-nature'].map(d=>new URL(`../assets/${d}/${a.type}.obj`,import.meta.url)).find(p=>fs.existsSync(p));
            assert.ok(path,a.type);
            cache.set(a.type,fs.readFileSync(path,'utf8').split(/\r?\n/).filter(s=>s.startsWith('v ')).map(s=>new THREE.Vector3(...s.trim().split(/\s+/).slice(1,4).map(Number))));
        }
        const up=new THREE.Vector3(-Math.cos(a.theta),-Math.sin(a.theta),0),forward=new THREE.Vector3(0,0,1),right=new THREE.Vector3().crossVectors(up,forward);
        const model=new THREE.Object3D();model.position.copy(circulationPoint([a.theta,a.z,a.surface.height]));model.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right,up,forward));model.rotateY(a.rotation);model.scale.setScalar(a.scale);model.updateMatrixWorld();
        const b=reservations.find(v=>v.id===a.id);
        for(const raw of cache.get(a.type)) {
            const p=raw.clone().applyMatrix4(model.matrixWorld),t=Math.atan2(p.y,p.x),x=(((t-a.theta+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI)*(830-b.height),h=830-Math.hypot(p.x,p.y);
            assert.ok(x>=b.x[0]-.015&&x<=b.x[1]+.015&&p.z>=b.zBounds[0]-.015&&p.z<=b.zBounds[1]+.015&&h>=b.h[0]-.015&&h<=b.h[1]+.015,`${a.id} actual OBJ escaped reservation: ${[x,p.z,h]}`);vertices++;
        }
    }
    assert.ok(vertices>10000);console.log(JSON.stringify({actualOBJReservationVertices:vertices,templates:cache.size}));
});

test('general worker schemas normalize without changing kind, dimensions or input',()=>{
    const input={id:'object-points',kind:'pedestrian',widthMeters:2,height:0,points:[{theta:3,z:0},{theta:3,z:12}]},snapshot=JSON.stringify(input),r=normalizeCirculationRoute(input);
    assert.equal(r.kind,'pedestrian');assert.equal(r.width,2);assert.deepEqual(r.points,[[3,0,0],[3,12,0]]);assert.equal(JSON.stringify(input),snapshot);
    const empty={assets:[],terraces:{decks:[],stairs:[]}};
    assert.deepEqual(validateCirculationRoute(r,empty),[]);
    assert.deepEqual(validateCirculationRoute(normalizeCirculationRoute({...input,points:[null,null]}),empty),['invalid route schema']);
    assert.deepEqual(validateCirculationRoute({...r,widthProfile:[[3,2],[2,4]]},empty),['invalid width profile']);
});

test('hundreds of identical routes share top, underside and bounded draw calls, while different deck elevations remain separate',()=>{
    const group=new THREE.Group(),w={assets:[],terraces:{decks:[],stairs:[]}},routes=Array.from({length:200},(_,i)=>({id:`parallel-${i}`,deckId:'ground',width:2,points:[[3,0,0],[3,20,0]]}));
    routes.push({id:'upper-crossing',deckId:'bridge',width:2,points:[[3,0,5],[3,20,5]]});
    const runtime=createSettlementCirculation(group,w,routes);
    try {
        assert.equal(runtime.plan.routes.length,202);assert.ok(runtime.stats.meshes<12);assert.ok(runtime.stats.triangles<20000);
        group.updateMatrixWorld(true);
        const origin=circulationPoint([3,12,10]),ray=new THREE.Raycaster(origin,new THREE.Vector3(Math.cos(3),Math.sin(3),0),0,12);
        const hits=ray.intersectObjects(runtime.meshes.filter(m=>m.userData.kind==='surface'),false);
        assert.equal(hits.length,2,'duplicate or merged decks');
        assert.ok(runtime.meshes.every(m=>Array.isArray(m.userData.routeIds)));
    }finally{runtime.dispose();}
});
