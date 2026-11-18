import { onRequest } from '../functions/_middleware.js';
import { household } from './household.js';

export default {
  fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/calendar' && request.method === 'GET') {
      return household(request, env);
    }
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      return onRequest({ request, env, next: () => household(request, env) });
    }
    return env.ASSETS.fetch(request);
  },
};
