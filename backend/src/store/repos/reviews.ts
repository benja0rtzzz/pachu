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
