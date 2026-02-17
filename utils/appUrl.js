function getAppBaseUrl() {
  const base = process.env.APP_BASE_URL || process.env.FRONTEND_URL || 'https://nvm-frontend.vercel.app';
  return String(base).replace(/\/+$/, '');
}

function buildAppUrl(path = '/') {
  const normalizedPath = String(path || '/');
  const suffix = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;
  return `${getAppBaseUrl()}${suffix}`;
}

module.exports = {
  getAppBaseUrl,
  buildAppUrl
};
