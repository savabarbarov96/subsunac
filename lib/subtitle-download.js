const http = require('node:http');
const https = require('node:https');
const { SubtitleError } = require('./subtitle-error');
const { getProvider } = require('./providers');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function requestBuffer(url, {timeoutMs = 25000, maxRedirects = 5, maxBytes = 20 * 1024 * 1024, headers = {}, transports = {http, https}} = {}) {
  return new Promise((resolve, reject) => {
    let finished = false;
    let activeRequest;
    let activeResponse;
    const timer = setTimeout(() => finish(new SubtitleError(504, 'Subtitle download timed out')), timeoutMs);
    function finish(error, result) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (error) {
        activeRequest?.destroy();
        activeResponse?.destroy();
        reject(error instanceof SubtitleError ? error : new SubtitleError(502, 'Subtitle download failed', error));
      } else resolve(result);
    }
    function fetchUrl(value, redirects) {
      if (finished) return;
      let target;
      let state;
      function onError(error) {
        // Subsunacs sends a complete body followed by malformed trailing HTTP bytes.
        // Recover only its known parser error after the declared body fully arrived.
        // Archive/content validation still runs before anything is served as SRT.
        if (target?.hostname === 'subsunacs.net' && error.code === 'HPE_INVALID_CONSTANT' &&
            activeResponse?.complete && state?.size > 0 && state.size === Number(state.headers['content-length'])) {
          finish(null, {buffer: Buffer.concat(state.chunks), headers: state.headers, finalUrl: target.href});
          return;
        }
        finish(error);
      }
      try {
        target = new URL(value);
        if (!['http:', 'https:'].includes(target.protocol)) throw new Error('Unsupported protocol');
        const transport = target.protocol === 'https:' ? transports.https : transports.http;
        activeRequest = transport.request(target, {
          method: 'GET',
          agent: false,
          headers: {'User-Agent': USER_AGENT, Accept: '*/*', 'Accept-Encoding': 'identity', Connection: 'close', ...headers},
          // Subsunacs uses malformed HTTP headers; keep its existing compatibility setting.
          insecureHTTPParser: target.hostname === 'subsunacs.net'
        }, response => {
          if (finished) {response.destroy(); return;}
          activeResponse = response;
          response.on('error', error => {if (activeResponse === response) onError(error);});
          const status = response.statusCode;
          if (status >= 300 && status < 400) {
            response.resume();
            if (!response.headers.location || redirects >= maxRedirects) {
              finish(new SubtitleError(502, 'Invalid subtitle download redirect'));
              return;
            }
            try { fetchUrl(new URL(response.headers.location, target), redirects + 1); }
            catch (error) { finish(error); }
            return;
          }
          if (status < 200 || status >= 300) {
            finish(new SubtitleError(status === 404 ? 404 : 502, 'Subtitle provider returned an error'));
            return;
          }
          if (Number(response.headers['content-length']) > maxBytes) {
            finish(new SubtitleError(502, 'Subtitle download exceeds size limit'));
            return;
          }
          const chunks = [];
          let size = 0;
          state = {chunks, size: 0, headers: response.headers};
          response.on('data', chunk => {
            size += chunk.length;
            state.size = size;
            if (size > maxBytes) finish(new SubtitleError(502, 'Subtitle download exceeds size limit'));
            else chunks.push(chunk);
          });
          response.on('aborted', () => finish(new SubtitleError(502, 'Subtitle download was interrupted')));
          response.on('end', () => {
            if (!response.complete) finish(new SubtitleError(502, 'Incomplete subtitle download'));
            else if (!size) finish(new SubtitleError(404, 'Subtitle not found'));
            else finish(null, {buffer: Buffer.concat(chunks), headers: response.headers, finalUrl: target.href});
          });
        });
        activeRequest.on('error', onError);
        activeRequest.end();
      } catch (error) { finish(error); }
    }
    fetchUrl(url, 0);
  });
}

async function downloadSubtitle(providerName, id) {
  const provider = getProvider(providerName);
  if (!provider || !/^\d+$/.test(id)) throw new SubtitleError(400, 'Invalid subtitle request');
  const {buffer} = await requestBuffer(provider.getDownloadUrl(id), {headers: {Referer: provider.BASE_URL}});
  return buffer;
}
module.exports = { requestBuffer, downloadSubtitle };
