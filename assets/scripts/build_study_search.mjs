import { chmodSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createStudySearchDatabase, indexStudySegments } from '../../src/study-search.js';
import {
  DEFAULT_EMBEDDING_DIMENSIONS,
  DEFAULT_EMBEDDING_MODEL,
  embedTextCollection,
  readOpenRouterApiKey,
  requestOpenRouterEmbeddings,
} from '../../src/study-embeddings.js';

const PROJECT_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
export const DEFAULT_SEGMENTS_PATH = path.join(PROJECT_ROOT, 'study', 'segments.json');
export const DEFAULT_SEARCH_DATABASE_PATH = path.join(homedir(), '.local', 'share', 'oneillsim', 'study-search.sqlite3');

function isPathWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function loadSegments(segmentsPath) {
  const source = JSON.parse(readFileSync(segmentsPath, 'utf8'));
  const segments = Array.isArray(source) ? source : source?.segments;
  if (!Array.isArray(segments) || segments.length === 0) {
    throw new Error('Study segment file must contain a non-empty segments array.');
  }
  if (Number.isInteger(source?.metadata?.segment_count) && source.metadata.segment_count !== segments.length) {
    throw new Error('Study segment metadata count does not match the stored segments.');
  }
  const ids = new Set();
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (!segment || typeof segment.id !== 'string' || !segment.id || ids.has(segment.id)) {
      throw new Error(`Study segment ${index + 1} has a missing or duplicate id.`);
    }
    ids.add(segment.id);
    if (segment.index !== index + 1) throw new Error(`Study segment ${segment.id} is out of order.`);
    if (typeof (segment.search_text || segment.text) !== 'string' || !(segment.search_text || segment.text).trim()) {
      throw new Error(`Study segment ${segment.id} has no searchable text.`);
    }
  }
  return segments;
}

export async function buildStudySearchIndex({
  segmentsPath = DEFAULT_SEGMENTS_PATH,
  databasePath = DEFAULT_SEARCH_DATABASE_PATH,
  apiKey,
  fetchImpl,
  model = DEFAULT_EMBEDDING_MODEL,
  dimensions = DEFAULT_EMBEDDING_DIMENSIONS,
  batchSize = 64,
  delayMs = 150,
  sleep,
  onBatch,
  embedBatch: injectedEmbedBatch,
} = {}) {
  const absoluteSegmentsPath = path.resolve(segmentsPath);
  const absoluteDatabasePath = path.resolve(databasePath);
  const projectRoot = realpathSync(PROJECT_ROOT);
  if (isPathWithin(projectRoot, absoluteDatabasePath)) {
    throw new Error('Study search database must be stored outside the public project directory.');
  }

  const segments = loadSegments(absoluteSegmentsPath);
  const texts = segments.map((segment) => String(segment.search_text || segment.text).trim());
  const key = injectedEmbedBatch ? apiKey : (apiKey || await readOpenRouterApiKey());
  const embedBatch = injectedEmbedBatch || ((batch) => requestOpenRouterEmbeddings(batch, {
    apiKey: key,
    fetchImpl,
    model,
    dimensions,
  }));
  const vectors = await embedTextCollection(texts, {
    embedBatch,
    batchSize,
    delayMs,
    ...(sleep ? { sleep } : {}),
    ...(onBatch ? { onBatch } : {}),
  });
  if (vectors.length !== segments.length) throw new Error('Generated embedding count does not match study segments.');
  const dimensionSet = new Set(vectors.map((vector) => Array.isArray(vector) ? vector.length : 0));
  if (dimensionSet.size !== 1 || dimensionSet.has(0)) throw new Error('Generated embeddings have inconsistent dimensions.');
  const vectorDimensions = vectors[0].length;
  const indexedSegments = segments.map((segment, index) => ({ ...segment, embedding: vectors[index] }));

  const directory = path.dirname(absoluteDatabasePath);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const realDirectory = realpathSync(directory);
  if (isPathWithin(projectRoot, path.join(realDirectory, path.basename(absoluteDatabasePath)))) {
    throw new Error('Study search database resolves inside the public project directory.');
  }

  const database = createStudySearchDatabase(absoluteDatabasePath);
  try {
    indexStudySegments(database, indexedSegments);
    const row = database.prepare('SELECT COUNT(*) AS count FROM study_segments').get();
    if (row.count !== segments.length) throw new Error('Study search database verification count does not match.');
  } finally {
    database.close();
    try {
      chmodSync(absoluteDatabasePath, 0o600);
    } catch {
      // A failed transaction can leave no database file; preserve the primary error.
    }
  }
  return {
    segment_count: segments.length,
    dimensions: vectorDimensions,
    database_path: absoluteDatabasePath,
  };
}

async function main() {
  const totalBatches = Math.ceil(
    JSON.parse(readFileSync(process.env.STUDY_SEGMENTS_PATH || DEFAULT_SEGMENTS_PATH, 'utf8')).segments.length / 64,
  );
  const result = await buildStudySearchIndex({
    segmentsPath: process.env.STUDY_SEGMENTS_PATH || DEFAULT_SEGMENTS_PATH,
    databasePath: process.env.STUDY_SEARCH_DB_PATH || DEFAULT_SEARCH_DATABASE_PATH,
    apiKey: await readOpenRouterApiKey(),
    onBatch: ({ completed, total }) => {
      const batchesDone = Math.ceil(completed / 64);
      if (completed === total || batchesDone % 10 === 0) {
        console.log(`Embedded ${completed}/${total} study segments (${batchesDone}/${totalBatches} batches).`);
      }
    },
  });
  console.log(`Indexed ${result.segment_count} study segments with ${result.dimensions}-dimensional vectors.`);
  console.log(`Private SQLite search index: ${result.database_path}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`Study search index build failed: ${error.message}`);
    process.exitCode = 1;
  });
}
