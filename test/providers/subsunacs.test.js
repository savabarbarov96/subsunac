const test = require('node:test');
const assert = require('node:assert/strict');
const subsunacs = require('../../lib/providers/subsunacs');

const SKIP_LIVE = process.env.SKIP_LIVE_TESTS === '1';

test('subsunacs provider exports correct constants', () => {
  assert.equal(subsunacs.PROVIDER, 'subsunacs');
  assert.equal(subsunacs.PROVIDER_NAME, 'Subsunacs');
  assert.equal(subsunacs.BASE_URL, 'https://subsunacs.net');
});

test('subsunacs search function exists', () => {
  assert.equal(typeof subsunacs.search, 'function');
});

test('subsunacs getDownloadUrl returns correct URL', () => {
  const url = subsunacs.getDownloadUrl('12345');
  assert.equal(url, 'https://subsunacs.net/getentry.php?id=12345&ei=0');
});

test('subsunacs search returns empty array for empty title', async () => {
  const results = await subsunacs.search('');
  assert.deepEqual(results, []);
});

test('subsunacs search returns empty array for whitespace title', async () => {
  const results = await subsunacs.search('   ');
  assert.deepEqual(results, []);
});

test('subsunacs live search returns results for The Matrix', { skip: SKIP_LIVE ? 'SKIP_LIVE_TESTS=1' : false }, async () => {
  const results = await subsunacs.search('The Matrix', 1999);

  assert.ok(Array.isArray(results), 'Results should be an array');
  assert.ok(results.length > 0, 'Should find at least one subtitle');

  const first = results[0];
  assert.equal(first.provider, 'subsunacs');
  assert.equal(first.providerName, 'Subsunacs');
  assert.ok(first.id, 'Should have an id');
  assert.ok(first.title, 'Should have a title');
});

test('subsunacs live search for series returns results', { skip: SKIP_LIVE ? 'SKIP_LIVE_TESTS=1' : false }, async () => {
  const results = await subsunacs.search('Breaking Bad', 2008, 1, 1);

  assert.ok(Array.isArray(results), 'Results should be an array');
  // Note: May or may not find results depending on provider content
  if (results.length > 0) {
    const first = results[0];
    assert.equal(first.provider, 'subsunacs');
    assert.equal(first.providerName, 'Subsunacs');
  }
});
