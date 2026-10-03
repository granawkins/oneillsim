import {getTerraces} from './terrace-surfaces.js';
import {setTerraceView} from './terraces.js';
import {invalidateRaycastCache} from './editor/raycaster.js';
import {cameraAnchor,camera,humanState,setCurrentMode,CameraMode,setYaw,setPitch} from './controls/state.js';
export function walkOnDeck(id){
 const d=getTerraces().decks.find(d=>d.id===id);if(!d)return;
 const theta=d.start+65/(830-d.height),z=d.bands.at(-1)[1]-.5;
 const radius=830-d.height-2;
 setCurrentMode(CameraMode.HUMAN);humanState.floorHeight=d.height;humanState.currentRadius=radius;humanState.radialVelocity=0;humanState.isGrounded=true;
 cameraAnchor.position.set(radius*Math.cos(theta),radius*Math.sin(theta),z);
 cameraAnchor.rotation.set(0,0,theta+Math.PI/2);setYaw(-Math.PI/2);setPitch(0);camera.rotation.set(0,-Math.PI/2,0,'YXZ');
}
export function initTerraceControls(habitat){
 const {decks}=getTerraces();if(!decks.length)return;
 const box=document.createElement('div');box.className='terrace-controls';
 const label=document.createElement('label');label.textContent='Farm deck ';
 const select=document.createElement('select');select.setAttribute('aria-label','Farm deck');
 for(const [value,name] of [['','All levels'],...decks.map(d=>[d.id,`${d.name} (${d.height} m)`])]){const o=document.createElement('option');o.value=value;o.textContent=name;select.append(o);}
 label.append(select);box.append(label);
 const walk=document.createElement('button');walk.textContent='Walk this deck';walk.disabled=true;box.append(walk);
 const note=document.createElement('small');note.textContent='Choose a deck to isolate it and place assets. Stairs are at the sector entrance.';box.append(note);
 const update=()=>{setTerraceView(select.value,habitat);invalidateRaycastCache();walk.disabled=!select.value;};select.addEventListener('change',update);
 walk.addEventListener('click',()=>{walkOnDeck(select.value);select.value='';update();});
 document.getElementById('ui').append(box);
 const requested=new URLSearchParams(location.search).get('deck');
 if(decks.some(d=>d.id===requested)) {select.value=requested;update();if(new URLSearchParams(location.search).get('mode')==='human'){walkOnDeck(requested);select.value='';update();}}
}
