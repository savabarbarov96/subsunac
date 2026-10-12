const { EventEmitter } = require('node:events');
const { createMocks } = require('node-mocks-http');

// Runs the actual Express middleware and SDK router without opening a listening socket.
function requestInMemory(app, value, options = {}) {
  const url = new URL(value, 'https://local.addon.test');
  const {req, res} = createMocks({
    method: options.method || 'GET', url: url.pathname + url.search,
    headers: {host: url.host, 'x-forwarded-proto': url.protocol.slice(0, -1), ...options.headers},
    query: Object.fromEntries(url.searchParams)
  }, {eventEmitter: EventEmitter});
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Express response timed out')), 55000);
    res.on('end', () => {
      clearTimeout(timeout);
      const body = res._getData();
      const bytes = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
      resolve({status: res.statusCode, headers: {get: name => res.getHeader(name)},
        text: async () => bytes.toString('utf8'), json: async () => JSON.parse(bytes.toString('utf8')),
        arrayBuffer: async () => Uint8Array.from(bytes).buffer});
    });
    try { app.handle(req, res, error => {clearTimeout(timeout); reject(error || new Error('Route not found'));}); }
    catch (error) {clearTimeout(timeout); reject(error);}
  });
}
module.exports = { requestInMemory };
