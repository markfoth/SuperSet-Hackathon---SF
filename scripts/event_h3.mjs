// Exact offline H3 indexing without native Python extensions; no browser payload.
import { latLngToCell, cellToBoundary, cellArea, UNITS } from 'h3-js';
let text = '';
for await (const chunk of process.stdin) text += chunk;
const points = JSON.parse(text);
const cells = points.map(([x, y]) => latLngToCell(y, x, 8));
const boundaries = Object.fromEntries([...new Set(cells)].map((id) => [id, cellToBoundary(id, true)]));
const areas = Object.fromEntries([...new Set(cells)].map((id) => [id, cellArea(id, UNITS.km2)]));
process.stdout.write(JSON.stringify({ cells, boundaries, areas }));
