function normalizeBaseUrl(value) {
  if (!value) {
    return '';
  }
  return value.replace(/\/+$/, '');
}

function getBaseUrl(req) {
  if (process.env.PUBLIC_URL) {
    return normalizeBaseUrl(process.env.PUBLIC_URL);
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  const headers = req && req.headers ? req.headers : {};
  const protocol = headers['x-forwarded-proto'] || 'https';
  const host = headers.host || headers['x-forwarded-host'] || '';

  if (!host) {
    return '';
  }

  return `${protocol}://${host}`;
}

module.exports = {
  getBaseUrl
};
