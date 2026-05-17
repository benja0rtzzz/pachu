import type {
  GeneratePuzzleRequest,
  Puzzle,
  SessionFinishRequest,
  SessionFinishResponse,
} from '@pachu/shared';
import { apiFetch } from './client';

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
