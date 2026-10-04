import * as THREE from 'three';
import {completedModels} from './completed-models.js';
// Full-scale envelopes/sections, not a complete engineered exterior assembly.
// Hub model local +Y is the spin/docking axis; align it to habitat +Z.
const hubRotation=[Math.PI/2,0,0];
const shellAngle=155*Math.PI/180;
const shellPosition=(radius,angle,z)=>[radius*Math.cos(angle),radius*Math.sin(angle),z];
const poses={
 TorusStructure_HubA:{position:[0,0,-65],euler:hubRotation,label:'Central hub envelope · axial docking drum'},
 TorusStructure_DockingA:{position:[0,-8,128],euler:[0,0,0],label:'Axial docking collar specimen'},
 TorusStructure_SpokeA:{position:[100,-7.8,0],euler:[0,Math.PI/2,0],label:'30 m cutaway at the +X hub spoke port'},
 TorusStructure_FrameA:{position:[123,-3.15,0],euler:[0,Math.PI/2,0],label:'Open structural frame inspection section'},
 TorusStructure_AirlockA:{position:[16,-1.7,126],euler:[0,0,0],label:'Open airlock vestibule · exterior inspection bay'},
 TorusStructure_MirrorA:{position:[-80,0,260],euler:hubRotation,label:'Solar mirror bay · representative module only'},
 TorusStructure_RadiatorA:{position:[80,0,180],euler:hubRotation,label:'Radiator bay · representative module only'},
 TorusStructure_HullPanelA:{position:shellPosition(900,shellAngle,20),euler:[0,0,shellAngle+Math.PI/2],label:'Exploded pressure-shell coupon outside the torus'},
 TorusStructure_ShieldA:{position:shellPosition(898,shellAngle+.035,-20),euler:[0,0,shellAngle+.035-Math.PI/2],label:'Radiation-shield brick section outside the torus'},
};
export function exteriorModelPlacements(){
 return completedModels.filter(m=>m.materialKit==='structure').map(m=>{
  const p=poses[m.id];if(!p)throw Error('Missing exterior pose '+m.id);
  const quaternion=new THREE.Quaternion().setFromEuler(new THREE.Euler(...p.euler));
  return {id:'completed-model-'+m.slug,type:m.id,theta:(Math.atan2(p.position[1],p.position[0])+Math.PI*2)%(Math.PI*2),z:p.position[2],scale:4,rotation:0,zone:'exterior',label:p.label,surface:{deckId:'exterior-structures',height:0,worldTransform:{position:[...p.position],quaternion:quaternion.toArray().map(v=>Object.is(v,-0)?0:v)}}};
 });
}
