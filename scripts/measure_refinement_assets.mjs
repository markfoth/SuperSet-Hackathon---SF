import {readdir,readFile,stat,writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
const assets=[];
for(const name of await readdir('dist/assets')){
 const data=await readFile(`dist/assets/${name}`);assets.push({name,bytes:data.length,gzipBytes:gzipSync(data).length});
}
const files=['incident_details.json','crash_details.json','neighbourhood_character.geojson','topography.png','cafes.geojson','restaurants.geojson','nightlife_venues.geojson','groceries.geojson'];
const optionalData=[];
for(const name of files){const data=await readFile(`data/sf/processed/${name}`);optionalData.push({name,bytes:data.length,gzipBytes:gzipSync(data).length});}
let staticDataBytes=0;
async function size(folder){for(const entry of await readdir(folder,{withFileTypes:true})){if(entry.isDirectory())await size(`${folder}/${entry.name}`);else staticDataBytes+=(await stat(`${folder}/${entry.name}`)).size;}}
await size('dist/data');
await writeFile('docs/audit/desktop-refinement/asset-sizes.json',JSON.stringify({assets,optionalData,staticDataBytes},null,2));
console.log(JSON.stringify({main:assets.filter(x=>/^index.*\.js$/.test(x.name)),optionalData,staticDataBytes}));
