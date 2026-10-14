import * as THREE from 'three';
import {exteriorViews,findExteriorView} from './exterior-views.js';
import {CameraMode,setCurrentMode,setYaw,setPitch,godState,endTransition} from './controls/state.js';

export function exteriorCameraPose(id,habitatMatrix=new THREE.Matrix4()){
 const view=findExteriorView(id),inverse=habitatMatrix.clone().invert(),position=new THREE.Vector3(...view.position).applyMatrix4(inverse),target=new THREE.Vector3(...view.target).applyMatrix4(inverse);
 const direction=target.clone().sub(position).normalize();
 // Match existing no-roll God mouse-look convention (camera local -Z).
 const pitch=Math.asin(Math.max(-1,Math.min(1,direction.y))),yaw=Math.atan2(-direction.x,-direction.z);
 return {view,position:position.toArray(),pitch,yaw,quaternion:new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch,yaw,0,'YXZ')).toArray()};
}

export function initExteriorControls({camera,cameraAnchor,habitatGroup,assembly}){
 const descriptions={
  overview:'The habitat wheel, its sunlight optics and heat-rejection systems. The remote industrial plant is a separate destination.',
  spokes:'Transport spokes connect the central hub to the inhabited ring; the ground-level entry is separate from the outer hull.',
  fabrication:'Fabrication sphere beside the hub. The distant facility 10 km south is extraction/processing, not this sphere.',
  industry:'Remote vacuum-operated extraction plant, 10 km south of the hub, linked by the transport tube.',
  radiator:'Waste-heat radiator. This is separate from the radiation shield wrapped around the habitat.',
  shield:'Radiation shield and reflective window chevrons around the inhabited ring—not the waste-heat radiator.',
  mirror:'Stationary main sunlight mirror; secondary mirrors redirect its light toward the window/chevron aperture.',
  solar:'Habitat solar-cell fields and the separate secondary-reflector banks.',
  docking:'North Pole docking and the stationary/rotating hub interfaces.',
 };
 const visit=id=>{
  habitatGroup.updateWorldMatrix(true,false);const pose=exteriorCameraPose(id,habitatGroup.matrixWorld);
  endTransition();setCurrentMode(CameraMode.GOD);godState.speedMultiplier=1;cameraAnchor.rotation.set(0,0,0);cameraAnchor.position.fromArray(pose.position);camera.position.set(0,0,0);camera.quaternion.fromArray(pose.quaternion);setYaw(pose.yaw);setPitch(pose.pitch);
  camera.fov=58;camera.near=.5;camera.far=20000;camera.updateProjectionMatrix();assembly.update(CameraMode.GOD,cameraAnchor.position);
  info.textContent=descriptions[id]||'';
  window.__oneillExteriorVisit={id,name:pose.view.name,description:info.textContent};return pose;
 };
 const panel=document.createElement('details');panel.id='exterior-tour';const summary=document.createElement('summary');summary.textContent='Inspect the station exterior';panel.append(summary);
 const select=document.createElement('select');select.setAttribute('aria-label','Exterior destination');for(const v of exteriorViews){const option=document.createElement('option');option.value=v.id;option.textContent=v.name;select.append(option);}panel.append(select);
 const info=document.createElement('p');info.id='exterior-description';info.textContent='Choose an exterior component to inspect its role and position.';panel.append(info);
 const button=document.createElement('button');button.type='button';button.textContent='Fly here';button.addEventListener('click',()=>visit(select.value));panel.append(button);
 const back=document.createElement('button');back.type='button';back.textContent='Return to gardens';back.addEventListener('click',()=>window.__oneillSettlementTour?.visit('settlement-residential-a-residential-a-49-garden'));panel.append(back);
 const note=document.createElement('small');note.textContent='Exterior inspection · static systems · WASD fly · Escape unlocks controls';panel.append(note);
 const style=document.createElement('style');style.textContent='#exterior-tour{position:fixed;right:16px;top:16px;z-index:120;background:rgba(20,30,40,.94);color:#e4edf4;padding:10px 14px;border:1px solid #7891a1;border-radius:10px;font:13px/1.45 system-ui;max-width:310px}#exterior-tour summary{cursor:pointer;font-weight:600}#exterior-tour select{width:100%;margin-top:12px;padding:7px;background:#233747;color:#e4edf4;border:1px solid #7891a1;border-radius:5px}#exterior-tour button{margin:8px 6px 0 0;padding:6px 10px;border:0;border-radius:5px;cursor:pointer}#exterior-tour small{display:block;margin-top:8px;color:#aec2d1}.capture-mode #exterior-tour{display:none}';document.head.append(style);
 for(const name of['mousedown','mouseup','click','wheel'])panel.addEventListener(name,e=>e.stopPropagation());document.body.append(panel);
 const initial=new URLSearchParams(window.location.search).get('exterior');if(initial){if(exteriorViews.some(v=>v.id===initial)){select.value=initial;visit(initial);}else window.__oneillExteriorPresetError='Unknown exterior view '+initial;}
 const result={views:exteriorViews,visit,dispose(){panel.remove();style.remove();}};window.__oneillExteriorTour=result;return result;
}
