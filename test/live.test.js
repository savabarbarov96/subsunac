const test = require('node:test');
const assert = require('node:assert/strict');

const LIVE_URL = process.env.LIVE_URL || 'https://subsunac.vercel.app';
const SKIP_LIVE = process.env.SKIP_LIVE_TESTS === '1';

test('live deployment returns manifest', { skip: SKIP_LIVE ? 'SKIP_LIVE_TESTS=1' : false }, async () => {
  const response = await fetch(`${LIVE_URL}/manifest.json`);
  assert.equal(response.status, 200);

  const manifest = await response.json();
  assert.equal(manifest.id, 'org.stremio.subsunacs');
  assert.ok(Array.isArray(manifest.resources));
});

test('live deployment returns subtitles with stable base URL', { skip: SKIP_LIVE ? 'SKIP_LIVE_TESTS=1' : false }, async () => {
  const response = await fetch(`${LIVE_URL}/subtitles/movie/tt0133093.json`);
  assert.equal(response.status, 200);

  const payload = await response.json();
  assert.ok(Array.isArray(payload.subtitles));
  assert.ok(payload.subtitles.length > 0);

  const first = payload.subtitles[0];
  assert.equal(typeof first.url, 'string');

  const url = new URL(first.url);
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.pathname, '/subtitles.vtt');

  const from = url.searchParams.get('from');
  assert.ok(from, 'expected a from= query parameter');

  const fromUrl = new URL(from);
  const liveHost = new URL(LIVE_URL).hostname;
  assert.equal(fromUrl.hostname, liveHost);

  // Verify the new URL pattern includes provider
  // Pattern: /subtitle/:provider/:id.srt
  // Note: yavka is disabled due to Cloudflare protection
  assert.match(fromUrl.pathname, /^\/subtitle\/(subsunacs|subsab)\/\d+\.srt$/);
});

test('live deployment returns subtitles with provider prefixes', { skip: SKIP_LIVE ? 'SKIP_LIVE_TESTS=1' : false }, async () => {
  const response = await fetch(`${LIVE_URL}/subtitles/movie/tt0133093.json`);
  assert.equal(response.status, 200);

  const payload = await response.json();
  assert.ok(Array.isArray(payload.subtitles));
  assert.ok(payload.subtitles.length > 0);

  // Check that subtitle titles have provider prefixes
  // Note: yavka is disabled due to Cloudflare protection
  const hasProviderPrefix = payload.subtitles.some(sub =>
    sub.title && (
      sub.title.startsWith('[Subsunacs]') ||
      sub.title.startsWith('[SubsSab]')
    )
  );
  assert.ok(hasProviderPrefix, 'At least one subtitle should have a provider prefix');
});

test('live deployment serves an SRT file from subsunacs', { skip: SKIP_LIVE ? 'SKIP_LIVE_TESTS=1' : false }, async () => {
  // Use the new URL pattern: /subtitle/:provider/:id.srt
  const response = await fetch(`${LIVE_URL}/subtitle/subsunacs/94087.srt`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /subrip/i);

  const text = await response.text();
  assert.match(text, /\d+\s*\n\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}/);
});

test('live deployment rejects invalid provider', { skip: SKIP_LIVE ? 'SKIP_LIVE_TESTS=1' : false }, async () => {
  const response = await fetch(`${LIVE_URL}/subtitle/invalidprovider/12345.srt`);
  assert.equal(response.status, 400);
});

test('live deployment rejects invalid subtitle ID', { skip: SKIP_LIVE ? 'SKIP_LIVE_TESTS=1' : false }, async () => {
  const response = await fetch(`${LIVE_URL}/subtitle/subsunacs/invalid.srt`);
  assert.equal(response.status, 400);
});

test('live health check returns providers list', { skip: SKIP_LIVE ? 'SKIP_LIVE_TESTS=1' : false }, async () => {
  const response = await fetch(`${LIVE_URL}/health`);
  assert.equal(response.status, 200);

  const data = await response.json();
  assert.equal(data.status, 'ok');
  assert.ok(Array.isArray(data.providers));
  assert.ok(data.providers.includes('subsunacs'));
  // Note: yavka is disabled due to Cloudflare protection
  assert.ok(data.providers.includes('subsab'));
});
