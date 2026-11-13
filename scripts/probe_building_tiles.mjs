import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import { writeFile } from 'node:fs/promises';
const style = await (await fetch('https://tiles.openfreemap.org/styles/positron')).json();
const source = style.sources.openmaptiles;
const meta = source.url ? await (await fetch(source.url)).json() : source;
const results = [];
for (const [name, lon, lat] of [['sf', -122.416, 37.775], ['south-sf', -122.411, 37.654], ['sfo', -122.379, 37.621], ['santa-clara',-121.9552,37.3541], ['fremont',-121.9886,37.5485], ['oakland',-122.2712,37.8044], ['berkeley',-122.273,37.8715]]) {
  for (const z of [12, 13, 14]) {
    const x = Math.floor((lon + 180) / 360 * 2 ** z), y = Math.floor((1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * 2 ** z);
    const url = meta.tiles[0].replace('{z}', z).replace('{x}', x).replace('{y}', y);
    const response = await fetch(url), bytes = new Uint8Array(await response.arrayBuffer());
    const tile = new VectorTile(new PbfReader(bytes)), layer = tile.layers.building;
    const properties = layer ? Array.from({length:layer.length}, (_,i) => layer.feature(i).properties) : [];
    results.push({name,z,url,bytes:bytes.length,count:properties.length,positiveHeight:properties.filter(p=>p.render_height>0&&p.render_height<=1000).length,missingHeight:properties.filter(p=>!(p.render_height>0)).length,sample:properties.slice(0,2)});
  }
}
await writeFile('docs/verification/building-source-probe.json', JSON.stringify({source,metadata:meta,results},null,2));
console.log(JSON.stringify(results));
