const test = require('node:test');
const assert = require('node:assert/strict');
const { liveFetch } = require('./fixtures/live-fetch');

const LIVE_URL = process.env.LIVE_URL || 'https://subsunac.vercel.app';
const SKIP_LIVE = process.env.RUN_LIVE_TESTS !== '1' || process.env.SKIP_LIVE_TESTS === '1';
const scenarios = [
  ['The Matrix', 'movie', 'tt0133093'],
  ['Breaking Bad S01E01', 'series', 'tt0903747:1:1'],
  ['Breaking Bad S01E02', 'series', 'tt0903747:1:2']
];

for (const [title, type, id] of scenarios) {
  test(`live returned subtitle files: ${title}`, { skip: SKIP_LIVE }, async (t) => {
    const listing = await liveFetch(`${LIVE_URL}/subtitles/${type}/${id}.json`, { signal: AbortSignal.timeout(55000) });
    assert.equal(listing.status, 200);
    const payload = await listing.json();
    assert.ok(payload.subtitles?.length > 0, 'Expected available subtitles');
    console.log(JSON.stringify({ scenario: title, count: payload.subtitles.length, providers: [...new Set(payload.subtitles.map(s => s.id.split('-')[0]))] }));
    for (const provider of ['subsunacs', 'subsab']) {
      const candidates = payload.subtitles.filter(s => s.id.startsWith(`${provider}-`)).slice(0, 2);
      assert.ok(candidates.length > 0, `Expected a result from ${provider}`);
      for (const subtitle of candidates) {
        await t.test(`${provider}: ${subtitle.id}`, async () => {
          const response = await liveFetch(subtitle.url, { signal: AbortSignal.timeout(35000) });
          const bytes = Buffer.from(await response.arrayBuffer());
          const text = bytes.toString('utf8');
          const validSrt = /\d+\s*\r?\n\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}/.test(text);
          const html = /<!doctype\s+html|<html|<body/i.test(text);
          console.log(JSON.stringify({ scenario: title, provider, id: subtitle.id, label: subtitle.title, url: subtitle.url, status: response.status, contentType: response.headers.get('content-type'), bytes: bytes.length, validSrt, html, signature: bytes.subarray(0, 12).toString('hex') }));
          assert.equal(response.status, 200);
          assert.match(response.headers.get('content-type') || '', /subrip/i);
          assert.ok(validSrt, 'Downloaded file must contain SRT subtitle cues');
          assert.equal(html, false, 'Downloaded subtitle must not contain an HTML page');
          assert.match(text, /[\u0400-\u04ff]/, 'Expected Bulgarian Cyrillic text');
          assert.equal(text.includes('\uFFFD'), false, 'Expected valid UTF-8 subtitle text');
        });
      }
    }
  });
}
