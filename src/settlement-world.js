import fs from 'node:fs/promises';
import {buildNeighborhoods} from './settlement-neighborhoods.js';
import {buildResidentialA} from './settlement-residential-a.js';
import {buildFarms,farmAssets} from './settlement-farms.js';
import crypto from 'node:crypto';
const settlementBaselineSha='98b71f7a70b06603dc080287c3025ca95242be1f64c5f4f463837b7020fb2591';
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');

// Immutable source makes composition independent of later user saves. Runtime
// consumes only the persisted design routes; this module is a build/QA tool.
export async function buildSettlementPlan(){
 const bytes=await fs.readFile(new URL('../assets/settlement-source-world.json',import.meta.url));
 if(digest(bytes)!==settlementBaselineSha)throw Error('Settlement source fixture changed');
 const baseline=JSON.parse(bytes),parts=[buildResidentialA(baseline),buildNeighborhoods(baseline),buildFarms(baseline)];
 const additions=parts.flatMap(p=>p.additions),replacements=parts.flatMap(p=>p.replacements),routes=parts.flatMap(p=>p.routes),landmarks=parts.flatMap(p=>p.landmarks).map(p=>({...p,theta:p.position?.[0]??p.theta,z:p.position?.[1]??p.z,height:p.position?.[2]??0,eyeHeight:1.65,yaw:p.yaw??-90,pitch:p.pitch??0}));
 if(new Set([...additions,...replacements].map(p=>p.id)).size!==additions.length+replacements.length)throw Error('Duplicated composed ID');
 // Explicit per-placement policy: low decorative foliage is nonblocking.
 // Trees, rocks, planters, furniture, buildings and farm equipment stay solid.
 const decorativeFoliage=new Set(['TorusNature_FlowersA','TorusNature_ShrubA','TorusNature_GrassA']);
 for(const p of additions)if(decorativeFoliage.has(p.type))p.surface={...p.surface,collisionMode:'none'};
 const inventory={};for(const p of additions)inventory[p.type]=(inventory[p.type]||0)+1;
 const metadata={version:1,name:'Gardens of the Stanford Torus',baselineSha256:settlementBaselineSha,interpretation:'Source-informed authored landscape and settlement composition; static systems and approximate represented capacity, not a fully engineered 10,000-person habitat.',sources:['sp413-s02237','sp413-s02259','sp413-s02284','sp413-s02262','sp413-s02265','sp413-s02268','sp413-s02276','sp413-s02373'],routes,landmarks,inventory,summaries:parts.map(p=>p.summary),added:additions.length,replaced:replacements.length,baselineRecords:baseline.assets.length,newFarmVariants:farmAssets.length};
 return {additions,replacements,metadata};
}
