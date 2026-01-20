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
});

test('live deployment serves an SRT file', { skip: SKIP_LIVE ? 'SKIP_LIVE_TESTS=1' : false }, async () => {
  const response = await fetch(`${LIVE_URL}/subtitle/94087.srt`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /subrip/i);

  const text = await response.text();
  assert.match(text, /\d+\s*\n\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}/);
});
