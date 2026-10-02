import {
  sanitizeStudySearchQuery,
  searchStudyBm25,
  searchStudySemantic,
} from './study-search.js';

const ALLOWED_MODES = new Set(['bm25', 'semantic']);
const MAX_QUERY_LENGTH = 400;
const MAX_RESULT_LIMIT = 12;

function invalidResponse(message) {
  return { status: 400, body: { error: message } };
}

function parseSearchPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { error: 'Search request must be a JSON object.' };
  }
  if (typeof payload.query !== 'string') return { error: 'Search query must be text.' };
  const query = payload.query.trim();
  if (!query) return { error: 'Enter a search term.' };
  if (query.length > MAX_QUERY_LENGTH) return { error: `Search query is limited to ${MAX_QUERY_LENGTH} characters.` };
  if (!sanitizeStudySearchQuery(query)) return { error: 'Search query must include letters or numbers.' };

  const modes = payload.modes === undefined ? ['bm25'] : payload.modes;
  if (!Array.isArray(modes) || modes.length === 0 || modes.some((mode) => !ALLOWED_MODES.has(mode))) {
    return { error: 'Choose keyword (BM25), semantic search, or both.' };
  }
  const uniqueModes = [...new Set(modes)];
  const requestedLimit = payload.limit === undefined ? 8 : Number(payload.limit);
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1) {
    return { error: 'Search result limit must be a positive whole number.' };
  }
  return { query, modes: uniqueModes, limit: Math.min(MAX_RESULT_LIMIT, requestedLimit) };
}

function publicSegment(segment) {
  return {
    id: segment.id,
    index: segment.index,
    pdf_page: segment.pdf_page,
    printed_page: segment.printed_page,
    heading_context: segment.heading_context || '',
    type: segment.type,
    text: segment.text,
    caption: segment.caption,
    description: segment.description,
  };
}

export async function executeStudySearch(payload, { database, embedQuery } = {}) {
  const parsed = parseSearchPayload(payload);
  if (parsed.error) return invalidResponse(parsed.error);
  if (!database) return { status: 503, body: { error: 'Study search index is unavailable.' } };

  let bm25 = [];
  if (parsed.modes.includes('bm25')) {
    try {
      bm25 = searchStudyBm25(database, parsed.query, parsed.limit).map(publicSegment);
    } catch {
      return { status: 500, body: { error: 'Keyword search is temporarily unavailable.' } };
    }
  }

  let semantic = [];
  let semanticAvailable = false;
  if (parsed.modes.includes('semantic') && typeof embedQuery === 'function') {
    try {
      const queryEmbedding = await embedQuery(parsed.query);
      semantic = searchStudySemantic(database, queryEmbedding, parsed.limit).map(publicSegment);
      semanticAvailable = true;
    } catch {
      semantic = [];
    }
  }

  return {
    status: 200,
    body: {
      bm25,
      semantic,
      semantic_available: semanticAvailable,
    },
  };
}
