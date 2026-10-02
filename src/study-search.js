import { DatabaseSync } from 'node:sqlite';

export const STUDY_VECTOR_DIMENSIONS = 256;

export function createStudySearchDatabase(databasePath = ':memory:') {
  const database = new DatabaseSync(databasePath);
  database.exec('PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
  database.exec(`
    CREATE TABLE IF NOT EXISTS study_segments (
      id TEXT PRIMARY KEY,
      segment_index INTEGER NOT NULL,
      pdf_page INTEGER NOT NULL,
      printed_page INTEGER,
      heading_context TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL,
      text TEXT NOT NULL,
      caption TEXT NOT NULL,
      description TEXT NOT NULL,
      table_markdown TEXT NOT NULL
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS study_fts USING fts5(
      segment_id UNINDEXED,
      heading,
      text,
      caption,
      description,
      table_markdown,
      tokenize = 'unicode61 remove_diacritics 2'
    );
    CREATE TABLE IF NOT EXISTS study_vectors (
      segment_id TEXT PRIMARY KEY REFERENCES study_segments(id) ON DELETE CASCADE,
      dimensions INTEGER NOT NULL,
      embedding BLOB NOT NULL
    );
  `);
  const segmentColumns = database.prepare('PRAGMA table_info(study_segments)').all();
  if (!segmentColumns.some((column) => column.name === 'heading_context')) {
    database.exec("ALTER TABLE study_segments ADD COLUMN heading_context TEXT NOT NULL DEFAULT '';");
  }
  return database;
}

function asVector(value) {
  if (!Array.isArray(value) && !(value instanceof Float32Array)) {
    throw new TypeError('Embedding must be an array of numbers');
  }
  if (!value.length) throw new RangeError('Embedding must have at least one dimension');
  const vector = Float32Array.from(value);
  for (const component of vector) {
    if (!Number.isFinite(component)) throw new RangeError('Embedding components must be finite');
  }
  return vector;
}

function encodeVector(value) {
  const vector = asVector(value);
  const bytes = Buffer.allocUnsafe(vector.length * 4);
  for (let index = 0; index < vector.length; index += 1) {
    bytes.writeFloatLE(vector[index], index * 4);
  }
  return { vector, bytes };
}

function decodeVector(bytes, dimensions) {
  const stored = Buffer.from(bytes);
  if (!stored || stored.byteLength !== dimensions * 4) {
    throw new RangeError('Stored embedding has an invalid byte length');
  }
  const vector = new Float32Array(dimensions);
  for (let index = 0; index < dimensions; index += 1) {
    vector[index] = stored.readFloatLE(index * 4);
  }
  return vector;
}

export function indexStudySegments(database, segments) {
  if (!Array.isArray(segments)) throw new TypeError('Segments must be an array');
  const insertSegment = database.prepare(`
    INSERT INTO study_segments
      (id, segment_index, pdf_page, printed_page, heading_context, type, text, caption, description, table_markdown)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertFts = database.prepare(`
    INSERT INTO study_fts (segment_id, heading, text, caption, description, table_markdown)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertVector = database.prepare(
    'INSERT INTO study_vectors (segment_id, dimensions, embedding) VALUES (?, ?, ?)',
  );

  database.exec('BEGIN IMMEDIATE;');
  try {
    database.exec('DELETE FROM study_fts; DELETE FROM study_vectors; DELETE FROM study_segments;');
    let expectedDimensions = null;
    for (const segment of segments) {
      if (!segment || typeof segment.id !== 'string' || !segment.id) {
        throw new TypeError('Every study segment must have a non-empty id');
      }
      const { vector, bytes } = encodeVector(segment.embedding);
      if (expectedDimensions === null) expectedDimensions = vector.length;
      if (vector.length !== expectedDimensions) {
        throw new RangeError(`Embedding dimension mismatch for segment ${segment.id}`);
      }
      const text = String(segment.text || '');
      const caption = String(segment.caption || '');
      const description = String(segment.description || '');
      const tableMarkdown = String(segment.table_markdown || '');
      const type = String(segment.type || 'text');
      const headingContext = String(segment.heading_context || (type === 'heading' ? text : ''));
      const heading = headingContext || String(segment.heading || '');
      const pdfPage = Number(segment.pdf_page);
      if (!Number.isInteger(pdfPage) || pdfPage < 1) {
        throw new RangeError(`Invalid PDF page for segment ${segment.id}`);
      }
      const index = Number(segment.index);
      if (!Number.isInteger(index) || index < 1) {
        throw new RangeError(`Invalid segment index for segment ${segment.id}`);
      }
      const printedPage = Number.isInteger(segment.printed_page) ? segment.printed_page : null;

      insertSegment.run(segment.id, index, pdfPage, printedPage, headingContext, type, text, caption, description, tableMarkdown);
      insertFts.run(segment.id, heading, text, caption, description, tableMarkdown);
      insertVector.run(segment.id, vector.length, bytes);
    }
    database.exec('COMMIT;');
  } catch (error) {
    database.exec('ROLLBACK;');
    throw error;
  }
}

export function sanitizeStudySearchQuery(query) {
  const normalized = String(query ?? '').normalize('NFKC');
  const words = normalized.match(/[\p{L}\p{N}]+/gu) || [];
  const uniqueWords = [...new Set(words.map((word) => word.toLocaleLowerCase()))].slice(0, 20);
  return uniqueWords.map((word) => `"${word.replaceAll('"', '""')}"`).join(' AND ');
}

function safeLimit(limit) {
  const number = Number(limit);
  if (!Number.isInteger(number)) return 10;
  return Math.min(25, Math.max(1, number));
}

function rowToResult(row, score) {
  return {
    id: row.id,
    index: row.segment_index,
    pdf_page: row.pdf_page,
    printed_page: row.printed_page,
    heading_context: row.heading_context,
    type: row.type,
    text: row.text,
    caption: row.caption,
    description: row.description,
    table_markdown: row.table_markdown,
    score,
  };
}

export function searchStudyBm25(database, query, limit = 10) {
  const match = sanitizeStudySearchQuery(query);
  if (!match) return [];
  const results = database.prepare(`
    SELECT s.*, bm25(study_fts) AS bm25_score
    FROM study_fts
    JOIN study_segments AS s ON s.id = study_fts.segment_id
    WHERE study_fts MATCH ?
    ORDER BY bm25_score ASC, s.segment_index ASC
    LIMIT ?
  `).all(match, safeLimit(limit));
  return results.map((row) => rowToResult(row, -Number(row.bm25_score)));
}

function cosineSimilarity(left, right) {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }
  if (!leftNorm || !rightNorm) return -1;
  return dot / Math.sqrt(leftNorm * rightNorm);
}

export function searchStudySemantic(database, queryEmbedding, limit = 10) {
  const queryVector = asVector(queryEmbedding);
  const rows = database.prepare(`
    SELECT s.*, v.dimensions, v.embedding
    FROM study_vectors AS v
    JOIN study_segments AS s ON s.id = v.segment_id
    ORDER BY s.segment_index ASC
  `).all();
  const scored = [];
  for (const row of rows) {
    if (row.dimensions !== queryVector.length) {
      throw new RangeError(`Query embedding dimension ${queryVector.length} does not match stored dimension ${row.dimensions}`);
    }
    const vector = decodeVector(row.embedding, row.dimensions);
    const score = cosineSimilarity(queryVector, vector);
    if (score >= 0) scored.push(rowToResult(row, score));
  }
  scored.sort((left, right) => right.score - left.score || left.index - right.index);
  return scored.slice(0, safeLimit(limit));
}
