import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../src/pages-upload.js';

test('Pages requires the shared password for the dashboard and API', async () => {
  const password = 'test-only-long-password';
  const options = { APP_PASSWORD: password, ASSETS: {
    fetch: request => {
      assert.equal(request.headers.has('Authorization'), false);
      return new Response('Dashboard');
    },
  } };
  const request = (path, credential) => new Request('https://example.pages.dev' + path, {
    headers: credential ? { Authorization: 'Basic ' + btoa(credential) } : {},
  });
  for (const path of ['/', '/index.html', '/api/calendar', '/api/household']) {
    assert.equal((await worker.fetch(request(path), options)).status, 401);
    assert.equal((await worker.fetch(request(path, 'heimili:wrong'), options)).status, 401);
    assert.equal((await worker.fetch(request(path, 'heimili:' + password), {})).status, 503);
  }
  const authorized = request('/', 'heimili:' + password);
  const dashboard = await worker.fetch(authorized, options);
  assert.equal(dashboard.status, 200);
  assert.equal(dashboard.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(await dashboard.text(), 'Dashboard');
  const calendar = await worker.fetch(request('/api/calendar', 'heimili:' + password), options);
  assert.deepEqual(await calendar.json(), { connected: false, events: [] });
});
