import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { onRequest } from '../functions/_middleware.js';

const team = 'family-test.cloudflareaccess.com';
const issuer = 'https://' + team;
const env = {
  ACCESS_TEAM_DOMAIN: team,
  ACCESS_AUDIENCES: 'production-audience, preview-audience',
  ACCESS_PARENT_EMAILS: 'first@example.com, second@example.com',
};

test('build serves only the page and applies Functions to every path', async () => {
  assert.deepEqual((await readdir('dist')).sort(), ['_routes.json', 'index.html']);
  assert.deepEqual(JSON.parse(await readFile('dist/_routes.json', 'utf8')), {
    version: 1, include: ['/*'], exclude: [],
  });
  const html = await readFile('dist/index.html', 'utf8');
  assert.match(html, /const school = \[[\s\S]*?2027-01-04/);
  assert.match(html, /const trips = \[.*2026-12-27.*2027-01-03.*2027-01-23.*2027-01-30/);
  assert.match(html, /const calendar = \[\{/);
  assert.ok(html.includes("let tasks=load('family-tasks-v2',[]);"));
});

test('Access requires a signed, current token for the app and an allowed parent', async (t) => {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const other = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);
  t.mock.method(globalThis, 'fetch', async (url) => {
    assert.equal(String(url), issuer + '/cdn-cgi/access/certs');
    return Response.json({ keys: [{ ...jwk, kid: 'test-key', alg: 'RS256' }] });
  });

  const sign = ({ email = 'first@example.com', audience = 'production-audience',
    tokenIssuer = issuer, expiration = '5m', key = privateKey } = {}) =>
    new SignJWT({ email }).setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(tokenIssuer).setAudience(audience).setIssuedAt()
      .setExpirationTime(expiration).sign(key);

  async function request(path, token, settings = env, useCookie = false) {
    const headers = {};
    if (token) {
      if (useCookie) headers.Cookie = 'other=1; CF_Authorization=' + token;
      else headers['Cf-Access-Jwt-Assertion'] = token;
    }
    headers['Cf-Access-Authenticated-User-Email'] = 'first@example.com';
    const response = await onRequest({
      request: new Request('https://example.com' + path, { headers }),
      env: settings,
      next: () => new Response('Verndað efni', { headers: { 'Cache-Control': 'public' } }),
    });
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
    assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, nofollow');
    return response.status;
  }

  for (const path of ['/', '/index.html', '/api/test']) {
    assert.equal(await request(path), 403);
  }
  assert.equal(await request('/', 'invalid'), 403);
  assert.equal(await request('/', await sign(), {}), 403);
  for (const claims of [
    { key: other.privateKey },
    { audience: 'other-audience' },
    { expiration: '1s ago' },
    { tokenIssuer: 'https://other.cloudflareaccess.com' },
    { email: 'someone@example.com' },
  ]) {
    assert.equal(await request('/', await sign(claims)), 403);
  }
  assert.equal(await request('/', await sign()), 200);
  assert.equal(await request('/', await sign(), { ...env, ACCESS_PARENT_EMAILS: '' }), 200);
  assert.equal(await request('/api/test', await sign(), env, true), 200);
  assert.equal(await request('/api/test', 'invalid', env, true), 403);
  assert.equal(await request('/index.html', await sign({
    email: 'second@example.com', audience: 'preview-audience',
  })), 200);
});
