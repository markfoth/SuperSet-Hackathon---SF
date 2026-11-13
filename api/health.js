import { routingConfiguration } from '../server/routing-core.mjs';
/** Small configuration check. Never returns credentials, locations or provider responses. */
export default {
  async fetch(request) {
    const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
    if (request.method !== 'GET') return Response.json({ error: 'method not allowed' }, { status: 405, headers: { ...headers, Allow: 'GET' } });
    return Response.json({ service: 'common-ground-routing', ...routingConfiguration(),
      usage: 'TravelTime Basic: research, development and evaluation only' }, { headers });
  },
};
