/** Small configuration check. Never returns credentials, locations or provider responses. */
export default {
  async fetch(request) {
    const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
    if (request.method !== 'GET') return Response.json({ error: 'method not allowed' }, { status: 405, headers: { ...headers, Allow: 'GET' } });
    return Response.json({ service: 'common-ground-routing', configured: Boolean(process.env.TRAVELTIME_APP_ID && process.env.TRAVELTIME_API_KEY),
      dryRun: process.env.ROUTING_DRY_RUN === '1', cacheAllowed: process.env.ROUTING_CACHE_ALLOWED === '1',
      usage: 'TravelTime Basic: research, development and evaluation only' }, { headers });
  },
};
