import { createHash } from 'node:crypto';
import { getCache } from '@vercel/functions';
import { createRoutingService } from '../server/routing-core.mjs';

const runtimeCache = getCache({ namespace: 'common-ground-sf:isochrone:v1',
  keyHashFunction: (key) => createHash('sha256').update(key).digest('hex') });
const routing = createRoutingService({ cache: {
  get: (key) => runtimeCache.get(key),
  set: (key, value) => runtimeCache.set(key, value, { ttl: 86400, name: 'inbound commute area' }),
} });

export default {
  async fetch(request) {
    const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
    if (request.method !== 'POST') return Response.json({ error: 'method not allowed' }, { status: 405, headers: { ...headers, Allow: 'POST' } });
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) return Response.json({ error: 'cross-origin routing is not allowed' }, { status: 403, headers });
    if (Number(request.headers.get('content-length') || 0) > 10000) return Response.json({ error: 'body too large' }, { status: 413, headers });
    let body;
    try {
      const raw = await request.text();
      if (raw.length > 10000) return Response.json({ error: 'body too large' }, { status: 413, headers });
      body = JSON.parse(raw);
    } catch { return Response.json({ error: 'invalid JSON' }, { status: 400, headers }); }
    const result = await routing.run(body);
    return Response.json(result.body, { status: result.status, headers });
  },
};
