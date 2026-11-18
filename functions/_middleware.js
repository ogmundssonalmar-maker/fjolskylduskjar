import { createRemoteJWKSet, jwtVerify } from 'jose';

const keySets = new Map();

function privateHeaders() {
  return new Headers({
    'Cache-Control': 'private, no-store',
    'X-Robots-Tag': 'noindex, nofollow',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "frame-ancestors 'none'; base-uri 'none'; object-src 'none'",
  });
}

export async function onRequest({ request, env, next }) {
  const headers = privateHeaders();
  const denied = () => new Response('Aðgangur óheimill.', { status: 403, headers });
  const cookieToken = request.headers.get('Cookie')?.match(/(?:^|;\s*)CF_Authorization=([^;]+)/)?.[1];
  const token = request.headers.get('Cf-Access-Jwt-Assertion') || cookieToken;
  const reject = reason => {
    console.warn('Cloudflare Access:', reason);
    return denied();
  };
  const team = env.ACCESS_TEAM_DOMAIN;
  const audiences = (env.ACCESS_AUDIENCES ?? '').split(',').map(value => value.trim()).filter(Boolean);
  const parents = (env.ACCESS_PARENT_EMAILS ?? '').toLowerCase().split(',').map(value => value.trim()).filter(Boolean);

  if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(team ?? '') || !audiences.length) {
    return reject('configuration missing or invalid');
  }
  if (!token) return reject('token missing');

  const issuer = 'https://' + team;
  if (!keySets.has(issuer)) {
    keySets.set(issuer, createRemoteJWKSet(new URL('/cdn-cgi/access/certs', issuer)));
  }

  try {
    const { payload } = await jwtVerify(token, keySets.get(issuer), {
      issuer,
      audience: audiences,
      algorithms: ['RS256'],
      requiredClaims: ['exp', 'email'],
    });
    if (typeof payload.email !== 'string' || (parents.length > 0 && !parents.includes(payload.email.toLowerCase()))) {
      return reject('email not allowed');
    }
  } catch (error) {
    const reason = error?.code === 'ERR_JWT_CLAIM_VALIDATION_FAILED' ? error.claim : error?.code;
    return reject(reason || 'verification failed');
  }

  const response = await next();
  const protectedResponse = new Response(response.body, response);
  headers.forEach((value, name) => protectedResponse.headers.set(name, value));
  return protectedResponse;
}
