let app;
function liveFetch(url, options = {}) {
  if (process.env.TEST_LOCAL_ADDON === '1') {
    app ||= require('../../lib/app').createApp();
    return require('./http').requestInMemory(app, url, options);
  }
  return fetch(url, {...options, signal: options.signal || AbortSignal.timeout(55000)});
}
module.exports = { liveFetch };
