import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { ColliderWorld, characterColliders } from '../src/physics/collider-world.js';
import { CharacterController, CHARACTER } from '../src/physics/character-controller.js';
import { createBlockout } from '../src/editor/blockout.js';
import { orientToSurface } from '../src/editor/placement.js';
import { configureTerraces, inTerraceSector } from '../src/terrace-surfaces.js';
import { createTerraces, terraceMeshes } from '../src/terraces.js';

const frame = new THREE.Matrix4().makeBasis(new THREE.Vector3(0,1,0), new THREE.Vector3(-1,0,0), new THREE.Vector3(0,0,1));
function box(world, id, x,y,z, w,h,d, rotation=0, scale=1) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d));
    const root = new THREE.Group(); root.position.set(830,0,0); root.quaternion.setFromRotationMatrix(frame);
    mesh.position.set(x,y,z); mesh.rotation.y=rotation; mesh.scale.setScalar(scale); root.add(mesh);
    world.setObject(id,root); return {root,mesh};
}
// Small authored fixtures retain their original motion timings; default tuning
// and high-speed collision are exercised separately below.
const controller = (world=new ColliderWorld(), options={}) => {
    const c = new CharacterController(world,{ speed: 5, jumpSpeed: 5, ...options }); c.teleport(new THREE.Vector3(830,0,0)); return c;
};
const run=(c,seconds,direction=new THREE.Vector3(),hz=120)=>{for(let i=0;i<Math.round(seconds*hz);i++)c.advance(1/hz,direction);};
const height=c=>830-Math.hypot(c.position.x,c.position.y);
const tangent=new THREE.Vector3(0,1,0);
const close=(a,b,tol=.03)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b} ± ${tol}`);

 test('default tuning moves 15m/s and jumps about twice the original height',()=>{
    const c=new CharacterController(new ColliderWorld());
    c.teleport(new THREE.Vector3(830,0,0));run(c,1,new THREE.Vector3(0,0,-1));
    close(c.position.z,-15,1e-8);
    const old=controller();let oldApex=0,newApex=0;
    old.queueJump();c.queueJump();
    for(let i=0;i<240;i++){old.advance(1/120);c.advance(1/120);oldApex=Math.max(oldApex,height(old));newApex=Math.max(newApex,height(c));}
    close(newApex/oldApex,2,.02);assert.ok(c.grounded);assert.ok(newApex>2.6&&newApex<2.7);
    console.log(JSON.stringify({tuning:{speed:c.config.speed,oldApex,newApex,eyeHeight:c.config.eyeHeight}}));
 });
 test('default high speed remains frame-independent and cannot cross a thin wall',()=>{
    const positions=[];
    for(const hz of [15,30,60,144]){
        const c=new CharacterController(new ColliderWorld());c.teleport(new THREE.Vector3(830,0,0));
        run(c,2,new THREE.Vector3(0,0,1),hz);positions.push(c.position.clone());
        const w=new ColliderWorld();box(w,'thin',2,3,0,.001,6,100);
        const blocked=new CharacterController(w);blocked.teleport(new THREE.Vector3(830,0,0));run(blocked,1,tangent,hz);
        assert.ok(blocked.position.y<1.66);assert.ok(blocked.grounded);
    }
    for(const p of positions)assert.ok(p.distanceTo(positions[0])<1e-8);
 });
 test('normal jump uses seconds, lands without input, and cannot double-jump',()=>{
    const c=controller(); c.queueJump(); let apex=0;
    for(let i=0;i<150;i++){c.advance(1/120);apex=Math.max(apex,height(c)); if(i===30)c.queueJump();}
    assert.ok(apex>1.2&&apex<1.4,`apex ${apex}`);close(height(c),0);assert.ok(c.grounded);
 });
 test('solid wall and ceiling stop the capsule; diagonal input slides along wall',()=>{
    const w=new ColliderWorld();box(w,'wall',2,3,0,.04,6,20);
    const c=controller(w);run(c,2,new THREE.Vector3(0,1,1).normalize(),15);
    assert.ok(c.position.y<1.64,JSON.stringify(c.position));assert.ok(c.position.z>6);
    box(w,'ceiling',0,2.5,0,20,.1,20);
    c.teleport(new THREE.Vector3(830,0,0));c.queueJump();let apex=0;
    for(let i=0;i<180;i++){c.advance(1/120);apex=Math.max(apex,height(c));}
    assert.ok(apex<.47,`ceiling apex ${apex}`);assert.ok(c.grounded);
 });
 test('jump onto a low roof then walk off and fall onto the lower floor',()=>{
    const w=new ColliderWorld();box(w,'roof',3,.4,0,3,.8,4);
    const c=controller(w);c.queueJump();run(c,.65,tangent);run(c,1);
    close(height(c),.8,.05);assert.ok(c.grounded);
    run(c,1,tangent);const edgeHeight=height(c);run(c,1);
    assert.ok(edgeHeight<.7);close(height(c),0,.05);assert.ok(c.grounded);
 });
 test('walking off a high terrace falls independently of movement to a lower deck',()=>{
    const w=new ColliderWorld();box(w,'upper',0,-.2,0,4,.4,6);box(w,'lower',8,-12.2,0,30,.4,10);
    const c=controller(w,{groundExists:()=>false});c.teleport(new THREE.Vector3(830,0,0));run(c,.05);
    run(c,1,tangent);assert.ok(!c.grounded);const before=height(c);run(c,2);
    assert.ok(height(c)<before-5);close(height(c),-12,.08);assert.ok(c.grounded);
 });
 test('small risers are stepped but tall walls require a jump or stair route',()=>{
    const w=new ColliderWorld();for(let i=0;i<8;i++)box(w,`step${i}`,1+i*.7,(i+1)*.15/2,0,.7,(i+1)*.15,4);
    const c=controller(w);run(c,1.1,tangent);run(c,.2);
    assert.ok(c.position.y>4.8,`stair progress ${c.position.y}`);assert.ok(height(c)>1,`stair height ${height(c)}`);
    const w2=new ColliderWorld();box(w2,'high',2,1,0,2,2,4);const c2=controller(w2);run(c2,2,tangent);
    assert.ok(c2.position.y<.7);close(height(c2),0,.05);
 });
 test('rotated scaled and elevated child geometry respects transforms, independent of visibility',()=>{
    const w=new ColliderWorld();const {root}=box(w,'transformed',3,3,0,.1,5,10,Math.PI/4,1.5);root.visible=false;w.setObject('transformed',root);
    const c=controller(w);run(c,2,tangent);
    assert.ok(c.position.y<8,`must not pass rotated wall ${c.position.y}`);
    // A scaled/elevated roof is queried at its actual transformed top.
    const w2=new ColliderWorld();box(w2,'roof',0,4,0,4,1,4,Math.PI/5,2);
    const c2=controller(w2);c2.teleport(new THREE.Vector3(822,0,0));run(c2,2);
    close(height(c2),5,.04);assert.ok(c2.grounded);
 });
 test('open proxy removal, closed door blocking, moved proxy and genuine apertures',()=>{
    const w=new ColliderWorld();box(w,'left',0,2,-2, .2,4,2);box(w,'right',0,2,2,.2,4,2);box(w,'lintel',0,3.5,0,.2,1,2);
    const c=controller(w);c.teleport(new THREE.Vector3(830,-2,0));run(c,1,tangent);assert.ok(c.position.y>2,'real mesh doorway must remain open');
    const {root}=box(w,'door',0,1.5,0,.1,3,2);
    c.teleport(new THREE.Vector3(830,-2,0));run(c,1,tangent);assert.ok(c.position.y<-.38);
    const before=w.triangleCount;assert.ok(w.remove('door'));assert.equal(w.triangleCount,before-12);
    run(c,1,tangent);assert.ok(c.position.y>3);
    root.position.y=8;w.setObject('door',root);c.teleport(new THREE.Vector3(830,6,0));run(c,1,tangent);assert.ok(c.position.y<7.62);
    w.setObject('door',root,null,{enabled:false});assert.equal(w.colliders.has('door'),false);
 });
 test('capsule stays within outer, inner and both side tube limits at multiple theta values',()=>{
    for(const theta of [0,.8,3.5,6.27])for(const [r,z] of [[900,0],[760,0],[830,75],[830,-75],[880,60]]){
        const c=controller(new ColliderWorld(),{groundExists:()=>false});
        c.teleport(new THREE.Vector3(r*Math.cos(theta),r*Math.sin(theta),z));c.capsule();
        for(const p of [c.start,c.end])assert.ok(Math.hypot(Math.hypot(p.x,p.y)-830,p.z)+c.config.radius<=65.00005,`${theta} ${r} ${z} -> ${p.toArray()}`);
    }
 });
 test('hull remains containing under radial velocity, jumps, sustained side input and long frames',()=>{
    for(const [r,z,v,dz] of [[770,0,40,0],[890,0,-40,0],[830,64,0,1],[830,-64,0,-1]]){
        const c=controller(new ColliderWorld(),{groundExists:()=>false});c.teleport(new THREE.Vector3(r,0,z));
        c.velocity.copy(c.radialUp()).multiplyScalar(v);
        for(let i=0;i<20;i++){
            c.advance(.25,new THREE.Vector3(0,0,dz));c.capsule();
            for(const p of [c.start,c.end])assert.ok(Math.hypot(Math.hypot(p.x,p.y)-830,p.z)+c.config.radius<=65.00005);
        }
    }
 });
 test('outward gravity varies radially and orientation follows the ring',()=>{
    for(const r of [790,870]){
        const c=controller(new ColliderWorld(),{groundExists:()=>false});c.teleport(new THREE.Vector3(0,r,0));c.advance(1/120);
        close(c.velocity.y,CHARACTER.gravity*r/830/120,1e-5);close(c.velocity.x,0,1e-5);
    }
 });
 test('30/60/144Hz and irregular deltas agree; long frames clamp and do not tunnel',()=>{
    const results=[];
    for(const hz of [30,60,144]){const c=controller();run(c,2,tangent,hz);results.push(c.position.clone());assert.equal(c.steps,240);}
    for(const p of results)assert.ok(p.distanceTo(results[0])<1e-8);
    const c=controller();for(let i=0;i<40;i++){c.advance(.007,tangent);c.advance(.043,tangent);}assert.ok(c.position.distanceTo(results[0])<1e-8);
    const w=new ColliderWorld();box(w,'thin',.8,3,0,.001,6,10);const slow=controller(w);assert.equal(slow.advance(10,tangent),30);assert.ok(slow.position.y<.46);
    const fall=controller(w,{groundExists:()=>false});box(w,'floor',0,-48.2,0,20,.4,10);fall.teleport(new THREE.Vector3(818,0,0));
    for(let i=0;i<24;i++)fall.advance(.25);close(height(fall),-48,.1);assert.ok(fall.grounded);
 });
 test('live 387-placement world builds a bounded hash and avoids ground scanning',()=>{
    const saved=JSON.parse(fs.readFileSync(new URL('../world.json',import.meta.url)));
    const serialized=JSON.stringify(saved);configureTerraces(saved.terraces);
    const habitat=new THREE.Group();createTerraces(habitat);
    const start=performance.now();
    for(const data of saved.assets){
        const [id,type,theta,z,scale,rotation,spec,surface]=data;
        assert.ok(spec,`fixture unexpectedly requires model ${type}`);
        const object=createBlockout(spec);orientToSurface(object,theta,z,surface?.height??spec.elevation??0);object.rotateY(rotation||0);object.scale.setScalar(scale||4);habitat.add(object);
        characterColliders.setObject(id,object,habitat);
    }
    const buildMs=performance.now()-start;
    assert.equal(saved.assets.length,387);assert.equal(JSON.stringify(saved),serialized);
    assert.equal(characterColliders.colliders.size,387+terraceMeshes.length);
    const c=controller(characterColliders,{groundExists:theta=>!inTerraceSector(theta),speed:CHARACTER.speed,jumpSpeed:CHARACTER.jumpSpeed});
    const timings=[];let sum=0,max=0;const beforeQueries=characterColliders.stats.queries,beforeCandidates=characterColliders.stats.candidates;
    for(let i=0;i<1200;i++){
        const theta=i/1200*Math.PI*2, r=830+(i%3===0?48:0),z=i%2?0:24;
        c.teleport(new THREE.Vector3(r*Math.cos(theta),r*Math.sin(theta),z));
        const t=performance.now();c.advance(1/60,new THREE.Vector3(-Math.sin(theta),Math.cos(theta),0));
        const ms=performance.now()-t;timings.push(ms);sum+=ms;max=Math.max(max,ms);
    }
    timings.sort((a,b)=>a-b);
    const queries=characterColliders.stats.queries-beforeQueries;
    const avgCandidates=(characterColliders.stats.candidates-beforeCandidates)/queries;
    console.log(JSON.stringify({livePhysics:{placements:387,terraceMeshes:terraceMeshes.length,triangles:characterColliders.triangleCount,cells:characterColliders.cells.size,buildMs,queries,avgCandidates,maxCandidates:characterColliders.stats.maxCandidates,meanMs:sum/1200,p95Ms:timings[1140],maxMs:max}}));
    assert.ok(avgCandidates<characterColliders.triangleCount*.02,`broadphase ${avgCandidates}`);
    assert.ok(timings[1140]<10,`p95 ${timings[1140]}ms`);assert.ok(buildMs<5000);
    // Ascend the real rendered 15m / 100-riser farm staircase, not a ramp proxy.
    const stair=saved.terraces.stairs[0],theta=stair.end+.002;
    const climber=controller(characterColliders,{groundExists:t=>!inTerraceSector(t),speed:CHARACTER.speed});
    climber.teleport(new THREE.Vector3(840*Math.cos(theta),840*Math.sin(theta),50));
    for(let i=0;i<850;i++){
        const a=Math.atan2(climber.position.y,climber.position.x);
        if(a<stair.start-.001)break; // Stop on the upper landing, not beyond its next edge.
        climber.advance(1/120,new THREE.Vector3(Math.sin(a),-Math.cos(a),0));
    }
    run(climber,2);
    close(height(climber),5,.03);assert.ok(climber.grounded);
    assert.ok(Math.atan2(climber.position.y,climber.position.x)<stair.start);
 });
