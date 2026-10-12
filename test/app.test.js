const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../lib/app');
const { rar } = require('./fixtures/archives');
const { requestInMemory } = require('./fixtures/http');
const srt = '1\n00:00:01,000 --> 00:00:03,000\nЗдравей\n';

async function withApp(t, overrides = {}) {
  const app = createApp({
    getIMDBInfo: async () => ({title: 'Fixture', year: 2008}),
    searchAllProviders: async () => [{provider: 'subsab', providerName: 'SubsSab', id: '123', title: 'Fixture'}],
    downloadSubtitle: async () => rar({'show.S01E02.srt': srt}),
    ...overrides
  });
  return (url, options) => requestInMemory(app, url, options);
}
test('serves extracted SRT through the real Express route', async t => {
  const request = await withApp(t);
  const response = await request(`/subtitle/subsab/123.srt?season=1&episode=2`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /subrip/);
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  assert.equal(await response.text(), srt);
});
test('HTML upstream body returns 502, never 200', async t => {
  const request = await withApp(t, {downloadSubtitle: async () => Buffer.from('<html>Error</html>')});
  assert.equal((await request(`/subtitle/subsab/123.srt`)).status, 502);
});
test('validates provider, ID, and episode parameters', async t => {
  const request = await withApp(t);
  for (const path of ['invalid/123.srt', 'constructor/123.srt', '__proto__/123.srt', 'subsunacs/bad.srt', 'subsab/123.srt?season=1', 'subsab/123.srt?season=1&episode=x']) {
    assert.equal((await request(`/subtitle/${path}`)).status, 400);
  }
});
test('request-scoped URLs survive concurrent requests with different hosts', async t => {
  let resolveFirst;
  const firstWaiting = new Promise(resolve => {resolveFirst = resolve});
  let markEntered;
  const entered = new Promise(resolve => {markEntered = resolve});
  const request = await withApp(t, {getIMDBInfo: async id => {
    if (id === 'tt0133093') {markEntered(); await firstWaiting;}
    return {title: 'Fixture', year: 2008};
  }});
  const first = request(`/subtitles/movie/tt0133093.json`, {headers: {host: 'production.example'}});
  await entered;
  const second = await request(`/subtitles/series/tt0903747:1:2.json`, {headers: {host: 'preview.example'}});
  const secondPayload = await second.json();
  resolveFirst();
  const firstPayload = await (await first).json();
  assert.equal(new URL(firstPayload.subtitles[0].url).hostname, 'production.example');
  const episodeUrl = new URL(secondPayload.subtitles[0].url);
  assert.equal(episodeUrl.hostname, 'preview.example');
  assert.equal(episodeUrl.searchParams.get('episode'), '2');
});
test('manifest and health preserve addon identity and expose the release version', async t => {
  const request = await withApp(t);
  const manifest = await (await request(`/manifest.json`)).json();
  assert.equal(manifest.id, 'org.stremio.subsunacs');
  assert.equal(manifest.version, '2.0.1');
  assert.equal((await (await request(`/health`)).json()).version, manifest.version);
});

test('CORS preflight succeeds without downloading a subtitle', async t => {
  const request = await withApp(t, {downloadSubtitle: async () => {throw new Error('Should not download');}});
  const response = await request('/subtitle/subsab/123.srt', {method: 'OPTIONS'});
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
});

test('installation page displays the same version as the manifest', async t => {
  const request = await withApp(t);
  const response = await request('/');
  assert.equal(response.status, 200);
  assert.match(await response.text(), /v2\.0\.1/);
});
