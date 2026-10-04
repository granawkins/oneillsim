import {completedModels} from './completed-models.js';
import {interiorModelPlacements} from './model-placement-interior.js';
import {exteriorModelPlacements} from './model-placement-exterior.js';
export function completedModelPlacements(world){
 const rows=[...interiorModelPlacements(world),...exteriorModelPlacements()];
 if(rows.length!==completedModels.length||new Set(rows.map(p=>p.id)).size!==rows.length||new Set(rows.map(p=>p.type)).size!==rows.length)throw Error('Expected one unique placement for each completed model');
 for(const m of completedModels){const p=rows.find(p=>p.type===m.id);if(!p||p.id!=='completed-model-'+m.slug||p.scale!==4||![p.theta,p.z,p.rotation,p.surface?.height].every(Number.isFinite))throw Error('Invalid reviewed placement '+m.id);}
 return rows;
}
