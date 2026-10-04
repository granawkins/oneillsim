import * as THREE from 'three';

// A reversible display palette, not a rewrite of saved source/spec colors.
// Atlas-based architecture/nature retains its authored colors and materials.
export function createSettlementLandscapePresentation(habitatGroup){
 const changes=[],remember=(material,color)=>{if(!material?.color)return;changes.push({material,color:material.color.clone()});material.color.set(color);};
 const ground=habitatGroup.getObjectByName('ground');remember(ground?.material,'#668750');
 for(const id of ['spoke-residential-a-platform','spoke-residential-b-platform','spoke-residential-c-platform','spoke-farm-a-platform','spoke-farm-b-platform','spoke-farm-c-platform']){
  const root=habitatGroup.children.find(o=>o.userData.assetId===id);const seen=new Set();root?.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if(!seen.has(m)){seen.add(m);remember(m,'#d1c8ad');}});
 }
 return {changedMaterials:changes.length,dispose(){for(const {material,color} of changes)material.color.copy(color);}};
}
