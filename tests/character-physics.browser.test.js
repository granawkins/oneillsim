import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { interceptCandidate } from './candidate-interception.js';

const base = 'http://127.0.0.1:3200/oneillsim/';
const launch = () => chromium.launch({executablePath:'/opt/oneillsim-renderer/chromium-1208/chrome-linux64/chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const ready = page => page.waitForFunction(()=>window.__oneillSimReady||window.__oneillSimError,null,{timeout:30000});
const fixture = async (page,{assets=[],terraces={decks:[],stairs:[]}}={}) => {
    await page.route('**/world.json',async route=>{
        assert.equal(route.request().method(),'GET');
        const response=await route.fetch(), world=await response.json();
        world.assets=assets;world.terraces=terraces;delete world.cropConfig;
        await route.fulfill({response,json:world});
    });
};

test('candidate integrates live load, exact IDs, collider readiness, deck visibility and stable camera capture', {timeout:90000},async()=>{
    const browser=await launch();
    try{
        const page=await browser.newPage({viewport:{width:320,height:240}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
        const guard=await interceptCandidate(page);
        await page.goto(base+'?x=0&y=830&z=12&yaw=0&pitch=10&capture=1',{waitUntil:'domcontentloaded'});await ready(page);
        const state=await page.evaluate(async()=>{
            const {characterColliders}=await import('./src/physics/collider-world.js');
            const {editorState}=await import('./src/editor/state.js');
            const {habitatGroup,cameraAnchor}=await import('./src/scene.js');
            const {terraceMeshes,setTerraceView}=await import('./src/terraces.js');
            const {getStars}=await import('./src/stars.js');
            const count=characterColliders.triangleCount;
            setTerraceView('farm-a-water',habitatGroup);
            const physicalAfterFilter=characterColliders.triangleCount;
            setTerraceView(null,habitatGroup);
            const before=cameraAnchor.position.toArray();
            await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
            const world=await fetch('world.json').then(r=>r.json());
            return {error:window.__oneillSimError||null,view:window.__oneillSimView,position:cameraAnchor.position.toArray(),before,
                ids:editorState.placedAssets.map(a=>a.id),savedIds:world.assets.map(a=>a[0]),colliders:characterColliders.colliders.size,
                triangleCount:count,physicalAfterFilter,terraces:terraceMeshes.length,
                faces:getStars().images.map(i=>[i?.naturalWidth,i?.complete]),firstFrame:window.__oneillSimFirstFrame,
                resources:performance.getEntriesByType('resource').filter(e=>e.name.includes('/src/')||e.name.endsWith('world.json')).length};
        });
        assert.equal(state.error,null);assert.deepEqual(errors,[]);assert.deepEqual(state.ids,state.savedIds);assert.equal(state.ids.length,387);
        assert.equal(state.colliders,387+state.terraces);assert.equal(state.physicalAfterFilter,state.triangleCount);
        assert.deepEqual(state.before,state.position);assert.ok(Math.abs(state.position[1]-828)<1e-9);assert.equal(state.position[2],12);
        await page.waitForFunction(async()=>{const {getStars}=await import('./src/stars.js');return getStars().images.every(i=>i.complete&&i.naturalWidth===1024);});
        assert.equal(guard.writes.length,0);
        console.log(JSON.stringify({candidateLive:{placements:state.ids.length,colliders:state.colliders,triangles:state.triangleCount,sourceResources:state.resources,camera:state.position,errors}}));
    }finally{await browser.close();}
});

test('actual animation falls while unlocked, input clears, and planner/god/zoom transitions retain behavior', {timeout:90000},async()=>{
    const browser=await launch();
    try{
        const page=await browser.newPage({viewport:{width:320,height:240}});const guard=await interceptCandidate(page);
        await fixture(page,{terraces:{decks:[{id:'lower',start:0,end:.3,height:-12,bands:[[-10,10]]}],stairs:[]}});
        await page.goto(base+'?theta=5&z=0',{waitUntil:'domcontentloaded'});await ready(page);
        await page.waitForFunction(async()=>{const {humanState}=await import('./src/controls/state.js');return humanState.floorHeight< -11.9&&humanState.isGrounded;},null,{timeout:30000});
        const falling=await page.evaluate(async()=>{
            const {humanState,moveState}=await import('./src/controls/state.js');
            moveState.forward=true;moveState.left=true;humanState.jumpRequested=true;
            window.dispatchEvent(new Event('blur'));
            const blur={...moveState,jump:humanState.jumpRequested};
            moveState.forward=true;document.dispatchEvent(new Event('pointerlockchange'));
            return {height:humanState.floorHeight,grounded:humanState.isGrounded,locked:!!document.pointerLockElement,blur,unlock:{...moveState}};
        });
        assert.ok(falling.height< -11.9);assert.ok(falling.grounded);assert.equal(falling.locked,false);
        assert.ok(Object.values(falling.blur).every(v=>!v));assert.ok(Object.values(falling.unlock).every(v=>!v));
        const modes=await page.evaluate(async()=>{
            const {switchToMode,startGodTransition}=await import('./src/controls/transitions.js');
            const {CameraMode,getCurrentMode,plannerState,cameraAnchor,habitatGroup,scene,setYaw}=await import('./src/controls/state.js');
            const {updateMovement}=await import('./src/controls/index.js');
            switchToMode(CameraMode.PLANNER);const planner=getCurrentMode();const before=plannerState.theta;
            document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW'}));updateMovement(1/60);
            document.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyW'}));const moved=plannerState.theta!==before;
            startGodTransition();const god=getCurrentMode(),godParent=cameraAnchor.parent===scene;
            switchToMode(CameraMode.PLANNER);const plannerParent=cameraAnchor.parent===habitatGroup;
            // Editor scroll is the ordinary no-pointer-lock zoom workflow.
            const {toggleEditorEnabled,setEditorVisible}=await import('./src/editor/index.js');toggleEditorEnabled();setEditorVisible(true);
            plannerState.height=10;setYaw(-Math.PI/2);
            document.dispatchEvent(new WheelEvent('wheel',{deltaY:-100,cancelable:true}));
            return {planner,moved,god,godParent,plannerParent,zoomMode:getCurrentMode(),height:plannerState.height};
        });
        assert.equal(modes.planner,'planner');assert.ok(modes.moved);assert.equal(modes.god,'god');assert.ok(modes.godParent&&modes.plannerParent);
        assert.equal(modes.zoomMode,'human');assert.equal(modes.height,10);assert.equal(guard.writes.length,0);
        console.log(JSON.stringify({candidateGameplay:{falling,modes}}));
    }finally{await browser.close();}
});

test('placement/deletion updates colliders, actual authored model transforms and fixture walls/roofs integrate', {timeout:180000},async()=>{
    const browser=await launch();
    try{
        const page=await browser.newPage({viewport:{width:320,height:240}});const guard=await interceptCandidate(page);
        await fixture(page,{assets:[['fixture-wall',1,0,0,1,Math.PI/4,{width:.1,depth:10,height:6,elevation:0,color:'#fff'}]]});
        await page.goto(base+'?capture=1&theta=0&z=0',{waitUntil:'domcontentloaded'});await ready(page);
        // Physics below is advanced explicitly; stop redundant software-WebGL
        // capture redraws while model requests and deterministic ticks run.
        await page.evaluate(()=>{window.requestAnimationFrame=()=>0;});
        const result=await page.evaluate(async()=>{
            const THREE=await import('three');const {characterColliders}=await import('./src/physics/collider-world.js');
            const {placeAsset,removeAsset}=await import('./src/editor/placement.js');
            const {editorState}=await import('./src/editor/state.js');
            const {CharacterController}=await import('./src/physics/character-controller.js');
            const {humanController,updateHumanMode}=await import('./src/controls/modes/human.js');
            const {humanState,cameraAnchor,moveState,setYaw}=await import('./src/controls/state.js');
            const initial=characterColliders.triangleCount;
            const id=await placeAsset('TorusHome_ModA',.1,0,4,Math.PI/4,{height:2,deckId:'fixture'});
            const placed=characterColliders.colliders.has(id),trianglesAdded=characterColliders.triangleCount-initial;
            const data=editorState.placedAssets.find(a=>a.id===id);
            const modelController=new CharacterController(characterColliders);
            modelController.teleport(new THREE.Vector3(820*Math.cos(.1),820*Math.sin(.1),0));
            for(let i=0;i<360;i++)modelController.advance(1/120);
            const roofHeight=830-Math.hypot(modelController.position.x,modelController.position.y),roofGrounded=modelController.grounded;
            const c=new CharacterController(characterColliders);c.teleport(new THREE.Vector3(830,-3,0));
            for(let i=0;i<240;i++)c.advance(1/120,new THREE.Vector3(0,1,0));
            const wallPosition=c.position.toArray();
            const removed=removeAsset(id),cleared=!characterColliders.colliders.has(id),restored=characterColliders.triangleCount===initial;
            // Exercise the camera wrapper's yaw-to-WASD and jump queue, not just
            // the standalone physics class. Move away from the fixture wall first.
            cameraAnchor.position.set(828,10,0);updateHumanMode(1/120);
            const start=humanController.position.clone();setYaw(0);moveState.forward=true;
            for(let i=0;i<60;i++)updateHumanMode(1/60);moveState.forward=false;
            humanState.jumpRequested=true;let apex=0;
            for(let i=0;i<180;i++){updateHumanMode(1/120);apex=Math.max(apex,humanState.floorHeight);}
            return {placed,trianglesAdded,data,removed,cleared,restored,wallPosition,roofHeight,roofGrounded,zMotion:humanController.position.z-start.z,apex,grounded:humanState.isGrounded};
        });
        assert.ok(result.placed);assert.equal(result.trianglesAdded,984);assert.ok(result.removed&&result.cleared&&result.restored);
        assert.ok(result.roofGrounded);assert.ok(result.roofHeight>6.8&&result.roofHeight<7.6,`transformed roof height ${result.roofHeight}`);
        assert.equal(result.data.scale,4);assert.equal(result.data.rotation,Math.PI/4);assert.equal(result.data.surface.height,2);
        assert.ok(result.wallPosition[1]-result.wallPosition[2]<-.45,`rotated wall must slide/stop ${result.wallPosition}`);
        assert.ok(result.wallPosition[2]>3,'diagonal plane should redirect motion, not freeze it');
        assert.ok(result.zMotion< -4.9);assert.ok(result.apex>1.2&&result.apex<1.4);assert.ok(result.grounded);
        assert.equal(guard.writes.length,0);console.log(JSON.stringify({candidateEditing:result}));
    }finally{await browser.close();}
});
