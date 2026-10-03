import {readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {blocks,radius} from '../src/residential-plan.js';
const input=process.argv[2] || 'world.json';
const world=JSON.parse(readFileSync(input,'utf8'));
copyFileSync('world.json',`/tmp/oneillsim-world-before-residential-${Date.now()}.json`);
// Replace only district A (0–60°); leave the other five segments untouched.
world.assets=world.assets.filter(a=>a[2]<0 || a[2]>=Math.PI/3);
let type=world.assetTypes.indexOf('ResidentialBlockout');
if(type<0) type=world.assetTypes.push('ResidentialBlockout')-1;
for(const block of blocks) world.assets.push([block.id,type,block.x/radius,block.z,1,0,block]);
writeFileSync('world.json',JSON.stringify(world));
console.log(`Populated district A with ${blocks.length} blockout objects.`);
