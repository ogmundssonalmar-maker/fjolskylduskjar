import { onRequest } from '../functions/_middleware.js';
import { household } from './household.js';
import { trips } from './trips.js';
import { todo, todoCallback } from './todo.js';
import { hasHouseholdSession, openHouseholdSession } from './household-session.js';

export async function serveWorker(request, env, assets = env.ASSETS) {
  const { pathname } = new URL(request.url);
  if (pathname === '/api/calendar' && request.method === 'GET') {
    return household(request, env);
  }
  if (pathname === '/api/household/session' && request.method === 'POST') {
    return openHouseholdSession(request, env.HOUSEHOLD_EDIT_CODE);
  }
  if (pathname === '/api/todo/callback') return todoCallback(request, env);
  const todoPath = pathname === '/api/todo' || pathname.startsWith('/api/todo/');
  const route = todoPath ? todo : pathname === '/api/trips' ? trips : household;
  if ((todoPath || ['/api/household', '/api/calendar/events', '/api/trips'].includes(pathname)) &&
      await hasHouseholdSession(request, env.HOUSEHOLD_EDIT_CODE)) {
    return route(request, env);
  }
  if (pathname === '/api' || pathname.startsWith('/api/')) {
    return onRequest({ request, env, next: () => route(request, env) });
  }
  return assets.fetch(request);
}

export default {
  fetch(request, env) {
    return serveWorker(request, env);
  },
};
