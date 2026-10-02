export function createStudyEmbeddingQueryService({
  embed,
  maxQueriesPerWindow = 30,
  windowMs = 60_000,
  cacheTtlMs = 5 * 60_000,
  maxCacheEntries = 128,
  now = Date.now,
} = {}) {
  if (typeof embed !== 'function') throw new TypeError('An embedding function is required.');
  if (!Number.isInteger(maxQueriesPerWindow) || maxQueriesPerWindow < 1) throw new RangeError('Query limit must be a positive integer.');
  if (!Number.isFinite(windowMs) || windowMs <= 0) throw new RangeError('Rate-limit window must be positive.');
  if (!Number.isFinite(cacheTtlMs) || cacheTtlMs <= 0) throw new RangeError('Cache lifetime must be positive.');
  if (!Number.isInteger(maxCacheEntries) || maxCacheEntries < 1) throw new RangeError('Cache size must be a positive integer.');

  const cache = new Map();
  const inFlight = new Map();
  const requestTimes = [];

  return async function embedQuery(query) {
    if (typeof query !== 'string') throw new TypeError('Search query must be text.');
    const normalized = query.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
    if (!normalized) throw new TypeError('Search query cannot be empty.');
    const time = now();

    for (const [key, entry] of cache) {
      if (entry.expiresAt <= time) cache.delete(key);
    }
    const cached = cache.get(normalized);
    if (cached) {
      cache.delete(normalized);
      cache.set(normalized, cached);
      return cached.vector;
    }
    if (inFlight.has(normalized)) return inFlight.get(normalized);

    while (requestTimes.length && requestTimes[0] <= time - windowMs) requestTimes.shift();
    if (requestTimes.length >= maxQueriesPerWindow) {
      throw new Error('Semantic search request limit reached; retry shortly or use keyword search.');
    }
    requestTimes.push(time);

    const pending = Promise.resolve()
      .then(() => embed(query.trim()))
      .then((vector) => {
        cache.set(normalized, { vector, expiresAt: now() + cacheTtlMs });
        while (cache.size > maxCacheEntries) cache.delete(cache.keys().next().value);
        return vector;
      })
      .finally(() => inFlight.delete(normalized));
    inFlight.set(normalized, pending);
    return pending;
  };
}
