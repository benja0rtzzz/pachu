import type {
  GeneratePuzzleRequest,
  Puzzle,
  SessionFinishRequest,
  SessionFinishResponse,
} from '@pachu/shared';
import { apiFetch, ApiError } from './client';

/** Saved progress payload for a puzzle (shape is screen-defined per kind). */
export interface PuzzleProgressResponse {
  puzzle: Puzzle | null;
  progress: unknown | null;
  finished: boolean;
}

/**
 * Generate a puzzle of the requested `kind` for a given space. Backend
 * picks the terms (FSRS-weighted), runs the engine, persists a session
 * row, and returns the `Puzzle` union. `puzzle.id` IS the session id and
 * is what the screens later pass to `finishPuzzle`.
 */
export async function generatePuzzle(body: GeneratePuzzleRequest): Promise<Puzzle> {
  return apiFetch<Puzzle>('/puzzles/generate', {
    method: 'POST',
    body,
  });
}

/**
 * Submit per-term review results, end the session, and get back the
 * refreshed `Space` (so the space-home picker shows updated due/streak
 * counts without a follow-up fetch) plus the next-due ISO timestamp
 * (used by the Flashcards end-of-deck summary).
 */
export async function finishPuzzle(
  puzzleId: string,
  body: SessionFinishRequest,
): Promise<SessionFinishResponse> {
  return apiFetch<SessionFinishResponse>(
    `/puzzles/${encodeURIComponent(puzzleId)}/finish`,
    { method: 'POST', body },
  );
}

/**
 * Fetch saved progress for an in-flight puzzle. Returns `null` when the
 * backend has no progress row (404) so callers can treat "fresh start" and
 * "resume" uniformly.
 */
export async function getPuzzleProgress(
  puzzleId: string,
): Promise<PuzzleProgressResponse | null> {
  try {
    return await apiFetch<PuzzleProgressResponse>(
      `/puzzles/${encodeURIComponent(puzzleId)}/progress`,
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

/**
 * Persist the current per-term progress blob. Fire-and-forget from the
 * screens (called on Submit / Reveal / grade); failures are swallowed so a
 * flaky network never blocks play.
 */
export async function savePuzzleProgress(
  puzzleId: string,
  progress: unknown,
): Promise<void> {
  try {
    await apiFetch<void>(`/puzzles/${encodeURIComponent(puzzleId)}/progress`, {
      method: 'PUT',
      body: { progress },
    });
  } catch {
    // best-effort; progress saving must never interrupt the session
  }
}
