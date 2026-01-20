const test = require('node:test');
const assert = require('node:assert/strict');
const subsab = require('../../lib/providers/subsab');

const SKIP_LIVE = process.env.SKIP_LIVE_TESTS === '1';

test('subsab provider exports correct constants', () => {
  assert.equal(subsab.PROVIDER, 'subsab');
  assert.equal(subsab.PROVIDER_NAME, 'SubsSab');
  assert.equal(subsab.BASE_URL, 'http://subs.sab.bz');
});

test('subsab search function exists', () => {
  assert.equal(typeof subsab.search, 'function');
});

test('subsab getDownloadUrl returns correct URL', () => {
  const url = subsab.getDownloadUrl('12345');
  assert.equal(url, 'http://subs.sab.bz/index.php?act=download&id=12345');
});

test('subsab downloadSubtitle function exists', () => {
  assert.equal(typeof subsab.downloadSubtitle, 'function');
});

test('subsab search returns empty array for empty title', async () => {
  const results = await subsab.search('');
  assert.deepEqual(results, []);
});

test('subsab search returns empty array for whitespace title', async () => {
  const results = await subsab.search('   ');
  assert.deepEqual(results, []);
});

test('subsab live search returns results for popular movie', { skip: SKIP_LIVE ? 'SKIP_LIVE_TESTS=1' : false }, async () => {
  const results = await subsab.search('The Matrix', 1999, null, null, 'tt0133093');

  assert.ok(Array.isArray(results), 'Results should be an array');
  // Note: SubsSab may or may not have results
  if (results.length > 0) {
    const first = results[0];
    assert.equal(first.provider, 'subsab');
    assert.equal(first.providerName, 'SubsSab');
    assert.ok(first.id, 'Should have an id');
    assert.ok(first.title, 'Should have a title');
  }
});

test('subsab live search for series returns results', { skip: SKIP_LIVE ? 'SKIP_LIVE_TESTS=1' : false }, async () => {
  const results = await subsab.search('Breaking Bad', 2008, 1, 1, 'tt0903747');

  assert.ok(Array.isArray(results), 'Results should be an array');
  if (results.length > 0) {
    const first = results[0];
    assert.equal(first.provider, 'subsab');
    assert.equal(first.providerName, 'SubsSab');
  }
});
