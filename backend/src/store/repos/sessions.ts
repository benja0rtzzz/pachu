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

export interface SessionRow {
  id: string;
  notesFileId: string;
  puzzleKind: PuzzleKind;
  startedAt: string;
  endedAt: string | null;
}

/**
 * Fetch a single session row by id, or null when no such session exists. The puzzles
 * route uses this to verify that a `POST /puzzles/:id/finish` targets a real, owned,
 * not-yet-finished session before applying any reviews.
 */
export function getSession(id: string): SessionRow | null {
  const db = getDatabase();
  const row = db
    .query(
      `SELECT id, notes_file_id, puzzle_kind, started_at, ended_at
       FROM sessions WHERE id = ?`,
    )
    .get(id) as {
    id: string;
    notes_file_id: string;
    puzzle_kind: PuzzleKind;
    started_at: string;
    ended_at: string | null;
  } | null;
  if (!row) return null;
  return {
    id: row.id,
    notesFileId: row.notes_file_id,
    puzzleKind: row.puzzle_kind,
    startedAt: row.started_at,
    endedAt: row.ended_at,
  };
}

/**
 * Most recent ended session for a notes file (i.e. a Space), or null if none exists.
 * `SpaceSummary.lastPuzzleKind` is sourced from this.
 */
export function getLastEndedSession(
  notesFileId: string,
): { endedAt: string; puzzleKind: PuzzleKind } | null {
  const db = getDatabase();
  const row = db
    .query(
      `SELECT ended_at, puzzle_kind FROM sessions
       WHERE notes_file_id = ? AND ended_at IS NOT NULL
       ORDER BY ended_at DESC LIMIT 1`,
    )
    .get(notesFileId) as { ended_at: string; puzzle_kind: PuzzleKind } | null;
  if (!row) return null;
  return { endedAt: row.ended_at, puzzleKind: row.puzzle_kind };
}

/**
 * Distinct puzzle kinds that have an ended session in `[from, to)` for a notes file.
 * Used by `SpaceSummary.playedTodayKinds` (caller supplies today's local boundaries).
 */
export function listEndedKindsBetween(
  notesFileId: string,
  fromIso: string,
  toIso: string,
): PuzzleKind[] {
  const db = getDatabase();
  const rows = db
    .query(
      `SELECT DISTINCT puzzle_kind FROM sessions
       WHERE notes_file_id = ? AND ended_at IS NOT NULL
         AND ended_at >= ? AND ended_at < ?`,
    )
    .all(notesFileId, fromIso, toIso) as Array<{ puzzle_kind: PuzzleKind }>;
  return rows.map((r) => r.puzzle_kind);
}

/**
 * Distinct local-time calendar dates (YYYY-MM-DD) on which this notes file had at least
 * one ended session, sorted descending (newest first). Used by `SpaceSummary.streakDays`.
 * Server local time matches what the user sees in the UI.
 */
export function listEndedSessionLocalDates(notesFileId: string): string[] {
  const db = getDatabase();
  const rows = db
    .query(
      `SELECT DISTINCT date(ended_at, 'localtime') AS d FROM sessions
       WHERE notes_file_id = ? AND ended_at IS NOT NULL
       ORDER BY d DESC`,
    )
    .all(notesFileId) as Array<{ d: string }>;
  return rows.map((r) => r.d);
}
