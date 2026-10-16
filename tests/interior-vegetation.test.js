import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {OBJLoader} from 'three/addons/loaders/OBJLoader.js';
import {createInteriorPlan} from '../src/interior-plan.js';
import {landscapeHeight,landscapePathZ,landscapeGeometry} from '../src/interior-landscape.js';
import {createInteriorVegetation,generateInteriorVegetation,vegetationReservation} from '../src/interior-vegetation.js';
import {createVegetationPrototypes,VEGETATION_KINDS} from '../src/interior-vegetation-prototypes.js';
import {ColliderWorld} from '../src/physics/collider-world.js';
import {CharacterController} from '../src/physics/character-controller.js';

const world=JSON.parse(fs.readFileSync(new URL('../world.json',import.meta.url))),plan=createInteriorPlan(),R=830;
const point=(theta,z,h)=>new THREE.Vector3((R-h)*Math.cos(theta),(R-h)*Math.sin(theta),z);
const polar=p=>({theta:(Math.atan2(p.y,p.x)+Math.PI*2)%(Math.PI*2),z:p.z,height:R-Math.hypot(p.x,p.y)});
function floorFixture(cw,habitat) {
  const meshes=[];
  for(const h of plan.hills)for(const path of [false,true]){const mesh=new THREE.Mesh(landscapeGeometry(h,{path}));mesh.name='fixture-'+h.id+'-'+path;habitat.add(mesh);cw.setObject(mesh.name,mesh,habitat);meshes.push(mesh);}
  return ()=>{for(const mesh of meshes){cw.remove(mesh.name);mesh.removeFromParent();mesh.geometry.dispose();mesh.material.dispose();}};
}
function savedTreeFixture(cw,habitat) {
  const loader=new OBJLoader(),cache=new Map(),ids=[];
  for(const a of world.assets.filter(a=>a[0].includes('-hill-')&&a[0].includes('-grove-'))) {
    const name=world.assetTypes[a[1]];
    if(!cache.has(name))cache.set(name,loader.parse(fs.readFileSync(new URL('../assets/ultimate-nature/'+name+'.obj',import.meta.url),'utf8')));
    const tree=cache.get(name).clone();tree.scale.setScalar(a[4]);tree.position.copy(point(a[2],a[3],a[7].height+.05));
    const c=Math.cos(a[2]),s=Math.sin(a[2]);tree.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(-s,c,0),new THREE.Vector3(-c,-s,0),new THREE.Vector3(0,0,1)));tree.rotateY(a[5]||0);
    habitat.add(tree);cw.setObject(a[0],tree,habitat);tree.removeFromParent();ids.push(a[0]);
  }
  return {count:ids.length,dispose(){for(const id of ids)cw.remove(id);for(const root of cache.values())root.traverse(o=>{o.geometry?.dispose();if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();});}};
}

test('deterministic clustered planting preserves inputs, authored trees, meadows, routes and actual ground',()=>{
  const before=JSON.stringify(world),planBefore=JSON.stringify(plan),a=generateInteriorVegetation({plan,world}),b=generateInteriorVegetation({plan,world});
  assert.deepEqual(a,b);assert.deepEqual(a,generateInteriorVegetation({plan:{...plan,hills:[...plan.hills].reverse()},world}));
  assert.notDeepEqual(a,generateInteriorVegetation({plan,world,seed:'alternate-seed'}));
  assert.equal(JSON.stringify(world),before);assert.equal(JSON.stringify(plan),planBefore);
  assert.equal(world.assets.length,1292,'fixture changed: reassess saved tree reservations rather than silently changing this gate');
  assert.equal(a.length,3802);assert.equal(a.filter(p=>p.blocking).length,145);
  assert.equal(new Set(a.map(p=>p.id)).size,a.length);
  assert.deepEqual([...new Set(a.map(p=>p.kind))].sort(),Object.keys(VEGETATION_KINDS).sort());
  for(const h of plan.hills) {
    const plants=a.filter(p=>p.hillId===h.id);assert.ok(plants.length>220,'underplanted park '+h.id);assert.ok(plants.some(p=>p.blocking));
    for(const p of plants) {
      assert.equal(vegetationReservation(plan,h,p.x,p.z,p.radius),null);
      assert.equal(p.height,landscapeHeight(h,p.x,p.z));assert.equal(p.theta,h.theta+p.x/R);
      assert.ok(Math.abs(p.x)>3+p.radius,'transverse vista blocked');
      assert.ok(Math.abs(p.z-landscapePathZ(h,p.x))>2.5+p.radius,'summit ribbon blocked');
      assert.ok(Math.hypot(p.height+VEGETATION_KINDS[p.kind].height*p.scale,Math.abs(p.z)+p.radius)<65,'tube penetration');
      for(const b of plan.buildings.filter(b=>b.base>=0))assert.ok(Math.abs((p.theta-b.theta)*R)>=b.width/2+4+p.radius||Math.abs(p.z-b.z)>=b.depth/2+4+p.radius,'building/stair conflict');
      for(const s of world.assets.filter(s=>s[0].includes(h.id+'-grove-')))assert.ok(Math.hypot((s[2]-p.theta)*R,s[3]-p.z)>=s[4]*.5+(p.blocking?1.3:.45),'existing tree root conflict');
    }
    for(const x of [-h.width*.15,0,h.width*.15])assert.equal(vegetationReservation(plan,h,x,h.z+(h.groveStyle===1?-1:1)*9,0),Math.abs(x)<3?'transverse-vista':'open-meadow');
  }
});

test('seven genuine prototype geometries have grounded feet, bounded silhouettes and finite attributes',()=>{
  const prototypes=createVegetationPrototypes(),signatures=[];
  for(const [kind,{geometry,spec,triangles}] of Object.entries(prototypes)) {
    const p=geometry.attributes.position;assert.ok(triangles<650);assert.equal(p.count/3,triangles);assert.ok(geometry.boundingBox.min.y>=-.004&&geometry.boundingBox.min.y<=1e-6,kind+' ungrounded');
    for(let i=0;i<p.count;i++) {assert.ok(Number.isFinite(p.getX(i)+p.getY(i)+p.getZ(i)));assert.ok(Math.hypot(p.getX(i),p.getZ(i))<=spec.radius+.025,kind+' radius reservation too small');assert.ok(p.getY(i)<=spec.height+.025,kind+' height reservation too small');}
    signatures.push(Buffer.from(p.array.buffer).toString('base64'));geometry.dispose();
  }
  assert.equal(new Set(signatures).size,7,'recoloured clones are not variants');
});

test('spatially culled instancing measures geometry/draw budget, safe registration and complete idempotent disposal',()=>{
  const habitat=new THREE.Group(),interior=new THREE.Group();interior.name='inhabited-garden';habitat.add(interior);habitat.rotation.z=.73;
  const cw=new ColliderWorld(),runtime=createInteriorVegetation({habitatGroup:habitat,colliderWorld:cw,plan,world});
  assert.equal(runtime.group.parent,interior);assert.equal(runtime.group.userData.capacityInterior,true);
  const meshes=runtime.group.children;assert.equal(meshes.length,runtime.stats.renderBatches);
  let triangles=0,instances=0,draws=0,disposedMeshes=0,disposedGeometry=0,disposedMaterials=0;
  const geometries=new Set(),materials=new Set();
  for(const mesh of meshes) {
    assert.ok(mesh.isInstancedMesh&&mesh.frustumCulled);assert.ok(!mesh.geometry.groups.length);assert.ok(mesh.boundingSphere.radius<90,'whole-ring batch defeats culling');
    draws++;triangles+=mesh.count*mesh.geometry.attributes.position.count/3;instances+=mesh.count;geometries.add(mesh.geometry);materials.add(mesh.material);mesh.addEventListener('dispose',()=>disposedMeshes++);
    const m=new THREE.Matrix4(),v=new THREE.Vector3();mesh.getMatrixAt(0,m);v.setFromMatrixPosition(m);const p=runtime.placements.find(p=>mesh.name===p.hillId+':'+p.kind);assert.ok(v.distanceTo(point(p.theta,p.z,p.height))<.0001,'tangent/drop transform');
  }
  for(const g of geometries)g.addEventListener('dispose',()=>disposedGeometry++);
  for(const m of materials)m.addEventListener('dispose',()=>disposedMaterials++);
  assert.equal(triangles,runtime.stats.triangles);assert.equal(draws,runtime.stats.drawCallsUpperBound);assert.equal(instances,runtime.stats.plants);
  assert.ok(draws<=84);assert.ok(triangles<750000);assert.equal(materials.size,1);
  assert.equal(cw.colliders.size,runtime.stats.trees);assert.equal(cw.triangleCount,runtime.stats.collisionTriangles);
  assert.equal(cw.triangleCount,runtime.stats.trees*24);
  assert.throws(()=>createInteriorVegetation({habitatGroup:habitat,colliderWorld:cw,plan,world}),/already registered/);
  interior.visible=false;assert.ok(cw.triangleCount>0,'render culling removed physics');interior.visible=true;
  console.log(JSON.stringify({vegetation:runtime.stats,uninstancedSameGeometryDrawCalls:instances,fullVisibleInstanceDrawCalls:draws}));
  runtime.dispose();runtime.dispose();assert.equal(cw.colliders.size,0);assert.equal(cw.triangleCount,0);assert.equal(cw.cells.size,0);assert.equal(runtime.group.parent,null);
  assert.equal(disposedMeshes,draws);assert.equal(disposedGeometry,7);assert.equal(disposedMaterials,1);
  const second=createInteriorVegetation({habitatGroup:habitat,colliderWorld:cw,plan,world});second.dispose();
});

test('registration errors do not replace unrelated colliders or leave a partial planting',()=>{
  const habitat=new THREE.Group(),cw=new ColliderWorld();
  assert.throws(()=>createInteriorVegetation({habitatGroup:habitat,plan,world}),/requires colliderWorld/);
  const p=generateInteriorVegetation({plan,world}).find(p=>p.blocking),sentinel=[];cw.colliders.set(p.id,sentinel);
  assert.throws(()=>createInteriorVegetation({habitatGroup:habitat,colliderWorld:cw,plan,world}),/Existing collider ID/);
  assert.equal(cw.colliders.get(p.id),sentinel);assert.equal(habitat.children.length,0);cw.remove(p.id);
  const realSet=cw.setObject.bind(cw);let calls=0;
  cw.setObject=(...args)=>{if(++calls===3)throw new Error('injected registration failure');return realSet(...args);};
  assert.throws(()=>createInteriorVegetation({habitatGroup:habitat,colliderWorld:cw,plan,world}),/injected registration failure/);
  assert.equal(cw.colliders.size,0);assert.equal(cw.triangleCount,0);assert.equal(cw.cells.size,0);assert.equal(habitat.children.length,0);
  cw.setObject=realSet;const runtime=createInteriorVegetation({habitatGroup:habitat,colliderWorld:cw,plan,world});runtime.dispose();
});

test('actual character capsule is blocked by all three trunk types; low plants have no collider',()=>{
  const habitat=new THREE.Group(),cw=new ColliderWorld(),disposeFloor=floorFixture(cw,habitat);
  const runtime=createInteriorVegetation({habitatGroup:habitat,colliderWorld:cw,plan,world}),controller=new CharacterController(cw),results=[];
  for(const kind of ['fruit','birch','cedar']) {
    const p=runtime.placements.find(p=>p.kind===kind&&p.height<.7),h=plan.hills.find(h=>h.id===p.hillId),startZ=p.z-2;
    controller.teleport(point(p.theta,startZ,landscapeHeight(h,p.x,startZ)+.04));for(let i=0;i<80;i++)controller.advance(1/120);
    assert.ok(controller.grounded);
    for(let i=0;i<100;i++) {
      const q=polar(controller.position),dx=(p.theta-q.theta)*R,dz=p.z-q.z;
      controller.advance(1/120,new THREE.Vector3(-Math.sin(q.theta)*dx,Math.cos(q.theta)*dx,dz).normalize().multiplyScalar(.3));
    }
    const stopped=polar(controller.position),separation=Math.hypot((stopped.theta-p.theta)*R,stopped.z-p.z);
    assert.ok(stopped.z<p.z&&separation>.4&&separation<.8,kind+' trunk did not block '+JSON.stringify({p,stopped,separation}));
    assert.ok(cw.colliders.get(p.id).length===24);results.push({kind,trunkZ:p.z,stoppedZ:stopped.z});
  }
  for(const p of runtime.placements.filter(p=>!p.blocking))assert.ok(!cw.colliders.has(p.id),'low foliage has physics');
  const p=runtime.placements.find(p=>p.kind==='birch'&&p.height<.7),h=plan.hills.find(h=>h.id===p.hillId);runtime.dispose();
  controller.teleport(point(p.theta,p.z-2,landscapeHeight(h,p.x,p.z-2)+.04));for(let i=0;i<80;i++)controller.advance(1/120);for(let i=0;i<120;i++)controller.advance(1/120,new THREE.Vector3(0,0,.3));assert.ok(controller.position.z>p.z+1,'removed trunk still blocks');
  console.log(JSON.stringify({actualTrunkPhysics:results,afterDisposeZ:controller.position.z}));disposeFloor();assert.equal(cw.colliders.size,0);
});

test('actual controller traverses every summit and central transverse grass crossing with planting loaded',()=>{
  const habitat=new THREE.Group(),cw=new ColliderWorld(),disposeFloor=floorFixture(cw,habitat),savedTrees=savedTreeFixture(cw,habitat);
  const runtime=createInteriorVegetation({habitatGroup:habitat,colliderWorld:cw,plan,world}),controller=new CharacterController(cw);let routes=0;
  for(const h of plan.hills) {
    controller.teleport(point(h.theta-(h.width/2-1)/R,h.z,.25));for(let i=0;i<100;i++)controller.advance(1/120);
    let ticks=0;
    for(;ticks<1500;ticks++) {
      const p=polar(controller.position),x=(p.theta-h.theta)*R;if(x>h.width/2-1)break;
      controller.advance(1/120,new THREE.Vector3(-Math.sin(p.theta),Math.cos(p.theta),(landscapePathZ(h,x+1)-p.z)*1.6).normalize());
    }
    assert.ok(ticks<1500,'planted summit route blocked '+h.id);routes++;
    controller.teleport(point(h.theta,h.z-h.depth/2-1,0));for(let i=0;i<100;i++)controller.advance(1/120);
    let cross=0;for(;cross<1100&&controller.position.z<h.z+h.depth/2+1;cross++)controller.advance(1/120,new THREE.Vector3(0,0,.4));
    assert.ok(cross<1100,'planted transverse route blocked '+h.id);routes++;
  }
  assert.equal(routes,24);assert.equal(savedTrees.count,144);runtime.dispose();savedTrees.dispose();disposeFloor();assert.equal(cw.colliders.size,0);console.log(JSON.stringify({actualWoodlandControllerRoutes:routes,preservedObjTrees:savedTrees.count}));
});
