import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { createSettlementRendering, createSettlementPresentation } from '../src/settlement-rendering.js';
import { ColliderWorld } from '../src/physics/collider-world.js';
import { applyPlacementTransform } from '../src/editor/placement-transform.js';
import { orientToSurface, initPlacement, loadPlacedAssets, removeAsset } from '../src/editor/placement.js';
import { CharacterController } from '../src/physics/character-controller.js';

const closeMatrix = (actual, expected, tolerance = .0003) => actual.elements.forEach((value, i) => assert.ok(Math.abs(value-expected.elements[i]) < tolerance, `matrix[${i}]: ${value} vs ${expected.elements[i]}`));
function fixture(count=3) {
    const habitat = new THREE.Group();
    habitat.position.set(4,7,12); habitat.rotation.set(.3,.4,.7);
    const geometry = new THREE.BoxGeometry(1,2,3), material = new THREE.MeshStandardMaterial();
    const roots = Array.from({length:count}, (_,i) => {
        const root = new THREE.Group(), nested = new THREE.Group(), mesh = new THREE.Mesh(geometry,material);
        root.userData.assetId = `asset_${i}`;
        root.position.set(830+i,-20+i,10*i); root.rotation.set(.2*i,.5,.9); root.scale.setScalar(4);
        nested.position.set(2,3,4); nested.rotation.y=.4; mesh.position.set(1,2,3); mesh.rotation.x=.2;
        nested.add(mesh); root.add(nested); habitat.add(root); return root;
    });
    return {habitat,roots,geometry,material,meshes:roots.map(root=>root.children[0].children[0])};
}

test('instance matrices retain all nested/root transforms and apply habitat rotation exactly once', () => {
    const {habitat,roots,meshes}=fixture(); habitat.updateWorldMatrix(true,true);
    const expected=meshes.map(mesh=>mesh.matrixWorld.clone());
    const rendering=createSettlementRendering(habitat,{cellSize:Infinity}), stats=rendering.refresh(roots);
    assert.equal(stats.batchedMeshes,3); assert.equal(stats.savedDrawCalls,2);
    assert.equal(rendering.group.children.length,1);
    habitat.updateWorldMatrix(true,true);
    const batch=rendering.group.children[0];
    assert.deepEqual(batch.userData.assetIds,roots.map(root=>root.userData.assetId));
    roots.forEach((root,i)=>{
        assert.equal(root.parent,habitat); assert.equal(root.visible,true); assert.equal(meshes[i].visible,false);
        const instance=new THREE.Matrix4(); batch.getMatrixAt(i,instance);
        closeMatrix(new THREE.Matrix4().multiplyMatrices(batch.matrixWorld,instance),expected[i]);
        const p=new THREE.Vector3().fromBufferAttribute(meshes[i].geometry.attributes.position,0);
        assert.ok(p.clone().applyMatrix4(instance).applyMatrix4(batch.matrixWorld).distanceTo(p.applyMatrix4(expected[i])) < .0003);
    });
    habitat.rotation.z+=.6; habitat.updateWorldMatrix(true,true);
    roots.forEach((root,i)=>{const instance=new THREE.Matrix4();batch.getMatrixAt(i,instance);closeMatrix(new THREE.Matrix4().multiplyMatrices(batch.matrixWorld,instance),meshes[i].matrixWorld);});
    rendering.dispose(); assert.ok(meshes.every(mesh=>mesh.visible));
});

test('real curved model geometry and full exterior free transforms preserve world vertex parity', async () => {
    const geometryModel = new OBJLoader().parse(await readFile(new URL('../assets/ultimate-buildings/TorusStructure_HubA.obj',import.meta.url),'utf8'));
    const habitat = new THREE.Group(); habitat.rotation.z=1.1;
    const roots = [geometryModel.clone(),geometryModel.clone()];
    for (let i=0;i<roots.length;i++) {
        applyPlacementTransform(roots[i],{scale:4,rotation:2,surface:{deckId:'exterior-structures',worldTransform:{position:[1050+i*100,-150,220],quaternion:[0,.6,0,-.8]}}},orientToSurface);
        roots[i].userData.assetId=`exterior_${i}`; habitat.add(roots[i]);
    }
    habitat.updateWorldMatrix(true,true);
    const expected = new Map(); roots.forEach(root=>root.traverse(mesh=>{if(mesh.isMesh)expected.set(mesh,mesh.matrixWorld.clone());}));
    const rendering=createSettlementRendering(habitat,{cellSize:Infinity}); assert.ok(rendering.refresh(roots).batchedMeshes>0);
    habitat.updateWorldMatrix(true,true);
    for (const batch of rendering.group.children) {
        for (let i=0;i<batch.count;i++) {
            const mesh=[...expected.keys()].filter(mesh=>mesh.geometry===batch.geometry && mesh.material===batch.material)[i];
            const instance=new THREE.Matrix4(); batch.getMatrixAt(i,instance);
            closeMatrix(new THREE.Matrix4().multiplyMatrices(batch.matrixWorld,instance),expected.get(mesh),.002);
            const positions=batch.geometry.attributes.position;
            for(let j=0;j<positions.count;j+=Math.max(1,Math.floor(positions.count/23))) {
                const p=new THREE.Vector3().fromBufferAttribute(positions,j);
                assert.ok(p.clone().applyMatrix4(instance).applyMatrix4(batch.matrixWorld).distanceTo(p.applyMatrix4(expected.get(mesh)))<.002);
            }
        }
    }
    rendering.dispose();
});

test('identity/flags, transparent water, invisible parents, mirrored/custom/preview meshes stay separate', () => {
    const {habitat,roots,meshes}=fixture(10);
    meshes[2].material=meshes[2].material.clone(); // same name, different actual resource
    meshes[3].geometry=meshes[3].geometry.clone();
    meshes[4].material=new THREE.MeshBasicMaterial({transparent:true,opacity:.5});
    roots[5].visible=false; meshes[6].scale.x=-1; meshes[7].onBeforeRender=()=>{};
    meshes[8].castShadow=true; roots[9].renderOrder=2;
    const rendering=createSettlementRendering(habitat);assert.equal(rendering.refresh(roots).batchedMeshes,2);
    assert.ok(meshes.slice(2).every(mesh=>mesh.visible));assert.equal(roots[5].visible,false);
    rendering.dispose();
});

test('refresh/removal restores survivors, never disposes borrowed resources, updates collider parity', () => {
    const {habitat,roots,meshes,geometry,material}=fixture(); const world=new ColliderWorld();
    roots.forEach(root=>world.setObject(root.userData.assetId,root,habitat));
    const before=world.triangleCount; let geometryDisposals=0,materialDisposals=0,batchDisposals=0;
    geometry.addEventListener('dispose',()=>geometryDisposals++);material.addEventListener('dispose',()=>materialDisposals++);
    const rendering=createSettlementRendering(habitat,{cellSize:Infinity});rendering.refresh(roots);
    rendering.group.children[0].addEventListener('dispose',()=>batchDisposals++);
    roots.forEach(root=>world.setObject(root.userData.assetId,root,habitat));assert.equal(world.triangleCount,before);
    habitat.remove(roots[0]);world.remove('asset_0');assert.equal(rendering.refresh(roots.slice(1)).batchedMeshes,2);
    assert.equal(meshes[0].visible,true); assert.equal(batchDisposals,1);assert.equal(world.triangleCount,before-12);
    roots[1].position.z+=7;rendering.refresh(roots.slice(1));
    habitat.remove(roots[1]);rendering.refresh(roots.slice(2));assert.equal(rendering.group.parent,null);assert.equal(meshes[2].visible,true);
    rendering.dispose();assert.equal(geometryDisposals,0);assert.equal(materialDisposals,0);
});

test('spatial batches retain local-view culling instead of submitting the entire ring',()=>{
    const {habitat,roots}=fixture(8);
    roots.forEach((root,i)=>{root.position.set(20+Math.floor(i/4)*1000,20,20);root.quaternion.identity();});
    const rendering=createSettlementRendering(habitat);const stats=rendering.refresh(roots);
    assert.equal(stats.batchedMeshes,8);assert.equal(stats.batches,2);
    const batches=rendering.group.children;
    assert.ok(batches.every(batch=>batch.frustumCulled&&batch.boundingSphere.radius<100));
    assert.ok(batches[0].boundingSphere.center.distanceTo(batches[1].boundingSphere.center)>900);
    rendering.dispose();
});

test('explicit collision modes preserve solids and visibility; flat supports retain root transform', () => {
    const {habitat,roots}=fixture(); const root=roots[0], world=new ColliderWorld();
    root.visible=false;world.setObject('solid',root,habitat);assert.equal(world.triangleCount,12);
    root.userData.collisionMode='none';world.setObject('solid',root,habitat);assert.equal(world.triangleCount,12,'not per-placement surface metadata');
    root.userData.surface={collisionMode:'none'};world.setObject('solid',root,habitat);assert.equal(world.triangleCount,0);
    root.userData.surface={collisionMode:'support-only',collisionSupport:{kind:'flat',width:5,depth:7,y:.2}};
    world.setObject('floor',root,habitat);assert.equal(world.triangleCount,2);
    const expected=new THREE.Vector3(-2.5,.2,-3.5).applyMatrix4(root.matrix);
    assert.ok(world.colliders.get('floor')[0].triangle.a.distanceTo(expected)<1e-9);
    const previous=world.colliders.get('floor');root.userData.surface.collisionSupport.width=-1;
    assert.throws(()=>world.setObject('floor',root,habitat),/explicit finite/);assert.equal(world.colliders.get('floor'),previous);
    root.userData.surface={collisionMode:'surprise'};assert.throws(()=>world.setObject('floor',root,habitat),/Unknown/);
});

test('explicit curved floor has conservative <=1cm chords; no inferred canopy or wall support', () => {
    const habitat=new THREE.Group();habitat.rotation.z=.9;
    const root=new THREE.Group();root.scale.setScalar(4);root.userData.surface={collisionMode:'support-only',collisionSupport:{kind:'curved',radius:207.5,thetaStart:.3,thetaEnd:.5,zMin:-3,zMax:3}};habitat.add(root);
    const world=new ColliderWorld();world.setObject('curve',root,habitat);
    const entries=world.colliders.get('curve');assert.ok(entries.length>2);
    for(const {triangle} of entries) {
        for(const p of [triangle.a,triangle.b,triangle.c])assert.ok(Math.abs(Math.hypot(p.x,p.y)-830)<1e-9);
        const mid=triangle.a.clone().add(triangle.c).multiplyScalar(.5);assert.ok(830-Math.hypot(mid.x,mid.y)<=.0100001);
    }
    root.userData.surface={collisionMode:'support-only'};assert.throws(()=>world.setObject('curve',root,habitat),/explicit/);
});

test('70m authored-metre crop floor follows analytic curvature and is walkable at speed 15',()=>{
    const root=new THREE.Group(), habitat=new THREE.Group(),world=new ColliderWorld();
    root.position.set(830,0,0);root.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0,1,0),new THREE.Vector3(-1,0,0),new THREE.Vector3(0,0,1)));root.scale.setScalar(4);
    root.add(new THREE.Mesh(new THREE.BoxGeometry(17.5,3,4))); // canopy does not become a ceiling/wall
    root.userData.surface={collisionMode:'support-only',collisionSupport:{width:70,depth:16,curveRadiusMeters:830,heightMeters:0}};habitat.add(root);
    world.setObject('plot',root,habitat);
    for(const {triangle} of world.colliders.get('plot')) {
        for(const p of [triangle.a,triangle.b,triangle.c])assert.ok(Math.abs(Math.hypot(p.x,p.y)-830)<1e-9);
        const mid=triangle.a.clone().add(triangle.c).multiplyScalar(.5);assert.ok(830-Math.hypot(mid.x,mid.y)<=.0100001);
    }
    const character=new CharacterController(world,{groundExists:()=>false});
    character.teleport(new THREE.Vector3(Math.sqrt(830*830-32*32),-32,0));
    for(let i=0;i<600&&character.position.y<32;i++) {
        const theta=Math.atan2(character.position.y,character.position.x);
        character.advance(1/120,new THREE.Vector3(-Math.sin(theta),Math.cos(theta),0));
        assert.ok(Math.abs(830-Math.hypot(character.position.x,character.position.y))<.03);
    }
    assert.ok(character.position.y>=32);assert.ok(character.grounded);
    root.userData.surface.collisionSupport.curveRadiusMeters=0;
    assert.throws(()=>world.setObject('plot',root,habitat),/explicit/);
});

test('collider geometry expansion cache invalidates changed attributes/index and preserves independent clones',()=>{
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,0,1],3));
    const first=new THREE.Mesh(geometry),second=new THREE.Mesh(geometry);second.position.y=3;
    const world=new ColliderWorld();world.setObject('first',first);world.setObject('second',second);
    assert.equal(world.colliders.get('first')[0].triangle.a.y,0);assert.equal(world.colliders.get('second')[0].triangle.a.y,3);
    geometry.attributes.position.setY(0,1);geometry.attributes.position.needsUpdate=true;world.setObject('first',first);
    assert.equal(world.colliders.get('first')[0].triangle.a.y,1);assert.equal(world.colliders.get('second')[0].triangle.a.y,3);
    geometry.setIndex([2,1,0]);world.setObject('first',first);assert.equal(world.colliders.get('first')[0].triangle.a.z,1);
    geometry.index.setX(0,0);geometry.index.setX(2,2);geometry.index.needsUpdate=true;world.setObject('first',first);assert.equal(world.colliders.get('first')[0].triangle.a.y,1);
    geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,9,0,1,0,0,0,0,1],3));world.setObject('first',first);assert.equal(world.colliders.get('first')[0].triangle.a.y,9);
});

test('incomplete saved collision contracts cannot leave a visible uncollidable runtime root',async()=>{
    const habitat=new THREE.Group(),warnings=[],warn=console.warn;
    initPlacement(habitat);console.warn=(...args)=>warnings.push(args);
    try {
        await loadPlacedAssets([{id:'invalid-support-fixture',type:'fixture',theta:0,z:0,scale:1,rotation:0,blockout:{width:2,depth:2,height:1,color:0xffffff},surface:{collisionMode:'support-only'}}]);
        assert.equal(habitat.children.length,0);assert.equal(removeAsset('invalid-support-fixture'),false);assert.equal(warnings.length,1);
    } finally {console.warn=warn;initPlacement(null);}
});

test('presentation is opt-in/reversible and changes no scene lights/materials',()=>{
    const renderer={toneMapping:THREE.NoToneMapping,toneMappingExposure:1.2};
    const presentation=createSettlementPresentation({renderer,exposure:.9});
    assert.equal(renderer.toneMapping,THREE.ACESFilmicToneMapping);assert.equal(renderer.toneMappingExposure,.9);
    presentation.dispose();assert.deepEqual(renderer,{toneMapping:THREE.NoToneMapping,toneMappingExposure:1.2});
});

// Run explicitly under the global renderer lock: SETTLEMENT_BROWSER_TEST=1.
// Actual OBJ/MTL/textures and world data from disk, real WebGL draw-call counters;
// GET-only route harness on the existing origin, no ports/CDN/world mutations.
test('actual runtime world draw calls, pixel parity, placement/removal/save/borrowed-resource semantics', {skip:process.env.SETTLEMENT_BROWSER_TEST!=='1',timeout:180000}, async()=>{
    const {chromium}=await import('playwright');
    const browser=await chromium.launch({executablePath:'/opt/oneillsim-renderer/chromium-1208/chrome-linux64/chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
    try {
        const page=await browser.newPage({viewport:{width:128,height:128}});
        await page.route('**/*',async route=>{
            assert.equal(route.request().method(),'GET');
            const path=new URL(route.request().url()).pathname;
            if(path==='/oneillsim/')return route.fulfill({contentType:'text/html',body:'<!doctype html><script type="importmap">{"imports":{"three":"/oneillsim/node_modules/three/build/three.module.js","three/addons/":"/oneillsim/node_modules/three/examples/jsm/"}}</script>'});
            assert.ok(path.startsWith('/oneillsim/')&&!path.includes('..'));
            const relative=path.slice('/oneillsim/'.length);
            const contentType=path.endsWith('.js')?'text/javascript':path.endsWith('.png')?'image/png':path.endsWith('.json')?'application/json':'text/plain';
            return route.fulfill({contentType,body:await readFile(new URL(`../${relative}`,import.meta.url))});
        });
        await page.goto('http://127.0.0.1:3200/oneillsim/');
        const result=await page.evaluate(async()=>{
            const THREE=await import('three');
            const {createSettlementRendering}=await import('./src/settlement-rendering.js');
            const placement=await import('./src/editor/placement.js');
            const loader=await import('./src/editor/loader.js');
            const state=await import('./src/editor/state.js');
            const {characterColliders}=await import('./src/physics/collider-world.js');
            const scene=new THREE.Scene(),habitat=new THREE.Group();scene.add(habitat);scene.add(new THREE.AmbientLight(0xffffff,2));
            const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});renderer.setSize(128,128);
            const camera=new THREE.PerspectiveCamera(60,1,.1,5000);camera.position.set(0,8,25);camera.lookAt(0,1,0);
            const pixel=()=>{renderer.render(scene,camera);const gl=renderer.getContext(),data=new Uint8Array(128*128*4);gl.readPixels(0,0,128,128,gl.RGBA,gl.UNSIGNED_BYTE,data);return data;};
            placement.initPlacement(habitat);
            const surfaces=[-7,0,7].map(x=>({worldTransform:{position:[x,0,0],quaternion:[0,0,0,1]}}));
            const ids=[];for(const surface of surfaces)ids.push(await placement.placeAsset('TorusBench_A',0,0,4,0,surface));
            const stats=placement.refreshPlacementRendering(),batched=pixel(),batchedCalls=renderer.info.render.calls;
            const batchGroup=habitat.children.find(child=>child.name==='settlement-render-batches');
            const roots=habitat.children.filter(child=>child.userData.assetId);
            const beforeExport=JSON.stringify(state.exportWorldState());
            // Temporarily expose original meshes to compare actual pixels/draws.
            batchGroup.visible=false;roots.forEach(root=>root.traverse(child=>{if(child.isMesh)child.visible=true;}));
            const original=pixel(),originalCalls=renderer.info.render.calls;
            let maxPixelDifference=0;for(let i=0;i<batched.length;i++)maxPixelDifference=Math.max(maxPixelDifference,Math.abs(batched[i]-original[i]));
            // Return to batching before testing removal.
            batchGroup.visible=true;placement.refreshPlacementRendering();
            let geometryDisposals=0,materialDisposals=0;const prototype=loader.getAsset('TorusBench_A');
            prototype.traverse(child=>{if(child.isMesh){child.geometry.addEventListener('dispose',()=>geometryDisposals++);const ms=Array.isArray(child.material)?child.material:[child.material];ms.forEach(m=>m.addEventListener('dispose',()=>materialDisposals++));}});
            const exportStable=beforeExport===JSON.stringify(state.exportWorldState());
            placement.removeAsset(ids[0]);const removalStats=placement.refreshPlacementRendering();placement.removeAsset(ids[1]);
            const survivor=habitat.children.find(child=>child.userData.assetId===ids[2]);let survivorVisible=true;survivor.traverse(child=>{if(child.isMesh&&!child.visible)survivorVisible=false;});placement.removeAsset(ids[2]);
            const world=await (await fetch('./world.json')).json();state.importWorldState(world);
            const normalizedBefore=JSON.stringify(state.exportWorldState());
            const start=performance.now();await placement.loadPlacedAssets(state.editorState.placedAssets);const loadMs=performance.now()-start;
            const worldStats=placement.refreshPlacementRendering(),saved=JSON.stringify(state.exportWorldState());
            state.importWorldState(JSON.parse(saved));
            const roundtrip=state.editorState.placedAssets.length===world.assets.length&&saved===normalizedBefore&&JSON.stringify(state.exportWorldState())===saved;
            // Overhead comparison: disable per-mesh culling for both paths, camera
            // sees the full ring, identical triangles, actual renderer.info calls.
            camera.position.set(0,0,2300);camera.lookAt(0,0,0);
            const worldRoots=habitat.children.filter(child=>child.userData.assetId);
            const worldBatchGroup=habitat.children.find(child=>child.name==='settlement-render-batches');
            worldRoots.forEach(root=>root.traverse(child=>{if(child.isMesh)child.frustumCulled=false;}));
            placement.refreshPlacementRendering();renderer.render(scene,camera);const worldBatchedCalls=renderer.info.render.calls,worldBatchedTriangles=renderer.info.render.triangles;
            worldBatchGroup.visible=false;worldRoots.forEach(root=>root.traverse(child=>{if(child.isMesh)child.visible=true;}));renderer.render(scene,camera);const worldOriginalCalls=renderer.info.render.calls,worldOriginalTriangles=renderer.info.render.triangles;
            const exteriorColliders=worldRoots.filter(root=>root.userData.exterior&&characterColliders.colliders.has(root.userData.assetId)).length;
            const worldRootCount=worldRoots.length;
            worldBatchGroup.visible=true;
            const denseWorld=state.exportWorldState(),benchIndex=denseWorld.assetTypes.indexOf('TorusBench_A');
            const extraCount=2000-worldRootCount;
            for(let i=0;i<extraCount;i++)denseWorld.assets.push([`settlement-benchmark-${i}`,benchIndex,i/extraCount*Math.PI*2,((i%9)-4)*6,4,0,null,{collisionMode:'none'}]);
            state.importWorldState(denseWorld);
            const colliderTrianglesBefore=characterColliders.triangleCount;
            const denseStart=performance.now();await placement.loadPlacedAssets(state.editorState.placedAssets.slice(worldRootCount));const denseLoadMs=performance.now()-denseStart;
            const refreshStart=performance.now(),denseStats=placement.refreshPlacementRendering(),denseRefreshMs=performance.now()-refreshStart;
            const denseRoots=habitat.children.filter(child=>child.userData.assetId);
            denseRoots.forEach(root=>root.traverse(child=>{if(child.isMesh)child.frustumCulled=false;}));placement.refreshPlacementRendering();
            renderer.render(scene,camera);const denseBatchedCalls=renderer.info.render.calls,denseBatchedTriangles=renderer.info.render.triangles;
            const denseGroup=habitat.children.find(child=>child.name==='settlement-render-batches');denseGroup.visible=false;
            denseRoots.forEach(root=>root.traverse(child=>{if(child.isMesh)child.visible=true;}));renderer.render(scene,camera);const denseOriginalCalls=renderer.info.render.calls,denseOriginalTriangles=renderer.info.render.triangles;
            const denseExport=JSON.stringify(state.exportWorldState());state.importWorldState(JSON.parse(denseExport));const denseRoundtrip=state.editorState.placedAssets.length===2000&&JSON.stringify(state.exportWorldState())===denseExport;
            const denseColliderUnchanged=colliderTrianglesBefore===characterColliders.triangleCount;
            denseGroup.visible=true;placement.removeAsset('settlement-benchmark-0');const denseRemovalRoots=state.editorState.placedAssets.length;
            const preview=placement.createPreview('TorusBench_A',.1,3,4);let previewLegacy=true;preview.traverse(child=>{if(child.isMesh){previewLegacy&&=child.material.transparent&&child.material.opacity===.5;child.material.dispose();}});
            // Page teardown owns these local test objects. Drop instance buffers,
            // not shared prototypes; no live endpoint or file is ever written.
            placement.initPlacement(null);renderer.dispose();
            return {stats,batchedCalls,originalCalls,maxPixelDifference,exportStable,removalStats,survivorVisible,geometryDisposals,materialDisposals,worldStats,loadMs,roundtrip,worldRootCount,worldBatchedCalls,worldOriginalCalls,worldBatchedTriangles,worldOriginalTriangles,exteriorColliders,denseStats,denseLoadMs,denseRefreshMs,denseBatchedCalls,denseOriginalCalls,denseBatchedTriangles,denseOriginalTriangles,denseRoundtrip,denseColliderUnchanged,denseRemovalRoots,previewLegacy};
        });
        console.log(JSON.stringify({settlementRuntime:result}));
        assert.ok(result.batchedCalls<result.originalCalls);assert.ok(result.maxPixelDifference<=1);assert.ok(result.exportStable);assert.ok(result.survivorVisible);
        assert.ok(result.removalStats.batchedMeshes>0);assert.equal(result.geometryDisposals,0);assert.equal(result.materialDisposals,0);
        assert.ok(result.roundtrip);assert.equal(result.exteriorColliders,0);assert.ok(result.worldBatchedCalls<result.worldOriginalCalls);assert.equal(result.worldBatchedTriangles,result.worldOriginalTriangles);
        assert.equal(result.worldRootCount,482);assert.equal(result.denseStats.logicalRoots,2000);assert.ok(result.denseRoundtrip);assert.ok(result.denseColliderUnchanged);assert.equal(result.denseRemovalRoots,1999);assert.ok(result.previewLegacy);
        assert.ok(result.denseBatchedCalls<result.denseOriginalCalls/2);assert.equal(result.denseBatchedTriangles,result.denseOriginalTriangles);
    } finally {await browser.close();}
});
