import type { PuzzleKind } from '@pachu/shared';
import { getDatabase } from '../db.js';

export interface PuzzleProgressRow {
  sessionId: string;
  notesFileId: string;
  puzzleKind: PuzzleKind;
  /** The frozen generated puzzle, JSON-encoded. */
  puzzleJson: string;
  /** Client-defined per-term progress blob, JSON-encoded. Null until first save. */
  progressJson: string | null;
  updatedAt: string;
}

/**
 * Persist the freshly generated puzzle so a later resume returns the exact
 * same items/order. Called once at generate time with `progress_json` NULL.
 */
export function savePuzzleSnapshot(input: {
  sessionId: string;
  notesFileId: string;
  puzzleKind: PuzzleKind;
  puzzleJson: string;
}): void {
  const db = getDatabase();
  db.run(
    `INSERT OR REPLACE INTO puzzle_progress
       (session_id, notes_file_id, puzzle_kind, puzzle_json, progress_json, updated_at)
     VALUES (?, ?, ?, ?, NULL, ?)`,
    [
      input.sessionId,
      input.notesFileId,
      input.puzzleKind,
      input.puzzleJson,
      new Date().toISOString(),
    ],
  );
}

/** Overwrite the client progress blob for a session. No-op if the row is gone. */
export function savePuzzleProgress(sessionId: string, progressJson: string): void {
  const db = getDatabase();
  db.run(
    `UPDATE puzzle_progress SET progress_json = ?, updated_at = ? WHERE session_id = ?`,
    [progressJson, new Date().toISOString(), sessionId],
  );
}

function rowToProgress(row: {
  session_id: string;
  notes_file_id: string;
  puzzle_kind: PuzzleKind;
  puzzle_json: string;
  progress_json: string | null;
  updated_at: string;
} | null): PuzzleProgressRow | null {
  if (!row) return null;
  return {
    sessionId: row.session_id,
    notesFileId: row.notes_file_id,
    puzzleKind: row.puzzle_kind,
    puzzleJson: row.puzzle_json,
    progressJson: row.progress_json,
    updatedAt: row.updated_at,
  };
}

export function getPuzzleProgress(sessionId: string): PuzzleProgressRow | null {
  const db = getDatabase();
  const row = db
    .query(
      `SELECT session_id, notes_file_id, puzzle_kind, puzzle_json, progress_json, updated_at
       FROM puzzle_progress WHERE session_id = ?`,
    )
    .get(sessionId) as Parameters<typeof rowToProgress>[0];
  return rowToProgress(row);
}

/**
 * The in-progress puzzle for a (space, kind) whose session has NOT ended yet —
 * i.e. the one a resume should pick up. Newest first when several exist.
 */
export function getActivePuzzleForSpace(
  notesFileId: string,
  puzzleKind: PuzzleKind,
): PuzzleProgressRow | null {
  const db = getDatabase();
  const row = db
    .query(
      `SELECT p.session_id, p.notes_file_id, p.puzzle_kind, p.puzzle_json,
              p.progress_json, p.updated_at
       FROM puzzle_progress p
       JOIN sessions s ON s.id = p.session_id
       WHERE p.notes_file_id = ? AND p.puzzle_kind = ? AND s.ended_at IS NULL
       ORDER BY p.updated_at DESC
       LIMIT 1`,
    )
    .get(notesFileId, puzzleKind) as Parameters<typeof rowToProgress>[0];
  return rowToProgress(row);
}
