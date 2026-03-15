// Worker entrypoint — handles /api/* routes, passes everything else to static assets

import { onRequestGet as sessionGet, onRequestPost as sessionPost } from './api/session.js';
import { onRequestGet as healthGet } from './api/health.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Route /api/* to handlers
    if (url.pathname === '/api/health' && request.method === 'GET') {
      return healthGet({ request, env, ctx });
    }
    if (url.pathname === '/api/session') {
      if (request.method === 'GET') return sessionGet({ request, env, ctx });
      if (request.method === 'POST') return sessionPost({ request, env, ctx });
      return new Response('Method not allowed', { status: 405 });
    }

    // Everything else: pass to static assets
    return env.ASSETS.fetch(request);
  }
};
