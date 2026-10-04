import {camera,cameraAnchor} from './scene.js';
import {CameraMode,setCurrentMode,setYaw,setPitch,plannerState} from './controls/state.js';
import {setupHumanMode,humanController} from './controls/modes/human.js';

export function initSettlementTour(design,{defaultVisit=false}={}){
 if(!Array.isArray(design?.landmarks)||!design.landmarks.length)return null;
 const landmarks=design.landmarks.filter(p=>[p.theta,p.z,p.height].every(Number.isFinite));
 const visit=id=>{
  const p=landmarks.find(p=>p.id===id);if(!p)throw Error('Unknown settlement landmark '+id);
  const radius=830-p.height-humanController.config.eyeHeight;
  cameraAnchor.position.set(radius*Math.cos(p.theta),radius*Math.sin(p.theta),p.z);
  cameraAnchor.rotation.set(0,0,p.theta+Math.PI/2);setCurrentMode(CameraMode.HUMAN);
  setYaw((p.yaw??-90)*Math.PI/180);setPitch((p.pitch??0)*Math.PI/180);
  camera.rotation.set((p.pitch??0)*Math.PI/180,(p.yaw??-90)*Math.PI/180,0,'YXZ');
  plannerState.theta=p.theta;plannerState.z=p.z;setupHumanMode();
  window.__oneillSettlementVisit={id:p.id,name:p.name,theta:p.theta,z:p.z,height:p.height};
  return p;
 };
 const panel=document.createElement('details');panel.id='settlement-tour';panel.innerHTML='<summary>Explore the gardens</summary>';
 const text=document.createElement('p');text.textContent='Connected neighborhoods, gardens and cultivated landscapes. Choose a starting point, then walk.';panel.append(text);
 const select=document.createElement('select');select.setAttribute('aria-label','Settlement destination');
 for(const p of landmarks){const option=document.createElement('option');option.value=p.id;option.textContent=p.name;select.append(option);}panel.append(select);
 const button=document.createElement('button');button.textContent='Walk here';button.type='button';button.addEventListener('click',()=>visit(select.value));panel.append(button);
 const note=document.createElement('small');note.textContent='Static museum interpretation · WASD move · Space jump · scroll to change camera mode';panel.append(note);
 const style=document.createElement('style');style.textContent='#settlement-tour{position:fixed;right:16px;bottom:16px;z-index:120;color:#eae7db;background:rgba(21,35,27,.9);border:1px solid #75816d;border-radius:10px;padding:10px 14px;max-width:310px;font:13px/1.45 system-ui;box-shadow:0 4px 20px #0005}#settlement-tour summary{cursor:pointer;font-weight:600;letter-spacing:.02em}#settlement-tour p{margin:10px 0}#settlement-tour select{width:100%;color:#eae7db;background:#283a2e;border:1px solid #7c9275;padding:7px;border-radius:5px}#settlement-tour button{margin-top:8px;padding:6px 12px;background:#d6c99f;border:0;border-radius:5px;color:#253225;cursor:pointer}#settlement-tour small{display:block;margin-top:8px;color:#b9c5b0}.capture-mode #settlement-tour{display:none}';document.head.append(style);
 for(const event of ['mousedown','mouseup','click','wheel'])panel.addEventListener(event,e=>e.stopPropagation());
 document.body.append(panel);
 if(defaultVisit){const center=landmarks.find(p=>p.id==='settlement-residential-a-residential-a-49-garden')||landmarks[0];select.value=center.id;visit(center.id);}
 const handle={landmarks,visit,dispose(){panel.remove();style.remove();}};window.__oneillSettlementTour=handle;return handle;
}
