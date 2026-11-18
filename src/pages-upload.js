import { household } from './household.js';

const encoder = new TextEncoder();
const privateHeaders = {
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "frame-ancestors 'none'; base-uri 'none'; object-src 'none'",
};

async function matches(request, password) {
  const match = /^Basic ([A-Za-z0-9+/=]+)$/i.exec(request.headers.get('Authorization') ?? '');
  if (!match) return false;

  let provided;
  try {
    provided = atob(match[1]);
  } catch {
    return false;
  }

  const [actual, expected] = await Promise.all([
    crypto.subtle.digest('SHA-256', Uint8Array.from(provided, character => character.charCodeAt(0))),
    crypto.subtle.digest('SHA-256', encoder.encode('heimili:' + password)),
  ]);
  const left = new Uint8Array(actual);
  const right = new Uint8Array(expected);
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  return difference === 0;
}

export default {
  async fetch(request, env) {
    if (!env.APP_PASSWORD) {
      return new Response('Heimilisskjárinn bíður uppsetningar lykilorðs.', {
        status: 503, headers: privateHeaders,
      });
    }
    if (!await matches(request, env.APP_PASSWORD)) {
      return new Response('Skráðu þig inn til að opna heimilisskjáinn.', {
        status: 401,
        headers: { ...privateHeaders, 'WWW-Authenticate': 'Basic realm="Heima hja okkur", charset="UTF-8"' },
      });
    }

    const { pathname } = new URL(request.url);
    if (pathname === '/api' || pathname.startsWith('/api/')) return household(request, env);

    const assetRequest = new Request(request);
    assetRequest.headers.delete('Authorization');
    const asset = await env.ASSETS.fetch(assetRequest);
    const response = new Response(asset.body, asset);
    for (const [key, value] of Object.entries(privateHeaders)) response.headers.set(key, value);
    return response;
  },
};
