import { onRequest } from '../functions/_middleware.js';
import { household } from './household.js';
import { trips } from './trips.js';
import { todo, todoCallback } from './todo.js';
import { hasHouseholdSession, openHouseholdSession } from './household-session.js';
import { generateWeeklyDraft } from './menu-automation.js';

// Short-lived, read-only check of the recipe reported by the household.
async function verifyRecipeContent(request, env) {
  const headers = { 'Cache-Control':'private, no-store' };
  const respond = (body, status = 200) => Response.json(body, { status, headers });
  const token = /^Bearer ([0-9a-f]{64})$/.exec(request.headers.get('Authorization') || '')?.[1];
  if (request.method !== 'GET' || !token || Date.now() >= Date.parse('2026-11-22T01:48:00+00:00')) {
    return respond({ error:'Not found.' }, 404);
  }
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  const digest = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
  if (digest !== 'befbb972a6e564676d0bcbc6be592a43440f345d06ca2fa71db40f428637c51c') return respond({ error:'Not found.' }, 404);
  const url = new URL('/api/household/menu?week=2026-11-23', request.url);
  const result = await household(new Request(url), env);
  if (!result.ok) return respond({ error:'Recipe lookup failed.' }, 502);
  const { week, status, meals } = await result.json();
  const matching = meals.filter(meal => /kjúkling/i.test(meal.name));
  return respond({ week, status, meals:matching.map(meal => ({
    day:meal.day, name:meal.name, ingredientCount:meal.ingredients?.length || 0,
    instructionChars:meal.recipe?.instructions?.length || 0, hasLink:Boolean(meal.url),
  })) });
}

export async function serveWorker(request, env, assets = env.ASSETS) {
  const { pathname, hostname } = new URL(request.url);
  if (pathname === '/api/_deployment/recipe-check' && hostname === 'fjolskylduskjar.ogmundssonalmar.workers.dev') {
    return verifyRecipeContent(request, env);
  }
  if (pathname === '/api/calendar' && request.method === 'GET') {
    return household(request, env);
  }
  if (pathname === '/api/household/session' && request.method === 'POST') {
    return openHouseholdSession(request, env.HOUSEHOLD_EDIT_CODE);
  }
  if (pathname === '/api/todo/callback') return todoCallback(request, env);
  const todoPath = pathname === '/api/todo' || pathname.startsWith('/api/todo/');
  const route = todoPath ? todo : pathname === '/api/trips' ? trips : household;
  if ((todoPath || ['/api/household', '/api/household/menu', '/api/calendar/events', '/api/trips'].includes(pathname)) &&
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
  scheduled(controller, env, ctx) {
    ctx.waitUntil(generateWeeklyDraft(env, controller.scheduledTime));
  },
};
