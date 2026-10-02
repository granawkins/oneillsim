import { executeStudySearch } from './study-search-api.js';

export const MAX_STUDY_SEARCH_BODY_BYTES = 16 * 1024;

function sendJson(response, status, body) {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(body));
}

export async function handleStudySearchHttp(request, response, dependencies = {}) {
  if (request.method !== 'POST') return sendJson(response, 405, { error: 'Method not allowed.' });
  const contentType = String(request.headers?.['content-type'] || '').toLowerCase();
  if (!contentType.startsWith('application/json')) {
    return sendJson(response, 415, { error: 'Search requests must use application/json.' });
  }
  const declaredLength = Number(request.headers?.['content-length']);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_STUDY_SEARCH_BODY_BYTES) {
    request.resume?.();
    return sendJson(response, 413, { error: 'Search request is too large.' });
  }

  const chunks = [];
  let size = 0;
  try {
    for await (const chunk of request) {
      size += chunk.length;
      if (size > MAX_STUDY_SEARCH_BODY_BYTES) {
        request.resume?.();
        return sendJson(response, 413, { error: 'Search request is too large.' });
      }
      chunks.push(chunk);
    }
  } catch {
    return sendJson(response, 400, { error: 'Search request could not be read.' });
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return sendJson(response, 400, { error: 'Search request must contain valid JSON.' });
  }

  try {
    const result = await executeStudySearch(payload, dependencies);
    return sendJson(response, result.status, result.body);
  } catch {
    return sendJson(response, 500, { error: 'Study search is temporarily unavailable.' });
  }
}
