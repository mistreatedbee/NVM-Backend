const store = new Map();

function createCacheKey(prefix, params = {}) {
  const entries = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([a], [b]) => a.localeCompare(b));
  return `${prefix}:${JSON.stringify(entries)}`;
}

function getCached(key) {
  const item = store.get(key);
  if (!item) return null;
  if (item.expiresAt < Date.now()) {
    store.delete(key);
    return null;
  }
  return item.value;
}

function setCached(key, value, ttlMs = 60 * 1000) {
  store.set(key, {
    value,
    expiresAt: Date.now() + ttlMs
  });
  return value;
}

function clearByPrefix(prefix) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

module.exports = {
  createCacheKey,
  getCached,
  setCached,
  clearByPrefix
};
