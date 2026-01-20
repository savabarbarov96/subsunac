const test = require('node:test');
const assert = require('node:assert/strict');

const { getBaseUrl } = require('../lib/base-url');

function withEnv(overrides, fn) {
  const original = { ...process.env };
  Object.assign(process.env, overrides);
  try {
    fn();
  } finally {
    process.env = original;
  }
}

test('getBaseUrl prefers PUBLIC_URL', () => {
  withEnv({ PUBLIC_URL: 'https://example.com/' }, () => {
    const baseUrl = getBaseUrl({ headers: { host: 'ignored.test' } });
    assert.equal(baseUrl, 'https://example.com');
  });
});

test('getBaseUrl prefers host header over VERCEL_URL', () => {
  withEnv({ PUBLIC_URL: '', VERCEL_URL: 'preview.vercel.app' }, () => {
    const baseUrl = getBaseUrl({
      headers: {
        host: 'subsunac.vercel.app',
        'x-forwarded-host': 'subsunac-preview.vercel.app',
        'x-forwarded-proto': 'https'
      }
    });
    assert.equal(baseUrl, 'https://subsunac.vercel.app');
  });
});

test('getBaseUrl uses x-forwarded-host when host is missing', () => {
  withEnv({ PUBLIC_URL: '', VERCEL_URL: 'preview.vercel.app' }, () => {
    const baseUrl = getBaseUrl({
      headers: {
        'x-forwarded-host': 'forwarded.example',
        'x-forwarded-proto': 'https'
      }
    });
    assert.equal(baseUrl, 'https://forwarded.example');
  });
});

test('getBaseUrl falls back to VERCEL_URL when host is missing', () => {
  withEnv({ PUBLIC_URL: '', VERCEL_URL: 'example.vercel.app' }, () => {
    const baseUrl = getBaseUrl({ headers: {} });
    assert.equal(baseUrl, 'https://example.vercel.app');
  });
});
