const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { requestBuffer } = require('../lib/subtitle-download');
const { zip } = require('./fixtures/archives');

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
      if (reply.requestError) {
        response.write(reply.body);
        req.emit('error', Object.assign(new Error('Malformed provider framing'), {code: reply.requestError}));
        response.destroy();
      } else if (reply.error) response.destroy(new Error('upstream disconnected'));
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
  assert.equal(mock.calls[2].options.agent, false);
  assert.equal(mock.calls[2].options.headers.Connection, 'close');
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

test('recovers a complete Subsunacs ZIP when trailing bytes trigger its known parser error', async () => {
  const body = zip({'movie.srt': '1\n00:00:01,000 --> 00:00:02,000\nЗдравей\n'});
  const mock = mockTransports([{body, headers: {'content-length': String(body.length)}, requestError: 'HPE_INVALID_CONSTANT', complete: true}]);
  const result = await requestBuffer('https://subsunacs.net/getentry.php?id=1', {transports: mock.transports});
  assert.deepEqual(result.buffer, body);
});
for (const [name, host, body, code] of [
  ['truncated ZIP', 'subsunacs.net', zip({'a.srt': 'subtitle'}).subarray(0, 20), 'HPE_INVALID_CONSTANT'],
  ['other provider', 'example.test', zip({'a.srt': 'subtitle'}), 'HPE_INVALID_CONSTANT'],
  ['other transport error', 'subsunacs.net', zip({'a.srt': 'subtitle'}), 'ECONNRESET']
]) {
  test(`does not recover ${name}`, async () => {
    const mock = mockTransports([{body, requestError: code, complete: false}]);
    await assert.rejects(requestBuffer(`https://${host}/file`, {transports: mock.transports}), {status: 502});
  });
}

test('retains complete raw SRT when Subsunacs appends invalid HTTP bytes', async () => {
  const body = Buffer.from('1\n00:00:01,000 --> 00:00:02,000\nЗдравей\n');
  const mock = mockTransports([{body, headers: {'content-length': String(body.length)}, requestError: 'HPE_INVALID_CONSTANT', complete: true}]);
  assert.deepEqual((await requestBuffer('https://subsunacs.net/getentry.php?id=1', {transports: mock.transports})).buffer, body);
});
test('does not recover when received body does not match its declared length', async () => {
  const mock = mockTransports([{body: 'partial', headers: {'content-length': '100'}, requestError: 'HPE_INVALID_CONSTANT', complete: true}]);
  await assert.rejects(requestBuffer('https://subsunacs.net/file', {transports: mock.transports}), {status: 502});
});
