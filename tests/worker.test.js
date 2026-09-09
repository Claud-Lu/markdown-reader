import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { fetchDocument, publicConfig, analyticsPayload } from '../worker.js';
const source = 'https://raw.githubusercontent.com/example/docs/main/README.md';

test('proxy follows only allowed redirects and reports final source for relative assets', async () => {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    return calls.length === 1 ? new Response(null, { status: 302, headers: { location: '/example/docs/main/docs/readme.md' } }) : new Response('# Document');
  };
  const result = await fetchDocument(source, {}, fetcher);
  assert.equal(result.sourceUrl, 'https://raw.githubusercontent.com/example/docs/main/docs/readme.md');
  assert.equal(result.markdown, '# Document');
  assert.equal(calls[0].options.redirect, 'manual');
  assert.equal(calls[0].options.headers.Cookie, undefined);
});
test('proxy blocks unlisted origins and rechecks redirected targets', async () => {
  let calls = 0;
  const fetcher = async () => { calls++; return new Response(null, { status: 302, headers: { location: 'https://unlisted.example.com/a.md' } }); };
  await assert.rejects(fetchDocument('https://unlisted.example.com/a.md', {}, fetcher), error => error.code === 'proxy_denied');
  assert.equal(calls, 0);
  await assert.rejects(fetchDocument(source, {}, fetcher), error => error.code === 'proxy_denied');
  assert.equal(calls, 1);
});
test('redirected private IPs are rejected before making a second request', async () => {
  let calls = 0;
  await assert.rejects(fetchDocument(source, {}, async () => { calls++; return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/secret' } }); }), error => error.code === 'invalid_url');
  assert.equal(calls, 1);
});
test('proxy has a finite redirect limit and rejects HTML/error responses', async () => {
  let calls = 0;
  await assert.rejects(fetchDocument(source, {}, async () => { calls++; return new Response(null, { status: 302, headers: { location: source } }); }), /跳转次数/);
  assert.equal(calls, 5);
  await assert.rejects(fetchDocument(source, {}, async () => new Response('<html>Login</html>', { headers: { 'content-type': 'text/html' } })), error => error.code === 'unsupported_type');
  await assert.rejects(fetchDocument(source, {}, async () => new Response('private details', { status: 404 })), error => error.status === 502 && !error.message.includes('private details'));
});
test('public config keeps integrations disabled by default and never exposes internal endpoints', () => {
  assert.deepEqual(publicConfig({}), { analyticsEnabled: false, feedbackUrl: '' });
  const config = publicConfig({ ANALYTICS_ENABLED: 'true', ANALYTICS_ENDPOINT: 'https://metrics.example.com/ingest', ANALYTICS_PROJECT: 'private-project', SECRET_TOKEN: 'not-a-real-secret' });
  assert.equal(config.analyticsEnabled, true);
  assert.equal(JSON.stringify(config).includes('private-project'), false);
  assert.equal(JSON.stringify(config).includes('metrics.example.com'), false);
});
test('analytics only forwards allowed events and strips titles, query strings, documents and private metadata', () => {
  const request = new Request('https://reader.example.com/api/analytics?private=removed', { headers: { 'user-agent': 'Browser' } });
  const input = { type: 'custom', name: 'read_success', visitorId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', sessionId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', source: 'file', referrer: 'https://docs.example.com/private?token=removed', url: 'https://example.com/secret', title: 'Sensitive title', text: 'Sensitive body', metadata: { token: 'Sensitive token' } };
  const payload = analyticsPayload(input, request, { ANALYTICS_PROJECT: 'example' });
  assert.equal(payload.url, 'https://reader.example.com/'); assert.equal(payload.path, '/');
  assert.equal(payload.referrer, 'https://docs.example.com');
  assert.deepEqual(payload.metadata, { source: 'file' }); assert.doesNotMatch(JSON.stringify(payload), /Sensitive|token|private|secret/);
  assert.equal(analyticsPayload({ ...input, name: 'free-form-secret' }, request, {}), null);
});
test('same-origin checks protect analytics, and disabled deployments send nothing', async () => {
  const request = new Request('https://reader.example.com/api/analytics', { method: 'POST', headers: { Origin: 'https://reader.example.com' }, body: '{}' });
  assert.equal((await worker.fetch(request, {}, {})).status, 204);
  const foreign = new Request('https://reader.example.com/api/analytics', { method: 'POST', headers: { Origin: 'https://other.example.com' }, body: '{}' });
  assert.equal((await worker.fetch(foreign, {}, {})).status, 403);
});
test('health version, routes, security headers and HTML cache control are explicit', async () => {
  const health = await worker.fetch(new Request('https://reader.example.com/health'), {}, {});
  assert.equal((await health.json()).version, '2.0.0');
  assert.equal((await worker.fetch(new Request('https://reader.example.com/api/missing'), {}, {})).status, 404);
  const response = await worker.fetch(new Request('https://reader.example.com/'), { ASSETS: { fetch: async () => new Response('<html></html>', { headers: { 'content-type': 'text/html' } }) } }, {});
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.get('cache-control'), 'no-cache');
  assert.match(response.headers.get('content-security-policy'), /script-src 'self'/);
});

test('proxy aborts the upstream fetch when its total timeout expires', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  let signal;
  const pending = fetchDocument(source, {}, async (_url, options) => {
    signal = options.signal;
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }));
  });
  const rejected = assert.rejects(pending, error => error.code === 'timeout' && error.status === 504);
  context.mock.timers.tick(12_001);
  await rejected;
  assert.equal(signal.aborted, true);
});
