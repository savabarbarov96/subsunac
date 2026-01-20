const test = require('node:test');
const assert = require('node:assert/strict');
const yavka = require('../../lib/providers/yavka');

const SKIP_LIVE = process.env.SKIP_LIVE_TESTS === '1';

test('yavka provider exports correct constants', () => {
  assert.equal(yavka.PROVIDER, 'yavka');
  assert.equal(yavka.PROVIDER_NAME, 'Yavka');
  assert.equal(yavka.BASE_URL, 'https://yavka.net');
});

test('yavka search function exists', () => {
  assert.equal(typeof yavka.search, 'function');
});

test('yavka getDownloadUrl returns correct URL', () => {
  const url = yavka.getDownloadUrl('12345');
  assert.equal(url, 'https://yavka.net/subtitles/12345');
});

test('yavka downloadSubtitle function exists', () => {
  assert.equal(typeof yavka.downloadSubtitle, 'function');
});

test('yavka search returns empty array for empty title', async () => {
  const results = await yavka.search('');
  assert.deepEqual(results, []);
});

test('yavka search returns empty array for whitespace title', async () => {
  const results = await yavka.search('   ');
  assert.deepEqual(results, []);
});

test('yavka live search returns results for popular movie', { skip: SKIP_LIVE ? 'SKIP_LIVE_TESTS=1' : false }, async () => {
  const results = await yavka.search('The Matrix', 1999, null, null, 'tt0133093');

  assert.ok(Array.isArray(results), 'Results should be an array');
  // Note: Yavka may or may not have results
  if (results.length > 0) {
    const first = results[0];
    assert.equal(first.provider, 'yavka');
    assert.equal(first.providerName, 'Yavka');
    assert.ok(first.id, 'Should have an id');
    assert.ok(first.title, 'Should have a title');
  }
});

test('yavka live search for series returns results', { skip: SKIP_LIVE ? 'SKIP_LIVE_TESTS=1' : false }, async () => {
  const results = await yavka.search('Game of Thrones', 2011, 1, 1, 'tt0944947');

  assert.ok(Array.isArray(results), 'Results should be an array');
  if (results.length > 0) {
    const first = results[0];
    assert.equal(first.provider, 'yavka');
    assert.equal(first.providerName, 'Yavka');
  }
});
