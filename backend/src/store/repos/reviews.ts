import type { Rating } from '@pachu/shared';
import { getDatabase } from '../db.js';

export function appendReviewEvent(input: {
  termId: string;
  sessionId?: string;
  rating: Rating;
  ms: number;
  hintsUsed: number;
}): number {
  const db = getDatabase();
  const createdAt = new Date().toISOString();
  const result = db.run(
    `INSERT INTO review_events (term_id, session_id, rating, ms, hints_used, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      input.termId,
      input.sessionId ?? null,
      input.rating,
      input.ms,
      input.hintsUsed,
      createdAt,
    ],
  );
  return Number(result.lastInsertRowid);
}

/**
 * ISO timestamp of the most recent review event for any term in a notes file (i.e. a
 * Space), or null if the space has never been reviewed. Source for `SpaceSummary.lastReviewedAt`.
 */
export function getLastReviewedAt(notesFileId: string): string | null {
  const db = getDatabase();
  const row = db
    .query(
      `SELECT MAX(r.created_at) AS at FROM review_events r
       JOIN terms t ON t.id = r.term_id
       WHERE t.notes_file_id = ?`,
    )
    .get(notesFileId) as { at: string | null } | null;
  return row?.at ?? null;
}
