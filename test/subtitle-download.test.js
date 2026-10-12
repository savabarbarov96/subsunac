const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { requestBuffer } = require('../lib/subtitle-download');

function mockTransports(replies) {
  const calls = [];
  function request(protocol, url, options, callback) {
    const req = new EventEmitter();
    calls.push({protocol, url: String(url), options});
    req.destroy = () => {};
    req.end = () => process.nextTick(() => {
      const reply = replies.shift();
      if (reply.hang) return;
      const response = new PassThrough();
      response.statusCode = reply.status || 200;
      response.headers = reply.headers || {};
      response.complete = reply.complete !== false;
      callback(response);
      if (reply.error) response.destroy(new Error('upstream disconnected'));
      else response.end(reply.body || 'subtitle');
    });
    return req;
  }
  return {calls, transports: {http: {request: (...args) => request('http', ...args)}, https: {request: (...args) => request('https', ...args)}}};
}
test('follows relative redirects and switches from HTTP to HTTPS', async () => {
  const mock = mockTransports([
    {status: 302, headers: {location: '/new'}},
    {status: 301, headers: {location: 'https://example.test:8443/file'}},
    {body: 'real subtitle'}
  ]);
  const result = await requestBuffer('http://example.test/old', {transports: mock.transports});
  assert.equal(result.buffer.toString(), 'real subtitle');
  assert.deepEqual(mock.calls.map(c => c.protocol), ['http', 'http', 'https']);
  assert.equal(mock.calls[2].url, 'https://example.test:8443/file');
});
for (const [name, replies, options, status] of [
  ['upstream 404', [{status: 404}], {}, 404],
  ['upstream 500', [{status: 500}], {}, 502],
  ['empty body', [{body: Buffer.alloc(0)}], {}, 404],
  ['incomplete response', [{complete: false}], {}, 502],
  ['response error', [{error: true}], {}, 502],
  ['unsupported redirect', [{status: 302, headers: {location: 'file:///etc/passwd'}}], {}, 502],
  ['missing redirect location', [{status: 302}], {}, 502],
  ['redirect limit', [{status: 302, headers: {location: '/again'}}, {status: 302, headers: {location: '/again'}}], {maxRedirects: 1}, 502],
  ['body limit', [{body: 'too long'}], {maxBytes: 3}, 502],
  ['absolute timeout', [{hang: true}], {timeoutMs: 10}, 504]
]) {
  test(`rejects ${name}`, async () => {
    const mock = mockTransports(replies);
    await assert.rejects(requestBuffer('https://example.test/file', {...options, transports: mock.transports}), {status});
  });
}
