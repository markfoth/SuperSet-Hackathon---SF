import{readdirSync,statSync,readFileSync,writeFileSync}from'node:fs';
import{join,relative}from'node:path';
import{gzipSync}from'node:zlib';
const files=folder=>readdirSync(folder,{withFileTypes:true}).flatMap(f=>f.isDirectory()?files(join(folder,f.name)):[join(folder,f.name)]);
function measure(folder){
 const all=files(folder),data=all.filter(f=>relative(folder,f).startsWith('data'));
 return{dataBytes:data.reduce((n,f)=>n+statSync(f).size,0),dataFiles:data.length,
 assets:all.filter(f=>/assets[\\/]/.test(f)).map(f=>({file:relative(folder,f),bytes:statSync(f).size,gzipBytes:gzipSync(readFileSync(f)).length})),
 largestData:data.map(f=>({file:relative(folder,f),bytes:statSync(f).size})).sort((a,b)=>b.bytes-a.bytes).slice(0,12)};
}
const result={beforeCommit:'ecfd5ae9eafd499f8137ea1aa40dffc7eae41fc9',before:measure('data/cache/baseline-checkout/dist'),after:measure('dist')};
writeFileSync('docs/verification/asset-sizes.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({beforeData:result.before.dataBytes,afterData:result.after.dataBytes,assets:result.after.assets}));
