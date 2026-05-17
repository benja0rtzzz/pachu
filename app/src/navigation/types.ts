import type { PuzzleKind } from '@pachu/shared';

// The `picker` route was per-`notesId` only; the spaces paradigm makes the
// per-space home the canonical landing for puzzle generation, so it now
// carries `spaceId` and is named `space`. Puzzle routes already carry
// `puzzleId`; navigation back to the space happens via
// `navigate({ name: 'space', spaceId })`.
export type Route =
  | { name: 'landing' }
  | { name: 'import' }
  | { name: 'spaces' }
  | { name: 'space'; spaceId: string }
  | { name: 'crossword'; puzzleId: string }
  | { name: 'cloze'; puzzleId: string }
  | { name: 'flashcards'; puzzleId: string };

export type NavigateTarget = Route;

export interface StartPuzzleParams {
  kind: PuzzleKind;
  puzzleId: string;
}
