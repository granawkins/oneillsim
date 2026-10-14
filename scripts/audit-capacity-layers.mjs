import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditFile} from './audit-settlement-capacity.mjs';
import {planCapacityFarmLayers} from '../src/capacity-farm-layers.js';
import {planCapacityResidentialLayers} from '../src/capacity-residential-layers.js';

export function auditCapacityLayers(root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')){
 const baseline=auditFile(root),world=JSON.parse(fs.readFileSync(path.join(root,'world.json')));
 const farms=planCapacityFarmLayers(world),residential=planCapacityResidentialLayers(world);
 return {worldSha256:baseline.worldSha256,savedRecordCount:baseline.recordCount,baseline,
  addedFarm:{summary:farms.summary,sourceBudgets:farms.sourceBudgets,existingMeasuredBedLedger:farms.existingBedLedger,conflicts:farms.conflicts},
  addedResidential:{summary:residential.summary,sourceBudgets:residential.sourceBudgets,deficits:residential.deficits,interiorFloorLedger:residential.floorLedger,classifiedPublicOpenMasks:residential.publicSpaceMasks,limitations:residential.limitations},
  verdict:{fullSourceCompliance:false,occupancyCertified:false,definition:'New measured interior floors and net crop-bed masks are distinct from baseline manifest allocations and projected reservations. Do not add incomparable area definitions or credit support slabs twice.',remaining:['Baseline housing net interiors remain unverified.','Agricultural animal/processing/drying/water areas remain incompletely quantified.','Source printed surface totals disagree; discrepancies remain explicit.','Full-scene stairs, ground openings, headroom and visual QA are separate runtime acceptance checks.']}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(auditCapacityLayers(process.argv[2]),null,2));
