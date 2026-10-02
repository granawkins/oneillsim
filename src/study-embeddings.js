import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

export const OPENROUTER_EMBEDDINGS_URL = 'https://openrouter.ai/api/v1/embeddings';
export const DEFAULT_EMBEDDING_MODEL = 'openai/text-embedding-3-small';
export const DEFAULT_EMBEDDING_DIMENSIONS = 256;

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function parseEnvValue(line) {
  const match = line.match(/^\s*(?:export\s+)?OPENROUTER_API_KEY\s*=\s*(.*?)\s*$/);
  if (!match) return null;
  let value = match[1];
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  } else {
    value = value.replace(/\s+#.*$/, '').trim();
  }
  return value || null;
}

export async function readOpenRouterApiKey({ env = process.env, envFile = path.join(homedir(), '.env') } = {}) {
  const environmentValue = typeof env.OPENROUTER_API_KEY === 'string' ? env.OPENROUTER_API_KEY.trim() : '';
  if (environmentValue) return environmentValue;
  let contents;
  try {
    contents = await readFile(envFile, 'utf8');
  } catch {
    throw new Error('OPENROUTER_API_KEY is not configured.');
  }
  for (const line of contents.split(/\r?\n/)) {
    const value = parseEnvValue(line);
    if (value) return value;
  }
  throw new Error('OPENROUTER_API_KEY is not configured.');
}

export async function requestOpenRouterEmbeddings(texts, {
  apiKey,
  fetchImpl = globalThis.fetch,
  model = DEFAULT_EMBEDDING_MODEL,
  dimensions = DEFAULT_EMBEDDING_DIMENSIONS,
  timeoutMs = 60_000,
} = {}) {
  if (!Array.isArray(texts) || texts.length === 0 || texts.some((text) => typeof text !== 'string' || !text.trim())) {
    throw new TypeError('Embedding input must be a non-empty array of non-empty strings.');
  }
  if (!apiKey) throw new Error('OpenRouter API key is not configured.');
  if (typeof fetchImpl !== 'function') throw new TypeError('Fetch implementation is required.');

  let response;
  try {
    response = await fetchImpl(OPENROUTER_EMBEDDINGS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, input: texts, dimensions }),
      signal: typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(timeoutMs) : undefined,
    });
  } catch {
    const error = new Error('OpenRouter embedding request failed before receiving a response.');
    error.retryable = true;
    throw error;
  }
  if (!response.ok) {
    const error = new Error(`OpenRouter embedding request returned HTTP ${response.status}.`);
    error.retryable = response.status === 429 || response.status >= 500;
    throw error;
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error('OpenRouter returned invalid embedding JSON.');
  }
  if (!Array.isArray(payload?.data) || payload.data.length !== texts.length) {
    throw new Error('OpenRouter returned an unexpected embedding count.');
  }
  const ordered = new Array(texts.length);
  for (const item of payload.data) {
    const index = item?.index;
    if (!Number.isInteger(index) || index < 0 || index >= texts.length || ordered[index] !== undefined) {
      throw new Error('OpenRouter returned an invalid embedding index.');
    }
    const vector = item?.embedding;
    if (!Array.isArray(vector) || vector.length !== dimensions) {
      throw new Error(`OpenRouter embedding has the wrong dimension; expected ${dimensions}.`);
    }
    if (vector.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
      throw new Error('OpenRouter embedding contains a non-finite value.');
    }
    ordered[index] = vector;
  }
  if (ordered.some((vector) => vector === undefined)) throw new Error('OpenRouter omitted an embedding index.');
  return ordered;
}

export async function embedTextCollection(texts, {
  embedBatch,
  batchSize = 64,
  maxRetries = 3,
  retryDelayMs = 500,
  delayMs = 150,
  sleep = wait,
  onBatch,
} = {}) {
  if (!Array.isArray(texts)) throw new TypeError('Texts must be an array.');
  if (typeof embedBatch !== 'function') throw new TypeError('An embedding batch function is required.');
  if (!Number.isInteger(batchSize) || batchSize < 1) throw new RangeError('Batch size must be a positive integer.');
  if (!Number.isInteger(maxRetries) || maxRetries < 0) throw new RangeError('Retry count must be a non-negative integer.');

  const vectors = [];
  for (let offset = 0; offset < texts.length; offset += batchSize) {
    const batch = texts.slice(offset, offset + batchSize);
    let result;
    for (let attempt = 0; ; attempt += 1) {
      try {
        result = await embedBatch(batch);
        break;
      } catch (error) {
        if (!error?.retryable || attempt >= maxRetries) throw error;
        await sleep(retryDelayMs * (2 ** attempt));
      }
    }
    if (!Array.isArray(result) || result.length !== batch.length) {
      throw new Error('Embedding batch result count does not match the input.');
    }
    vectors.push(...result);
    if (typeof onBatch === 'function') onBatch({ completed: vectors.length, total: texts.length });
    if (offset + batch.length < texts.length && delayMs > 0) await sleep(delayMs);
  }
  return vectors;
}
