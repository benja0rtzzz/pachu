import { randomUUID } from 'node:crypto';
import type { PuzzleKind } from '@pachu/shared';
import { getDatabase } from '../db.js';

export function createSession(input: { notesFileId: string; puzzleKind: PuzzleKind }): {
  id: string;
  startedAt: string;
} {
  const db = getDatabase();
  const id = randomUUID();
  const startedAt = new Date().toISOString();
  db.run(
    `INSERT INTO sessions (id, notes_file_id, puzzle_kind, started_at) VALUES (?, ?, ?, ?)`,
    [id, input.notesFileId, input.puzzleKind, startedAt],
  );
  return { id, startedAt };
}

export function endSession(sessionId: string): void {
  const db = getDatabase();
  const endedAt = new Date().toISOString();
  db.run('UPDATE sessions SET ended_at = ? WHERE id = ? AND ended_at IS NULL', [
    endedAt,
    sessionId,
  ]);
}
