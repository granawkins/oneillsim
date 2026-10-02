import { existsSync, readFileSync } from 'node:fs';
import { createStudySearchDatabase } from './study-search.js';

export function openStudySearchDatabase(databasePath, segmentsPath) {
  if (!existsSync(databasePath) || !existsSync(segmentsPath)) return null;
  const payload = JSON.parse(readFileSync(segmentsPath, 'utf8'));
  const expectedCount = Number(payload?.metadata?.segment_count);
  if (!Number.isInteger(expectedCount) || expectedCount < 1) return null;

  const database = createStudySearchDatabase(databasePath);
  try {
    const counts = database.prepare(`
      SELECT
        (SELECT COUNT(*) FROM study_segments) AS segments,
        (SELECT COUNT(*) FROM study_fts) AS lexical,
        (SELECT COUNT(*) FROM study_vectors) AS vectors
    `).get();
    if (counts.segments !== expectedCount || counts.lexical !== expectedCount || counts.vectors !== expectedCount) {
      database.close();
      return null;
    }
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}
