const cookieName = 'fjolskylduskjar_edit';
const lifetime = 90 * 24 * 60 * 60;
const encode = new TextEncoder();

function cookieValue(request) {
  return request.headers.get('Cookie')?.split(';').map(value => value.trim())
    .find(value => value.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
}

function signingKey(secret) {
  return crypto.subtle.importKey('raw', encode.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

const hex = bytes => Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, '0')).join('');

function reply(body, status, cookie) {
  const headers = new Headers({ 'Cache-Control': 'private, no-store' });
  if (cookie) headers.set('Set-Cookie', cookie);
  return Response.json(body, { status, headers });
}

export async function openHouseholdSession(request, secret) {
  if (request.headers.get('Origin') !== new URL(request.url).origin ||
      request.headers.get('Content-Type')?.split(';')[0] !== 'application/json') {
    return reply({ error: 'Beiðni óheimil.' }, 403);
  }
  if (!secret || secret.length < 12) {
    return reply({ error: 'Breytingakóði hefur ekki verið stilltur.' }, 503);
  }

  let code;
  try {
    ({ code } = await request.json());
  } catch {
    return reply({ error: 'Ógild beiðni.' }, 400);
  }
  if (typeof code !== 'string' || code.length > 256 || !code) {
    return reply({ error: 'Rangur breytingakóði.' }, 403);
  }
  const key = await signingKey(secret);
  const candidate = await crypto.subtle.sign('HMAC', await signingKey(code), encode.encode('household sign-in'));
  if (!await crypto.subtle.verify('HMAC', key, candidate, encode.encode('household sign-in'))) {
    return reply({ error: 'Rangur breytingakóði.' }, 403);
  }

  const expires = Math.floor(Date.now() / 1000) + lifetime;
  const proof = hex(await crypto.subtle.sign('HMAC', key, encode.encode('household session:' + expires)));
  const cookie = `${cookieName}=${expires}.${proof}; Path=/api; Max-Age=${lifetime}; Secure; HttpOnly; SameSite=Strict`;
  return reply({ authorized: true }, 200, cookie);
}

export async function hasHouseholdSession(request, secret) {
  if (!secret || secret.length < 12) return false;
  const match = /^(\d{10,12})\.([a-f0-9]{64})$/.exec(cookieValue(request) || '');
  if (!match || Number(match[1]) <= Math.floor(Date.now() / 1000)) return false;
  const proof = Uint8Array.from(match[2].match(/../g), byte => parseInt(byte, 16));
  return crypto.subtle.verify('HMAC', await signingKey(secret), proof, encode.encode('household session:' + match[1]));
}
