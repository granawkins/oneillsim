import * as THREE from 'three';

export function exteriorEnvelopeWanted(mode,position){
 const p=Array.isArray(position)?position:[position.x,position.y,position.z];
 return mode==='god' && Math.hypot(Math.hypot(p[0],p[1])-830,p[2])>85;
}

// Runtime-owned engineering scene: saved editor instances/data are never replaced.
// Builders own only their new resources; all existing torus meshes are borrowed.
export function createExteriorAssembly({scene,habitatGroup,world,structureBuilder,energyBuilder,industryBuilder,legacyTorus,refreshRendering=()=>{}}){
 if(typeof structureBuilder!=='function'||typeof energyBuilder!=='function')throw new TypeError('Exterior builders required');
 const stationaryGroup=new THREE.Group();stationaryGroup.name='exterior-stationary-frame';scene.add(stationaryGroup);
 const rotatingGroup=new THREE.Group();rotatingGroup.name='exterior-rotating-frame';habitatGroup.add(rotatingGroup);
 let structure,energy,industry;
 try{structure=structureBuilder({rotatingGroup,stationaryGroup,world});energy=energyBuilder({rotatingGroup,stationaryGroup,world});if(industryBuilder)industry=industryBuilder({rotatingGroup,stationaryGroup,world});}
 catch(error){structure?.dispose();energy?.dispose();industry?.dispose();rotatingGroup.removeFromParent();stationaryGroup.removeFromParent();throw error;}
 const sun=new THREE.DirectionalLight(0xfff4dd,2);sun.name='exterior-sunlight';sun.position.set(2500,0,0);scene.add(sun);sun.visible=false;
 const fill=new THREE.DirectionalLight(0xa9bdd7,.65);fill.name='exterior-fill';fill.position.set(-1000,-1200,1400);scene.add(fill);fill.visible=false;
 let visible=false,disposed=false,legacyVisibility=null;
 const specimenVisibility=new Map();
 const externalIds=new Set((world.assets||[]).filter(a=>a[7]?.worldTransform).map(a=>a[0]));
 const distantVisibility=new Map();let distant=false;
 function setDistant(value){
  if(value===distant)return;
  if(value){for(const root of habitatGroup.children)if((root.userData.assetId&&!externalIds.has(root.userData.assetId))||['texturePatchGroup','settlement-circulation'].includes(root.name)){distantVisibility.set(root,root.visible);root.visible=false;}}
  else{for(const [root,wasVisible]of distantVisibility)root.visible=wasVisible;distantVisibility.clear();}
  distant=value;refreshRendering();
 }
 function setEnvelopeVisible(value){
  value=!!value;structure.setEnvelopeVisible(value);energy.setEnvelopeVisible(value);industry?.setEnvelopeVisible(value);sun.visible=value;fill.visible=value;
  if(value!==visible){
   if(value){
    legacyVisibility=legacyTorus?{inner:legacyTorus.innerTorusMesh.visible,outer:legacyTorus.outerTorusMesh.visible}:null;
    for(const a of world.assets||[])if(a[0].startsWith('completed-model-')&&a[7]?.deckId==='exterior-structures'&&a[7]?.worldTransform){const root=habitatGroup.children.find(o=>o.userData.assetId===a[0]);if(root){specimenVisibility.set(root,root.visible);root.visible=false;}}
   }else{
    if(legacyVisibility){legacyTorus.innerTorusMesh.visible=legacyVisibility.inner;legacyTorus.outerTorusMesh.visible=legacyVisibility.outer;}
    for(const [root,wasVisible]of specimenVisibility)root.visible=wasVisible;specimenVisibility.clear();
   }
   visible=value;refreshRendering();
  }
  if(value&&legacyTorus){legacyTorus.innerTorusMesh.visible=false;legacyTorus.outerTorusMesh.visible=false;}
  return visible;
 }
 setEnvelopeVisible(false);
 function stats(){
  let meshes=0,instances=0,triangles=0;const materials=new Set();
  for(const root of[rotatingGroup,stationaryGroup])root.traverse(o=>{if(!o.isMesh)return;meshes++;const count=o.isInstancedMesh?o.count:1;if(o.isInstancedMesh)instances+=o.count;triangles+=((o.geometry.index?.count??o.geometry.attributes.position?.count??0)/3)*count;for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);});
  return {meshes,instances,triangles,materials:materials.size,structure:structure.stats,energy:energy.stats,industry:industry?.stats};
 }
 return {rotatingGroup,stationaryGroup,structure,energy,industry,stats,setEnvelopeVisible,get envelopeVisible(){return visible;},get distantInteriorHidden(){return distant;},update(mode,position){const envelope=setEnvelopeVisible(exteriorEnvelopeWanted(mode,position));const p=Array.isArray(position)?position:[position.x,position.y,position.z];setDistant(envelope&&Math.hypot(Math.hypot(p[0],p[1])-830,p[2])>250);return envelope;},dispose(){if(disposed)return;setEnvelopeVisible(false);setDistant(false);disposed=true;structure.dispose();energy.dispose();industry?.dispose();sun.removeFromParent();fill.removeFromParent();rotatingGroup.removeFromParent();stationaryGroup.removeFromParent();}};
}
